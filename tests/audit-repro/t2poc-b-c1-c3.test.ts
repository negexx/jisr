import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CURRENT_CONSENT_VERSION } from "@/lib/auth/consent";
import type { SignInLinkRequest } from "@/lib/server/signup";

import { confirmRequest } from "../support/magic-link";

// PoC engineer B — independent reproduction of the surface hunter's C1 and C3.
//
// C1: an anonymous third party calls the sign-in Server Action for an address it does not own, and
// the pre-account `pending_signups` row records age/consent evidence authored by that third party.
// The address owner's own confirm consumes it. This spec checks exactly what reaches the *account*
// (the hunter claims the account's consented_at is the create clock, not the row value) and what the
// owner's own JSON export discloses.
//
// C3: an expired pre-account row is ignored by the reader but only deleted when a *later* auth email
// is granted (lazy purge). Read-only assertions, PGlite only, reserved @example.org addresses.
//
// Everything is local: no network, no production, no real mailbox. The mail directory is a temp
// folder so the emailed link can be followed exactly as the confirm page does.

const TIMEOUT_MS = 60_000;
const ORIGIN = "http://localhost:3000";
// A value no confirm could ever produce, so the account row cannot have picked it up from the plant.
const PLANTED_OLD = new Date("2020-01-02T03:04:05.000Z");

const io = vi.hoisted(() => ({ mailDir: "" }));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "http://localhost:3000" }) }));

vi.mock("@/lib/server/email", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/email")>();
  return {
    ...original,
    sendAuthEmail: async (request: Parameters<typeof original.sendAuthEmail>[0]) => {
      await original.sendAuthEmail(request, { mailDir: io.mailDir });
    },
  };
});

type AuthModule = typeof import("@/lib/auth/server");
type SignupModule = typeof import("@/lib/server/signup");
type PendingModule = typeof import("@/lib/auth/pending-signup");
type CooldownModule = typeof import("@/lib/server/email-cooldown");
type ExportStore = typeof import("@/lib/server/account-export-store");

let testDb: TestDatabase;
let pool: Pool;
let auth: ReturnType<AuthModule["getAuth"]>;
let requestSignInLink: SignupModule["requestSignInLink"];
let readPendingSignup: PendingModule["readPendingSignup"];
let claimAuthEmailSend: CooldownModule["claimAuthEmailSend"];
let exportAccountDataFor: ExportStore["exportAccountDataFor"];
let closeAppPool: () => Promise<void>;

async function count(table: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(`select count(*) as count from "${table}"`);
  return Number(rows[0]?.count);
}

type MailRecord = { kind: string; to: string; url: string };

async function lastLink(): Promise<string> {
  const files = (await readdir(io.mailDir).catch(() => [])).sort();
  const last = files.at(-1);
  if (last === undefined) throw new Error("no magic-link mail was written");
  const mail: MailRecord = JSON.parse(await readFile(join(io.mailDir, last), "utf8"));
  return mail.url;
}

function request(overrides: Partial<SignInLinkRequest> = {}): SignInLinkRequest {
  return {
    email: "victim@example.org",
    consent: true,
    ageConfirmed: true,
    locale: "fr",
    returnPath: "/fr/plan",
    ...overrides,
  };
}

// Follows the emailed link the way the confirm page does; returns the refusal code or null.
async function follow(link: string): Promise<{ error: string | null }> {
  const response = await auth.handler(confirmRequest(link));
  if (response.status === 200) return { error: null };
  const body: { code?: string } = await response.json();
  return { error: body.code ?? null };
}

beforeAll(async () => {
  testDb = await startTestDatabase({ port: 0 });
  pool = new Pool({ connectionString: testDb.databaseUrl });
  process.env.DATABASE_URL = testDb.databaseUrl;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
  process.env.BETTER_AUTH_URL = ORIGIN;
  auth = (await import("@/lib/auth/server")).getAuth();
  ({ requestSignInLink } = await import("@/lib/server/signup"));
  ({ readPendingSignup } = await import("@/lib/auth/pending-signup"));
  ({ claimAuthEmailSend } = await import("@/lib/server/email-cooldown"));
  ({ exportAccountDataFor } = await import("@/lib/server/account-export-store"));
  const { db } = await import("@/db");
  closeAppPool = () => db.$client.end();
}, TIMEOUT_MS);

beforeEach(async () => {
  vi.stubEnv("ACCOUNTS_ENABLED", "true");
  io.mailDir = await mkdtemp(join(tmpdir(), "jisr-poc-b-c1-"));
  for (const table of ["session", "account", "user", "verification", "pending_signups"]) {
    await pool.query(`delete from "${table}"`);
  }
  await pool.query("delete from email_cooldowns");
  await pool.query("delete from auth_email_days");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(io.mailDir, { recursive: true, force: true });
});

afterAll(async () => {
  await closeAppPool?.();
  await pool?.end();
  await testDb?.stop();
}, TIMEOUT_MS);

describe("C1 — an attacker plants consent/age evidence for an address it does not own", () => {
  it("writes the pending row from one anonymous action call, with the request-time clock", async () => {
    const before = Date.now();
    expect(await requestSignInLink(request())).toEqual({ ok: true });
    const after = Date.now();

    const { rows } = await pool.query<{
      email: string;
      consent_version: string;
      age_confirmed: boolean;
      consented_ms: string;
    }>(
      `select email, consent_version, age_confirmed,
              extract(epoch from consented_at) * 1000 as consented_ms
       from pending_signups`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: "victim@example.org",
      consent_version: CURRENT_CONSENT_VERSION,
      age_confirmed: true,
    });
    // The evidence names the third-party request, not any act by the address owner.
    expect(Number(rows[0]?.consented_ms)).toBeGreaterThanOrEqual(before);
    expect(Number(rows[0]?.consented_ms)).toBeLessThanOrEqual(after);
  });

  it("the created account stamps the CREATE clock, not the planted row's consented_at", async () => {
    expect(await requestSignInLink(request())).toEqual({ ok: true });
    // Age the planted row: if the account inherited this value the claim would be upheld.
    await pool.query("update pending_signups set consented_at = $1", [PLANTED_OLD]);

    const confirmAt = Date.now();
    const { error } = await follow(await lastLink());
    expect(error).toBeNull();

    const { rows } = await pool.query<{
      email: string;
      consent_version: string | null;
      consented_ms: string | null;
    }>(
      `select email, consent_version,
              extract(epoch from consented_at) * 1000 as consented_ms
       from "user"`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("victim@example.org");
    expect(rows[0]?.consent_version).toBe(CURRENT_CONSENT_VERSION);
    // The account's consent time is the create/confirm clock, not the planted 2020 value: the
    // third party cannot forge the *account's* consent timestamp.
    const accountMs = Number(rows[0]?.consented_ms);
    expect(accountMs).toBeGreaterThanOrEqual(confirmAt - 1000);
    expect(accountMs).not.toBe(PLANTED_OLD.getTime());

    // The planted row survives the confirm unchanged, with the attacker-authored timestamp.
    const row = await pool.query<{ consented_ms: string }>(
      "select extract(epoch from consented_at) * 1000 as consented_ms from pending_signups",
    );
    expect(Number(row.rows[0]?.consented_ms)).toBe(PLANTED_OLD.getTime());
  });

  it("discloses the third-party-authored row in the address owner's own export", async () => {
    expect(await requestSignInLink(request())).toEqual({ ok: true });
    await pool.query("update pending_signups set consented_at = $1", [PLANTED_OLD]);
    expect((await follow(await lastLink())).error).toBeNull();

    const { rows } = await pool.query<{ id: string }>(
      'select id from "user" where email = $1',
      ["victim@example.org"],
    );
    const userId = rows[0]?.id;
    if (userId === undefined) throw new Error("no user was created");

    const { db } = await import("@/db");
    const document = await exportAccountDataFor(db, userId, new Date());
    expect(document).not.toBeNull();
    // The export keys the row by normalizeEmail(owner.email), so the owner sees evidence they did
    // not author, with no field marking it unverified.
    expect(document?.pendingSignup).toEqual({
      consentVersion: CURRENT_CONSENT_VERSION,
      consentedAt: PLANTED_OLD.toISOString(),
      ageConfirmed: true,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      expiresAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });
});

describe("C3 — expired pre-account rows are purged only lazily", () => {
  async function insertExpired(email: string): Promise<void> {
    await pool.query(
      `insert into pending_signups (email, consent_version, consented_at, age_confirmed, expires_at)
       values ($1, $2, now() - interval '1 hour', true, now() - interval '1 second')`,
      [email, CURRENT_CONSENT_VERSION],
    );
  }

  it("ignores an expired row at read time while it still exists", async () => {
    await insertExpired("stale@example.org");
    expect(await readPendingSignup("stale@example.org")).toBeNull();
    // The reader ignores it; nothing swept it.
    expect(await count("pending_signups")).toBe(1);
  });

  it("a granted auth-email claim is the purge path", async () => {
    await insertExpired("stale@example.org");
    expect(await claimAuthEmailSend("magic-link", "sender@example.org")).toBe(true);
    expect(await count("pending_signups")).toBe(0);
  });

  it("a refused claim purges nothing", async () => {
    await insertExpired("stale@example.org");
    // Occupy the mailbox slot so the next claim is refused.
    expect(await claimAuthEmailSend("magic-link", "sender@example.org")).toBe(true);
    await insertExpired("stale@example.org");
    expect(await claimAuthEmailSend("magic-link", "sender@example.org")).toBe(false);
    expect(await count("pending_signups")).toBe(1);
  });
});
