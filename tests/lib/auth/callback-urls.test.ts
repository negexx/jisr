import { describe, expect, it } from "vitest";

import {
  authCallbackUrls,
  POST_AUTH_LANDING,
  safeReturnPath,
  signInPath,
} from "@/lib/auth/callback-urls";

describe("safeReturnPath", () => {
  it.each([
    ["/fr", "/fr"],
    ["/ar/plan", "/ar/plan"],
    ["/en/programs/de-tum-informatics-bsc", "/en/programs/de-tum-informatics-bsc"],
    ["/fr/compare/", "/fr/compare/"],
  ])("keeps the same-origin locale path %s", (raw, expected) => {
    expect(safeReturnPath(raw, "fr")).toBe(expected);
  });

  it.each<[string, string | null | undefined]>([
    ["nothing", undefined],
    ["null", null],
    ["an empty string", ""],
    ["an absolute URL", "https://evil.example/fr"],
    ["a protocol-relative URL", "//evil.example/fr"],
    ["a backslash trick", "/\\evil.example"],
    ["a path without a locale", "/plan"],
    ["an unknown locale", "/de/plan"],
    ["a locale prefix of a longer segment", "/frx/plan"],
    ["a dot segment", "/fr/../plan"],
    ["a single dot segment", "/fr/./plan"],
    ["a query string", "/fr/plan?x=1"],
    ["a fragment", "/fr/plan#top"],
    ["an encoded character", "/fr/%2e%2e/plan"],
    ["a relative path", "fr/plan"],
    ["a javascript URL", "javascript:alert(1)"],
    ["an empty segment", "/fr//plan"],
    ["whitespace", "/fr/ plan"],
  ])("falls back to the locale home for %s", (_label, raw) => {
    expect(safeReturnPath(raw, "ar")).toBe("/ar");
  });
});

describe("authCallbackUrls", () => {
  it("sends every outcome to the post-auth landing with the sanitised return path", () => {
    const expected = `/fr${POST_AUTH_LANDING}?return=%2Ffr%2Fplan`;
    expect(authCallbackUrls("fr", "/fr/plan")).toEqual({
      callbackURL: expected,
      newUserCallbackURL: expected,
      errorCallbackURL: expected,
    });
  });

  it("uses the locale home when the return path is unsafe", () => {
    expect(authCallbackUrls("ar", "https://evil.example").callbackURL).toBe(
      "/ar/welcome?return=%2Far",
    );
  });

  it("builds relative URLs only, so Better Auth's origin check accepts them", () => {
    for (const url of Object.values(authCallbackUrls("en", "/en/compare"))) {
      expect(url.startsWith("/en/welcome?")).toBe(true);
    }
  });
});

describe("signInPath", () => {
  it("names the sign-in surface with the sanitised return path", () => {
    expect(signInPath("fr", "/fr/plan")).toBe("/fr/sign-in?return=%2Ffr%2Fplan");
    expect(signInPath("ar", "//evil.example")).toBe("/ar/sign-in?return=%2Far");
  });
});
