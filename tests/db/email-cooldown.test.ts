import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const TIMEOUT_MS = 60_000;
const T0 = new Date("2026-10-14T09:00:00.000Z");

function after(seconds: number): Date {
  return new Date(T0.getTime() + seconds * 1000);
}

type CooldownModule = typeof import("@/lib/server/email-cooldown");

let testDb: TestDatabase;
let pool: Pool;
let claimEmailSendSlot: CooldownModule["claimEmailSendSlot"];
let EMAIL_COOLDOWN_S: CooldownModule["EMAIL_COOLDOWN_S"];
let claimDailyEmailSlot: CooldownModule["claimDailyEmailSlot"];
let claimAuthEmailSend: CooldownModule["claimAuthEmailSend"];
let closeAppPool: () => Promise<void>;

beforeAll(async () => {
  testDb = await startTestDatabase({ port: 0 });
  pool = new Pool({ connectionString: testDb.databaseUrl });
  process.env.DATABASE_URL = testDb.databaseUrl;
  ({ claimEmailSendSlot, EMAIL_COOLDOWN_S, claimDailyEmailSlot, claimAuthEmailSend } = await import(
    "@/lib/server/email-cooldown"
  ));
  const { db } = await import("@/db");
  closeAppPool = () => db.$client.end();
}, TIMEOUT_MS);

beforeEach(async () => {
  await pool.query("delete from email_cooldowns");
  await pool.query("delete from auth_email_days");
  await pool.query("delete from pending_signups");
});

afterAll(async () => {
  await closeAppPool?.();
  await pool?.end();
  await testDb?.stop();
}, TIMEOUT_MS);

describe("claimEmailSendSlot", () => {
  it("uses a 60 second window", () => {
    expect(EMAIL_COOLDOWN_S).toBe(60);
  });

  it("grants the first claim and refuses a second one inside the window", async () => {
    expect(await claimEmailSendSlot("magic-link", "ana@example.com", T0)).toBe(true);
    expect(await claimEmailSendSlot("magic-link", "ana@example.com", after(1))).toBe(false);
    expect(await claimEmailSendSlot("magic-link", "ana@example.com", after(59))).toBe(false);
  });

  it("grants again once the window has passed, and restarts it from that claim", async () => {
    await claimEmailSendSlot("magic-link", "ana@example.com", T0);
    expect(await claimEmailSendSlot("magic-link", "ana@example.com", after(60))).toBe(true);
    expect(await claimEmailSendSlot("magic-link", "ana@example.com", after(61))).toBe(false);
    expect(await claimEmailSendSlot("magic-link", "ana@example.com", after(120))).toBe(true);
  });

  it("does not move the window when a claim is refused", async () => {
    await claimEmailSendSlot("magic-link", "ana@example.com", T0);
    await claimEmailSendSlot("magic-link", "ana@example.com", after(59));
    expect(await claimEmailSendSlot("magic-link", "ana@example.com", after(60))).toBe(true);
  });

  it("keeps the two kinds independent", async () => {
    expect(await claimEmailSendSlot("magic-link", "ana@example.com", T0)).toBe(true);
    expect(await claimEmailSendSlot("delete-account", "ana@example.com", after(1))).toBe(true);
    expect(await claimEmailSendSlot("delete-account", "ana@example.com", after(2))).toBe(false);
  });

  it("keeps different addresses independent", async () => {
    expect(await claimEmailSendSlot("magic-link", "ana@example.com", T0)).toBe(true);
    expect(await claimEmailSendSlot("magic-link", "ben@example.com", after(1))).toBe(true);
  });

  it("shares one slot between differently-cased and space-padded forms of an address", async () => {
    expect(await claimEmailSendSlot("magic-link", "ana@example.com", T0)).toBe(true);
    expect(await claimEmailSendSlot("magic-link", " Ana@Example.COM ", after(1))).toBe(false);
    const { rows } = await pool.query<{ email: string }>("select email from email_cooldowns");
    expect(rows).toEqual([{ email: "ana@example.com" }]);
  });

  it("uses the database clock when no time is injected", async () => {
    expect(await claimEmailSendSlot("magic-link", "clock@example.com")).toBe(true);
    expect(await claimEmailSendSlot("magic-link", "clock@example.com")).toBe(false);
    const { rows } = await pool.query<{ near: boolean }>(
      "select abs(extract(epoch from (now() - last_sent_at))) < 30 as near from email_cooldowns where email = 'clock@example.com'",
    );
    expect(rows).toEqual([{ near: true }]);
  });

  it("grants exactly one of several simultaneous claims", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => claimEmailSendSlot("magic-link", "race@example.com", T0)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe("claimEmailSendSlot mailbox key", () => {
  it("shares one slot between +tag forms of one address", async () => {
    expect(await claimEmailSendSlot("magic-link", "a+1@example.com", T0)).toBe(true);
    expect(await claimEmailSendSlot("magic-link", "a+2@example.com", after(1))).toBe(false);
    expect(await claimEmailSendSlot("magic-link", "a@example.com", after(2))).toBe(false);
  });

  it("shares one slot between dotted Gmail forms of one mailbox", async () => {
    expect(await claimEmailSendSlot("magic-link", "ana.b@gmail.com", T0)).toBe(true);
    expect(await claimEmailSendSlot("magic-link", "a.n.a.b+x@googlemail.com", after(1))).toBe(
      false,
    );
  });
});

describe("claimDailyEmailSlot", () => {
  it("allows 250 auth emails a day, below the Brevo free daily quota", async () => {
    const { AUTH_EMAILS_PER_DAY } = await import("@/lib/constants");
    expect(AUTH_EMAILS_PER_DAY).toBe(250);
  });

  it("refuses the send after the ceiling and keeps the count at the ceiling", async () => {
    for (let index = 0; index < 3; index += 1) {
      expect(await claimDailyEmailSlot(after(index), 3)).toBe(true);
    }
    expect(await claimDailyEmailSlot(after(10), 3)).toBe(false);
    const { rows } = await pool.query<{ day: string; sent: number }>(
      "select to_char(day, 'YYYY-MM-DD') as day, sent from auth_email_days",
    );
    expect(rows).toEqual([{ day: "2026-10-14", sent: 3 }]);
  });

  it("counts each UTC day on its own", async () => {
    expect(await claimDailyEmailSlot(new Date("2026-10-14T23:59:59.000Z"), 1)).toBe(true);
    expect(await claimDailyEmailSlot(new Date("2026-10-14T23:59:59.500Z"), 1)).toBe(false);
    expect(await claimDailyEmailSlot(new Date("2026-10-15T00:00:00.000Z"), 1)).toBe(true);
  });

  it("uses the database clock's UTC day when no time is injected", async () => {
    expect(await claimDailyEmailSlot(undefined, 5)).toBe(true);
    const { rows } = await pool.query<{ today: boolean }>(
      "select day = (now() at time zone 'utc')::date as today from auth_email_days",
    );
    expect(rows).toEqual([{ today: true }]);
  });
});

describe("claimAuthEmailSend", () => {
  it("does not spend the daily budget on a request the address cooldown refuses", async () => {
    const claim = (email: string, seconds: number) =>
      claimAuthEmailSend("magic-link", email, {
        now: after(seconds),
        dailyLimit: 2,
        reservedForDeletion: 0,
      });
    expect(await claim("ana@example.com", 0)).toBe(true);
    for (let index = 1; index <= 5; index += 1) {
      expect(await claim("ana@example.com", index)).toBe(false);
    }
    expect(await claim("ben@example.com", 6)).toBe(true);
    expect(await claim("cleo@example.com", 7)).toBe(false);
  });
});

describe("claimAuthEmailSend retention purge", () => {
  async function seedResidue(): Promise<void> {
    await pool.query(
      `insert into pending_signups (email, consent_version, consented_at, age_confirmed, expires_at)
       values ('expired@example.com', 'v', $1, true, $2), ('fresh@example.com', 'v', $1, true, $3)`,
      [after(-3600), after(-1), after(600)],
    );
    await pool.query(
      `insert into email_cooldowns (email, kind, last_sent_at)
       values ('old@example.com', 'magic-link', $1), ('recent@example.com', 'magic-link', $2)`,
      [after(-(24 * 3600 + 1)), after(-(23 * 3600))],
    );
    await pool.query(
      "insert into auth_email_days (day, sent) values ('2026-10-13', 7), ('2026-10-12', 3)",
    );
  }

  async function emails(table: string): Promise<string[]> {
    const { rows } = await pool.query<{ email: string }>(`select email from ${table} order by 1`);
    return rows.map((row) => row.email);
  }

  it("deletes expired pending rows, day-old cooldowns and past counters on a send", async () => {
    await seedResidue();
    expect(await claimAuthEmailSend("magic-link", "ana@example.com", { now: T0 })).toBe(true);
    expect(await emails("pending_signups")).toEqual(["fresh@example.com"]);
    expect(await emails("email_cooldowns")).toEqual(["ana@example.com", "recent@example.com"]);
    const { rows } = await pool.query<{ day: string; sent: number }>(
      "select to_char(day, 'YYYY-MM-DD') as day, sent from auth_email_days order by 1",
    );
    expect(rows).toEqual([{ day: "2026-10-14", sent: 1 }]);
  });

  it("purges on the database clock when no time is injected", async () => {
    await pool.query(
      `insert into pending_signups (email, consent_version, consented_at, age_confirmed, expires_at)
       values ('expired@example.com', 'v', now() - interval '1 hour', true, now() - interval '1 second'),
              ('fresh@example.com', 'v', now(), true, now() + interval '10 minutes')`,
    );
    await pool.query(
      `insert into email_cooldowns (email, kind, last_sent_at)
       values ('old@example.com', 'magic-link', now() - interval '25 hours')`,
    );
    expect(await claimAuthEmailSend("magic-link", "ana@example.com")).toBe(true);
    expect(await emails("pending_signups")).toEqual(["fresh@example.com"]);
    expect(await emails("email_cooldowns")).toEqual(["ana@example.com"]);
  });

  it("purges nothing on a refused claim", async () => {
    await claimAuthEmailSend("magic-link", "ana@example.com", { now: after(-10) });
    await seedResidue();
    expect(await claimAuthEmailSend("magic-link", "ana@example.com", { now: T0 })).toBe(false);
    expect(await emails("pending_signups")).toEqual(["expired@example.com", "fresh@example.com"]);
  });
});

describe("claimAuthEmailSend deletion reserve", () => {
  it("reserves 20 of the 250 daily sends for deletion confirmations", async () => {
    const { AUTH_EMAILS_PER_DAY, AUTH_EMAILS_RESERVED_FOR_DELETION } = await import(
      "@/lib/constants"
    );
    expect([AUTH_EMAILS_PER_DAY, AUTH_EMAILS_RESERVED_FOR_DELETION]).toEqual([250, 20]);
  });

  it("stops magic links at the total minus the reserve and lets deletions use the rest", async () => {
    const options = (seconds: number) => ({
      now: after(seconds),
      dailyLimit: 5,
      reservedForDeletion: 2,
    });
    for (let index = 0; index < 3; index += 1) {
      expect(await claimAuthEmailSend("magic-link", `m${index}@example.com`, options(index))).toBe(
        true,
      );
    }
    expect(await claimAuthEmailSend("magic-link", "m3@example.com", options(3))).toBe(false);
    expect(await claimAuthEmailSend("delete-account", "d0@example.com", options(4))).toBe(true);
    expect(await claimAuthEmailSend("delete-account", "d1@example.com", options(5))).toBe(true);
    expect(await claimAuthEmailSend("delete-account", "d2@example.com", options(6))).toBe(false);
    const { rows } = await pool.query<{ sent: number }>("select sent from auth_email_days");
    expect(rows).toEqual([{ sent: 5 }]);
  });
});
