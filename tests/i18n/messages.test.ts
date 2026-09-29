import { describe, expect, it } from "vitest";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function flatten(tree: Record<string, unknown>, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else if (isPlainObject(value)) for (const [k, v] of flatten(value, path)) out.set(k, v);
    else throw new Error(`messages leaf "${path}" must be a string or an object`);
  }
  return out;
}

const catalogs = { fr: flatten(fr), en: flatten(en), ar: flatten(ar) };

describe("flatten", () => {
  it.each([
    ["number", { a: { b: 1 } }],
    ["boolean", { a: true }],
    ["array", { a: ["x"] }],
    ["null", { a: null }],
  ])("throws on a %s leaf", (_kind, tree) => {
    expect(() => flatten(tree)).toThrow(/must be a string or an object/);
  });
});

describe("messages catalogs", () => {
  it.each(["en", "ar"] as const)("%s has exactly the same keys as fr", (locale) => {
    expect([...catalogs[locale].keys()].sort()).toEqual([...catalogs.fr.keys()].sort());
  });

  it.each(["fr", "en", "ar"] as const)("%s has no empty strings", (locale) => {
    const empty = [...catalogs[locale]].filter(([, v]) => v.trim() === "").map(([k]) => k);
    expect(empty).toEqual([]);
  });
});
