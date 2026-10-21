import "server-only";

import { getIP } from "better-auth/api";

// Vercel overwrites x-forwarded-for with the single client address; a header with several values is
// not trusted (no trustedProxies). One definition, read by Better Auth's own limiter (auth/server.ts)
// and by the sign-in Server Action below, so both count the same address.
export const AUTH_IP_ADDRESS_OPTIONS = { ipAddressHeaders: ["x-forwarded-for"], ipv6Subnet: 64 };

const NO_TRUSTED_ADDRESS = "unknown";

// The single trusted client address as Better Auth would resolve it (IPv6 collapsed to its /64), or
// one shared key for every request without one. Held in memory only; throttleKey hashes it.
export function clientAddressKey(headers: Headers): string {
  return getIP(headers, { advanced: { ipAddress: AUTH_IP_ADDRESS_OPTIONS } }) ?? NO_TRUSTED_ADDRESS;
}
