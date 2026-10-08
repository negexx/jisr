import type { HeaderRules } from "./snapshot-headers";

// No script-src or default-src on purpose: every page is static, so there is no per-request nonce, and
// Next's inline bootstrap scripts would force 'unsafe-inline', which adds no protection. Revisit when
// Next supports hash-based CSP for static pages (ADR 0011).
const CONTENT_SECURITY_POLICY =
  "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'";

// No includeSubDomains or preload: unsafe until the production domain is chosen (ADR 0011).
const STRICT_TRANSPORT_SECURITY = "max-age=63072000";

const PERMISSIONS_POLICY =
  "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()";

export function securityHeaderRules(indexable: boolean): HeaderRules {
  const headers = [
    { key: "Strict-Transport-Security", value: STRICT_TRANSPORT_SECURITY },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  ];
  if (!indexable) headers.push({ key: "X-Robots-Tag", value: "noindex, nofollow" });
  return [{ source: "/:path*", headers }];
}
