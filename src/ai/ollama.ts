export type OllamaGenerateRequest = {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: Record<string, unknown>;
};

export type OllamaGenerateResponse = {
  model: string;
  created_at?: string;
  response?: string;
  done?: boolean;
};

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function waitForOllama(baseUrl: string, opts?: { timeoutMs?: number }): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  const started = Date.now();
  let attempt = 0;

  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        return;
      }
    } catch {
      // ignore until timeout
    }

    attempt += 1;
    const backoff = Math.min(5000, 250 + attempt * 250);
    await sleep(backoff);
  }

  throw new Error(`Timed out waiting for Ollama at ${baseUrl}`);
}

export async function ollamaGenerate(
  baseUrl: string,
  body: OllamaGenerateRequest,
  opts?: { timeoutMs?: number; retries?: number },
): Promise<OllamaGenerateResponse> {
  const timeoutMs = opts?.timeoutMs ?? 600_000;
  const retries = opts?.retries ?? 2;
  const url = `${baseUrl.replace(/\/$/, "")}/api/generate`;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ stream: false, ...body }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Ollama HTTP ${res.status}: ${text || res.statusText}`);
      }

      const json = (await res.json()) as OllamaGenerateResponse;
      return json;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;

      if (attempt >= retries) {
        break;
      }

      const backoff = Math.min(10_000, 500 + attempt * 750);
      await sleep(backoff);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
