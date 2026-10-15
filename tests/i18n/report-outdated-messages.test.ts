import { describe, expect, it } from "vitest";

import { LOCALES, namespaceMessages, placeholderNames } from "./trust-wording";

const NAMESPACES = ["reportOutdated"] as const;
const KEYS = ["button", "reported", "failed", "rateLimited"] as const;

describe.each(LOCALES)("report outdated messages (%s)", (locale) => {
  const messages = namespaceMessages(locale, NAMESPACES);

  it("has the same keys and placeholders as fr, and every string the button shows", () => {
    const reference = namespaceMessages("fr", NAMESPACES);
    expect([...messages.keys()].sort()).toEqual([...reference.keys()].sort());
    for (const [key, value] of messages) {
      expect(placeholderNames(value).sort(), key).toEqual(
        placeholderNames(reference.get(key) ?? "").sort(),
      );
    }
    for (const key of KEYS) expect(messages.has(`reportOutdated.${key}`), key).toBe(true);
  });

  it("has no em or en dashes, no TODO marker and no ICU number formatting", () => {
    for (const [key, value] of messages) {
      expect(value, key).not.toMatch(/[–—]/);
      expect(value, key).not.toContain("TODO-translate");
      expect(value, key).not.toMatch(/,\s*(number|date|time)\b/);
    }
  });
});
