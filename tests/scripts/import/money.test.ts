import { describe, expect, it } from "vitest";

import { fromMinor, toMinor } from "../../../scripts/import/money";

describe("toMinor", () => {
  it("scales a euro amount to hundredths", () => {
    expect(toMinor(14650, "EUR")).toBe(1465000);
    expect(toMinor(5000, "MAD")).toBe(500000);
  });
  it("rounds a float amount to a whole minor unit instead of keeping float noise", () => {
    expect(toMinor(37.8, "EUR")).toBe(3780);
    expect(toMinor(1.005, "EUR")).toBe(101);
    expect(toMinor(0.29, "EUR")).toBe(29);
  });
  it("leaves forints whole: HUF has no minor unit", () => {
    expect(toMinor(1500000, "HUF")).toBe(1500000);
    expect(toMinor(43700, "HUF")).toBe(43700);
  });
  it("rounds half away from zero", () => {
    expect(toMinor(0.5, "HUF")).toBe(1);
    expect(toMinor(-0.5, "HUF")).toBe(-1);
  });
});

describe("fromMinor", () => {
  it("is the inverse of toMinor", () => {
    expect(fromMinor(1465000, "EUR")).toBe(14650);
    expect(fromMinor(3780, "EUR")).toBe(37.8);
    expect(fromMinor(1500000, "HUF")).toBe(1500000);
    expect(fromMinor(43700, "HUF")).toBe(43700);
  });
});
