import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

function ensureDbDirectory(dbPath: string): void {
  const dir = path.dirname(dbPath);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.error(`Failed to create database directory ${dir}`, err);
    throw err;
  }
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      author_username TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel_created
      ON messages (channel_id, created_at);

    CREATE TABLE IF NOT EXISTS summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT NOT NULL,
      summary_date TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(channel_id, summary_date)
    );

    CREATE INDEX IF NOT EXISTS idx_summaries_channel_date
      ON summaries (channel_id, summary_date);
  `);
}

export function openDatabase(dbPath: string): Database.Database {
  ensureDbDirectory(dbPath);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}
