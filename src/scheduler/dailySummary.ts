import cron from "node-cron";
import type { Client } from "discord.js";
import type Database from "better-sqlite3";

import type { AppConfig } from "../config.js";
import { formatZonedYmd } from "../util/dayRange.js";
import { summarizeChannelDay } from "../bot/summaryRunner.js";

let started = false;

export function startDailySummaryCron(input: {
  client: Client;
  db: Database.Database;
  config: AppConfig;
}): void {
  if (started) {
    console.warn("[SummaryBot] Daily summary cron already started; skipping duplicate start.");
    return;
  }
  started = true;

  const expression = input.config.summaryCron;
  const ok = cron.validate(expression);
  if (!ok) {
    console.error(`[SummaryBot] Invalid SUMMARY_CRON expression: ${expression}`);
    return;
  }

  let running = false;

  cron.schedule(
    expression,
    async () => {
      if (running) {
        console.warn("[SummaryBot] Skipping cron tick because a previous run is still in progress.");
        return;
      }

      running = true;
      try {
        const summaryDate = formatZonedYmd(new Date(), input.config.timeZone);
        console.log(`[SummaryBot] Cron triggered: summarizing tracked channels for ${summaryDate}`);

        for (const channelId of input.config.trackedChannels) {
          try {
            const result = await summarizeChannelDay({
              client: input.client,
              db: input.db,
              config: input.config,
              trackedChannelId: channelId,
              summaryDate,
              announceErrorsToSummaryChannel: true,
            });

            if (!result.ok) {
              console.error(`[SummaryBot] Cron summarize failed for ${channelId}: ${result.error}`);
            } else {
              console.log(`[SummaryBot] Cron summarize OK for ${channelId} (${result.messageCount} messages)`);
            }
          } catch (err) {
            console.error(`[SummaryBot] Cron summarize crashed for ${channelId}:`, err);
          }
        }
      } finally {
        running = false;
      }
    },
    { timezone: input.config.timeZone },
  );

  console.log(`[SummaryBot] Scheduled daily summaries with cron="${expression}" timezone="${input.config.timeZone}"`);
}
