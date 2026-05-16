import type Database from "better-sqlite3";

import { loadConfig, type AppConfig } from "./config.js";
import { openDatabase } from "./db/database.js";
import { waitForOllama } from "./ai/ollama.js";
import { createDiscordClient } from "./bot/client.js";
import { handleMessageCreate } from "./bot/events/messageCreate.js";
import { handleReady } from "./bot/events/ready.js";
import { handleSummarizeCommand } from "./bot/commands/summarize.js";
import { handleScheduleCommand } from "./bot/commands/schedule.js";
function wireDiscordHandlers(client: ReturnType<typeof createDiscordClient>, db: Database.Database, config: AppConfig) {
  client.once("ready", handleReady(client, db, config));

  client.on("messageCreate", handleMessageCreate(db, config));

  client.on("interactionCreate", async (interaction) => {
    try {
      if (!interaction.isChatInputCommand()) return;

      if (interaction.commandName === "summarize") {
        await handleSummarizeCommand(interaction, { db, config });
        return;
      }

      if (interaction.commandName === "schedule") {
        await handleScheduleCommand(interaction, { db, config });
        return;
      }
    } catch (err) {
      console.error("[SummaryBot] interactionCreate handler error:", err);
      try {
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "Something went wrong handling this command.",
            ephemeral: true,
          });
        }
      } catch {
        // ignore
      }
    }
  });
}

async function main() {
  const config = loadConfig();
  const db = openDatabase(config.dbPath);

  console.log("[SummaryBot] Waiting for Ollama…");
  await waitForOllama(config.ollamaBaseUrl);
  console.log("[SummaryBot] Ollama is reachable.");

  const client = createDiscordClient();
  wireDiscordHandlers(client, db, config);

  await client.login(config.discordToken);
}

main().catch((err) => {
  console.error("[SummaryBot] Fatal startup error:", err);
  process.exit(1);
});
