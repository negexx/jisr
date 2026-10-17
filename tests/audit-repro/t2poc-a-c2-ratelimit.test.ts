import { randomBytes } from "node:crypto";

import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CURRENT_CONSENT_VERSION } from "@/lib/auth/consent";

// PoC A / C2 — no rate limiting, unbounded write amplification and unbounded DB work.
//
// Everything is driven in-process through the real /api/auth route on the PGlite harness: no
// network, no production, reserved @example.org addresses only. (i) N unauthenticated google
// sign-in starts must each write one `auth-state:` verification row with no 429. (ii) The app's
// lazy purge must run (it deletes an expired pending row) yet leave every verification row.
// (iii) N junk-token confirms must each answer 400 with no 429; a best-effort counter on the app
// pool measures the DB work per request. The rate limiter's disableIpTracking switch is asserted
// from the configured instance, matching the static re-read of node_modules/better-auth.

vi.mock("@/lib/server/email", () => ({ sendAuthEmail: async () => {} }));

const TIMEOUT_MS = 120_000;
const ORIGIN = "http://localhost:3000";
const GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = "test-google-client-secret";
const N = 50;

type RouteModule = typeof import("@/app/api/auth/[...all]/route");
type AuthModule = typeof import("@/lib/auth/server");

let testDb: TestDatabase;
let pool: Pool;
let route: RouteModule;
let auth: ReturnType<AuthModule["getAuth"]>;
let claimAuthEmailSend: (kind: "magic-link", email: string) => Promise<boolean>;
let closeAppPool: () => Promise<void>;
let restoreAppQuery: (() => void) | undefined;
let appQueryCount = 0;

async function count(table: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(`select count(*) as count from "${table}"`);
  return Number(rows[0]?.count);
}

async function authStateCount(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    "select count(*) as count from verification where identifier like 'auth-state:%'",
  );
  return Number(rows[0]?.count);
}

async function googleStart(): Promise<{ status: number; url: string | null }> {
  const response = await route.POST(
    new Request(`${ORIGIN}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ provider: "google" }),
    }),
  );
  const body = (await response.json().catch(() => null)) as { url?: string } | null;
  return { status: response.status, url: body?.url ?? null };
}

async function junkConfirm(): Promise<number> {
  const token = randomBytes(24).toString("base64url").slice(0, 32);
  const response = await route.POST(
    new Request(`${ORIGIN}/api/auth/magic-link/confirm`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }),
  );
  await response.json().catch(() => null);
  return response.status;
}

beforeAll(async () => {
  testDb = await startTestDatabase({ port: 0 });
  pool = new Pool({ connectionString: testDb.databaseUrl });
  process.env.DATABASE_URL = testDb.databaseUrl;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
  process.env.BETTER_AUTH_URL = ORIGIN;
  process.env.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = GOOGLE_CLIENT_SECRET;
  route = await import("@/app/api/auth/[...all]/route");
  auth = (await import("@/lib/auth/server")).getAuth();
  ({ claimAuthEmailSend } = await import("@/lib/server/email-cooldown"));
  const { db } = await import("@/db");
  closeAppPool = () => db.$client.end();

  // Best-effort statement counter: drizzle's node-postgres session calls `client.query` on the
  // app pool, so patching it counts the statements the auth endpoints issue.
  const client = db.$client as unknown as Record<string, unknown>;
  const original = client.query as (...args: unknown[]) => unknown;
  client.query = (...args: unknown[]) => {
    appQueryCount += 1;
    return original.apply(client, args);
  };
  restoreAppQuery = () => {
    client.query = original;
  };
}, TIMEOUT_MS);

beforeEach(async () => {
  vi.stubEnv("ACCOUNTS_ENABLED", "true");
  for (const table of ["session", "account", "user", "verification", "pending_signups"]) {
    await pool.query(`delete from "${table}"`);
  }
  await pool.query("delete from email_cooldowns");
  await pool.query("delete from auth_email_days");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  restoreAppQuery?.();
  await closeAppPool?.();
  await pool?.end();
  await testDb?.stop();
}, TIMEOUT_MS);

describe("C2 — no rate limiting on /sign-in/social (write amplification)", () => {
  it(`answers ${N} unauthenticated google starts with 200 and writes ${N} verification rows, no 429`, async () => {
    const before = await authStateCount();
    expect(before).toBe(0);
    const statuses: number[] = [];
    for (let i = 0; i < N; i += 1) {
      const started = await googleStart();
      expect(started.url).toContain("accounts.google.com");
      statuses.push(started.status);
    }
    expect(statuses).toEqual(Array.from({ length: N }, () => 200));
    expect(statuses).not.toContain(429);
    const after = await authStateCount();
    expect(after - before).toBe(N);
  });
});

describe("C2 — the app's lazy purge does not cover verification", () => {
  it("deletes an expired pending row but leaves every auth-state row, even expired", async () => {
    for (let i = 0; i < N; i += 1) {
      expect((await googleStart()).status).toBe(200);
    }
    const seeded = await authStateCount();
    expect(seeded).toBe(N);

    await pool.query(
      `insert into pending_signups (email, consent_version, consented_at, age_confirmed, expires_at)
       values ('expired-purge@example.org', $1, now(), true, now() - interval '1 hour')`,
      [CURRENT_CONSENT_VERSION],
    );
    // Expire the attacker-driven state rows too, so the purge has a reason to sweep them.
    await pool.query(
      "update verification set expires_at = now() - interval '1 hour' where identifier like 'auth-state:%'",
    );

    expect(await claimAuthEmailSend("magic-link", "purge-check@example.org")).toBe(true);

    // Control: the purge really ran (the expired pending row is gone) ...
    expect(await count("pending_signups")).toBe(0);
    // ... yet it does not touch verification: every state row survives.
    expect(await authStateCount()).toBe(seeded);
  });
});

describe("C2 — no rate limiting on /magic-link/confirm (read amplification)", () => {
  it(`answers ${N} junk-token confirms with 400 each and never 429`, async () => {
    const before = appQueryCount;
    const statuses: number[] = [];
    for (let i = 0; i < N; i += 1) {
      statuses.push(await junkConfirm());
    }
    const after = appQueryCount;

    expect(statuses).toEqual(Array.from({ length: N }, () => 400));
    expect(statuses).not.toContain(429);
    expect(await count("user")).toBe(0);

    const perRequest = (after - before) / N;
    console.log(`[C2] app-pool statements over ${N} junk confirms: ${after - before} (${perRequest}/request)`);
    // Best effort: the count is only meaningful if the patch captured the app pool's queries.
    expect(after - before).toBeGreaterThan(0);
  });
});

describe("C2 — the rate limiter is switched off by disableIpTracking", () => {
  it("configures disableIpTracking: true on the live instance", () => {
    expect(auth.options.advanced?.ipAddress?.disableIpTracking).toBe(true);
  });
});
