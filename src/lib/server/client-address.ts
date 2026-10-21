import "server-only";

import { getIP } from "better-auth/api";

// Vercel overwrites x-forwarded-for with the single client address; a header with several values is
// not trusted (no trustedProxies). One definition, read by Better Auth's own limiter (auth/server.ts)
// and by the sign-in Server Action below, so both count the same address.
export const AUTH_IP_ADDRESS_OPTIONS = { ipAddressHeaders: ["x-forwarded-for"], ipv6Subnet: 64 };

const NO_TRUSTED_ADDRESS = "unknown";

let warnedWithoutAddress = false;

// In production every request lands in the one shared bucket when the platform forwards no single
// address (a proxy change, or a header with several values): one noisy client then locks everyone
// out, so say so once per instance. Tests and local runs have no proxy and would warn every time.
function warnOnceWithoutAddress(): void {
  if (warnedWithoutAddress) return;
  if (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development") return;
  warnedWithoutAddress = true;
  console.warn("auth throttle: no trusted client address, requests share one bucket");
}

// The single trusted client address as Better Auth would resolve it (IPv6 collapsed to its /64), or
// one shared key for every request without one. Held in memory only; throttleKey hashes it.
export function clientAddressKey(headers: Headers): string {
  const address = getIP(headers, { advanced: { ipAddress: AUTH_IP_ADDRESS_OPTIONS } });
  if (address) return address;
  warnOnceWithoutAddress();
  return NO_TRUSTED_ADDRESS;
}
