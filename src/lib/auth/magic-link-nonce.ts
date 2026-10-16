import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Todo 28, ruling Q19: the magic-link confirm page removed the "opening the link signs you in"
// problem, but a victim can still be talked into pressing its button on an attacker's link. The
// soft browser-bound nonce is the remaining guard: the browser that asked for a link keeps an
// HttpOnly cookie holding a random value, and only a hash of that value is stored, bound to that
// link's token. At confirm, a matching cookie means "the browser that asked"; a missing or
// mismatched one still signs in (cross-device must keep working) but is marked "another browser",
// and the landing then never offers to import this device's data.
//
// The hash lives in a second `verification` row (identifier `magic-link-nonce:<hash of token>`),
// which is the "small keyed row" the brief allows: Better Auth 1.7.7 stores the magic-link record as
// `.strict()` JSON ({type,email,name}), so the metadata slot the brief preferred does not exist.
// Reusing the verification table means no migration; the row expires with the link's own token.

export const NONCE_COOKIE = "jisr.ml-nonce";
export const NONCE_COOKIE_PATH = "/api/auth";

export type NonceCookieAttributes = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
};

/** A fresh nonce: 24 random bytes, URL-safe, never logged. */
export function newNonce(): string {
  return randomBytes(24).toString("base64url");
}

/** The verification identifier the nonce hash is stored under, bound to the link's token. */
export function nonceIdentifier(token: string): string {
  return `magic-link-nonce:${sha256(token)}`;
}

/** What is stored: a hash of the nonce, so a database read reveals nothing usable. */
export function hashNonce(nonce: string): string {
  return sha256(nonce);
}

/** Timing-safe: does the cookie's nonce hash to the stored hash? Missing either side is no match. */
export function nonceMatches(cookieNonce: string | null, storedHash: string | null): boolean {
  if (cookieNonce === null || storedHash === null) return false;
  const offered = Buffer.from(sha256(cookieNonce), "base64url");
  const stored = Buffer.from(storedHash, "base64url");
  return offered.length === stored.length && timingSafeEqual(offered, stored);
}

/** HttpOnly, Lax, scoped to the auth mount; Secure only when the deployment is https. */
export function nonceCookieAttributes(baseURL: string, maxAge: number): NonceCookieAttributes {
  return {
    httpOnly: true,
    secure: isHttps(baseURL),
    sameSite: "lax",
    path: NONCE_COOKIE_PATH,
    maxAge,
  };
}

function isHttps(baseURL: string): boolean {
  try {
    return new URL(baseURL).protocol === "https:";
  } catch {
    return false;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}
