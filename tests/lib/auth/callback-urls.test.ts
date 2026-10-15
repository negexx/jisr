import { describe, expect, it } from "vitest";

import {
  accountDeleteConfirmPath,
  accountDeletePath,
  accountDeleteRequest,
  accountPath,
  authCallbackUrls,
  finishSetupPath,
  landingReturnPath,
  MAGIC_LINK_CONFIRM_ENDPOINT,
  POST_AUTH_LANDING,
  readSignInLink,
  safeReturnPath,
  signInConfirmPath,
  signInErrorPath,
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

describe("landingReturnPath", () => {
  it("defaults to the plan when no return was given", () => {
    for (const absent of [null, undefined, ""]) {
      expect(landingReturnPath(absent, "ar")).toBe("/ar/plan");
    }
  });

  it("keeps a safe return and falls back to the locale home for an unsafe one", () => {
    expect(landingReturnPath("/fr/compare", "fr")).toBe("/fr/compare");
    expect(landingReturnPath("https://evil.example", "fr")).toBe("/fr");
    expect(landingReturnPath("/en/plan", "fr")).toBe("/en/plan");
  });
});

describe("signInErrorPath", () => {
  it("adds the failure code to the sign-in surface, keeping the return", () => {
    expect(signInErrorPath("fr", "/fr/plan", "AGE_NOT_CONFIRMED")).toBe(
      "/fr/sign-in?return=%2Ffr%2Fplan&error=AGE_NOT_CONFIRMED",
    );
  });

  it.each([
    "",
    "a b",
    "<script>",
    "x".repeat(65),
    "é",
    "a&b=c",
  ])("replaces the code %j that is not a plain token", (code) => {
    expect(signInErrorPath("ar", null, code)).toBe("/ar/sign-in?return=%2Far&error=UNKNOWN");
  });
});

describe("finishSetupPath", () => {
  it.each([
    ["fr", "/compare", "/fr/welcome?return=%2Ffr%2Fcompare"],
    [
      "ar",
      "/programs/de-tum-informatics-bsc",
      "/ar/welcome?return=%2Far%2Fprograms%2Fde-tum-informatics-bsc",
    ],
    ["en", "/", "/en/welcome?return=%2Fen"],
    ["fr", "/sign-in", "/fr/welcome?return=%2Ffr"],
    ["fr", "/welcome", "/fr/welcome?return=%2Ffr"],
  ] as const)("sends %s %s through the landing, returning to %s", (locale, pathname, expected) => {
    expect(finishSetupPath(locale, pathname)).toBe(expected);
  });
});

describe("account page path", () => {
  it("names the page under the locale and survives as a sign-in return", () => {
    expect(accountPath("ar")).toBe("/ar/account");
    expect(signInPath("ar", accountPath("ar"))).toBe("/ar/sign-in?return=%2Far%2Faccount");
  });
});

describe("account deletion paths", () => {
  it("names the confirm page under the locale", () => {
    expect(accountDeletePath("ar")).toBe("/ar/account/delete");
  });

  it("sends the confirm page as the deletion request's callbackURL", () => {
    expect(accountDeleteRequest("en")).toEqual({ callbackURL: "/en/account/delete" });
  });

  it("carries the token as an encoded fragment parameter", () => {
    expect(accountDeleteConfirmPath("fr", "abc123")).toBe("/fr/account/delete#token=abc123");
    expect(accountDeleteConfirmPath("en", "a&b=c")).toBe("/en/account/delete#token=a%26b%3Dc");
  });
});

describe("sign-in confirm link (todo 28, F3)", () => {
  it("carries the token, the mode and the safe return path in the fragment only", () => {
    const path = signInConfirmPath("ar", "AbcXyz", "signup", "/ar/compare");
    const url = new URL(path, "https://jisr.example");
    expect(url.pathname).toBe("/ar/sign-in/confirm");
    expect(url.search).toBe("");
    expect(new URLSearchParams(url.hash.slice(1)).get("token")).toBe("AbcXyz");
    expect(path).toBe("/ar/sign-in/confirm#token=AbcXyz&mode=signup&return=%2Far%2Fcompare");
  });

  it("drops an unsafe return path to the locale home and omits a missing one", () => {
    expect(signInConfirmPath("fr", "t", "signin", "https://evil.example/")).toBe(
      "/fr/sign-in/confirm#token=t&mode=signin&return=%2Ffr",
    );
    expect(signInConfirmPath("en", "t", "signin", null)).toBe(
      "/en/sign-in/confirm#token=t&mode=signin",
    );
  });

  it("reads back what it wrote", () => {
    const { hash } = new URL(
      signInConfirmPath("fr", "AbcXyz", "signup", "/fr/plan"),
      "https://x.example",
    );
    expect(readSignInLink(hash, "fr")).toEqual({
      token: "AbcXyz",
      mode: "signup",
      returnPath: "/fr/plan",
    });
  });

  it.each<[string, ReturnType<typeof readSignInLink>]>([
    ["", { token: null, mode: "signin", returnPath: null }],
    ["#token=", { token: null, mode: "signin", returnPath: null }],
    ["#token=a%20b&mode=signup", { token: null, mode: "signup", returnPath: null }],
    [`#token=${"a".repeat(129)}`, { token: null, mode: "signin", returnPath: null }],
    ["#token=ok&mode=admin", { token: "ok", mode: "signin", returnPath: null }],
    ["#token=ok&return=%2F%2Fevil.example", { token: "ok", mode: "signin", returnPath: "/fr" }],
    ["token=ok&return=%2Ffr%2Fplan", { token: "ok", mode: "signin", returnPath: "/fr/plan" }],
  ])("reads %j defensively", (hash, expected) => {
    expect(readSignInLink(hash, "fr")).toEqual(expected);
  });

  it("posts to the confirm endpoint under Better Auth's mount point", () => {
    expect(MAGIC_LINK_CONFIRM_ENDPOINT).toBe("/api/auth/magic-link/confirm");
  });
});
