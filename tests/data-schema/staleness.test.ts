import { describe, expect, it } from "vitest";

import { addDays } from "@/data-schema/dates";
import { freshnessOf, STALENESS } from "@/data-schema/staleness";

const NOW = "2026-09-29";
const ago = (days: number) => addDays(NOW, -days);

describe("STALENESS constants (ADR 0004)", () => {
  it("matches the ADR thresholds", () => {
    expect(STALENESS).toEqual({
      volatile: { agingDays: 120, staleDays: 270 },
      stable: { agingDays: 270, staleDays: 545 },
    });
  });
});

describe("freshnessOf", () => {
  it.each([
    ["volatile", 0, "fresh"],
    ["volatile", 119, "fresh"],
    ["volatile", 120, "aging"],
    ["volatile", 269, "aging"],
    ["volatile", 270, "stale"],
    ["stable", 269, "fresh"],
    ["stable", 270, "aging"],
    ["stable", 544, "aging"],
    ["stable", 545, "stale"],
    ["stable", 5000, "stale"],
    ["volatile", -1, "fresh"],
    ["stable", -400, "fresh"],
  ] as const)("%s fact verified %i days ago is %s", (cls, days, expected) => {
    expect(freshnessOf(cls, ago(days), NOW)).toBe(expected);
  });
});
