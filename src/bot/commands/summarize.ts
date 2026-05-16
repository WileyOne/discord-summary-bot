import { ChatInputCommandInteraction } from "discord.js";
import type Database from "better-sqlite3";

import type { AppConfig } from "../../config.js";
import { summarizeChannelDay } from "../summaryRunner.js";
import { formatZonedYmd } from "../../util/dayRange.js";

export async function handleSummarizeCommand(
  interaction: ChatInputCommandInteraction,
  ctx: { db: Database.Database; config: AppConfig },
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }

  const requestedChannel = interaction.options.getChannel("channel");
  const channelId = requestedChannel?.id ?? interaction.channelId;

  const tracked = new Set(ctx.config.trackedChannels);
  if (!tracked.has(channelId)) {
    await interaction.reply({
      content: "That channel is not listed in TRACKED_CHANNELS (or you must run this from a tracked channel).",
      ephemeral: true,
    });
    return;
  }

  const dateRaw = interaction.options.getString("date");
  let summaryDate: string;
  if (dateRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
      await interaction.reply({ content: "`date` must be formatted as YYYY-MM-DD.", ephemeral: true });
      return;
    }
    summaryDate = dateRaw;
  } else {
    summaryDate = formatZonedYmd(new Date(), ctx.config.timeZone);
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await summarizeChannelDay({
      client: interaction.client,
      db: ctx.db,
      config: ctx.config,
      trackedChannelId: channelId,
      summaryDate,
      announceErrorsToSummaryChannel: true,
    });

    if (result.ok) {
      await interaction.editReply({
        content: `Posted summary for <#${channelId}> on ${summaryDate} (${result.messageCount} messages) to <#${ctx.config.summaryChannelId}>.`,
      });
      return;
    }

    await interaction.editReply({
      content: `Could not summarize <#${channelId}> on ${summaryDate}: ${result.error}`,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[SummaryBot] /summarize failed:", detail);
    await interaction.editReply({
      content: `Unexpected error while running /summarize: ${detail}`,
    });
  }
}
