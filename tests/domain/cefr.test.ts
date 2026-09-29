import { describe, expect, it } from "vitest";
import { CEFR_ORDER, cefrAtLeast } from "@/domain/cefr";

describe("cefr", () => {
  it("orders A1..C2", () => {
    expect(CEFR_ORDER).toEqual(["A1", "A2", "B1", "B2", "C1", "C2"]);
  });
  it.each([
    ["B2", "B2", true],
    ["C1", "B2", true],
    ["B1", "B2", false],
    ["A1", "A1", true],
    ["C2", "A1", true],
    ["A2", "C2", false],
  ] as const)("%s at least %s -> %s", (level, min, expected) => {
    expect(cefrAtLeast(level, min)).toBe(expected);
  });
});
