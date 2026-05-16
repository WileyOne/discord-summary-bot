import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import type { Client } from "discord.js";
import type Database from "better-sqlite3";

import type { AppConfig } from "../config.js";
import { resolveEffectiveConfig } from "../db/scheduleSettings.js";
import { formatZonedYmd } from "../util/dayRange.js";
import { summarizeChannelDay } from "../bot/summaryRunner.js";

let scheduledTask: ScheduledTask | null = null;

export function stopDailySummaryCron(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("[SummaryBot] Stopped daily summary cron.");
  }
}

/** Starts or replaces the cron job using DB overrides + `.env` (via {@link resolveEffectiveConfig}). */
export function startOrRestartDailySummaryCron(input: {
  client: Client;
  db: Database.Database;
  config: AppConfig;
}): void {
  stopDailySummaryCron();

  const effective = resolveEffectiveConfig(input.db, input.config);
  const expression = effective.summaryCron;

  if (!cron.validate(expression)) {
    console.error(`[SummaryBot] Invalid SUMMARY_CRON expression: ${expression}`);
    return;
  }

  let running = false;

  scheduledTask = cron.schedule(
    expression,
    async () => {
      if (running) {
        console.warn("[SummaryBot] Skipping cron tick because a previous run is still in progress.");
        return;
      }

      running = true;
      try {
        const summaryDate = formatZonedYmd(new Date(), effective.timeZone);
        console.log(`[SummaryBot] Cron triggered: summarizing tracked channels for ${summaryDate}`);

        for (const channelId of input.config.trackedChannels) {
          try {
            const result = await summarizeChannelDay({
              client: input.client,
              db: input.db,
              config: effective,
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
    { timezone: effective.timeZone },
  );

  console.log(
    `[SummaryBot] Scheduled daily summaries with cron="${expression}" timezone="${effective.timeZone}"`,
  );
}
