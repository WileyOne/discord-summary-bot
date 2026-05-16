import {
  Colors,
  EmbedBuilder,
  bold,
  inlineCode,
} from "discord.js";

import type { StructuredSummary } from "../ai/summarizer.js";

const MAX_FIELD_CHARS = 950;

function truncateBlock(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function formatBulletList(items: string[]): string {
  if (items.length === 0) return "_None_";
  const lines = items.map((s) => `• ${s}`);
  return truncateBlock(lines.join("\n"), MAX_FIELD_CHARS);
}

export function buildSummaryEmbed(input: {
  sourceChannelId: string;
  sourceChannelLabel: string;
  summaryDate: string;
  structured: StructuredSummary;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle(`Daily summary — ${input.summaryDate}`)
    .setDescription(
      truncateBlock(
        `${bold("Channel")}: ${input.sourceChannelLabel} (${inlineCode(input.sourceChannelId)})\n\n${input.structured.summary || "_No summary text returned._"}`,
        3900,
      ),
    )
    .addFields(
      { name: "Action items / due-outs", value: formatBulletList(input.structured.actionItems) },
      { name: "Tasks / assignments", value: formatBulletList(input.structured.tasks) },
      { name: "Calendar / deadlines / events", value: formatBulletList(input.structured.calendarItems) },
      { name: "Open questions / blockers", value: formatBulletList(input.structured.openQuestions) },
    )
    .setTimestamp(new Date());

  return embed;
}

export function buildSummaryErrorEmbed(input: {
  title: string;
  detail: string;
  sourceChannelId?: string;
  summaryDate?: string;
}): EmbedBuilder {
  const descriptionParts = [truncateBlock(input.detail, 3500)];
  if (input.sourceChannelId) {
    descriptionParts.unshift(`${bold("Channel ID")}: ${inlineCode(input.sourceChannelId)}`);
  }
  if (input.summaryDate) {
    descriptionParts.unshift(`${bold("Date")}: ${inlineCode(input.summaryDate)}`);
  }

  return new EmbedBuilder()
    .setColor(Colors.Red)
    .setTitle(input.title)
    .setDescription(descriptionParts.filter(Boolean).join("\n"))
    .setTimestamp(new Date());
}
