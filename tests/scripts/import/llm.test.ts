import { describe, expect, it } from "vitest";

import {
  absorbEvent,
  Budget,
  BudgetExceeded,
  costUsd,
  isPeak,
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
  it("throws once the cost cap is passed, and keeps counting", () => {
    const budget = new Budget({ maxUsd: 0.01, maxTokens: 1_000_000 });
    budget.charge(0.006, 10);
    expect(() => budget.charge(0.006, 10)).toThrow(BudgetExceeded);
    expect(budget.spentUsd).toBeCloseTo(0.012, 9);
  });

  it("throws once the token cap is passed", () => {
    const budget = new Budget({ maxUsd: 100, maxTokens: 100 });
    expect(() => budget.charge(0, 101)).toThrow(BudgetExceeded);
  });

  it("refuses a new call when the cap is already reached", () => {
    const budget = new Budget({ maxUsd: 0.01, maxTokens: 100 });
    expect(() => budget.assertRoom()).not.toThrow();
    try {
      budget.charge(0.5, 1);
    } catch {
      // expected
    }
    expect(() => budget.assertRoom()).toThrow(BudgetExceeded);
  });
});

describe("parseSse", () => {
  it("yields the data payloads, joins split chunks and skips [DONE]", () => {
    const events: string[] = [];
    const feed = parseSse((data) => events.push(data));
    feed('data: {"a":1}\n\ndata: {"b"');
    feed(":2}\n\ndata: [DONE]\n\n");
    expect(events).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("ignores event: lines and comments", () => {
    const events: string[] = [];
    const feed = parseSse((data) => events.push(data));
    feed('event: message_start\ndata: {"x":1}\n\n: keep-alive\n\n');
    expect(events).toEqual(['{"x":1}']);
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
