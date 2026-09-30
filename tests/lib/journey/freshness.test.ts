import { describe, expect, it } from "vitest";
import type { FactMeta } from "@/data-schema/resolved";
import type { StalenessClass } from "@/data-schema/staleness";
import type { FactRef } from "@/domain/types";
import { freshnessOfFact, oldestVerified, worstFreshness } from "@/lib/journey/freshness";

const NOW = "2026-01-01";

function meta(cls: StalenessClass, lastVerifiedAt: string): FactMeta {
  return {
    source_url: "https://example.org/x",
    info_kind: "official",
    last_verified_at: lastVerifiedAt,
    class: cls,
  };
}

// A FactRef computed at some other time: its stored freshness must not be trusted over `now`.
function ref(cls: StalenessClass, lastVerifiedAt: string): FactRef {
  return { ...meta(cls, lastVerifiedAt), record: "r/x", path: "", freshness: "fresh" };
}

describe("freshnessOfFact", () => {
  it.each([
    ["volatile", "2025-09-04", "fresh"],
    ["volatile", "2025-09-03", "aging"],
    ["volatile", "2025-04-07", "aging"],
    ["volatile", "2025-04-06", "stale"],
    ["stable", "2025-04-07", "fresh"],
    ["stable", "2025-04-06", "aging"],
    ["stable", "2024-07-06", "aging"],
    ["stable", "2024-07-05", "stale"],
  ] as const)("%s verified %s is %s", (cls, date, expected) => {
    expect(freshnessOfFact(meta(cls, date), NOW)).toBe(expected);
    expect(freshnessOfFact(ref(cls, date), NOW)).toBe(expected);
  });
});

describe("worstFreshness", () => {
  it.each([
    [[], "fresh"],
    [[meta("stable", "2025-12-01")], "fresh"],
    [[meta("stable", "2025-12-01"), meta("volatile", "2025-09-03")], "aging"],
    [
      [meta("volatile", "2025-09-03"), ref("stable", "2024-07-05"), meta("stable", "2025-12-01")],
      "stale",
    ],
  ] as const)("%j is %s", (facts, expected) => {
    expect(worstFreshness(facts, NOW)).toBe(expected);
  });
});

describe("oldestVerified", () => {
  it("is null for no facts", () => {
    expect(oldestVerified([])).toBeNull();
  });

  it("is the earliest last-verified date across both shapes", () => {
    expect(
      oldestVerified([
        meta("stable", "2025-12-01"),
        ref("volatile", "2024-02-29"),
        meta("volatile", "2025-01-10"),
      ]),
    ).toBe("2024-02-29");
    expect(oldestVerified([meta("stable", "2025-12-01")])).toBe("2025-12-01");
  });
});
