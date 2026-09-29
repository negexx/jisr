import type { TextBag } from "@scripts/data/resolve";
import { textEntries } from "@scripts/data/text";
import { describe, expect, it } from "vitest";
import type { LocalizedText } from "@/data-schema/localized-text";
import type { Locale } from "@/data-schema/primitives";
import type { TextEntry } from "@/data-schema/resolved";

const frOnly: LocalizedText = { fr: { text: "Bonjour", status: "reviewed" } };
const withEn: LocalizedText = {
  fr: { text: "Salut", status: "reviewed" },
  en: { text: "Hi", status: "draft" },
};
const bag: TextBag = new Map([
  ["programs/xx-test-prog#a", frOnly],
  ["programs/xx-test-prog#b", withEn],
]);

describe("textEntries", () => {
  const rows: Array<{ locale: Locale; a: TextEntry; b: TextEntry }> = [
    {
      locale: "fr",
      a: { text: "Bonjour", status: "reviewed", fallback: false },
      b: { text: "Salut", status: "reviewed", fallback: false },
    },
    {
      locale: "en",
      a: { text: "Bonjour", status: "reviewed", fallback: true },
      b: { text: "Hi", status: "draft", fallback: false },
    },
    {
      locale: "ar",
      a: { text: "Bonjour", status: "reviewed", fallback: true },
      b: { text: "Salut", status: "reviewed", fallback: true },
    },
  ];

  it.each(rows)("$locale", ({ locale, a, b }) => {
    expect(textEntries(bag, locale)).toEqual({
      "programs/xx-test-prog#a": a,
      "programs/xx-test-prog#b": b,
    });
  });

  it("returns an empty record for an empty bag", () => {
    expect(textEntries(new Map(), "ar")).toEqual({});
  });
});
