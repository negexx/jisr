import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { contrastRatio, oklabDistance, oklchToSrgb, parseOklch } from "@/lib/design/contrast";

const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");

function rootBlock(source: string): string {
  const start = source.indexOf(":root {");
  const end = source.indexOf("\n}", start);
  if (start === -1 || end === -1) throw new Error("no :root block in globals.css");
  return source.slice(start, end);
}

function tokens(): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of rootBlock(css).matchAll(/--([a-z0-9-]+):\s*(oklch\([^)]*\));/g)) {
    const [, name = "", value = ""] = match;
    out.set(name, value);
  }
  return out;
}

const palette = tokens();

function ratio(foreground: string, background: string): number {
  const front = palette.get(foreground);
  const back = palette.get(background);
  if (!front || !back) throw new Error(`missing token: ${foreground} or ${background}`);
  return contrastRatio(oklchToSrgb(parseOklch(front)), oklchToSrgb(parseOklch(back)));
}

const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["foreground", "muted"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["primary", "background"],
  ["destructive", "background"],
  ["destructive", "destructive-bg"],
  ["status-ok-fg", "status-ok-bg"],
  ["status-ok-fg", "background"],
  ["status-check-fg", "status-check-bg"],
  ["status-check-fg", "background"],
  ["status-fail-fg", "status-fail-bg"],
  ["status-fail-fg", "background"],
  ["kind-official", "kind-official-bg"],
  ["kind-official", "background"],
  ["kind-estimate", "kind-estimate-bg"],
  ["kind-estimate", "background"],
  ["kind-guidance", "kind-guidance-bg"],
  ["kind-guidance", "background"],
];

const UI_PAIRS: readonly (readonly [string, string])[] = [
  ["input", "background"],
  ["input", "card"],
  ["ring", "background"],
  ["ring", "card"],
  ["status-ok", "status-ok-bg"],
  ["status-ok-border", "status-ok-bg"],
  ["status-check", "status-check-bg"],
  ["status-check-border", "status-check-bg"],
  ["status-fail", "status-fail-bg"],
  ["status-fail-border", "status-fail-bg"],
];

describe("design tokens", () => {
  it("defines the tokens the pairs below rely on", () => {
    for (const name of new Set([...TEXT_PAIRS, ...UI_PAIRS].flat())) {
      expect(palette.has(name), name).toBe(true);
    }
  });

  it("uses no pure black or white", () => {
    for (const [name, value] of palette) {
      const { l, c } = parseOklch(value);
      expect(l === 0 || (l === 1 && c === 0), name).toBe(false);
    }
  });

  it.each(TEXT_PAIRS)("text %s on %s has at least 4.5:1", (foreground, background) => {
    expect(ratio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)("non-text %s against %s has at least 3:1", (foreground, background) => {
    expect(ratio(foreground, background)).toBeGreaterThanOrEqual(3);
  });

  describe("families that must not be confused", () => {
    function distance(first: string, second: string): number {
      const one = palette.get(first);
      const two = palette.get(second);
      if (!one || !two) throw new Error(`missing token: ${first} or ${second}`);
      return oklabDistance(parseOklch(one), parseOklch(two));
    }

    // OKLab distance: about 0.02 is barely noticeable, 0.06 is clearly a different colour.
    const CLEARLY_APART = 0.06;

    it.each([
      ["kind-estimate", "status-check-fg"],
      ["kind-estimate", "status-check"],
      ["kind-estimate-bg", "status-check-bg"],
      ["kind-estimate", "kind-official"],
      ["kind-estimate", "kind-guidance"],
      ["kind-official", "status-ok-fg"],
      ["kind-official", "status-ok"],
    ])("%s is clearly apart from %s", (first, second) => {
      expect(distance(first, second)).toBeGreaterThanOrEqual(CLEARLY_APART);
    });

    it("keeps the pale official and ok tints distinguishable (they only ever carry text and an icon)", () => {
      expect(distance("kind-official-bg", "status-ok-bg")).toBeGreaterThanOrEqual(0.02);
    });
  });
});
