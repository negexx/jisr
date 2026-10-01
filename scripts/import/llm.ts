import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

// A small client for the OpenCode Go API. Three wire formats sit behind one `complete()`:
// OpenAI chat/completions, OpenAI responses, Anthropic messages. Every call is streamed so the time
// to first token is measured, its tokens are normalised to {input, cached, output}, its cost is
// computed from the price table below and charged to a hard per-run Budget. The API key is read from
// OPENCODE_API_KEY (env or .env.local) and is never logged or echoed.
const BASE_URL = "https://opencode.ai/zen/go/v1";
const TIMEOUT_MS = 240_000;
// A stream that sends nothing for this long is stalled: abort and retry instead of waiting for the total timeout.
const IDLE_MS = 45_000;
const MAX_ATTEMPTS = 3;

export type Wire = "chat" | "responses" | "messages";
export type Usage = { input: number; cached: number; output: number };

export type ModelSpec = {
  id: string;
  wire: Wire;
  // USD per 1M tokens
  price: { input: number; output: number; cached: number };
  // priced double on weekdays 01-04 and 06-10 UTC
  peakDouble?: boolean;
  // merged into the request body (a model's way of switching its reasoning off, for instance)
  body?: Record<string, unknown>;
};

const spec = (
  id: string,
  wire: Wire,
  input: number,
  output: number,
  cached: number,
  extra: Pick<ModelSpec, "peakDouble" | "body"> = {},
): [string, ModelSpec] => [id, { id, wire, price: { input, output, cached }, ...extra }];

// Prices from the OpenCode Go console (USD per 1M tokens: input / output / cached read).
export const MODELS: Record<string, ModelSpec> = Object.fromEntries([
  spec("muse-spark-1.3-contributor", "responses", 0.1, 0.2, 0.002),
  spec("gpt-6-luna", "responses", 0.1, 0.5, 0.01, { body: { reasoning: { effort: "none" } } }),
  spec("mimo-v2.6-flash", "chat", 0.14, 0.28, 0.0028, { body: { reasoning_effort: "none" } }),
  spec("mimo-v2.5", "chat", 0.14, 0.28, 0.0028, { body: { reasoning_effort: "none" } }),
  spec("hy3", "chat", 0.14, 0.58, 0.035, { body: { reasoning_effort: "none" } }),
  spec("qwen3.8-flash", "messages", 0.15, 0.47, 0.016, {
    body: { thinking: { type: "disabled" } },
  }),
  spec("glm-5.3-flash", "chat", 0.15, 0.5, 0.03),
  spec("deepseek-v4.1-flash", "chat", 0.15, 0.6, 0.003, {
    peakDouble: true,
    body: { reasoning_effort: "none" },
  }),
  spec("longcat-2.5-preview-free", "chat", 0, 0, 0),
  spec("space-bunny-free", "chat", 0, 0, 0),
  spec("kimi-k2.7-code", "chat", 0.95, 4, 0.19),
  spec("glm-5.2", "chat", 1.4, 4.4, 0.26),
  spec("qwen3.7-plus", "messages", 0.4, 1.6, 0.04),
]);

export function isPeak(at: Date): boolean {
  const day = at.getUTCDay();
  if (day === 0 || day === 6) return false;
  const hour = at.getUTCHours();
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
}

export function costUsd(model: ModelSpec, usage: Usage, at: Date = new Date()): number {
  const uncached = Math.max(0, usage.input - usage.cached);
  const raw =
    (uncached * model.price.input +
      usage.cached * model.price.cached +
      usage.output * model.price.output) /
    1_000_000;
  return model.peakDouble === true && isPeak(at) ? raw * 2 : raw;
}

const num = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;
const obj = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

export function normalizeUsage(wire: Wire, raw: unknown): Usage {
  const u = obj(raw);
  if (wire === "chat") {
    return {
      input: num(u.prompt_tokens),
      cached: num(obj(u.prompt_tokens_details).cached_tokens),
      output: num(u.completion_tokens),
    };
  }
  if (wire === "responses") {
    return {
      input: num(u.input_tokens),
      cached: num(obj(u.input_tokens_details).cached_tokens),
      output: num(u.output_tokens),
    };
  }
  const cached = num(u.cache_read_input_tokens);
  return {
    input: num(u.input_tokens) + cached + num(u.cache_creation_input_tokens),
    cached,
    output: num(u.output_tokens),
  };
}

// --- budget --------------------------------------------------------------------------------------
export class BudgetExceeded extends Error {}

// A hard cap per run: the run stops at the cap instead of spending on.
export class Budget {
  spentUsd = 0;
  spentTokens = 0;
  constructor(private readonly cap: { maxUsd: number; maxTokens: number }) {}

  assertRoom(): void {
    if (this.spentUsd >= this.cap.maxUsd || this.spentTokens >= this.cap.maxTokens) {
      throw new BudgetExceeded(
        `budget reached: $${this.spentUsd.toFixed(4)} of $${this.cap.maxUsd}, ${this.spentTokens} of ${this.cap.maxTokens} tokens`,
      );
    }
  }

  charge(usd: number, tokens: number): void {
    this.spentUsd += usd;
    this.spentTokens += tokens;
    this.assertRoom();
  }
}

// --- server-sent events --------------------------------------------------------------------------
// Returns a function to feed text chunks to; `onData` gets the payload of every `data:` event.
export function parseSse(onData: (data: string) => void): (chunk: string) => void {
  let buffer = "";
  return (chunk) => {
    buffer += chunk.replace(/\r\n/g, "\n");
    for (;;) {
      const end = buffer.indexOf("\n\n");
      if (end === -1) return;
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data !== "" && data !== "[DONE]") onData(data);
    }
  };
}

// --- the call ------------------------------------------------------------------------------------
export type Completion = {
  model: string;
  text: string;
  usage: Usage;
  costUsd: number;
  latencyMs: number;
  // time to the first streamed token of any kind (reasoning included)
  ttftMs: number | null;
  finishReason: string | null;
};

export type CompleteInput = {
  system: string;
  user: string;
  // a stable id per batch: lets OpenCode route to the same backend and reuse the prompt cache
  session: string;
  maxOutputTokens?: number;
  budget?: Budget;
};

export class LlmError extends Error {}

function apiKey(): string {
  const loadEnvFile = (process as { loadEnvFile?: (p: string) => void }).loadEnvFile;
  if (process.env.OPENCODE_API_KEY === undefined) {
    try {
      loadEnvFile?.(".env.local");
    } catch {
      // no .env.local
    }
  }
  const key = process.env.OPENCODE_API_KEY;
  if (key === undefined || key === "") throw new LlmError("OPENCODE_API_KEY is not set");
  return key;
}

function request(
  model: ModelSpec,
  input: CompleteInput,
): { url: string; headers: Record<string, string>; body: unknown } {
  const key = apiKey();
  const max = input.maxOutputTokens ?? 8000;
  const common = { "content-type": "application/json", "x-opencode-session": input.session };
  if (model.wire === "chat") {
    return {
      url: `${BASE_URL}/chat/completions`,
      headers: { ...common, authorization: `Bearer ${key}` },
      body: {
        model: model.id,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: max,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        ...model.body,
      },
    };
  }
  if (model.wire === "responses") {
    return {
      url: `${BASE_URL}/responses`,
      headers: { ...common, authorization: `Bearer ${key}` },
      body: {
        model: model.id,
        stream: true,
        max_output_tokens: max,
        instructions: input.system,
        input: input.user,
        ...model.body,
      },
    };
  }
  return {
    url: `${BASE_URL}/messages`,
    headers: { ...common, "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: {
      model: model.id,
      stream: true,
      max_tokens: max,
      system: input.system,
      messages: [{ role: "user", content: input.user }],
      ...model.body,
    },
  };
}

export type Accumulator = {
  text: string;
  firstTokenAt: number | null;
  usage: Record<string, unknown>;
  finishReason: string | null;
  // an error the provider sent inside the stream (the HTTP status was still 200)
  error: string | null;
};

const errorText = (value: unknown): string => {
  const e = obj(value);
  return (
    [e.code, e.type, e.message].filter((x) => typeof x === "string").join(": ") ||
    JSON.stringify(value).slice(0, 200)
  );
};

// One streamed event of any wire format folded into the accumulator.
export function absorbEvent(wire: Wire, data: string, acc: Accumulator, now: number): void {
  let event: Record<string, unknown>;
  try {
    event = obj(JSON.parse(data));
  } catch {
    return;
  }
  const seen = () => {
    acc.firstTokenAt ??= now;
  };
  if (
    event.type === "error" ||
    event.type === "response.failed" ||
    (wire === "chat" && event.error !== undefined)
  ) {
    const response = obj(event.response);
    acc.error = errorText(response.error ?? event.error ?? event);
    return;
  }
  if (wire === "chat") {
    if (event.usage !== undefined && event.usage !== null) acc.usage = obj(event.usage);
    const choice = obj((event.choices as unknown[] | undefined)?.[0]);
    const delta = obj(choice.delta);
    if (typeof delta.content === "string" && delta.content !== "") {
      seen();
      acc.text += delta.content;
    } else if (typeof delta.reasoning_content === "string" && delta.reasoning_content !== "")
      seen();
    if (typeof choice.finish_reason === "string") acc.finishReason = choice.finish_reason;
    return;
  }
  if (wire === "responses") {
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      seen();
      acc.text += event.delta;
    } else if (
      typeof event.type === "string" &&
      event.type.includes("reasoning") &&
      event.type.endsWith(".delta")
    ) {
      seen();
    } else if (event.type === "response.completed" || event.type === "response.incomplete") {
      const response = obj(event.response);
      acc.usage = obj(response.usage);
      acc.finishReason = event.type === "response.completed" ? "stop" : "length";
    }
    return;
  }
  if (event.type === "message_start") {
    acc.usage = { ...acc.usage, ...obj(obj(event.message).usage) };
  } else if (event.type === "content_block_delta") {
    const delta = obj(event.delta);
    if (typeof delta.text === "string" && delta.text !== "") {
      seen();
      acc.text += delta.text;
    } else if (typeof delta.thinking === "string" && delta.thinking !== "") seen();
  } else if (event.type === "message_delta") {
    acc.usage = { ...acc.usage, ...obj(event.usage) };
    const stop = obj(event.delta).stop_reason;
    if (typeof stop === "string") acc.finishReason = stop;
  }
}

// Aborts the request when it runs too long in total or sends nothing for IDLE_MS.
function watchdog(): { signal: AbortSignal; touch: () => void; stop: () => void } {
  const controller = new AbortController();
  const total = setTimeout(() => controller.abort(new Error("timed out")), TIMEOUT_MS);
  let idle = setTimeout(() => controller.abort(new Error("stalled: no data")), IDLE_MS);
  return {
    signal: controller.signal,
    touch: () => {
      clearTimeout(idle);
      idle = setTimeout(() => controller.abort(new Error("stalled: no data")), IDLE_MS);
    },
    stop: () => {
      clearTimeout(total);
      clearTimeout(idle);
    },
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function complete(model: ModelSpec, input: CompleteInput): Promise<Completion> {
  input.budget?.assertRoom();
  const req = request(model, input);
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    const acc: Accumulator = {
      text: "",
      firstTokenAt: null,
      usage: {},
      finishReason: null,
      error: null,
    };
    const dog = watchdog();
    try {
      const response = await fetch(req.url, {
        method: "POST",
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal: dog.signal,
      });
      if (!response.ok || response.body === null) {
        const detail = (await response.text()).slice(0, 300);
        lastError = `HTTP ${response.status}: ${detail}`;
        if (response.status === 429 || response.status >= 500) {
          await sleep(2000 * 2 ** (attempt - 1));
          continue;
        }
        throw new LlmError(lastError);
      }
      const decoder = new TextDecoder();
      const feed = parseSse((data) => absorbEvent(model.wire, data, acc, Date.now()));
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        dog.touch();
        feed(decoder.decode(chunk, { stream: true }));
      }
      if (acc.error !== null && acc.text === "") {
        lastError = `stream error: ${acc.error}`;
        await sleep(1000 * attempt);
        continue;
      }
      const usage = normalizeUsage(model.wire, acc.usage);
      const cost = costUsd(model, usage);
      input.budget?.charge(cost, usage.input + usage.output);
      return {
        model: model.id,
        text: acc.text,
        usage,
        costUsd: cost,
        latencyMs: Date.now() - started,
        ttftMs: acc.firstTokenAt === null ? null : acc.firstTokenAt - started,
        finishReason: acc.finishReason,
      };
    } catch (error) {
      if (error instanceof BudgetExceeded || error instanceof LlmError) throw error;
      lastError = error instanceof Error ? error.message : String(error);
      await sleep(2000 * 2 ** (attempt - 1));
    } finally {
      dog.stop();
    }
  }
  throw new LlmError(`${model.id}: ${lastError}`);
}

// One JSON line per call: no prompt text, no headers, nothing secret.
export async function appendJsonl(file: string, row: Record<string, unknown>): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(row)}\n`);
}
