import type { Message } from "discord.js";
import type Database from "better-sqlite3";

import type { AppConfig } from "../../config.js";
import { insertMessage } from "../../db/messages.js";

export function handleMessageCreate(db: Database.Database, config: AppConfig) {
  return async (message: Message): Promise<void> => {
    try {
      if (!message.guildId) return;
      if (message.author.bot) return;

      const allowed = new Set(config.trackedChannels);
      if (!allowed.has(message.channelId)) return;

      const createdAt = message.createdAt.toISOString();
      const content = message.content?.trim() ?? "";

      insertMessage(db, {
        id: message.id,
        channelId: message.channelId,
        authorUsername: message.author.username,
        content,
        createdAt,
      });
    } catch (err) {
      console.error("[SummaryBot] Failed storing message:", err);
    }
  };
}
