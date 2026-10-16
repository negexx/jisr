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

// The signed-in Clear my data copy: same shape as the guest's, and parity across locales.
describe.each(LOCALES)("clearDataAccount messages (%s)", (locale) => {
  it("has the same keys as fr, without placeholders, dashes or TODO markers", () => {
    const messages = namespaceMessages(locale, ["clearDataAccount"]);
    const reference = namespaceMessages("fr", ["clearDataAccount"]);
    expect([...messages.keys()].sort()).toEqual([...reference.keys()].sort());
    for (const [key, value] of messages) {
      expect(placeholderNames(value), key).toEqual([]);
      expect(value, key).not.toMatch(/[–—]/);
      expect(value, key).not.toContain("TODO-translate");
    }
  });
});

describe("account and welcome messages: language rules", () => {
  it("puts a no-break space (U+00A0 or U+202F) before : ? ! ; in French", () => {
    for (const [key, value] of namespaceMessages("fr", NAMESPACES)) {
      expect(value, key).not.toMatch(/[^\u00a0\u202f][:?!;]/u);
      expect(value, key).not.toMatch(/ [:?!;]/u);
    }
  });

  it("asks the guest-import confirmation as a question in every locale", () => {
    expect(namespaceMessages("fr", NAMESPACES).get("welcome.confirm.title")).toMatch(/\u00a0\?$/u);
    expect(namespaceMessages("en", NAMESPACES).get("welcome.confirm.title")).toMatch(/\?$/u);
    expect(namespaceMessages("ar", NAMESPACES).get("welcome.confirm.title")).toMatch(/؟$/u);
  });
});
