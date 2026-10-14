import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { startTestDatabase, type TestDatabase } from "./harness";

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
let closeAppPool: () => Promise<void>;

beforeAll(async () => {
  testDb = await startTestDatabase({ port: 0 });
  pool = new Pool({ connectionString: testDb.databaseUrl });
  process.env.DATABASE_URL = testDb.databaseUrl;
  ({ claimEmailSendSlot, EMAIL_COOLDOWN_S } = await import("@/lib/server/email-cooldown"));
  const { db } = await import("@/db");
  closeAppPool = () => db.$client.end();
}, TIMEOUT_MS);

beforeEach(async () => {
  await pool.query("delete from email_cooldowns");
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

  it("grants exactly one of several simultaneous claims", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => claimEmailSendSlot("magic-link", "race@example.com", T0)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
