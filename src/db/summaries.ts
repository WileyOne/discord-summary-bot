import type Database from "better-sqlite3";

export type SummaryRecord = {
  channelId: string;
  summaryDate: string;
  summaryJson: string;
  createdAt: string;
};

export function upsertSummary(
  db: Database.Database,
  record: Omit<SummaryRecord, "createdAt"> & { createdAt?: string },
): void {
  const createdAt = record.createdAt ?? new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO summaries (channel_id, summary_date, summary_json, created_at)
    VALUES (@channelId, @summaryDate, @summaryJson, @createdAt)
    ON CONFLICT(channel_id, summary_date) DO UPDATE SET
      summary_json = excluded.summary_json,
      created_at = excluded.created_at
  `);
  stmt.run({
    channelId: record.channelId,
    summaryDate: record.summaryDate,
    summaryJson: record.summaryJson,
    createdAt,
  });
}

export function getSummaryForChannelDate(
  db: Database.Database,
  channelId: string,
  summaryDate: string,
): SummaryRecord | undefined {
  const row = db
    .prepare(
      `
      SELECT channel_id AS channelId, summary_date AS summaryDate,
             summary_json AS summaryJson, created_at AS createdAt
      FROM summaries
      WHERE channel_id = ? AND summary_date = ?
    `,
    )
    .get(channelId, summaryDate) as SummaryRecord | undefined;

  return row;
}
