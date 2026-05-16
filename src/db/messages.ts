import type Database from "better-sqlite3";

export type StoredMessage = {
  id: string;
  channelId: string;
  authorUsername: string;
  content: string;
  createdAt: string;
};

export function insertMessage(db: Database.Database, message: StoredMessage): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO messages (id, channel_id, author_username, content, created_at)
    VALUES (@id, @channelId, @authorUsername, @content, @createdAt)
  `);
  stmt.run(message);
}

export function getMessagesForChannelBetween(
  db: Database.Database,
  channelId: string,
  startIso: string,
  endIsoExclusive: string,
): StoredMessage[] {
  const rows = db
    .prepare(
      `
      SELECT id, channel_id AS channelId, author_username AS authorUsername,
             content, created_at AS createdAt
      FROM messages
      WHERE channel_id = ?
        AND created_at >= ?
        AND created_at < ?
      ORDER BY created_at ASC
    `,
    )
    .all(channelId, startIso, endIsoExclusive) as StoredMessage[];

  return rows;
}

/** Returns distinct channel IDs that have at least one stored message in the range. */
export function listChannelsWithMessagesBetween(
  db: Database.Database,
  channelIds: string[],
  startIso: string,
  endIsoExclusive: string,
): string[] {
  if (channelIds.length === 0) {
    return [];
  }

  const placeholders = channelIds.map(() => "?").join(", ");
  const sql = `
    SELECT DISTINCT channel_id AS channelId
    FROM messages
    WHERE channel_id IN (${placeholders})
      AND created_at >= ?
      AND created_at < ?
  `;

  const rows = db.prepare(sql).all(...channelIds, startIso, endIsoExclusive) as {
    channelId: string;
  }[];

  return rows.map((r) => r.channelId);
}
