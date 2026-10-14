import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { startTestDatabase, type TestDatabase } from "./harness";

const TIMEOUT_MS = 60_000;
const sentLinks: { to: string; token: string }[] = [];

vi.mock("@/lib/server/email", () => ({
  sendAuthEmail: async (request: { to: string; token: string }) => {
    sentLinks.push({ to: request.to, token: request.token });
  },
}));

type AuthModule = typeof import("@/lib/auth/server");
type PendingModule = typeof import("@/lib/auth/pending-signup");

let testDb: TestDatabase;
let pool: Pool;
let auth: AuthModule["auth"];
let readPendingSignup: PendingModule["readPendingSignup"];
let closeAppPool: () => Promise<void>;

const IN_ONE_HOUR = new Date(Date.now() + 60 * 60 * 1000);
const ONE_HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000);

async function userCount(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>('select count(*) as count from "user"');
  return Number(rows[0]?.count);
}

async function insertPending(
  email: string,
  fields: { expiresAt: Date; ageConfirmed?: boolean; consentVersion?: string | null },
): Promise<void> {
  await pool.query(
    "insert into pending_signups (email, age_confirmed, consent_version, consented_at, expires_at) values ($1, $2, $3, $4, $5)",
    [
      email,
      fields.ageConfirmed ?? true,
      fields.consentVersion ?? null,
      fields.consentVersion ? new Date() : null,
      fields.expiresAt,
    ],
  );
}

function redirectLocation(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  if (!("status" in error) || error.status !== "FOUND") return null;
  if (!("headers" in error) || !(error.headers instanceof Headers)) return null;
  return error.headers.get("location");
}

// The real sign-in path: request a magic link, then follow it. Better Auth answers a verify
// with a redirect; a gate rejection shows up as `?error=<code>` on the redirect target.
async function signInWithMagicLink(email: string): Promise<{ error: string | null }> {
  const headers = () =>
    new Headers({ "x-forwarded-for": "203.0.113.7", "user-agent": "jisr-test-agent" });
  await auth.api.signInMagicLink({ body: { email }, headers: headers() });
  const link = sentLinks.at(-1);
  if (link?.to !== email) throw new Error("no magic link was sent");
  try {
    await auth.api.magicLinkVerify({ query: { token: link.token }, headers: headers() });
  } catch (error) {
    const location = redirectLocation(error);
    if (location === null) throw error;
    return { error: new URL(location).searchParams.get("error") };
  }
  return { error: null };
}

beforeAll(async () => {
  testDb = await startTestDatabase({ port: 0 });
  pool = new Pool({ connectionString: testDb.databaseUrl });
  // @/db builds its pool from DATABASE_URL at import time, so point it at the harness first.
  // The server asks for Asia/Tokyo at startup; the app pool must still end up on UTC.
  process.env.DATABASE_URL = `${testDb.databaseUrl}&options=-c%20timezone%3DAsia%2FTokyo`;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  ({ auth } = await import("@/lib/auth/server"));
  ({ readPendingSignup } = await import("@/lib/auth/pending-signup"));
  const { db } = await import("@/db");
  closeAppPool = () => db.$client.end();
}, TIMEOUT_MS);

beforeEach(async () => {
  sentLinks.length = 0;
  await pool.query('delete from "user"');
  await pool.query("delete from verification");
  await pool.query("delete from session");
  await pool.query("delete from pending_signups");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await closeAppPool?.();
  await pool?.end();
  await testDb?.stop();
}, TIMEOUT_MS);

describe("app pool", () => {
  it("pins the session time zone to UTC", async () => {
    const { db } = await import("@/db");
    const result = await db.$client.query<{ TimeZone: string }>("show timezone");
    expect(result.rows[0]?.TimeZone).toBe("UTC");
  });
});

describe("readPendingSignup", () => {
  it("finds a row by the normalised form of a messy address", async () => {
    await insertPending("ana@example.com", {
      expiresAt: IN_ONE_HOUR,
      consentVersion: "2026-10-14",
    });
    expect(await readPendingSignup(" Ana@Example.COM ")).toEqual({
      email: "ana@example.com",
      ageConfirmed: true,
      consentVersion: "2026-10-14",
    });
  });

  it("ignores a row past its expires_at", async () => {
    await insertPending("ana@example.com", { expiresAt: ONE_HOUR_AGO });
    expect(await readPendingSignup("ana@example.com")).toBeNull();
  });

  it("judges expiry against the clock it is given", async () => {
    await insertPending("ana@example.com", { expiresAt: IN_ONE_HOUR });
    const afterExpiry = new Date(IN_ONE_HOUR.getTime() + 1000);
    expect(await readPendingSignup("ana@example.com", afterExpiry)).toBeNull();
  });

  it("returns null when there is no row", async () => {
    expect(await readPendingSignup("nobody@example.com")).toBeNull();
  });
});

describe("admission gate against the database", () => {
  // The accounts kill switch is off by default; these specs exercise the admission rules
  // behind it, so each one turns it on for its own run only.
  beforeEach(() => {
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
  });

  it("rejects a create with no server-validated evidence at the hook, so no row is written", async () => {
    const before = auth.options.databaseHooks?.user?.create?.before;
    if (!before) throw new Error("the create.before gate hook is not registered");
    await expect(
      before({ email: "student@example.com", name: "Student" } as never, null),
    ).rejects.toMatchObject({
      status: "BAD_REQUEST",
      body: { code: "AGE_NOT_CONFIRMED" },
    });
    expect(await userCount()).toBe(0);
  });

  it("creates no user when a magic link is followed with no pending row", async () => {
    expect(await signInWithMagicLink("new@example.com")).toEqual({ error: "AGE_NOT_CONFIRMED" });
    expect(await userCount()).toBe(0);
  });

  it("creates no user when the only pending row has expired", async () => {
    await insertPending("new@example.com", { expiresAt: ONE_HOUR_AGO });
    expect(await signInWithMagicLink("new@example.com")).toEqual({ error: "AGE_NOT_CONFIRMED" });
    expect(await userCount()).toBe(0);
  });

  it("creates the user with the consent record from a valid pending row", async () => {
    await insertPending("new@example.com", {
      expiresAt: IN_ONE_HOUR,
      consentVersion: "2026-10-14",
    });
    expect(await signInWithMagicLink("new@example.com")).toEqual({ error: null });
    const { rows } = await pool.query<{
      consent_version: string | null;
      consented_at: Date | null;
    }>('select consent_version, consented_at from "user" where email = $1', ["new@example.com"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.consent_version).toBe("2026-10-14");
    expect(rows[0]?.consented_at).toBeInstanceOf(Date);
  });

  it("records no client IP on the session created by the magic-link flow", async () => {
    await insertPending("new@example.com", {
      expiresAt: IN_ONE_HOUR,
      consentVersion: "2026-10-14",
    });
    // The request carries an x-forwarded-for header; with tracking disabled it must not land in the row.
    expect(await signInWithMagicLink("new@example.com")).toEqual({ error: null });
    const { rows } = await pool.query<{ ip_address: string | null }>(
      "select ip_address from session",
    );
    expect(rows).toHaveLength(1);
    // Better Auth writes "" rather than NULL when it has no address; either way no IP is stored.
    expect([null, ""]).toContain(rows[0]?.ip_address);
  });
});
