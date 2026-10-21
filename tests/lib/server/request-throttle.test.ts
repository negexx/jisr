import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { throttleKey } from "@/lib/server/request-throttle";

const DAY_1 = new Date("2026-10-21T12:00:00.000Z");
const IP = "203.0.113.7";

describe("throttleKey", () => {
  beforeEach(() => {
    vi.stubEnv("BETTER_AUTH_SECRET", "unit-test-secret-0123456789abcdef");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is deterministic for the same inputs", () => {
    expect(throttleKey("sign-in-link:hour", IP, DAY_1)).toBe(
      throttleKey("sign-in-link:hour", IP, DAY_1),
    );
  });

  it("differs for another bucket and for another raw key", () => {
    const base = throttleKey("sign-in-link:hour", IP, DAY_1);
    expect(throttleKey("sign-in-link:day", IP, DAY_1)).not.toBe(base);
    expect(throttleKey("sign-in-link:hour", "203.0.113.8", DAY_1)).not.toBe(base);
  });

  it("differs on another UTC day, so the same address is not linked across days", () => {
    const lastSecond = new Date("2026-10-21T23:59:59.999Z");
    const firstSecond = new Date("2026-10-22T00:00:00.000Z");
    expect(throttleKey("b", IP, lastSecond)).not.toBe(throttleKey("b", IP, firstSecond));
    expect(throttleKey("b", IP, new Date("2026-10-21T00:00:00.000Z"))).toBe(
      throttleKey("b", IP, lastSecond),
    );
  });

  it("depends on the secret", () => {
    const before = throttleKey("b", IP, DAY_1);
    vi.stubEnv("BETTER_AUTH_SECRET", "another-secret-0123456789abcdef");
    expect(throttleKey("b", IP, DAY_1)).not.toBe(before);
  });

  it("is a 43 character base64url digest that does not contain the raw key", () => {
    const key = throttleKey("b", IP, DAY_1);
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(key).not.toContain(IP);
    expect(key).not.toContain("203.0.113.7");
  });

  it("names the missing variable, never a value, when the secret is absent or blank", () => {
    for (const value of ["", "   "]) {
      vi.stubEnv("BETTER_AUTH_SECRET", value);
      expect(() => throttleKey("b", IP, DAY_1)).toThrow("BETTER_AUTH_SECRET");
    }
  });
});
