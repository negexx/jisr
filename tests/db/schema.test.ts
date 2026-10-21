import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProfileSchema } from "@/data-schema/profile";
import * as schema from "@/db/schema";
import { CHECKLIST_STEP_IDS } from "@/domain/types";
import { rowsToPlanProgress, rowsToSavedList, rowToProfile } from "@/lib/server/rows";

const TIMEOUT_MS = 60_000;
const NOW = new Date("2026-10-14T09:00:00.000Z");

const USER_OWNED_TABLES = [
  "session",
  "account",
  "profiles",
  "saved_programs",
  "checklist_progress",
  "feedback_reports",
  "user_data_state",
] as const;

const PROFILE = ProfileSchema.parse({
  schemaVersion: 2,
  nationality: "MA",
  credential: {
    country: "MA",
    type: "bac",
    track: "sciences-maths-a",
    status: "obtained",
    overall: { scale: "ma-20", value: 14.5 },
    subjects: [],
  },
  priorHigherEducationYears: 0,
  languages: [],
});

let testDb: TestDatabase;
let pool: Pool;
let db: NodePgDatabase<typeof schema>;

async function insertUser(id: string): Promise<void> {
  await db.insert(schema.user).values({
    id,
    name: id,
    email: `${id}@example.com`,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function savedRow(userId: string, slug: string) {
  return {
    userId,
    slug,
    country: "FR",
    field: "computer-science",
    snapshotVersion: "0123456789ab",
    savedAt: "2026-09-01",
  };
}

async function countRows(table: string, userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `select count(*) as count from "${table}" where user_id = $1`,
    [userId],
  );
  return Number(rows[0]?.count);
}

// Drizzle wraps the driver error; the Postgres SQLSTATE sits on `cause`.
async function sqlState(statement: Promise<unknown>): Promise<string | undefined> {
  try {
    await statement;
  } catch (error) {
    const source = error instanceof Error && error.cause !== undefined ? error.cause : error;
    return typeof source === "object" && source !== null && "code" in source
      ? String(source.code)
      : undefined;
  }
  throw new Error("expected the statement to be rejected");
}

beforeAll(async () => {
  testDb = await startTestDatabase({ port: 0 });
  pool = new Pool({ connectionString: testDb.databaseUrl });
  db = drizzle({ client: pool, schema });
}, TIMEOUT_MS);

afterAll(async () => {
  await pool?.end();
  await testDb?.stop();
}, TIMEOUT_MS);

describe("user data schema on the harness", () => {
  it("applied the first migration to an empty database", async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by 1",
    );
    expect(rows.map((row) => row.table_name)).toEqual([
      "account",
      "auth_email_days",
      "checklist_progress",
      "email_cooldowns",
      "feedback_reports",
      "pending_signups",
      "profiles",
      "request_throttles",
      "saved_programs",
      "session",
      "user",
      "user_data_state",
      "verification",
    ]);
  });

  it("stores the auth additional fields and defaults role to student", async () => {
    await insertUser("u-auth");
    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, "u-auth"));
    expect(row?.role).toBe("student");
    expect(row?.consentVersion).toBeNull();
    expect(row?.consentedAt).toBeNull();
  });

  it(
    "cascades a user delete to every user-owned table and keeps pending_signups",
    async () => {
      await insertUser("u-cascade");
      await insertUser("u-keep");
      await db.insert(schema.session).values({
        id: "s1",
        token: "t1",
        userId: "u-cascade",
        expiresAt: NOW,
        updatedAt: NOW,
      });
      await db.insert(schema.account).values({
        id: "a1",
        accountId: "g1",
        providerId: "google",
        userId: "u-cascade",
        updatedAt: NOW,
      });
      await db.insert(schema.profiles).values({ userId: "u-cascade", data: PROFILE });
      await db.insert(schema.savedPrograms).values(savedRow("u-cascade", "xx-prog-a"));
      await db
        .insert(schema.checklistProgress)
        .values({ userId: "u-cascade", programSlug: "xx-prog-a", stepId: "visa" });
      await db.insert(schema.feedbackReports).values({
        userId: "u-cascade",
        record: "programs/xx-prog-a",
        path: "tuition",
        sourceUrl: "https://example.org/fees",
        snapshotVersion: "0123456789ab",
        note: "The fee looks outdated.",
      });
      await db.insert(schema.userDataState).values({ userId: "u-cascade", importedAt: NOW });
      await db.insert(schema.pendingSignups).values({
        email: "pending@example.com",
        ageConfirmed: true,
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      });
      await db.insert(schema.profiles).values({ userId: "u-keep", data: PROFILE });

      for (const table of USER_OWNED_TABLES) {
        expect(await countRows(table, "u-cascade"), `${table} before delete`).toBe(1);
      }

      await db.delete(schema.user).where(eq(schema.user.id, "u-cascade"));

      for (const table of USER_OWNED_TABLES) {
        expect(await countRows(table, "u-cascade"), `${table} after delete`).toBe(0);
      }
      expect(await db.select().from(schema.pendingSignups)).toHaveLength(1);
      expect(await countRows("profiles", "u-keep")).toBe(1);
    },
    TIMEOUT_MS,
  );

  it("round-trips SavedList, PlanProgress and Profile through the database", async () => {
    await insertUser("u-roundtrip");
    await db
      .insert(schema.savedPrograms)
      .values([
        { ...savedRow("u-roundtrip", "xx-prog-b"), savedAt: "2026-09-12" },
        savedRow("u-roundtrip", "xx-prog-a"),
      ]);
    await db.insert(schema.checklistProgress).values([
      { userId: "u-roundtrip", programSlug: "xx-prog-a", stepId: "visa" },
      { userId: "u-roundtrip", programSlug: "xx-prog-a", stepId: "documents" },
      { userId: "u-roundtrip", programSlug: "xx-prog-b", stepId: "submit" },
    ]);
    await db.insert(schema.profiles).values({ userId: "u-roundtrip", data: PROFILE });

    const savedRows = await db
      .select()
      .from(schema.savedPrograms)
      .where(eq(schema.savedPrograms.userId, "u-roundtrip"));
    expect(rowsToSavedList(savedRows).items.map((item) => [item.slug, item.savedAt])).toEqual([
      ["xx-prog-a", "2026-09-01"],
      ["xx-prog-b", "2026-09-12"],
    ]);

    const planRows = await db
      .select()
      .from(schema.checklistProgress)
      .where(eq(schema.checklistProgress.userId, "u-roundtrip"));
    expect(rowsToPlanProgress(planRows)).toEqual({
      schemaVersion: 1,
      done: { "xx-prog-a": ["documents", "visa"], "xx-prog-b": ["submit"] },
    });

    const [profileRow] = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, "u-roundtrip"));
    expect(profileRow?.revision).toBe(0);
    expect(profileRow && rowToProfile(profileRow)).toEqual(PROFILE);
  });

  it("keeps insertion order for two same-day saves read back through the mapper", async () => {
    await insertUser("u-same-day");
    // Alphabetical order is the reverse of insertion order, so only created_at can explain it.
    // Explicit, distinct created_at values: the clock_timestamp() default can tie for two rapid
    // inserts, and the slug tie-break then reverses the order (the flake this test hit).
    await db.insert(schema.savedPrograms).values({
      ...savedRow("u-same-day", "xx-prog-z"),
      createdAt: new Date("2026-09-01T00:00:00Z"),
    });
    await db.insert(schema.savedPrograms).values({
      ...savedRow("u-same-day", "xx-prog-a"),
      createdAt: new Date("2026-09-01T00:00:01Z"),
    });
    const rows = await db
      .select()
      .from(schema.savedPrograms)
      .where(eq(schema.savedPrograms.userId, "u-same-day"));
    expect(rowsToSavedList(rows).items.map((item) => item.slug)).toEqual([
      "xx-prog-z",
      "xx-prog-a",
    ]);
  });

  it("rejects a duplicate (user_id, slug) saved programme", async () => {
    await insertUser("u-dup-saved");
    await db.insert(schema.savedPrograms).values(savedRow("u-dup-saved", "xx-prog-a"));
    expect(
      await sqlState(db.insert(schema.savedPrograms).values(savedRow("u-dup-saved", "xx-prog-a"))),
    ).toBe("23505");
  });

  it("rejects a duplicate (user_id, program_slug, step_id) tick", async () => {
    await insertUser("u-dup-step");
    const tick = { userId: "u-dup-step", programSlug: "xx-prog-a", stepId: "visa" };
    await db.insert(schema.checklistProgress).values(tick);
    expect(await sqlState(db.insert(schema.checklistProgress).values(tick))).toBe("23505");
  });

  it("rejects an unknown step_id and accepts every CHECKLIST_STEP_IDS entry", async () => {
    await insertUser("u-steps");
    expect(
      await sqlState(
        db
          .insert(schema.checklistProgress)
          .values({ userId: "u-steps", programSlug: "xx-prog-a", stepId: "not-a-step" }),
      ),
    ).toBe("23514");

    await db.insert(schema.checklistProgress).values(
      CHECKLIST_STEP_IDS.map((stepId) => ({
        userId: "u-steps",
        programSlug: "xx-prog-a",
        stepId,
      })),
    );
    expect(await countRows("checklist_progress", "u-steps")).toBe(CHECKLIST_STEP_IDS.length);
  });

  it("rejects a saved programme without snapshot_version", async () => {
    await insertUser("u-no-version");
    expect(
      await sqlState(
        pool.query(
          "insert into saved_programs (user_id, slug, country, field, saved_at) values ('u-no-version', 'xx-prog-a', 'FR', 'computer-science', '2026-09-01')",
        ),
      ),
    ).toBe("23502");
  });

  // Postgres only rejects what it cannot parse as a date; it still accepts other layouts such
  // as '10/14/2026'. Enforcing the ISO YYYY-MM-DD form is the Server Action's job (todo 13).
  it("rejects an unparsable or impossible saved_at", async () => {
    await insertUser("u-bad-date");
    for (const savedAt of ["not-a-date", "2026-13-45", "2026-02-30"]) {
      const state = await sqlState(
        db.insert(schema.savedPrograms).values({ ...savedRow("u-bad-date", "xx-prog-a"), savedAt }),
      );
      expect(["22007", "22008"], savedAt).toContain(state);
    }
  });

  it("rejects over-long bounded text", async () => {
    await insertUser("u-bounds");
    expect(
      await sqlState(
        db.insert(schema.feedbackReports).values({
          userId: "u-bounds",
          record: "programs/xx-prog-a",
          path: "tuition",
          sourceUrl: "https://example.org/fees",
          snapshotVersion: "0123456789ab",
          note: "x".repeat(schema.FEEDBACK_NOTE_MAX_LENGTH + 1),
        }),
      ),
    ).toBe("22001");
    expect(
      await sqlState(
        db.insert(schema.pendingSignups).values({
          email: `${"a".repeat(schema.EMAIL_MAX_LENGTH)}@example.com`,
          expiresAt: NOW,
        }),
      ),
    ).toBe("22001");
  });

  it("keys email_cooldowns by (email, kind) and rejects an unknown kind", async () => {
    const row = { email: "cool@example.com", kind: "magic-link", lastSentAt: NOW };
    await db.insert(schema.emailCooldowns).values(row);
    await db.insert(schema.emailCooldowns).values({ ...row, kind: "delete-account" });
    expect(await sqlState(db.insert(schema.emailCooldowns).values(row))).toBe("23505");
    expect(
      await sqlState(db.insert(schema.emailCooldowns).values({ ...row, kind: "newsletter" })),
    ).toBe("23514");
    expect(
      await sqlState(
        db.insert(schema.emailCooldowns).values({
          ...row,
          email: `${"a".repeat(schema.EMAIL_MAX_LENGTH)}@example.com`,
        }),
      ),
    ).toBe("22001");
  });

  it("keys request_throttles by key and rejects a count below one", async () => {
    const row = { key: "throttle-key", windowStart: NOW, count: 1 };
    await db.insert(schema.requestThrottles).values(row);
    expect(await sqlState(db.insert(schema.requestThrottles).values(row))).toBe("23505");
    expect(
      await sqlState(db.insert(schema.requestThrottles).values({ ...row, key: "zero", count: 0 })),
    ).toBe("23514");
  });

  it("rejects a user-owned row for a user that does not exist", async () => {
    expect(
      await sqlState(db.insert(schema.userDataState).values({ userId: "ghost", importedAt: null })),
    ).toBe("23503");
  });
});
