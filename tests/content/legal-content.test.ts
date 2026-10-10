import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { FORBIDDEN } from "../i18n/forbidden-wording";

const LOCALES = ["en", "fr", "ar"] as const;
const DOCS = ["privacy", "terms"] as const;

type Locale = (typeof LOCALES)[number];
type Doc = (typeof DOCS)[number];

function read(locale: Locale, doc: Doc): string {
  return readFileSync(path.resolve(process.cwd(), "content", locale, `${doc}.mdx`), "utf8");
}

function lines(source: string, pattern: RegExp): number {
  return source.split("\n").filter((line) => pattern.test(line)).length;
}

describe.each(LOCALES)("legal MDX documents (%s)", (locale) => {
  it.each(DOCS)("content/%s is a complete document", (doc) => {
    const source = read(locale, doc);
    expect(source.trim().length, doc).toBeGreaterThan(200);
    expect(lines(source, /^# /), `${doc} H1 count`).toBe(1);
    expect(lines(source, /^## /), `${doc} H2 count`).toBeGreaterThanOrEqual(5);
  });

  it.each(DOCS)("content/%s uses no forbidden wording", (doc) => {
    const source = read(locale, doc);
    for (const pattern of FORBIDDEN[locale]) {
      expect(source, `${doc} ${pattern}`).not.toMatch(pattern);
    }
  });

  it("content/privacy names the controller, processors and supervisory authorities", () => {
    const source = read(locale, "privacy");
    for (const literal of [
      "Vercel",
      "GoatCounter",
      "[CONTROLLER NAME]",
      "[CONTACT EMAIL]",
      "Garante",
      "CNDP",
    ]) {
      expect(source, `${locale} ${literal}`).toContain(literal);
    }
  });

  it("content/privacy links to the terms and vice versa", () => {
    expect(read(locale, "privacy"), `${locale} privacy → terms`).toContain("(/terms)");
    expect(read(locale, "terms"), `${locale} terms → privacy`).toContain("(/privacy)");
  });
});

describe("legal MDX translations", () => {
  it.each(DOCS)("Arabic content/%s is not a copy of French", (doc) => {
    expect(read("ar", doc)).not.toBe(read("fr", doc));
  });
});
