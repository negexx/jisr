import { describe, expect, it } from "vitest";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

const catalogs = { fr: flatten(fr), en: flatten(en), ar: flatten(ar) };

describe("messages catalogs", () => {
  it.each(["en", "ar"] as const)("%s has exactly the same keys as fr", (locale) => {
    expect([...catalogs[locale].keys()].sort()).toEqual([...catalogs.fr.keys()].sort());
  });

  it.each(["fr", "en", "ar"] as const)("%s has no empty strings", (locale) => {
    const empty = [...catalogs[locale]].filter(([, v]) => v.trim() === "").map(([k]) => k);
    expect(empty).toEqual([]);
  });
});
