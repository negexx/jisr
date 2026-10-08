import { describe, expect, it } from "vitest";

import { securityHeaderRules } from "@/lib/security-headers";

function headerMap(indexable: boolean): Record<string, string> {
  const rules = securityHeaderRules(indexable);
  expect(rules).toHaveLength(1);
  expect(rules[0]?.source).toBe("/:path*");
  return Object.fromEntries((rules[0]?.headers ?? []).map((h) => [h.key, h.value]));
}

const BASE_HEADERS = {
  "Strict-Transport-Security": "max-age=63072000",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  "Content-Security-Policy":
    "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
};

describe("securityHeaderRules", () => {
  it("sets the security headers on every route of an indexable build", () => {
    expect(headerMap(true)).toEqual(BASE_HEADERS);
  });

  it("adds X-Robots-Tag noindex on a non-indexable build", () => {
    expect(headerMap(false)).toEqual({
      ...BASE_HEADERS,
      "X-Robots-Tag": "noindex, nofollow",
    });
  });

  // Pages are static, so there is no per-request nonce, and Next's inline bootstrap scripts would force
  // 'unsafe-inline' into script-src, which protects nothing. Only the structural directives are set
  // (ADR 0011).
  it("keeps the CSP structural: no script-src or default-src", () => {
    const csp = headerMap(true)["Content-Security-Policy"] ?? "";
    expect(csp).not.toContain("script-src");
    expect(csp).not.toContain("default-src");
  });

  it("does not set HSTS includeSubDomains or preload before the domain is chosen", () => {
    const hsts = headerMap(true)["Strict-Transport-Security"] ?? "";
    expect(hsts).not.toContain("includeSubDomains");
    expect(hsts).not.toContain("preload");
  });
});
