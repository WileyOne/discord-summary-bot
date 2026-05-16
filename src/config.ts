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

/** Unset / empty env → undefined (caller treats as “no limit” / omit). */
function optionalPositiveInt(name: string): number | undefined {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") {
    return undefined;
  }
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer when set`);
  }
  return n;
}

/** Extra Ollama /api/generate options merged under `options` (e.g. temperature). Must be a JSON object. */
function optionalJsonObject(name: string): Record<string, unknown> | undefined {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${name} must be valid JSON object: ${detail}`);
  }
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
  /** Max messages sent to the model (latest-first retention). Unset = all. */
  summaryMaxMessages?: number;
  /** Max approximate transcript characters sent to the model. Unset = unlimited. */
  summaryMaxTranscriptChars?: number;
  /** Ollama generate option num_predict (caps completion length → faster). */
  ollamaNumPredict?: number;
  /** Ollama generate option num_ctx (context window size). */
  ollamaNumCtx?: number;
  /** Merged into Ollama `options`; explicit NUM_PREDICT / NUM_CTX override same keys. */
  ollamaOptionsJson: Record<string, unknown>;
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
    summaryMaxMessages: optionalPositiveInt("SUMMARY_MAX_MESSAGES"),
    summaryMaxTranscriptChars: optionalPositiveInt("SUMMARY_MAX_TRANSCRIPT_CHARS"),
    ollamaNumPredict: optionalPositiveInt("OLLAMA_NUM_PREDICT"),
    ollamaNumCtx: optionalPositiveInt("OLLAMA_NUM_CTX"),
    ollamaOptionsJson: optionalJsonObject("OLLAMA_OPTIONS") ?? {},
  };
}
