import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// PoC engineer B — independent reproduction of the surface hunter's C2 (per-mailbox cooldown hold)
// and one falsification check against the auth-data hunter's H2-C2 (Better Auth's rate limiter is
// switched off because disableIpTracking makes getIP() return null).
//
// C2: with an injected clock, one accepted claim takes the mailbox slot for 60 s; +tag and Gmail-dot
// aliases share that one key; a refused mailbox claim and a refused daily-ceiling claim surface the
// *same* HTTP error. The honest impact is reproduced at the end: each accepted attacker send spends
// the shared daily budget.
//
// Falsification: 25 same-origin magic-link requests for 25 *distinct* addresses (a path under
// Better Auth's `/sign-in` special rule, window 10 s max 3) must all answer 200 — a 429 would mean
// the limiter is on. Reserved @example.org addresses only, no network, no production.

const TIMEOUT_MS = 120_000;
const ORIGIN = "http://localhost:3000";
const T0 = new Date("2026-10-14T09:00:00.000Z");

function after(seconds: number): Date {
  return new Date(T0.getTime() + seconds * 1000);
}

vi.mock("@/lib/server/email", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/email")>();
  return { ...original, sendAuthEmail: async () => {} };
});

type AuthModule = typeof import("@/lib/auth/server");
type CooldownModule = typeof import("@/lib/server/email-cooldown");

let testDb: TestDatabase;
let pool: Pool;
let auth: ReturnType<AuthModule["getAuth"]>;
let claimEmailSendSlot: CooldownModule["claimEmailSendSlot"];
let claimAuthEmailSend: CooldownModule["claimAuthEmailSend"];
let closeAppPool: () => Promise<void>;

async function count(table: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(`select count(*) as count from "${table}"`);
  return Number(rows[0]?.count);
}

async function magicLink(email: string): Promise<Response> {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ email, callbackURL: "/fr/welcome" }),
    }),
  );
}

beforeAll(async () => {
  testDb = await startTestDatabase({ port: 0 });
  pool = new Pool({ connectionString: testDb.databaseUrl });
  process.env.DATABASE_URL = testDb.databaseUrl;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
  process.env.BETTER_AUTH_URL = ORIGIN;
  auth = (await import("@/lib/auth/server")).getAuth();
  ({ claimEmailSendSlot, claimAuthEmailSend } = await import("@/lib/server/email-cooldown"));
  const { db } = await import("@/db");
  closeAppPool = () => db.$client.end();
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
  await closeAppPool?.();
  await pool?.end();
  await testDb?.stop();
}, TIMEOUT_MS);

describe("C2 — the mailbox cooldown is a 60 s hold on one mailbox", () => {
  it("accepts at t0, refuses at t0+59s, accepts at t0+61s", async () => {
    expect(await claimEmailSendSlot("magic-link", "victim@example.org", T0)).toBe(true);
    expect(await claimEmailSendSlot("magic-link", "victim@example.org", after(59))).toBe(false);
    expect(await claimEmailSendSlot("magic-link", "victim@example.org", after(61))).toBe(true);
  });

  it("shares one cooldown key across +tag aliases of one mailbox", async () => {
    expect(await claimEmailSendSlot("magic-link", "victim+1@example.org", T0)).toBe(true);
    expect(await claimEmailSendSlot("magic-link", "victim+2@example.org", after(1))).toBe(false);
    expect(await claimEmailSendSlot("magic-link", "victim@example.org", after(2))).toBe(false);
  });

  it("shares one cooldown key across dotted Gmail forms of one mailbox", async () => {
    expect(await claimEmailSendSlot("magic-link", "v.i.c.t.i.m@gmail.com", T0)).toBe(true);
    expect(await claimEmailSendSlot("magic-link", "victim@gmail.com", after(1))).toBe(false);
  });

  it("lets the attacker spend the shared daily budget one accepted send at a time", async () => {
    const opts = (seconds: number) => ({
      now: after(seconds),
      dailyLimit: 3,
      reservedForDeletion: 0,
    });
    // Each accepted request is outside the 60 s window, so the only thing that can refuse is the
    // shared ceiling: holding a mailbox continuously burns the budget everyone shares.
    expect(await claimAuthEmailSend("magic-link", "victim@example.org", opts(0))).toBe(true);
    expect(await claimAuthEmailSend("magic-link", "victim@example.org", opts(61))).toBe(true);
    expect(await claimAuthEmailSend("magic-link", "victim@example.org", opts(122))).toBe(true);
    expect(await claimAuthEmailSend("magic-link", "victim@example.org", opts(183))).toBe(false);
  });
});

describe("C2 — a mailbox refusal and a daily-ceiling refusal are indistinguishable", () => {
  it("answers both with 429 and the identical body", async () => {
    // (a) mailbox cooldown: the first request takes the slot, the second is inside the window.
    expect((await magicLink("victim@example.org")).status).toBe(200);
    const mailbox = await magicLink("victim@example.org");
    expect(mailbox.status).toBe(429);
    const mailboxBody = await mailbox.json();

    // (b) daily ceiling: seed the day's counter at the limit; a fresh address still hits the ceiling.
    await pool.query(
      `insert into auth_email_days (day, sent)
       values ((now() at time zone 'utc')::date, 250)
       on conflict (day) do update set sent = 250`,
    );
    const daily = await magicLink("fresh-ceiling@example.org");
    expect(daily.status).toBe(429);
    const dailyBody = await daily.json();

    expect(mailboxBody).toEqual(dailyBody);
    expect(mailboxBody).toMatchObject({ code: "EMAIL_COOLDOWN" });
  });
});

describe("H2-C2 falsification — Better Auth's rate limiter is off", () => {
  it("the live instance configures disableIpTracking: true", () => {
    expect(auth.options.advanced?.ipAddress?.disableIpTracking).toBe(true);
  });

  it("answers 25 distinct-address magic-link requests with 200 and never 429", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      statuses.push((await magicLink(`rl-${i}@example.org`)).status);
    }
    // `/sign-in/magic-link` matches Better Auth's default special rule (window 10 s, max 3): a live
    // limiter would answer the 4th request with 429. It never does.
    expect(statuses).not.toContain(429);
    expect(statuses).toEqual(Array.from({ length: 25 }, () => 200));
    expect(await count("verification")).toBeGreaterThanOrEqual(25);
  });
});
