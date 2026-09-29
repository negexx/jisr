import { describe, expect, it } from "vitest";

import { localeDirection } from "@/i18n/direction";

describe("localeDirection", () => {
  it.each([
    ["fr", "ltr"],
    ["en", "ltr"],
    ["ar", "rtl"],
  ] as const)("renders %s as %s", (locale, dir) => {
    expect(localeDirection(locale)).toBe(dir);
  });
});
