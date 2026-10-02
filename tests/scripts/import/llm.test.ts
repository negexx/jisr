import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  absorbEvent,
  Budget,
  BudgetExceeded,
  complete,
  costUsd,
  isPeak,
  LlmError,
  MODELS,
  normalizeUsage,
  parseSse,
} from "../../../scripts/import/llm";

const WEEKDAY_OFF_PEAK = new Date("2026-10-07T12:00:00Z"); // a Wednesday, 12:00 UTC
const WEEKDAY_PEAK = new Date("2026-10-07T02:30:00Z");

describe("normalizeUsage", () => {
  it("chat/completions: prompt_tokens already include the cached ones", () => {
    expect(
      normalizeUsage("chat", {
        prompt_tokens: 1000,
        completion_tokens: 50,
        prompt_tokens_details: { cached_tokens: 800 },
      }),
    ).toEqual({ input: 1000, cached: 800, output: 50 });
  });

  it("responses: input_tokens include the cached ones", () => {
    expect(
      normalizeUsage("responses", {
        input_tokens: 500,
        output_tokens: 7,
        input_tokens_details: { cached_tokens: 100 },
      }),
    ).toEqual({ input: 500, cached: 100, output: 7 });
  });

  it("messages: cache reads and writes are reported next to input_tokens", () => {
    expect(
      normalizeUsage("messages", {
        input_tokens: 40,
        output_tokens: 9,
        cache_read_input_tokens: 900,
        cache_creation_input_tokens: 60,
      }),
    ).toEqual({ input: 1000, cached: 900, output: 9 });
  });

  it("missing usage is zero, never NaN", () => {
    expect(normalizeUsage("chat", undefined)).toEqual({ input: 0, cached: 0, output: 0 });
  });
});

describe("costUsd", () => {
  it("bills uncached input, cached input and output at their own prices", () => {
    const spec = MODELS["mimo-v2.6-flash"];
    if (spec === undefined) throw new Error("model missing");
    // 1M input of which 0.5M cached, 1M output: 0.5*0.14 + 0.5*0.0028 + 0.28
    const usd = costUsd(
      spec,
      { input: 1_000_000, cached: 500_000, output: 1_000_000 },
      WEEKDAY_OFF_PEAK,
    );
    expect(usd).toBeCloseTo(0.07 + 0.0014 + 0.28, 6);
  });

  it("doubles the price of peak-priced models during UTC peak hours on weekdays only", () => {
    const spec = MODELS["deepseek-v4.1-flash"];
    if (spec === undefined) throw new Error("model missing");
    const usage = { input: 1_000_000, cached: 0, output: 0 };
    expect(costUsd(spec, usage, WEEKDAY_PEAK)).toBeCloseTo(
      2 * costUsd(spec, usage, WEEKDAY_OFF_PEAK),
      9,
    );
    const saturday = new Date("2026-10-10T02:30:00Z");
    expect(costUsd(spec, usage, saturday)).toBeCloseTo(costUsd(spec, usage, WEEKDAY_OFF_PEAK), 9);
  });

  it("peak is 01-04 and 06-10 UTC", () => {
    expect(isPeak(new Date("2026-10-07T01:00:00Z"))).toBe(true);
    expect(isPeak(new Date("2026-10-07T04:00:00Z"))).toBe(false);
    expect(isPeak(new Date("2026-10-07T06:00:00Z"))).toBe(true);
    expect(isPeak(new Date("2026-10-07T10:00:00Z"))).toBe(false);
  });
});

describe("Budget", () => {
  it("charge never throws; the next call is refused once the cost cap is passed", () => {
    const budget = new Budget({ maxUsd: 0.01, maxTokens: 1_000_000 });
    budget.charge(0.006, 10);
    expect(() => budget.assertRoom()).not.toThrow();
    budget.charge(0.006, 10);
    expect(budget.spentUsd).toBeCloseTo(0.012, 9);
    expect(() => budget.assertRoom()).toThrow(BudgetExceeded);
  });

  it("refuses once the token cap is passed", () => {
    const budget = new Budget({ maxUsd: 100, maxTokens: 100 });
    budget.charge(0, 101);
    expect(() => budget.assertRoom()).toThrow(BudgetExceeded);
  });

  it("counts calls in flight: a reservation that would pass the cap is refused", () => {
    const budget = new Budget({ maxUsd: 0.01, maxTokens: 1_000_000 });
    const release = budget.reserve(0.006, 100);
    expect(() => budget.reserve(0.006, 100)).toThrow(BudgetExceeded);
    release();
    expect(() => budget.reserve(0.006, 100)).not.toThrow();
  });

  it("releasing a reservation does not charge it", () => {
    const budget = new Budget({ maxUsd: 1, maxTokens: 1000 });
    budget.reserve(0.5, 500)();
    expect(budget.spentUsd).toBe(0);
  });
});

describe("parseSse", () => {
  const run = (...chunks: string[]) => {
    const events: string[] = [];
    const sse = parseSse((data) => events.push(data));
    for (const chunk of chunks) sse.feed(chunk);
    sse.end();
    return events;
  };

  it("yields the data payloads, joins split chunks and skips [DONE]", () => {
    expect(run('data: {"a":1}\n\ndata: {"b"', ":2}\n\ndata: [DONE]\n\n")).toEqual([
      '{"a":1}',
      '{"b":2}',
    ]);
  });

  it("ignores event: lines and comments", () => {
    expect(run('event: message_start\ndata: {"x":1}\n\n: keep-alive\n\n')).toEqual(['{"x":1}']);
  });

  it("flushes a last event that has no blank line after it (it often carries the usage)", () => {
    expect(run('data: {"a":1}\n\ndata: {"usage":{"prompt_tokens":5}}')).toEqual([
      '{"a":1}',
      '{"usage":{"prompt_tokens":5}}',
    ]);
  });

  it("handles a CRLF pair split across two chunks", () => {
    expect(run('data: {"a":1}\r', "\n\r", '\ndata: {"b":2}\r\n\r\n')).toEqual([
      '{"a":1}',
      '{"b":2}',
    ]);
  });
});

describe("absorbEvent", () => {
  const fresh = () => ({
    text: "",
    firstTokenAt: null as number | null,
    usage: {} as Record<string, unknown>,
    finishReason: null as string | null,
    error: null as string | null,
  });

  it("collects the text of a chat stream and its usage", () => {
    const acc = fresh();
    absorbEvent("chat", '{"choices":[{"delta":{"content":"Hel"}}]}', acc, 5);
    absorbEvent("chat", '{"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}', acc, 6);
    absorbEvent("chat", '{"usage":{"prompt_tokens":3,"completion_tokens":2}}', acc, 7);
    expect(acc.text).toBe("Hello");
    expect(acc.firstTokenAt).toBe(5);
    expect(acc.finishReason).toBe("stop");
    expect(normalizeUsage("chat", acc.usage).output).toBe(2);
  });

  it("keeps the message of a failed responses stream instead of swallowing it", () => {
    const acc = fresh();
    absorbEvent(
      "responses",
      '{"type":"response.failed","response":{"error":{"code":"content_filter","message":"blocked by policy"}}}',
      acc,
      1,
    );
    expect(acc.error).toContain("blocked by policy");
  });

  it("keeps the message of an error event on the other wires", () => {
    const chat = fresh();
    absorbEvent("chat", '{"error":{"message":"overloaded"}}', chat, 1);
    expect(chat.error).toContain("overloaded");
    const messages = fresh();
    absorbEvent(
      "messages",
      '{"type":"error","error":{"type":"overloaded_error","message":"busy"}}',
      messages,
      1,
    );
    expect(messages.error).toContain("busy");
  });

  it("an incomplete responses stream is reported as cut at the limit", () => {
    const acc = fresh();
    absorbEvent(
      "responses",
      '{"type":"response.incomplete","response":{"incomplete_details":{"reason":"max_output_tokens"}}}',
      acc,
      1,
    );
    expect(acc.finishReason).toBe("length");
  });
});

describe("complete", () => {
  const model = MODELS["mimo-v2.6-flash"];
  if (model === undefined) throw new Error("model missing");
  const sse = (...events: unknown[]) =>
    events
      .map(
        (e) => `data: ${typeof e === "string" ? e : JSON.stringify(e)}

`,
      )
      .join("");
  const reply = (text: string, usage: unknown = { prompt_tokens: 100, completion_tokens: 20 }) =>
    sse(
      { choices: [{ delta: { content: text } }] },
      { choices: [{ delta: {}, finish_reason: "stop" }] },
      ...(usage === null ? [] : [{ usage }]),
      "[DONE]",
    );
  const input = { system: "s", user: "u", session: "t", retryDelayMs: 0 };

  beforeEach(() => vi.stubEnv("OPENCODE_API_KEY", "oc_sk_test_secret_value"));
  afterEach(() => vi.unstubAllEnvs());

  it("returns the text, the normalised usage and the cost", async () => {
    const out = await complete(model, {
      ...input,
      fetchFn: async () => new Response(reply("hello")),
    });
    expect(out.text).toBe("hello");
    expect(out.usage).toEqual({ input: 100, cached: 0, output: 20 });
    expect(out.costUsd).toBeGreaterThan(0);
    expect(out.usageEstimated).toBeUndefined();
  });

  it("estimates the cost when the stream carries no usage, so the budget still counts it", async () => {
    const budget = new Budget({ maxUsd: 10, maxTokens: 1_000_000 });
    const out = await complete(model, {
      ...input,
      user: "x".repeat(4000),
      budget,
      fetchFn: async () => new Response(reply("y".repeat(400), null)),
    });
    expect(out.usageEstimated).toBe(true);
    expect(out.usage.input).toBeGreaterThanOrEqual(1000);
    expect(out.usage.output).toBeGreaterThanOrEqual(100);
    expect(budget.spentTokens).toBeGreaterThan(0);
    expect(budget.spentUsd).toBeGreaterThan(0);
  });

  it("retries a 429 and then succeeds", async () => {
    let calls = 0;
    const out = await complete(model, {
      ...input,
      fetchFn: async () =>
        ++calls === 1 ? new Response("slow down", { status: 429 }) : new Response(reply("ok")),
    });
    expect(calls).toBe(2);
    expect(out.text).toBe("ok");
  });

  it("does not retry a 400", async () => {
    let calls = 0;
    await expect(
      complete(model, {
        ...input,
        fetchFn: async () => {
          calls++;
          return new Response("bad request", { status: 400 });
        },
      }),
    ).rejects.toThrow(LlmError);
    expect(calls).toBe(1);
  });

  it("never lets the API key reach an error message, even if the gateway echoes it", async () => {
    const error = await complete(model, {
      ...input,
      fetchFn: async () =>
        new Response(
          '{"error":"invalid key oc_sk_test_secret_value; Authorization: Bearer oc_sk_test_secret_value"}',
          {
            status: 401,
          },
        ),
    }).catch((e: unknown) => e);
    expect(String(error)).not.toContain("oc_sk_test_secret_value");
  });

  it("redacts before cutting the error body, so a key that straddles the cut cannot leak in part", async () => {
    vi.stubEnv("OPENCODE_API_KEY", "plainsecretkeywithoutprefix1234567890");
    const body = `${"x".repeat(285)}plainsecretkeywithoutprefix1234567890 tail`;
    const error = await complete(model, {
      ...input,
      fetchFn: async () => new Response(body, { status: 401 }),
    }).catch((e: unknown) => e);
    expect(String(error)).not.toContain("plainsecret");
  });

  it("charges an estimate for a stream that only reasoned (no text, no usage)", async () => {
    const budget = new Budget({ maxUsd: 10, maxTokens: 1_000_000 });
    const reasoningOnly = `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "thinking..." } }] })}

data: [DONE]

`;
    const out = await complete(model, {
      ...input,
      user: "x".repeat(4000),
      budget,
      fetchFn: async () => new Response(reasoningOnly),
    });
    expect(out.text).toBe("");
    expect(out.usageEstimated).toBe(true);
    expect(budget.spentTokens).toBeGreaterThanOrEqual(1000);
  });

  it("refuses a second concurrent call that would take the run past the cap, before sending it", async () => {
    const budget = new Budget({ maxUsd: 0.0005, maxTokens: 10_000_000 });
    let sent = 0;
    const slow = async () => {
      sent++;
      await new Promise((r) => setTimeout(r, 20));
      return new Response(reply("a"));
    };
    const results = await Promise.allSettled([
      complete(model, { ...input, maxOutputTokens: 1500, budget, fetchFn: slow }),
      complete(model, { ...input, maxOutputTokens: 1500, budget, fetchFn: slow }),
    ]);
    expect(sent).toBe(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });

  it("keeps a result that pushed the run over the cap instead of throwing it away", async () => {
    const budget = new Budget({ maxUsd: 0.00001, maxTokens: 10_000_000 });
    const out = await complete(model, {
      ...input,
      maxOutputTokens: 1,
      budget,
      fetchFn: async () =>
        new Response(reply("a", { prompt_tokens: 100000, completion_tokens: 100000 })),
    });
    expect(out.text).toBe("a");
    expect(() => budget.assertRoom()).toThrow(BudgetExceeded);
  });
});

describe("Budget rejects a cap that would silently disable it", () => {
  it("refuses NaN, negative and infinite caps (a mistyped --max-usd must not mean unlimited)", () => {
    expect(() => new Budget({ maxUsd: Number.NaN, maxTokens: 100 })).toThrow(/cap/i);
    expect(() => new Budget({ maxUsd: 1, maxTokens: Number.NaN })).toThrow(/cap/i);
    expect(() => new Budget({ maxUsd: -1, maxTokens: 100 })).toThrow(/cap/i);
    expect(() => new Budget({ maxUsd: Number.POSITIVE_INFINITY, maxTokens: 100 })).toThrow(/cap/i);
  });

  it("accepts a normal cap", () => {
    expect(() => new Budget({ maxUsd: 0.5, maxTokens: 1000 })).not.toThrow();
  });
});
