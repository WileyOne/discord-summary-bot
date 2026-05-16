import type { StoredMessage } from "../db/messages.js";
import { ollamaGenerate } from "./ollama.js";

export type StructuredSummary = {
  summary: string;
  actionItems: string[];
  tasks: string[];
  calendarItems: string[];
  openQuestions: string[];
};

export function buildSummarizerPrompt(input: {
  channelLabel: string;
  summaryDate: string;
  messages: StoredMessage[];
}): string {
  const lines = input.messages.map((m) => {
    const header = `[${m.createdAt}] ${m.authorUsername}`;
    return `${header}: ${m.content}`;
  });

  const transcript = lines.join("\n");

  return `You are an assistant that summarizes Discord channel activity for one calendar day.

Channel: ${input.channelLabel}
Date (local/org TZ context provided externally): ${input.summaryDate}

Below is the chronological message transcript for this channel on that date. Ignore bots (already filtered).

Transcript:
${transcript}

Return ONLY valid JSON with exactly these keys and types:
{
  "summary": string,
  "actionItems": string[],
  "tasks": string[],
  "calendarItems": string[],
  "openQuestions": string[]
}

Rules:
- Use concise bullets inside arrays where helpful; each array entry should be a single human-readable string.
- Extract explicit decisions, commitments, owners/assignees when mentioned.
- actionItems: concrete next steps / due-outs.
- tasks: work items or assignments.
- calendarItems: dates/times/deadlines/events mentioned.
- openQuestions: unanswered questions / blockers / needs clarification.
- If a section has nothing relevant, use an empty array (summary must still be a short paragraph).
- Do not include markdown fences or commentary outside JSON.
`;
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

function extractFirstJsonObject(text: string): string {
  const stripped = stripCodeFences(text);
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model output");
  }
  return stripped.slice(start, end + 1);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").map((s) => s.trim()).filter((s) => s.length > 0);
}

export function parseStructuredSummaryJson(rawModelText: string): StructuredSummary {
  const jsonText = extractFirstJsonObject(rawModelText);
  const parsed = JSON.parse(jsonText) as unknown;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Parsed JSON is not an object");
  }

  const obj = parsed as Record<string, unknown>;

  const summary = typeof obj["summary"] === "string" ? obj["summary"].trim() : "";

  return {
    summary,
    actionItems: asStringArray(obj["actionItems"]),
    tasks: asStringArray(obj["tasks"]),
    calendarItems: asStringArray(obj["calendarItems"]),
    openQuestions: asStringArray(obj["openQuestions"]),
  };
}

export async function summarizeMessages(input: {
  ollamaBaseUrl: string;
  ollamaModel: string;
  channelLabel: string;
  summaryDate: string;
  messages: StoredMessage[];
}): Promise<StructuredSummary> {
  const prompt = buildSummarizerPrompt({
    channelLabel: input.channelLabel,
    summaryDate: input.summaryDate,
    messages: input.messages,
  });

  const response = await ollamaGenerate(input.ollamaBaseUrl, {
    model: input.ollamaModel,
    prompt,
  });

  const text = typeof response.response === "string" ? response.response : "";
  if (!text.trim()) {
    throw new Error("Ollama returned an empty response");
  }

  return parseStructuredSummaryJson(text);
}
