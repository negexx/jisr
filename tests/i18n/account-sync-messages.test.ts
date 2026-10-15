import { describe, expect, it } from "vitest";

import type { SyncNoticeKind } from "@/lib/account-sync/sync";

import { LOCALES, namespaceMessages, placeholderNames } from "./trust-wording";

const NAMESPACES = ["accountSync"] as const;
const NOTICE_KINDS: readonly SyncNoticeKind[] = [
  "failed",
  "savedLimit",
  "planLimit",
  "signedOut",
  "consentRequired",
  "consentPending",
  "profileReloaded",
];

describe.each(LOCALES)("account sync messages (%s)", (locale) => {
  const messages = namespaceMessages(locale, NAMESPACES);

  it("has the same keys and placeholders as fr, and a message for every notice", () => {
    const reference = namespaceMessages("fr", NAMESPACES);
    expect([...messages.keys()].sort()).toEqual([...reference.keys()].sort());
    for (const [key, value] of messages) {
      expect(placeholderNames(value).sort(), key).toEqual(
        placeholderNames(reference.get(key) ?? "").sort(),
      );
    }
    for (const kind of NOTICE_KINDS) expect(messages.has(`accountSync.${kind}`), kind).toBe(true);
  });

  it("has no em or en dashes, no TODO marker and no ICU number formatting", () => {
    for (const [key, value] of messages) {
      expect(value, key).not.toMatch(/[–—]/);
      expect(value, key).not.toContain("TODO-translate");
      expect(value, key).not.toMatch(/,\s*(number|date|time)\b/);
    }
  });
});
