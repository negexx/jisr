import { describe, expect, it } from "vitest";

import type { Tuition } from "@/data-schema/records/program";
import { isTuitionRange, tuitionBounds } from "@/domain/tuition";

const flat: Tuition = { amountMinor: 120000, currency: "XTS", period: "year" };
const range: Tuition = { ...flat, maxAmountMinor: 300000, basis: "income_based" };

describe("tuitionBounds", () => {
  it("makes a flat fee a range with equal ends", () => {
    expect(tuitionBounds(flat)).toEqual({ min: 120000, max: 120000 });
  });
  it("returns the stated bounds of a range", () => {
    expect(tuitionBounds(range)).toEqual({ min: 120000, max: 300000 });
  });
});

describe("isTuitionRange", () => {
  it("is false for a flat fee and for equal bounds, true for a real range", () => {
    expect(isTuitionRange(flat)).toBe(false);
    expect(isTuitionRange({ ...flat, maxAmountMinor: 120000 })).toBe(false);
    expect(isTuitionRange(range)).toBe(true);
  });
});
