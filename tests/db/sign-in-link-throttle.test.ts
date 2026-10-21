import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignInLinkRequest } from "@/lib/server/signup";

// Request-level throttling of the sign-in link path (I1) on PGlite: the Server Action takes its own
// per-address slots (Better Auth's limiter does not run for auth.api calls), refuses an address with
// no mail route before any budget is claimed, and a direct POST without the signup intent is a 404.

const TIMEOUT_MS = 60_000;
const ORIGIN = "http://localhost:3000";
const SECRET = "test-secret-test-secret-test-secret-0123";
const CLIENT_IP = "203.0.113.7";

const io = vi.hoisted(() => ({
  mailDir: "",
  requestHeaders: new Headers(),
  routable: true,
  asked: [] as string[],
}));

vi.mock("next/headers", () => ({ headers: async () => io.requestHeaders }));

vi.mock("@/lib/server/email", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/email")>();
  return {
    ...original,
    sendAuthEmail: async (request: Parameters<typeof original.sendAuthEmail>[0]) => {
      await original.sendAuthEmail(request, { mailDir: io.mailDir });
    },
  };
});

vi.mock("@/lib/server/email-domain", () => ({
  hasMailRoute: async (email: string) => {
    io.asked.push(email);
    return io.routable;
  },
}));

type SignupModule = typeof import("@/lib/server/signup");
type AuthModule = typeof import("@/lib/auth/server");

let testDb: TestDatabase;
let pool: Pool;
let auth: ReturnType<AuthModule["getAuth"]>;
let requestSignInLink: SignupModule["requestSignInLink"];
let closeAppPool: () => Promise<void>;

async function count(table: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(`select count(*) as count from "${table}"`);
  return Number(rows[0]?.count);
}

async function mailCount(): Promise<number> {
  return (await readdir(io.mailDir).catch(() => [])).length;
}

function from(address: string | null): Headers {
  io.requestHeaders = new Headers({
    origin: ORIGIN,
    ...(address === null ? {} : { "x-forwarded-for": address }),
  });
  return io.requestHeaders;
}

function request(email: string): SignInLinkRequest {
  return { email, consent: true, ageConfirmed: true, locale: "fr", returnPath: null };
}

function unique(index: number): string {
  return `student-${index}@example.com`;
}

async function throttleKeyOf(bucket: string, rawKey: string): Promise<string> {
  const { throttleKey } = await import("@/lib/server/request-throttle");
  return throttleKey(bucket, rawKey);
}

async function throttleCount(bucket: string): Promise<number | undefined> {
  const { rows } = await pool.query<{ count: number }>(
    "select count from request_throttles where key = $1",
    [await throttleKeyOf(bucket, CLIENT_IP)],
  );
  return rows[0]?.count;
}

async function seedThrottle(key: string, count: number): Promise<void> {
  await pool.query(
    "insert into request_throttles (key, window_start, count) values ($1, now(), $2)",
    [key, count],
  );
}

beforeAll(async () => {
  testDb = await startTestDatabase({ port: 0 });
  pool = new Pool({ connectionString: testDb.databaseUrl });
  process.env.DATABASE_URL = testDb.databaseUrl;
  process.env.BETTER_AUTH_SECRET = SECRET;
  process.env.BETTER_AUTH_URL = ORIGIN;
  auth = (await import("@/lib/auth/server")).getAuth();
  ({ requestSignInLink } = await import("@/lib/server/signup"));
  const { db } = await import("@/db");
  closeAppPool = () => db.$client.end();
}, TIMEOUT_MS);

beforeEach(async () => {
  vi.stubEnv("ACCOUNTS_ENABLED", "true");
  io.mailDir = await mkdtemp(join(tmpdir(), "jisr-throttle-mail-"));
  io.routable = true;
  io.asked = [];
  from(CLIENT_IP);
  for (const table of ["session", "account", "user", "verification", "pending_signups"]) {
    await pool.query(`delete from "${table}"`);
  }
  await pool.query("delete from email_cooldowns");
  await pool.query("delete from auth_email_days");
  await pool.query("delete from request_throttles");
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(io.mailDir, { recursive: true, force: true });
});

afterAll(async () => {
  await closeAppPool?.();
  await pool?.end();
  await testDb?.stop();
}, TIMEOUT_MS);

describe("the sign-in link action, per address", () => {
  it("answers the eleventh request in an hour with cooldown and claims nothing for it", async () => {
    for (let index = 1; index <= 10; index += 1) {
      expect(await requestSignInLink(request(unique(index))), `request ${index}`).toEqual({
        ok: true,
      });
    }
    expect(await requestSignInLink(request(unique(11)))).toEqual({ ok: false, error: "cooldown" });
    expect(await throttleCount("sign-in-link-day")).toBe(10);
    expect(await count("email_cooldowns")).toBe(10);
    const { rows } = await pool.query<{ sent: number }>("select sent from auth_email_days");
    expect(rows).toEqual([{ sent: 10 }]);
    expect(await count("verification")).toBe(20);
    expect(await mailCount()).toBe(10);
  });

  it("answers the thirty-first request in a day with cooldown and claims nothing for it", async () => {
    await seedThrottle(await throttleKeyOf("sign-in-link-day", CLIENT_IP), 30);
    expect(await requestSignInLink(request(unique(1)))).toEqual({ ok: false, error: "cooldown" });
    expect(await count("email_cooldowns")).toBe(0);
    expect(await count("auth_email_days")).toBe(0);
    expect(await count("pending_signups")).toBe(0);
    expect(await mailCount()).toBe(0);
  });

  it("counts another address separately", async () => {
    await seedThrottle(await throttleKeyOf("sign-in-link-hour", CLIENT_IP), 10);
    expect(await requestSignInLink(request(unique(1)))).toEqual({ ok: false, error: "cooldown" });
    from("203.0.113.8");
    expect(await requestSignInLink(request(unique(2)))).toEqual({ ok: true });
  });

  it("stores hashed keys, never the address", async () => {
    await requestSignInLink(request(unique(1)));
    const { rows } = await pool.query<{ key: string }>("select key from request_throttles");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.key).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(row.key).not.toContain(CLIENT_IP);
    }
    expect(rows.map((row) => row.key).sort()).toEqual(
      [
        await throttleKeyOf("sign-in-link-hour", CLIENT_IP),
        await throttleKeyOf("sign-in-link-day", CLIENT_IP),
      ].sort(),
    );
  });

  it("shares one key when there is no trusted address, and does not throw", async () => {
    from("198.51.100.1, 203.0.113.9");
    expect(await requestSignInLink(request(unique(1)))).toEqual({ ok: true });
    from("198.51.100.2, 203.0.113.9");
    expect(await requestSignInLink(request(unique(2)))).toEqual({ ok: true });
    const { rows } = await pool.query<{ key: string; count: number }>(
      "select key, count from request_throttles order by key",
    );
    expect(rows.map((row) => row.count)).toEqual([2, 2]);
    // Better Auth's shared fallback: localhost under test, "unknown" in production.
    const { clientAddressKey } = await import("@/lib/server/client-address");
    const shared = clientAddressKey(from("198.51.100.3, 203.0.113.9"));
    expect(rows.map((row) => row.key).sort()).toEqual(
      [
        await throttleKeyOf("sign-in-link-hour", shared),
        await throttleKeyOf("sign-in-link-day", shared),
      ].sort(),
    );
  });

  it("works with no forwarded address at all", async () => {
    from(null);
    expect(await requestSignInLink(request(unique(1)))).toEqual({ ok: true });
  });

  it("answers a throttle store failure with `failed` and logs no query text and no key", async () => {
    const { db } = await import("@/db");
    vi.spyOn(db, "insert").mockImplementation((() => {
      throw Object.assign(
        new Error(`Failed query: insert into "request_throttles" params: ${CLIENT_IP}`),
        { cause: { code: "08006" } },
      );
    }) as unknown as typeof db.insert);
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    expect(await requestSignInLink(request(unique(1)))).toEqual({ ok: false, error: "failed" });
    const output = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    expect(output).toContain("08006");
    expect(output).not.toContain("Failed query");
    expect(output).not.toContain(CLIENT_IP);
    expect(output).not.toContain(unique(1));
    expect(await count("email_cooldowns")).toBe(0);
  });

  it.each([
    ["sign-in-link-hour", 10],
    ["sign-in-link-day", 30],
  ])("logs one fixed line naming only the %s bucket when it refuses", async (bucket, max) => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    await seedThrottle(await throttleKeyOf(bucket, CLIENT_IP), max);
    expect(await requestSignInLink(request(unique(1)))).toEqual({ ok: false, error: "cooldown" });
    const output = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    expect(output).toContain(bucket);
    expect(output).not.toContain(CLIENT_IP);
    expect(output).not.toContain(unique(1));
    expect(output).not.toMatch(/[A-Za-z0-9_-]{43}/);
    expect(spies.flatMap((spy) => spy.mock.calls)).toHaveLength(1);
  });

  it("logs nothing when the address is within its limits", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    expect(await requestSignInLink(request(unique(1)))).toEqual({ ok: true });
    expect(spies.flatMap((spy) => spy.mock.calls)).toEqual([]);
  });

  it("takes no throttle slot while the confirmations are missing", async () => {
    expect(await requestSignInLink({ ...request(unique(1)), consent: false })).toEqual({
      ok: false,
      error: "confirmation_required",
    });
    expect(await count("request_throttles")).toBe(0);
  });
});

describe("the mail-route check", () => {
  beforeEach(() => {
    // The file transport (tests, local runs, the e2e server) skips the lookup: no mail leaves the
    // process there. A provider key makes this a real-delivery configuration.
    vi.stubEnv("BREVO_API_KEY", "test-key");
    vi.stubEnv("BREVO_SENDER", "Jisrr <no-reply@jisrr.test>");
  });

  it("refuses an unroutable domain as invalid_email before any budget is claimed", async () => {
    io.routable = false;
    expect(await requestSignInLink(request("ana@no-such-domain.example"))).toEqual({
      ok: false,
      error: "invalid_email",
    });
    expect(io.asked).toEqual(["ana@no-such-domain.example"]);
    expect(await count("email_cooldowns")).toBe(0);
    expect(await count("auth_email_days")).toBe(0);
    expect(await count("pending_signups")).toBe(0);
    expect(await count("verification")).toBe(0);
    expect(await mailCount()).toBe(0);
  });

  it("does not look the domain up on the file transport", async () => {
    vi.stubEnv("BREVO_API_KEY", "");
    vi.stubEnv("BREVO_SENDER", "");
    expect(await requestSignInLink(request(unique(1)))).toEqual({ ok: true });
    expect(io.asked).toEqual([]);
  });
});

describe("a direct request without the signup intent", () => {
  function directPost(email: string): Promise<Response> {
    return auth.handler(
      new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ email, metadata: { locale: "en", mode: "signup" } }),
      }),
    );
  }

  async function expectNothingWritten(): Promise<void> {
    expect(await count("email_cooldowns")).toBe(0);
    expect(await count("auth_email_days")).toBe(0);
    expect(await count("verification")).toBe(0);
    expect(await count("pending_signups")).toBe(0);
    expect(await mailCount()).toBe(0);
  }

  it("answers a POST to /sign-in/magic-link with 404 and writes nothing", async () => {
    const response = await directPost("direct@example.com");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
    await expectNothingWritten();
  });

  it("refuses a server-side auth.api call the same way", async () => {
    await expect(
      auth.api.signInMagicLink({
        body: { email: "direct@example.com" },
        headers: new Headers({ origin: ORIGIN }),
      }),
    ).rejects.toMatchObject({ status: "NOT_FOUND" });
    await expectNothingWritten();
  });

  it("refuses a request that carries the intent for another address", async () => {
    const { runAsSignup } = await import("@/lib/auth/signup-intent");
    await expect(
      runAsSignup("someone@example.com", () =>
        auth.api.signInMagicLink({
          body: { email: "other@example.com" },
          headers: new Headers({ origin: ORIGIN }),
        }),
      ),
    ).rejects.toMatchObject({ status: "NOT_FOUND" });
    await expectNothingWritten();
  });

  it("keeps the 400 for a value that is not an address (checked before the intent)", async () => {
    const response = await directPost("not-an-address");
    expect(response.status).toBe(400);
    await expectNothingWritten();
  });
});
