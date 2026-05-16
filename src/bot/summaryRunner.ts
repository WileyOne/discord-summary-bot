import type { Client, GuildTextBasedChannel } from "discord.js";
import type Database from "better-sqlite3";

import type { AppConfig } from "../config.js";
import { summarizeMessages } from "../ai/summarizer.js";
import { getMessagesForChannelBetween } from "../db/messages.js";
import { upsertSummary } from "../db/summaries.js";
import { getZonedDayUtcBounds } from "../util/dayRange.js";
import { buildSummaryEmbed, buildSummaryErrorEmbed } from "./summaryEmbed.js";

async function resolveChannelLabel(client: Client, channelId: string): Promise<string> {
  try {
    const ch = await client.channels.fetch(channelId);
    if (!ch) return channelId;
    if ("name" in ch && typeof ch.name === "string" && ch.name.length > 0) {
      return `#${ch.name}`;
    }
    return channelId;
  } catch {
    return channelId;
  }
}

export type SummarizeChannelDayResult =
  | { ok: true; messageCount: number }
  | { ok: false; error: string; messageCount: number };

export async function summarizeChannelDay(input: {
  client: Client;
  db: Database.Database;
  config: Pick<
    AppConfig,
    | "summaryChannelId"
    | "timeZone"
    | "ollamaBaseUrl"
    | "ollamaModel"
    | "summaryMaxMessages"
    | "summaryMaxTranscriptChars"
    | "ollamaNumPredict"
    | "ollamaNumCtx"
    | "ollamaOptionsJson"
  >;
  trackedChannelId: string;
  summaryDate: string;
  announceErrorsToSummaryChannel?: boolean;
}): Promise<SummarizeChannelDayResult> {
  const { startIso, endIsoExclusive } = getZonedDayUtcBounds(input.summaryDate, input.config.timeZone);

  const messages = getMessagesForChannelBetween(
    input.db,
    input.trackedChannelId,
    startIso,
    endIsoExclusive,
  );

  if (messages.length === 0) {
    return { ok: false, error: "No stored messages found for that channel/date.", messageCount: 0 };
  }

  let structured;
  try {
    const channelLabel = await resolveChannelLabel(input.client, input.trackedChannelId);
    structured = await summarizeMessages({
      ollamaBaseUrl: input.config.ollamaBaseUrl,
      ollamaModel: input.config.ollamaModel,
      channelLabel,
      summaryDate: input.summaryDate,
      messages,
      summaryMaxMessages: input.config.summaryMaxMessages,
      summaryMaxTranscriptChars: input.config.summaryMaxTranscriptChars,
      ollamaNumPredict: input.config.ollamaNumPredict,
      ollamaNumCtx: input.config.ollamaNumCtx,
      ollamaOptionsJson: input.config.ollamaOptionsJson,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[SummaryBot] Summarization failed:", detail);

    if (input.announceErrorsToSummaryChannel ?? true) {
      try {
        const summaryChannel = await input.client.channels.fetch(input.config.summaryChannelId);
        if (summaryChannel?.isTextBased()) {
          await (summaryChannel as GuildTextBasedChannel).send({
            embeds: [
              buildSummaryErrorEmbed({
                title: "Summary generation failed",
                detail,
                sourceChannelId: input.trackedChannelId,
                summaryDate: input.summaryDate,
              }),
            ],
          });
        }
      } catch (sendErr) {
        console.error("[SummaryBot] Failed posting summarization error embed:", sendErr);
      }
    }

    return { ok: false, error: detail, messageCount: messages.length };
  }

  try {
    upsertSummary(input.db, {
      channelId: input.trackedChannelId,
      summaryDate: input.summaryDate,
      summaryJson: JSON.stringify(structured),
    });
  } catch (err) {
    console.error("[SummaryBot] Failed persisting summary:", err);
  }

  try {
    const summaryChannel = await input.client.channels.fetch(input.config.summaryChannelId);
    if (!summaryChannel?.isTextBased()) {
      return {
        ok: false,
        error: `Summary channel is missing or not sendable: ${input.config.summaryChannelId}`,
        messageCount: messages.length,
      };
    }

    const channelLabel = await resolveChannelLabel(input.client, input.trackedChannelId);
    const embed = buildSummaryEmbed({
      sourceChannelId: input.trackedChannelId,
      sourceChannelLabel: channelLabel,
      summaryDate: input.summaryDate,
      structured,
    });

    await (summaryChannel as GuildTextBasedChannel).send({ embeds: [embed] });
    return { ok: true, messageCount: messages.length };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[SummaryBot] Failed posting summary embed:", detail);
    return { ok: false, error: detail, messageCount: messages.length };
  }
}
