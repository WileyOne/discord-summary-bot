import { REST, Routes, SlashCommandBuilder, ChannelType, PermissionFlagsBits } from "discord.js";

export function buildSlashCommands() {
  return [
    new SlashCommandBuilder()
      .setName("summarize")
      .setDescription("Generate and post a structured daily summary for a tracked channel")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Tracked channel to summarize (defaults to this channel)")
          .addChannelTypes(
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
            ChannelType.PublicThread,
            ChannelType.PrivateThread,
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName("date")
          .setDescription("Date in YYYY-MM-DD (defaults to today in TZ)")
          .setMinLength(10)
          .setMaxLength(10),
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName("schedule")
      .setDescription("View or change automatic summary schedule (cron + timezone)")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((sub) =>
        sub.setName("view").setDescription("Show effective cron, timezone, .env defaults, and SQLite overrides"),
      )
      .addSubcommand((sub) =>
        sub
          .setName("set")
          .setDescription("Persist cron and/or timezone (overrides .env until cleared)")
          .addStringOption((opt) =>
            opt
              .setName("cron")
              .setDescription('5-field cron, e.g. "0 18 * * 1-5" (weekdays 6pm)')
              .setRequired(false),
          )
          .addStringOption((opt) =>
            opt
              .setName("timezone")
              .setDescription('IANA timezone, e.g. "America/New_York"')
              .setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("clear")
          .setDescription("Remove saved overrides; use SUMMARY_CRON and TZ from .env again"),
      )
      .toJSON(),
  ];
}

export async function registerGuildSlashCommands(input: {
  token: string;
  clientId: string;
  guildId: string;
}): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(input.token);
  await rest.put(Routes.applicationGuildCommands(input.clientId, input.guildId), {
    body: buildSlashCommands(),
  });
}
