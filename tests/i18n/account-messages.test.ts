import { describe, expect, it } from "vitest";

import { LOCALES, namespaceMessages, placeholderNames } from "./trust-wording";

const NAMESPACES = ["account", "welcome"] as const;

describe.each(LOCALES)("account and welcome messages (%s)", (locale) => {
  const messages = namespaceMessages(locale, NAMESPACES);

  it("has the same keys and placeholders as fr", () => {
    const reference = namespaceMessages("fr", NAMESPACES);
    expect([...messages.keys()].sort()).toEqual([...reference.keys()].sort());
    for (const [key, value] of messages) {
      expect(placeholderNames(value).sort(), key).toEqual(
        placeholderNames(reference.get(key) ?? "").sort(),
      );
    }
  });

  it("has no em or en dashes, no TODO marker and no ICU number formatting", () => {
    for (const [key, value] of messages) {
      expect(value, key).not.toMatch(/[–—]/);
      expect(value, key).not.toContain("TODO-translate");
      expect(value, key).not.toMatch(/,\s*(number|date|time)\b/);
    }
  });
});

describe("account and welcome messages: language rules", () => {
  it("puts a no-break space before : ? ! ; in French", () => {
    for (const [key, value] of namespaceMessages("fr", NAMESPACES)) {
      expect(value, key).not.toMatch(/[^ ][:?!;]/u);
      expect(value, key).not.toMatch(/ [:?!;]/u);
    }
  });
});
