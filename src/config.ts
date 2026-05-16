import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    return fallback;
  }
  return value.trim();
}

function parseChannelIds(raw: string): string[] {
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

export type AppConfig = {
  discordToken: string;
  discordClientId: string;
  discordGuildId: string;
  trackedChannels: string[];
  summaryChannelId: string;
  summaryCron: string;
  timeZone: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  dbPath: string;
};

export function loadConfig(): AppConfig {
  const trackedChannels = parseChannelIds(required("TRACKED_CHANNELS"));
  if (trackedChannels.length === 0) {
    throw new Error("TRACKED_CHANNELS must contain at least one channel ID");
  }

  return {
    discordToken: required("DISCORD_TOKEN"),
    discordClientId: required("DISCORD_CLIENT_ID"),
    discordGuildId: required("DISCORD_GUILD_ID"),
    trackedChannels,
    summaryChannelId: required("SUMMARY_CHANNEL_ID"),
    summaryCron: required("SUMMARY_CRON"),
    timeZone: optional("TZ", "UTC"),
    ollamaBaseUrl: optional("OLLAMA_BASE_URL", "http://ollama:11434"),
    ollamaModel: optional("OLLAMA_MODEL", "llama3"),
    dbPath: optional("DB_PATH", "/data/bot.db"),
  };
}
