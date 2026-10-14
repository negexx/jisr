import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import type { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createPool, pinSessionTimeZone } from "@/db/pool";

const TIMEOUT_MS = 60_000;
const SECRET = "postgres://user:hunter2@ep-secret-host.eu-central-1.aws.neon.tech/db";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pinSessionTimeZone", () => {
  it("pins the session zone and lets the client through when the SET succeeds", async () => {
    const client = { query: vi.fn().mockResolvedValue({}) };
    const done = vi.fn();
    pinSessionTimeZone(client, done);
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(client.query).toHaveBeenCalledWith("SET TIME ZONE 'UTC'");
    expect(done).toHaveBeenCalledWith();
  });

  it("logs a fixed message with the SQLSTATE only and fails the checkout when the SET fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = {
      query: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error(`connect to ${SECRET} failed`), { code: "57P01" }),
        ),
    };
    const done = vi.fn();
    pinSessionTimeZone(client, done);
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1));

    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      "[db] could not pin session time zone to UTC (SQLSTATE 57P01)",
    );
    const failure = done.mock.calls[0]?.[0];
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).not.toContain("hunter2");
    expect(String(failure)).not.toContain("ep-secret-host");
  });

  it("still logs the fixed message when the failure carries no SQLSTATE", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = { query: vi.fn().mockRejectedValue(new Error(SECRET)) };
    const done = vi.fn();
    pinSessionTimeZone(client, done);
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(error).toHaveBeenCalledWith("[db] could not pin session time zone to UTC");
    expect(done.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });
});

describe("createPool", () => {
  let db: TestDatabase;
  let pool: Pool;

  beforeAll(async () => {
    db = await startTestDatabase({ port: 0, runMigrations: false });
    const admin = createPool(db.databaseUrl);
    await admin.query("ALTER DATABASE postgres SET timezone = 'Asia/Tokyo'");
    await admin.end();
    pool = createPool(db.databaseUrl);
  }, TIMEOUT_MS);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await db?.stop().catch(() => undefined);
  });

  it(
    "gives every pooled connection a UTC session zone even when the server default differs",
    async () => {
      const first = await pool.connect();
      const second = await pool.connect();
      try {
        for (const client of [first, second]) {
          const { rows } = await client.query<{ TimeZone: string }>("SHOW TimeZone");
          expect(rows[0]?.TimeZone).toBe("UTC");
        }
      } finally {
        first.release();
        second.release();
      }
    },
    TIMEOUT_MS,
  );
});
