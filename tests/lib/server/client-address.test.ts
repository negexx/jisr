import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("the missing-address warning", () => {
  afterEach(() => {
    vi.doUnmock("better-auth/api");
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // A fresh copy of the module per test, because the warning is once per instance; Better Auth's
  // getIP is stubbed to give the production answer, which it cannot give under test.
  async function loadWithoutTrustedAddress() {
    vi.resetModules();
    vi.doMock("better-auth/api", () => ({ getIP: () => null }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { clientAddressKey: key } = await import("@/lib/server/client-address");
    return { key, warn };
  }

  it("warns once per instance, with a fixed line, when production has no trusted address", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { key, warn } = await loadWithoutTrustedAddress();
    const headers = new Headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.9" });
    expect(key(headers)).toBe("unknown");
    expect(key(new Headers())).toBe("unknown");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/198\.51\.100|203\.0\.113/);
  });

  it.each(["test", "development"])("stays silent under NODE_ENV=%s", async (env) => {
    vi.stubEnv("NODE_ENV", env);
    const { key, warn } = await loadWithoutTrustedAddress();
    expect(key(new Headers())).toBe("unknown");
    expect(warn).not.toHaveBeenCalled();
  });

  it("stays silent when an address is found", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    vi.doMock("better-auth/api", () => ({ getIP: () => "203.0.113.7" }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { clientAddressKey: key } = await import("@/lib/server/client-address");
    expect(key(new Headers())).toBe("203.0.113.7");
    expect(warn).not.toHaveBeenCalled();
  });
});
