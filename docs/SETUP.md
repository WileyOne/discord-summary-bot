# SummaryBot — full setup (rebuild on any server)

This document is a **single rebuild checklist**: Discord configuration, environment variables, Docker Compose, verification, persistence, and **TrueNAS-specific** notes. The concise README overview lives in [`../README.md`](../README.md).

---

## 1. What you’re deploying

| Piece | Role |
|-------|------|
| **`ollama`** container | Local LLM API (`ollama/ollama`) |
| **`bot`** container | discord.js bot + SQLite + cron + `/summarize` |

Networking:

- Bot reaches Discord **outbound** (HTTPS / gateway — no inbound ports required for Discord).
- Bot reaches Ollama at **`OLLAMA_BASE_URL`** — default in Compose is **`http://ollama:11434`** (Docker DNS inside the **`summarybot`** network).

Secrets stay in **`.env`** on the host (**never commit**).

---

## 2. Prerequisites on the server

- **Docker Engine** + **Docker Compose plugin** (`docker compose version`).
- **Outbound Internet** (Discord API + pulling images/models).
- **CPU/RAM** suitable for your **`OLLAMA_MODEL`** (host-dependent).

Optional:

- **`sudo`** if your Linux user cannot access **`/var/run/docker.sock`** (common). Prefer **`sudo usermod -aG docker <user>`** + new SSH session if you want passwordless Docker.

---

## 3. Get this repository onto the server

### Option A — Git clone (preferred)

```bash
cd ~
git clone https://github.com/WileyOne/discord-summary-bot.git
cd discord-summary-bot
```

### Option B — Tarball (no Git on disk)

```bash
mkdir -p ~/discord-summary-bot && cd ~/discord-summary-bot
curl -L -o /tmp/discord-summary-bot.tgz https://github.com/WileyOne/discord-summary-bot/archive/refs/heads/main.tar.gz
tar -xzf /tmp/discord-summary-bot.tgz --strip-components=1 -C ~/discord-summary-bot
```

### Option C — TrueNAS / ZFS dataset quirks

Some **`/mnt/Storage/...`** datasets behave poorly with Git (**`chmod` on `.git/*`** fails). If **`git clone` fails there**, clone under **`~/discord-summary-bot`** and run Compose from home — persistence uses **Docker named volumes**, not the checkout path.

---

## 4. Discord Developer Portal — credentials & IDs

Open **[Discord Developer Portal](https://discord.com/developers/applications)**.

### 4.1 Application & bot token

1. **Applications** → create or select application.
2. **Bot** → **Reset Token** / **Copy** → this is **`DISCORD_TOKEN`**.

### 4.2 Application (client) ID

3. **OAuth2** → **General** → **CLIENT ID** → **`DISCORD_CLIENT_ID`**.

### 4.3 Message Content Intent

4. **Bot** → **Privileged Gateway Intents** → enable **MESSAGE CONTENT INTENT** (required to read message bodies).

### 4.4 Guild (server) ID — `DISCORD_GUILD_ID`

5. Discord desktop/web → **User Settings → App Settings → Advanced → Developer Mode** → **On**.
6. Right-click your **server icon** → **Copy Server ID** → **`DISCORD_GUILD_ID`**.

Slash commands are registered **for this guild** when you run the registration script later.

### 4.5 Channel IDs — `TRACKED_CHANNELS` & `SUMMARY_CHANNEL_ID`

7. **Tracked channels:** channels whose messages should be **stored and summarized**.  
   Right-click each channel → **Copy Channel ID**.  
   **`TRACKED_CHANNELS`** = comma-separated list **with no spaces**, e.g.  
   `111111111111111111,222222222222222222`.

8. **Summary channel:** where embeds are posted (daily cron + `/summarize`).  
   Right-click channel → **Copy Channel ID** → **`SUMMARY_CHANNEL_ID`**.

The bot needs permission to **read** tracked channels and **send messages / embeds** in the summary channel. Those rights come from **(a)** privileged intents in the portal, **(b)** the **OAuth2 URL Generator** scopes + bot permission checkboxes, and **(c)** channel/category overrides in your server. **Intents alone are not enough** — if Step **4.6** is skipped or incomplete, the bot may never appear in the server or may lack channel access.

### 4.6 OAuth2 URL Generator — scopes & bot permissions (required)

Do this in **[Discord Developer Portal](https://discord.com/developers/applications)** → your application → **OAuth2** → **URL Generator**.

**Step A — Scopes**

Under **SCOPES**, enable exactly these (both are required for SummaryBot):

| Scope | Why |
|-------|-----|
| **`bot`** | Adds the bot user to your server with the permissions you select below. |
| **`applications.commands`** | Allows **`/summarize`** (slash commands) to be registered and shown in Discord. |

Without **`bot`**, the authorize flow does not add the bot to a server. Without **`applications.commands`**, slash commands will not work as intended.

**Step B — Bot permissions**

Under **BOT PERMISSIONS** (only visible after you select the **`bot`** scope), enable at least:

| Permission (typical **General** / **Text** group in portal) | Purpose |
|-------------------------------|---------|
| **View Channels** | Discover channels so role/category permissions can apply. |
| **Read Message History** | Read past messages where needed (recommended even when using live events). |
| **Send Messages** | Post messages where allowed. |
| **Embed Links** | Post summary **embeds** to **`SUMMARY_CHANNEL_ID`**. |

If your server uses **threads** for tracked or summary channels, add thread-related permissions as appropriate (**Send Messages in Threads**, **Create Public Threads**, etc.).

**Step C — Generate URL and authorize**

1. Scroll to the bottom of the URL Generator page and **copy** the **generated URL**.
2. Open it in a browser while logged into Discord as someone who can **Manage Server** on the target guild.
3. Select the **correct server** → **Authorize** → complete CAPTCHA if shown.

**After you change** scopes, bot permission checkboxes, or privileged intents: generate a **new** URL and authorize again (or **kick** the bot and re-invite), so Discord applies the updated grants.

### 4.7 Confirm the bot is in the server

1. Discord → target server → **Server Settings** → **Members** (or search `@` + bot username).
2. **Integrations** should list the application if the invite succeeded.

If the bot never appears under Members, the authorize flow did not complete or the wrong account/server was chosen — repeat **§4.6**.

## 5. Environment file (`.env`)

Work inside the repo directory:

```bash
cd ~/discord-summary-bot    # or your checkout path
cp .env.example .env          # or: cp .env.development.example .env
nano .env
chmod 600 .env
```

### Required variables (must be non-empty)

| Variable | Meaning |
|----------|---------|
| **`DISCORD_TOKEN`** | Bot token |
| **`DISCORD_CLIENT_ID`** | Application / OAuth2 client ID |
| **`DISCORD_GUILD_ID`** | Target server ID (slash registration) |
| **`TRACKED_CHANNELS`** | Comma-separated channel IDs |
| **`SUMMARY_CHANNEL_ID`** | Channel ID for posted summaries |
| **`SUMMARY_CRON`** | Cron expression (`TZ`-aware) |

### Recommended defaults (Compose single stack)

| Variable | Typical value |
|----------|----------------|
| **`TZ`** | IANA zone, e.g. **`America/New_York`** |
| **`OLLAMA_BASE_URL`** | **`http://ollama:11434`** |
| **`OLLAMA_MODEL`** | e.g. **`llama3`** (pull explicitly below) |
| **`DB_PATH`** | **`/data/bot.db`** |

### Optional — summarization speed / cost tuning

Unset variables mean **no limit** / **Ollama defaults**.

| Variable | Meaning |
|----------|---------|
| **`SUMMARY_MAX_MESSAGES`** | Max messages sent to the model per summary (**latest** kept for that calendar day). |
| **`SUMMARY_MAX_TRANSCRIPT_CHARS`** | Approximate character budget for the transcript; drops **oldest** messages first. |
| **`OLLAMA_NUM_PREDICT`** | Maps to Ollama **`num_predict`** — caps completion length (often **large latency win**). Try **`512`–`1024`**. |
| **`OLLAMA_NUM_CTX`** | Maps to **`num_ctx`** — smaller context can reduce prefill cost (risk of truncating long threads). |
| **`OLLAMA_OPTIONS`** | JSON object merged into Ollama **`options`** (e.g. **`{"temperature":0.2}`**). **`num_predict`** / **`num_ctx`** from dedicated vars override keys here if both set. |

Shell hygiene (avoid paste accidents):

- Run **`cp`** / **`nano`** / **`chmod`** **one command per line** — don’t paste commented examples after **`cp`** on the same line in **`zsh`**.

---

## 6. Start the stack

Production-like (**Ollama not exposed on host ports**):

```bash
cd ~/discord-summary-bot
sudo docker compose up -d --build
```

Test/dev (**Ollama on host loopback `127.0.0.1:11434`**):

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Inspect:

```bash
sudo docker compose ps
sudo docker compose logs --tail=100 bot
sudo docker compose logs --tail=50 ollama
```

---

## 7. Pull the LLM

Must match **`OLLAMA_MODEL`** in `.env`:

```bash
sudo docker compose exec ollama ollama pull llama3
sudo docker compose exec ollama ollama list
```

---

## 8. Register slash commands (once per guild; repeat after command changes)

Registers **`/summarize`** and **`/schedule`** for **`DISCORD_GUILD_ID`**.

```bash
cd ~/discord-summary-bot
sudo docker compose run --rm bot npm run register-commands
```

---

## 9. Verification

1. Bot appears **online** in Discord.
2. Send a normal message (non-bot) in a **tracked** channel.
3. Run **`/summarize`** (optional channel/date).
4. Try **`/schedule view`** — should show effective cron and timezone (**Manage Server** required).
5. Confirm an embed lands in **`SUMMARY_CHANNEL_ID`** (or check logs if generation fails).

---

## 10. Inbound HTTP / reverse proxies

**Not required** for Discord operation. The bot only needs **outbound** connectivity.

Do **not** expose **Ollama** (`11434`) publicly without VPN/auth. Optional **`docker-compose.dev.yml`** binds **`127.0.0.1:11434`** for debugging on the host only.

---

## 11. Persistence & moving servers

Compose defines named volumes:

- **`ollama-data`** — models  
- **`bot-data`** — SQLite at **`DB_PATH`** (default **`/data/bot.db`** inside the container)

### Same server — backup mindset

- Snapshot or copy Docker volume data per your platform (`docker volume inspect …`).
- Keep a secure copy of **`.env`** off the repo.

### New server — rebuild checklist

1. Install Docker + Compose.
2. Clone/tarball this repo.
3. Restore **`.env`** (same Discord app possible).
4. **`docker compose up -d --build`**
5. **`ollama pull`** for **`OLLAMA_MODEL`**
6. **`docker compose run --rm bot npm run register-commands`** (same guild unless guild ID changed)
7. Historical messages/summaries **do not** migrate unless you restore **`bot-data`** / **`ollama-data`** volumes or dump/restore SQLite manually.

---

## 12. Troubleshooting (quick)

| Symptom | Checks |
|---------|--------|
| **`permission denied` on Docker socket** | Use **`sudo docker …`** or add user to **`docker`** group + re-login |
| **Git `chmod … config.lock` on a dataset** | Clone under **`~`**, not SMB-weird paths |
| **Bot offline** | **`docker compose logs bot`**, token wrong or intents missing |
| **`Used disallowed intents`** | Enable **Message Content Intent** in portal |
| **No messages summarized** | Channel IDs wrong / not in **`TRACKED_CHANNELS`** / bot can’t read channel |
| **`SQLITE_CANTOPEN` / unable to open database file** | **`bot-data`** is often **root-owned** while the app runs as **`node`**. **Rebuild** the bot image (entrypoint **`chown`s `/data`**). One-off: `sudo docker volume ls` → note `*_bot-data`, then `sudo docker run --rm -v THAT_VOLUME:/data alpine chown -R 1000:1000 /data`. Keep **`DB_PATH=/data/bot.db`**. |
| **Ollama errors** | **`docker compose logs ollama`**, confirm **`ollama pull`** succeeded |

---

## 13. Optional — Docker Desktop “remote” control

Docker Desktop on a workstation can target the server with **`docker context`** over SSH **only if** Docker works for your SSH user on the server (often **`sudo`**). Compose/build run **on the remote**. See Docker docs for **`docker context create`**.

---

## 14. Reference files in this repo

| File | Purpose |
|------|---------|
| [`docker-compose.yml`](../docker-compose.yml) | **`ollama`** + **`bot`**, network **`summarybot`** |
| [`docker-compose.dev.yml`](../docker-compose.dev.yml) | Optional **`127.0.0.1:11434`** publish |
| [`.env.example`](../.env.example) | Documented variables |
| [`.env.development.example`](../.env.development.example) | Placeholder-style template |

---

*Document version tracks repo `main`; update Discord portal screenshots/links if Discord UI changes.*
