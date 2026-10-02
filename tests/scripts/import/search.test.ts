import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  makeProvider,
  parseBrave,
  parseSerper,
  QueryBudget,
  SearchBudgetExceeded,
  type SearchProvider,
  withCache,
} from "../../../scripts/import/search";

describe("parseSerper", () => {
  it("reads the organic results", () => {
    expect(
      parseSerper({
        organic: [
          { title: "Bachelor ICT", link: "https://u.example/ict", snippet: "Study ICT" },
          { title: "No link" },
        ],
      }),
    ).toEqual([{ url: "https://u.example/ict", title: "Bachelor ICT", snippet: "Study ICT" }]);
  });

  it("is empty for anything unexpected", () => {
    expect(parseSerper(null)).toEqual([]);
    expect(parseSerper({ organic: "x" })).toEqual([]);
  });
});

describe("parseBrave", () => {
  it("reads web results", () => {
    expect(
      parseBrave({
        web: { results: [{ title: "T", url: "https://u.example/a", description: "D" }] },
      }),
    ).toEqual([{ url: "https://u.example/a", title: "T", snippet: "D" }]);
  });

  it("is empty for anything unexpected", () => {
    expect(parseBrave({})).toEqual([]);
  });
});

describe("QueryBudget", () => {
  it("allows queries up to the cap and then refuses", () => {
    const budget = new QueryBudget(2);
    budget.take();
    budget.take();
    expect(() => budget.take()).toThrow(SearchBudgetExceeded);
    expect(budget.used).toBe(2);
  });
});

describe("makeProvider", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is null without a key, so a run says what is missing instead of guessing", () => {
    vi.stubEnv("SERPER_API_KEY", "");
    vi.stubEnv("BRAVE_API_KEY", "");
    expect(makeProvider()).toBeNull();
  });

  it("uses the provider whose key is set, Serper first", () => {
    vi.stubEnv("SERPER_API_KEY", "k1");
    vi.stubEnv("BRAVE_API_KEY", "k2");
    expect(makeProvider()?.name).toBe("serper");
    vi.stubEnv("SERPER_API_KEY", "");
    expect(makeProvider()?.name).toBe("brave");
  });

  it("sends the key in a header, never in the URL, and does not echo it in an error", async () => {
    vi.stubEnv("SERPER_API_KEY", "super-secret-key-123");
    const seen: { url: string; headers: string } = { url: "", headers: "" };
    const provider = makeProvider({
      fetchFn: async (url, init) => {
        seen.url = String(url);
        seen.headers = JSON.stringify(init?.headers);
        return new Response('{"message":"bad key super-secret-key-123"}', { status: 403 });
      },
    });
    const error = await provider?.search("q").catch((e: unknown) => e);
    expect(seen.url).toContain("serper.dev");
    expect(seen.url).not.toContain("super-secret-key-123");
    expect(seen.headers).toContain("super-secret-key-123");
    expect(String(error)).not.toContain("super-secret-key-123");
  });
});

describe("withCache", () => {
  const counting = (): { provider: SearchProvider; calls: () => number } => {
    let calls = 0;
    return {
      calls: () => calls,
      provider: {
        name: "fake",
        search: async (q) => {
          calls++;
          return [{ url: `https://u.example/${q}`, title: q, snippet: "" }];
        },
      },
    };
  };

  it("answers a repeated query from disk and does not call the provider again", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "search-"));
    const { provider, calls } = counting();
    const cached = withCache(provider, dir);
    const first = await cached.search("alpha");
    const second = await cached.search("alpha");
    expect(second).toEqual(first);
    expect(calls()).toBe(1);
  });

  it("without a directory always asks the provider (for providers whose terms forbid storing results)", async () => {
    const { provider, calls } = counting();
    const cached = withCache(provider, null);
    await cached.search("alpha");
    await cached.search("alpha");
    expect(calls()).toBe(2);
  });
});

describe("QueryBudget rejects a cap that would silently disable it", () => {
  it("refuses NaN, negative and fractional caps", () => {
    expect(() => new QueryBudget(Number.NaN)).toThrow(/cap/i);
    expect(() => new QueryBudget(-1)).toThrow(/cap/i);
    expect(() => new QueryBudget(2.5)).toThrow(/cap/i);
  });

  it("accepts zero (nothing may be asked) and a normal cap", () => {
    expect(() => new QueryBudget(0)).not.toThrow();
    expect(() => new QueryBudget(300)).not.toThrow();
  });
});
