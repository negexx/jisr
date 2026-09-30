import { describe, expect, it } from "vitest";

import { contrastRatio, oklchToSrgb, parseOklch } from "@/lib/design/contrast";

describe("parseOklch", () => {
  it("parses lightness, chroma and hue", () => {
    expect(parseOklch("oklch(0.4 0.075 205)")).toEqual({ l: 0.4, c: 0.075, h: 205 });
  });

  it("accepts a percentage lightness and extra whitespace", () => {
    expect(parseOklch("  oklch( 40%   0.075  205 ) ")).toEqual({ l: 0.4, c: 0.075, h: 205 });
  });

  it("rejects values that are not a plain oklch triple", () => {
    expect(() => parseOklch("#ffffff")).toThrow(/oklch/);
    expect(() => parseOklch("oklch(0.4 0.1 205 / 50%)")).toThrow(/oklch/);
  });
});

describe("oklchToSrgb", () => {
  it("maps the lightness extremes to black and white", () => {
    expect(oklchToSrgb({ l: 0, c: 0, h: 0 })).toEqual({ r: 0, g: 0, b: 0 });
    const white = oklchToSrgb({ l: 1, c: 0, h: 0 });
    for (const channel of [white.r, white.g, white.b]) expect(channel).toBeCloseTo(1, 3);
  });

  it("maps mid grey to about #636363", () => {
    const grey = oklchToSrgb({ l: 0.5, c: 0, h: 0 });
    expect(Math.round(grey.r * 255)).toBe(99);
    expect(Math.round(grey.g * 255)).toBe(99);
    expect(Math.round(grey.b * 255)).toBe(99);
  });

  it("maps a known chromatic colour (oklch(0.628 0.2577 29.23) is sRGB red)", () => {
    const red = oklchToSrgb({ l: 0.628, c: 0.2577, h: 29.23 });
    expect(red.r).toBeCloseTo(1, 1);
    expect(red.g).toBeLessThan(0.05);
    expect(red.b).toBeLessThan(0.05);
  });

  it("clamps out-of-gamut colours into 0..1", () => {
    const vivid = oklchToSrgb({ l: 0.7, c: 0.4, h: 150 });
    for (const channel of [vivid.r, vivid.g, vivid.b]) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });
});

describe("contrastRatio", () => {
  it("is 21:1 for black on white and 1:1 for a colour on itself", () => {
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 1, g: 1, b: 1 };
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
  });

  it("matches the published ratio for #767676 on white (4.54:1)", () => {
    const grey = { r: 0x76 / 255, g: 0x76 / 255, b: 0x76 / 255 };
    expect(contrastRatio(grey, { r: 1, g: 1, b: 1 })).toBeCloseTo(4.54, 2);
  });
});
