import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Spies on the real Better Auth factory so "never initialised" is asserted on the thing that
// actually throws "You are using the default secret", not on one of our own wrappers.
const betterAuthSpy = vi.hoisted(() => vi.fn());

vi.mock("better-auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("better-auth")>();
  betterAuthSpy.mockImplementation(original.betterAuth);
  return { ...original, betterAuth: betterAuthSpy };
});

// Each test re-imports the whole Better Auth module graph; the first import is slow under load.
vi.setConfig({ testTimeout: 30_000 });

const ORIGIN = "http://localhost:3000";

type RouteModule = typeof import("@/app/api/auth/[...all]/route");

async function loadRoute(): Promise<RouteModule> {
  vi.resetModules();
  return import("@/app/api/auth/[...all]/route");
}

function getRequest(path: string): Request {
  return new Request(`${ORIGIN}${path}`, { method: "GET", headers: { origin: ORIGIN } });
}

function postRequest(path: string, body: unknown): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  betterAuthSpy.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each([
  ["unset", undefined],
  ["empty", ""],
  ["false", "false"],
  ["a typo", "fasle"],
  ["yes", "yes"],
])("production, no auth secret, ACCOUNTS_ENABLED %s", (_label, value) => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", undefined);
    vi.stubEnv("BETTER_AUTH_URL", undefined);
    vi.stubEnv("ACCOUNTS_ENABLED", value);
  });

  it("answers get-session as a signed-out visitor and never initialises Better Auth", async () => {
    const route = await loadRoute();
    const response = await route.GET(getRequest("/api/auth/get-session"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toBeNull();
    expect(betterAuthSpy).not.toHaveBeenCalled();
  });

  it("refuses a sign-in POST and a provider callback GET without initialising Better Auth", async () => {
    const route = await loadRoute();
    const signIn = await route.POST(
      postRequest("/api/auth/sign-in/magic-link", { email: "new@example.com" }),
    );
    expect(signIn.status).toBe(403);
    expect(signIn.headers.get("cache-control")).toBe("no-store");
    expect(await signIn.json()).toEqual({ code: "ACCOUNTS_DISABLED" });

    const callback = await route.GET(getRequest("/api/auth/callback/google?code=a&state=b"));
    expect(callback.status).toBe(403);
    expect(await callback.json()).toEqual({ code: "ACCOUNTS_DISABLED" });

    expect(betterAuthSpy).not.toHaveBeenCalled();
  });

  it("refuses get-session look-alikes without initialising Better Auth", async () => {
    const route = await loadRoute();
    expect((await route.GET(getRequest("/api/auth/get-session/"))).status).toBe(403);
    expect((await route.GET(getRequest("/api/auth/Get-Session"))).status).toBe(403);
    expect((await route.POST(postRequest("/api/auth/get-session", {}))).status).toBe(403);
    expect(betterAuthSpy).not.toHaveBeenCalled();
  });
});

describe.each([
  ["secret missing", undefined, ORIGIN],
  ["secret blank", "   ", ORIGIN],
  ["url missing", "test-secret-test-secret-test-secret-0123", undefined],
  ["url blank", "test-secret-test-secret-test-secret-0123", ""],
  ["both missing", undefined, undefined],
])("accounts on, %s", (_label, secret, url) => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    vi.stubEnv("BETTER_AUTH_SECRET", secret);
    vi.stubEnv("BETTER_AUTH_URL", url);
  });

  it("answers 500 AUTH_MISCONFIGURED without detail and creates nothing", async () => {
    const route = await loadRoute();
    for (const response of [
      await route.GET(getRequest("/api/auth/get-session")),
      await route.POST(postRequest("/api/auth/sign-in/magic-link", { email: "a@example.com" })),
    ]) {
      expect(response.status).toBe(500);
      const text = await response.text();
      expect(JSON.parse(text)).toEqual({ code: "AUTH_MISCONFIGURED" });
      expect(text).not.toContain("BETTER_AUTH");
    }
    expect(betterAuthSpy).not.toHaveBeenCalled();
  });
});

describe("accounts on and configured", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-0123");
    vi.stubEnv("BETTER_AUTH_URL", ORIGIN);
  });

  it("creates Better Auth once, on the first request, and reuses it", async () => {
    const route = await loadRoute();
    expect(betterAuthSpy).not.toHaveBeenCalled();
    const first = await route.GET(getRequest("/api/auth/get-session"));
    expect(first.status).toBe(200);
    expect(await first.json()).toBeNull();
    await route.GET(getRequest("/api/auth/get-session"));
    expect(betterAuthSpy).toHaveBeenCalledTimes(1);
  });

  it("recovers once the missing variable is set: a failure is not memoised", async () => {
    vi.stubEnv("BETTER_AUTH_URL", undefined);
    const route = await loadRoute();
    expect((await route.GET(getRequest("/api/auth/get-session"))).status).toBe(500);
    vi.stubEnv("BETTER_AUTH_URL", ORIGIN);
    expect((await route.GET(getRequest("/api/auth/get-session"))).status).toBe(200);
    expect(betterAuthSpy).toHaveBeenCalledTimes(1);
  });

  it("does not create Better Auth while the switch is off, then does once it is on", async () => {
    vi.stubEnv("ACCOUNTS_ENABLED", "false");
    const route = await loadRoute();
    await route.GET(getRequest("/api/auth/get-session"));
    expect(betterAuthSpy).not.toHaveBeenCalled();
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    await route.GET(getRequest("/api/auth/get-session"));
    expect(betterAuthSpy).toHaveBeenCalledTimes(1);
  });
});
