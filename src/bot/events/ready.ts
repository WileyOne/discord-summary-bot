import type { Client } from "discord.js";
import type Database from "better-sqlite3";

import type { AppConfig } from "../../config.js";
import { startDailySummaryCron } from "../../scheduler/dailySummary.js";

export function handleReady(client: Client, db: Database.Database, config: AppConfig) {
  return (): void => {
    console.log(`[SummaryBot] Logged in as ${client.user?.tag ?? "unknown"}`);
    startDailySummaryCron({ client, db, config });
  };
}
