import type Database from "better-sqlite3";

import type { AppConfig } from "../config.js";

export type ScheduleSettingsRow = {
  summaryCron: string | null;
  timeZone: string | null;
  updatedAt: string;
};

export function getScheduleSettingsRow(db: Database.Database): ScheduleSettingsRow | undefined {
  const row = db
    .prepare(
      `
      SELECT summary_cron AS summaryCron, time_zone AS timeZone, updated_at AS updatedAt
      FROM schedule_settings
      WHERE id = 1
    `,
    )
    .get() as ScheduleSettingsRow | undefined;

  return row;
}

/** Merge `.env` config with optional DB overrides (NULL / empty DB column → use env). */
export function resolveEffectiveConfig(db: Database.Database, config: AppConfig): AppConfig {
  const row = getScheduleSettingsRow(db);
  if (!row) return config;

  const cron =
    row.summaryCron && row.summaryCron.trim() !== "" ? row.summaryCron.trim() : config.summaryCron;
  const tz = row.timeZone && row.timeZone.trim() !== "" ? row.timeZone.trim() : config.timeZone;

  return {
    ...config,
    summaryCron: cron,
    timeZone: tz,
  };
}

export function upsertScheduleSettings(
  db: Database.Database,
  patch: { summaryCron?: string | null; timeZone?: string | null },
): void {
  const row = getScheduleSettingsRow(db);

  const nextCron =
    patch.summaryCron !== undefined ? patch.summaryCron : row?.summaryCron ?? null;
  const nextTz = patch.timeZone !== undefined ? patch.timeZone : row?.timeZone ?? null;

  db.prepare(
    `
    INSERT INTO schedule_settings (id, summary_cron, time_zone, updated_at)
    VALUES (1, @summaryCron, @timeZone, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      summary_cron = excluded.summary_cron,
      time_zone = excluded.time_zone,
      updated_at = excluded.updated_at
  `,
  ).run({
    summaryCron: nextCron,
    timeZone: nextTz,
    updatedAt: new Date().toISOString(),
  });
}

export function clearScheduleSettings(db: Database.Database): void {
  db.prepare(`DELETE FROM schedule_settings WHERE id = 1`).run();
}
