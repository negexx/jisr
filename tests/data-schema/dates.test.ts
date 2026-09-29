import { describe, expect, it } from "vitest";

import {
  addDays,
  compareIso,
  diffDays,
  formatIso,
  fromDayNumber,
  InvalidIsoDateError,
  isValidIsoDate,
  parseIso,
  toDayNumber,
} from "@/data-schema/dates";

describe("isValidIsoDate", () => {
  it.each([
    ["2024-02-29", true],
    ["2023-02-29", false],
    ["2000-02-29", true],
    ["1900-02-29", false],
    ["2026-12-31", true],
    ["2026-13-01", false],
    ["2026-00-10", false],
    ["2026-04-31", false],
    ["2026-4-01", false],
    ["26-04-01", false],
    ["2026-04-01T00:00:00Z", false],
    ["", false],
    [" 2026-04-01", false],
  ])("%s -> %s", (value, expected) => {
    expect(isValidIsoDate(value)).toBe(expected);
  });
});

describe("parseIso / formatIso", () => {
  it("round-trips a zero-padded date", () => {
    expect(parseIso("2026-03-07")).toEqual({ year: 2026, month: 3, day: 7 });
    expect(formatIso({ year: 2026, month: 3, day: 7 })).toBe("2026-03-07");
  });
  it.each(["2023-02-29", "nope"])("throws InvalidIsoDateError for %s", (v) => {
    expect(() => parseIso(v)).toThrow(InvalidIsoDateError);
  });
});

describe("day numbers", () => {
  it.each([
    ["1970-01-01", 0],
    ["1970-01-02", 1],
    ["1969-12-31", -1],
    ["2000-03-01", 11017],
    ["2024-02-29", 19782],
  ])("toDayNumber(%s) = %i and inverts", (iso, n) => {
    expect(toDayNumber(iso)).toBe(n);
    expect(fromDayNumber(n)).toBe(iso);
  });
  it("rejects a non-integer day number", () => {
    expect(() => fromDayNumber(1.5)).toThrow(InvalidIsoDateError);
  });
});

describe("arithmetic", () => {
  it.each([
    ["2024-02-28", 1, "2024-02-29"],
    ["2023-02-28", 1, "2023-03-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2026-01-01", -1, "2025-12-31"],
    ["2026-01-01", 0, "2026-01-01"],
  ])("addDays(%s, %i) = %s", (d, n, out) => {
    expect(addDays(d, n)).toBe(out);
  });
  it.each([
    ["2026-09-29", "2026-01-01", 271],
    ["2026-01-01", "2026-09-29", -271],
    ["2025-03-01", "2024-03-01", 365],
    ["2024-03-01", "2023-03-01", 366],
  ])("diffDays(%s, %s) = %i", (a, b, n) => {
    expect(diffDays(a, b)).toBe(n);
  });
  it.each([
    ["2026-01-01", "2026-01-02", -1],
    ["2026-01-02", "2026-01-01", 1],
    ["2026-01-01", "2026-01-01", 0],
  ] as const)("compareIso(%s, %s) = %i", (a, b, n) => {
    expect(compareIso(a, b)).toBe(n);
  });
});
