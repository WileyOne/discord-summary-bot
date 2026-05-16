import { REST, Routes, SlashCommandBuilder, ChannelType } from "discord.js";

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
