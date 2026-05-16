import type { StoredMessage } from "../db/messages.js";
import { ollamaGenerate } from "./ollama.js";

export type StructuredSummary = {
  summary: string;
  actionItems: string[];
  tasks: string[];
  calendarItems: string[];
  openQuestions: string[];
};

function estimateTranscriptChars(messages: StoredMessage[]): number {
  let sum = 0;
  for (const msg of messages) {
    sum += `[${msg.createdAt}] ${msg.authorUsername}: ${msg.content}`.length + 1;
  }
  return sum;
}

/**
 * Keeps the latest messages first by count, then drops oldest until under char budget.
 * Single oversized messages get content clipped.
 */
export function truncateMessagesForSummarization(
  messages: StoredMessage[],
  maxMessages?: number,
  maxTranscriptChars?: number,
): StoredMessage[] {
  let m = messages;
  if (maxMessages !== undefined && maxMessages > 0 && m.length > maxMessages) {
    m = m.slice(-maxMessages);
  }
  if (maxTranscriptChars === undefined || maxTranscriptChars <= 0 || m.length === 0) {
    return m;
  }

  while (m.length > 1 && estimateTranscriptChars(m) > maxTranscriptChars) {
    m = m.slice(1);
  }

  if (m.length === 1 && estimateTranscriptChars(m) > maxTranscriptChars) {
    const msg = m[0];
    if (!msg) {
      return m;
    }
    const prefix = `[${msg.createdAt}] ${msg.authorUsername}: `;
    const overhead = prefix.length + 48;
    const budget = Math.max(256, maxTranscriptChars - overhead);
    const c = msg.content;
    const clipped =
      c.length <= budget ? c : `…[truncated]\n${c.slice(-budget)}`;
    const clippedMsg: StoredMessage = {
      id: msg.id,
      channelId: msg.channelId,
      authorUsername: msg.authorUsername,
      content: clipped,
      createdAt: msg.createdAt,
    };
    m = [clippedMsg];
  }

  return m;
}

function buildGenerateOptions(input: {
  ollamaNumPredict?: number;
  ollamaNumCtx?: number;
  ollamaOptionsJson: Record<string, unknown>;
}): Record<string, unknown> | undefined {
  const opts: Record<string, unknown> = { ...input.ollamaOptionsJson };
  if (input.ollamaNumPredict !== undefined) {
    opts["num_predict"] = input.ollamaNumPredict;
  }
  if (input.ollamaNumCtx !== undefined) {
    opts["num_ctx"] = input.ollamaNumCtx;
  }
  return Object.keys(opts).length > 0 ? opts : undefined;
}

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
  summaryMaxMessages?: number;
  summaryMaxTranscriptChars?: number;
  ollamaNumPredict?: number;
  ollamaNumCtx?: number;
  ollamaOptionsJson: Record<string, unknown>;
}): Promise<StructuredSummary> {
  const forPrompt = truncateMessagesForSummarization(
    input.messages,
    input.summaryMaxMessages,
    input.summaryMaxTranscriptChars,
  );

  if (forPrompt.length < input.messages.length) {
    console.log(
      `[SummaryBot] Transcript truncated for model: ${input.messages.length} → ${forPrompt.length} messages`,
    );
  }

  const prompt = buildSummarizerPrompt({
    channelLabel: input.channelLabel,
    summaryDate: input.summaryDate,
    messages: forPrompt,
  });

  const options = buildGenerateOptions({
    ollamaNumPredict: input.ollamaNumPredict,
    ollamaNumCtx: input.ollamaNumCtx,
    ollamaOptionsJson: input.ollamaOptionsJson,
  });

  const response = await ollamaGenerate(input.ollamaBaseUrl, {
    model: input.ollamaModel,
    prompt,
    ...(options ? { options } : {}),
  });

  const text = typeof response.response === "string" ? response.response : "";
  if (!text.trim()) {
    throw new Error("Ollama returned an empty response");
  }

  return parseStructuredSummaryJson(text);
}
