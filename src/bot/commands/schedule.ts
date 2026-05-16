import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  bold,
  inlineCode,
} from "discord.js";
import cron from "node-cron";
import type Database from "better-sqlite3";

import type { AppConfig } from "../../config.js";
import {
  clearScheduleSettings,
  getScheduleSettingsRow,
  resolveEffectiveConfig,
  upsertScheduleSettings,
} from "../../db/scheduleSettings.js";
import { startOrRestartDailySummaryCron } from "../../scheduler/dailySummary.js";

function isValidIanaTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function handleScheduleCommand(
  interaction: ChatInputCommandInteraction,
  ctx: { db: Database.Database; config: AppConfig },
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: "You need **Manage Server** to change the summary schedule.",
      ephemeral: true,
    });
    return;
  }

  const sub = interaction.options.getSubcommand(true);

  if (sub === "view") {
    const row = getScheduleSettingsRow(ctx.db);
    const effective = resolveEffectiveConfig(ctx.db, ctx.config);

    const lines = [
      `${bold("Effective (used now)")}`,
      `• Cron: ${inlineCode(effective.summaryCron)}`,
      `• Timezone: ${inlineCode(effective.timeZone)}`,
      "",
      `${bold("From .env (defaults)")}`,
      `• SUMMARY_CRON: ${inlineCode(ctx.config.summaryCron)}`,
      `• TZ: ${inlineCode(ctx.config.timeZone)}`,
    ];

    if (row) {
      lines.push(
        "",
        `${bold("Stored overrides (SQLite)")}`,
        `• summary_cron: ${row.summaryCron ? inlineCode(row.summaryCron) : "_not set — uses .env_"}`,
        `• time_zone: ${row.timeZone ? inlineCode(row.timeZone) : "_not set — uses .env_"}`,
        `• updated_at: ${inlineCode(row.updatedAt)}`,
      );
    } else {
      lines.push("", `${bold("Stored overrides")}: _none_ (using ${inlineCode(".env")} only)`);
    }

    lines.push(
      "",
      `${bold("Tracked channels")}: ${ctx.config.trackedChannels.length} (see TRACKED_CHANNELS in .env)`,
    );

    await interaction.reply({ content: lines.join("\n"), ephemeral: true });
    return;
  }

  if (sub === "clear") {
    await interaction.deferReply({ ephemeral: true });
    try {
      clearScheduleSettings(ctx.db);
      startOrRestartDailySummaryCron({ client: interaction.client, db: ctx.db, config: ctx.config });
      await interaction.editReply({
        content:
          "Removed saved schedule overrides. The bot is using **SUMMARY_CRON** and **TZ** from `.env` again (cron restarted).",
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      await interaction.editReply({ content: `Failed to clear schedule: ${detail}` });
    }
    return;
  }

  if (sub === "set") {
    const cronExprRaw = interaction.options.getString("cron");
    const tzRaw = interaction.options.getString("timezone");

    const cronExpr = cronExprRaw?.trim() ?? "";
    const tz = tzRaw?.trim() ?? "";

    if (!cronExpr && !tz) {
      await interaction.reply({
        content: "Provide at least one of **`cron`** or **`timezone`** (or use `/schedule clear`).",
        ephemeral: true,
      });
      return;
    }

    if (cronExpr && !cron.validate(cronExpr)) {
      await interaction.reply({
        content: `Invalid cron expression: ${inlineCode(cronExpr)}. Use standard 5-field cron (e.g. ${inlineCode("0 18 * * 1-5")}).`,
        ephemeral: true,
      });
      return;
    }

    if (tz && !isValidIanaTimeZone(tz)) {
      await interaction.reply({
        content: `Invalid IANA timezone: ${inlineCode(tz)}. Example: ${inlineCode("America/New_York")}.`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      upsertScheduleSettings(ctx.db, {
        summaryCron: cronExpr ? cronExpr : undefined,
        timeZone: tz ? tz : undefined,
      });
      startOrRestartDailySummaryCron({ client: interaction.client, db: ctx.db, config: ctx.config });

      const effective = resolveEffectiveConfig(ctx.db, ctx.config);
      await interaction.editReply({
        content: [
          "Schedule updated and cron restarted.",
          `• **Cron:** ${inlineCode(effective.summaryCron)}`,
          `• **Timezone:** ${inlineCode(effective.timeZone)}`,
          "",
          "_Stored in SQLite; survives bot restarts. Use `/schedule clear` to revert to `.env`._",
        ].join("\n"),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("[SummaryBot] /schedule set failed:", detail);
      await interaction.editReply({ content: `Failed to save schedule: ${detail}` });
    }
    return;
  }
}
