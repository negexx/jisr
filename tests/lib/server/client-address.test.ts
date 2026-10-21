import { describe, expect, it } from "vitest";

import { clientAddressKey } from "@/lib/server/client-address";

function forwarded(value: string): Headers {
  return new Headers({ "x-forwarded-for": value });
}

describe("clientAddressKey", () => {
  it("is the single forwarded address", () => {
    expect(clientAddressKey(forwarded("203.0.113.7"))).toBe("203.0.113.7");
  });

  it("collapses an IPv6 address to its /64, as Better Auth's limiter does", () => {
    const a = clientAddressKey(forwarded("2001:db8:1:2:aaaa:bbbb:cccc:dddd"));
    const b = clientAddressKey(forwarded("2001:db8:1:2:1111:2222:3333:4444"));
    const other = clientAddressKey(forwarded("2001:db8:1:3:aaaa:bbbb:cccc:dddd"));
    expect(a).toBe(b);
    expect(a).not.toBe(other);
  });

  // Better Auth caches NODE_ENV when it loads, so the production answer ("unknown") cannot be
  // reached from a test; under test it falls back to localhost. What matters is the same here: one
  // shared key, never one of the forwarded values, never a throw.
  it.each([
    ["a header with several values", ["198.51.100.1, 203.0.113.9", "198.51.100.2, 203.0.113.9"]],
    ["a value that is not an address", ["not-an-ip", "also-not-an-ip"]],
  ])("gives %s one shared key", (_label, values) => {
    const keys = values.map((value) => clientAddressKey(forwarded(value)));
    expect(new Set(keys).size).toBe(1);
    expect(values.join(" ")).not.toContain(keys[0] ?? "");
  });

  it("shares that key with a request that forwarded nothing", () => {
    expect(clientAddressKey(new Headers())).toBe(
      clientAddressKey(forwarded("198.51.100.1, 203.0.113.9")),
    );
  });

  it("reads no other header", () => {
    const key = clientAddressKey(new Headers());
    expect(
      clientAddressKey(new Headers({ "x-real-ip": "203.0.113.7", forwarded: "for=203.0.113.7" })),
    ).toBe(key);
  });
});
