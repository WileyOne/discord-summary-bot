# SummaryBot (Discord + Ollama + SQLite)

SummaryBot joins your Discord server, records messages from configured channels, and generates structured daily summaries using a **local Ollama** model over HTTP. Everything is wired for **Docker Compose** from day one.

## Features

- Tracks messages only in **explicitly configured channels**
- Ignores bot-authored messages
- Persists raw messages + generated summaries in **SQLite** (`better-sqlite3`)
- Runs an automatic summary on a **`SUMMARY_CRON` schedule** (`node-cron`, timezone via `TZ`)
- Supports **`/summarize`** for on-demand runs (posts output to `SUMMARY_CHANNEL_ID`)

## Prerequisites

- Docker + Docker Compose
- A Discord bot token + basic bot setup (privileged intents below)

## Discord setup (developer portal)

1. Create an application and bot user.
2. Enable **Privileged Gateway Intents** → **Message Content Intent** (required to read message bodies).
3. Invite the bot with scopes **`bot`** and **`applications.commands`**, and permissions appropriate for your channels (at minimum: read/send messages in tracked + summary channels).

## Configure environment variables

Copy `.env.example` → `.env` and fill values:

- **`DISCORD_TOKEN`**: Bot token
- **`DISCORD_CLIENT_ID`**: Application ID (aka client ID)
- **`DISCORD_GUILD_ID`**: Server ID where you’re registering slash commands
- **`TRACKED_CHANNELS`**: Comma-separated numeric channel IDs to monitor/store
- **`SUMMARY_CHANNEL_ID`**: Channel ID where summaries are posted
- **`SUMMARY_CRON`**: Cron expression (interpreted in `TZ`)
- **`TZ`**: IANA timezone name for cron + “calendar day” boundaries (example: `America/New_York`)
- **`OLLAMA_BASE_URL`**: Default in Compose is `http://ollama:11434`
- **`OLLAMA_MODEL`**: Example: `llama3`
- **`DB_PATH`**: Default in Compose-friendly setup is `/data/bot.db`

## Pull the Ollama model

After Compose is up, pull the model you configured (example uses `llama3`):

```bash
docker compose up -d ollama
docker compose exec ollama ollama pull llama3
```

You can verify it exists:

```bash
docker compose exec ollama ollama list
```

## Register slash commands

Slash commands are registered **per guild** for fast iteration.

### Local (recommended while developing)

```bash
cd discord-summary-bot
npm ci
npm run build
npm run register-commands
```

### Docker (one-off container)

```bash
docker compose run --rm bot npm run register-commands
```

## Run with Docker Compose

```bash
cd discord-summary-bot
docker compose up --build
```

The bot service waits for Docker’s **Ollama healthcheck**, and the bot also retries Ollama readiness on startup (`waitForOllama`).

## Local development (without Docker)

```bash
cd discord-summary-bot
npm ci
cp .env.example .env
# Point OLLAMA_BASE_URL at your local Ollama, e.g. http://127.0.0.1:11434
npm run dev
```

## Notes / operational guidance

- Summaries are generated from **stored messages** only; if the bot wasn’t running, history won’t exist in SQLite yet.
- Message collection requires the bot to **actually receive message events** (it must be present in the server and able to read those channels).
- If the model returns malformed JSON, SummaryBot logs the failure and posts an **error embed** to `SUMMARY_CHANNEL_ID` (when possible) instead of crashing.

## JSON shape produced by the model

The prompt asks for JSON with keys:

- `summary`
- `actionItems`
- `tasks`
- `calendarItems`
- `openQuestions`

Those values are parsed defensively and rendered into a Discord embed.
