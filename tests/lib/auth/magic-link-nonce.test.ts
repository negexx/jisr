import { describe, expect, it } from "vitest";

import {
  hashNonce,
  NONCE_COOKIE,
  NONCE_COOKIE_PATH,
  newNonce,
  nonceCookieAttributes,
  nonceIdentifier,
  nonceMatches,
} from "@/lib/auth/magic-link-nonce";

// Todo 28, ruling Q19: a soft browser-bound magic-link nonce. The cookie the requesting browser
// keeps holds a random value; only its hash is stored, bound to that link's token. These are the
// pure pieces; tests/db/magic-link-confirm.test.ts drives the whole flow.

describe("the magic-link nonce", () => {
  it("generates at least 16 bytes of randomness, base64url", () => {
    const nonce = newNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(nonce, "base64url").length).toBeGreaterThanOrEqual(16);
    expect(newNonce()).not.toBe(nonce);
  });

  it("binds the stored identifier to the token by a hash, never the raw token", () => {
    const token = "AbCd1234AbCd1234AbCd1234AbCd1234";
    const identifier = nonceIdentifier(token);
    expect(identifier).toMatch(/^magic-link-nonce:[A-Za-z0-9_-]{43}$/);
    expect(identifier).not.toContain("AbCd");
    expect(nonceIdentifier(token)).toBe(identifier);
  });

  it("matches a cookie nonce to its stored hash and rejects anything else", () => {
    const nonce = newNonce();
    expect(nonceMatches(nonce, hashNonce(nonce))).toBe(true);
    expect(nonceMatches(nonce, hashNonce(newNonce()))).toBe(false);
    expect(nonceMatches(null, hashNonce(nonce))).toBe(false);
    expect(nonceMatches(nonce, null)).toBe(false);
  });

  it("is HttpOnly, path-scoped, Lax, and secure only over https", () => {
    expect(nonceCookieAttributes("http://localhost:3000", 900)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: NONCE_COOKIE_PATH,
      maxAge: 900,
    });
    expect(nonceCookieAttributes("https://jisrr.org", 900).secure).toBe(true);
  });

  it("names the cookie under our own namespace and the auth mount", () => {
    expect(NONCE_COOKIE).toBe("jisr.ml-nonce");
    expect(NONCE_COOKIE_PATH).toBe("/api/auth");
  });
});
