import { loadConfig } from "../src/config.js";
import { registerGuildSlashCommands } from "../src/bot/commands/register.js";

async function main() {
  const config = loadConfig();

  await registerGuildSlashCommands({
    token: config.discordToken,
    clientId: config.discordClientId,
    guildId: config.discordGuildId,
  });

  console.log("[SummaryBot] Guild slash commands registered.");
}

main().catch((err) => {
  console.error("[SummaryBot] Command registration failed:", err);
  process.exit(1);
});
