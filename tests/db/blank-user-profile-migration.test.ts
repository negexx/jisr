import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Accounts created before the profile-blanking hooks (S7) hold Google's name and picture address,
// which nothing uses. The migration blanks them. Run against the schema as it stood just before it,
// with rows written the way the old code wrote them.

const TIMEOUT_MS = 60_000;
const MIGRATION_TAG = "0004_blank-user-profile";
const MIGRATIONS_DIR = resolve(process.cwd(), "drizzle");
const NOW = "2026-10-14T09:00:00.000Z";

let testDb: TestDatabase;
let pool: Pool;

async function runMigration(tag: string): Promise<void> {
  const sql = await readFile(resolve(MIGRATIONS_DIR, `${tag}.sql`), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim() !== "") await pool.query(statement);
  }
}

async function journalTags(): Promise<string[]> {
  const journal: { entries: { tag: string }[] } = JSON.parse(
    await readFile(resolve(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8"),
  );
  return journal.entries.map((entry) => entry.tag);
}

async function insertUser(id: string, name: string, image: string | null): Promise<void> {
  await pool.query(
    `insert into "user" (id, name, email, image, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $5)`,
    [id, name, `${id}@example.com`, image, NOW],
  );
}

async function stored(id: string): Promise<{ name: string; image: string | null }> {
  const { rows } = await pool.query<{ name: string; image: string | null }>(
    'select name, image from "user" where id = $1',
    [id],
  );
  const row = rows[0];
  if (row === undefined) throw new Error(`user ${id} is missing`);
  return row;
}

beforeAll(async () => {
  testDb = await startTestDatabase({ port: 0, runMigrations: false });
  pool = new Pool({ connectionString: testDb.databaseUrl });
  for (const tag of await journalTags()) {
    if (tag !== MIGRATION_TAG) await runMigration(tag);
  }
}, TIMEOUT_MS);

afterAll(async () => {
  await pool?.end();
  await testDb?.stop();
}, TIMEOUT_MS);

describe("migration 0004 blank-user-profile", () => {
  it("is the last entry of the journal", async () => {
    expect((await journalTags()).at(-1)).toBe(MIGRATION_TAG);
  });

  it("blanks the Google name and picture of existing accounts and touches nothing else", async () => {
    await insertUser("u-google", "Real Name", "https://lh3.googleusercontent.com/a/photo");
    await insertUser("u-name-only", "Another Name", null);
    await insertUser("u-image-only", "", "https://lh3.googleusercontent.com/a/other");
    await insertUser("u-blank", "", null);

    await runMigration(MIGRATION_TAG);

    for (const id of ["u-google", "u-name-only", "u-image-only", "u-blank"]) {
      expect(await stored(id), id).toEqual({ name: "", image: null });
    }
    const { rows } = await pool.query<{ email: string }>('select email from "user" order by email');
    expect(rows.map((row) => row.email)).toEqual([
      "u-blank@example.com",
      "u-google@example.com",
      "u-image-only@example.com",
      "u-name-only@example.com",
    ]);
  });

  it("is safe to run again", async () => {
    await runMigration(MIGRATION_TAG);
    expect(await stored("u-google")).toEqual({ name: "", image: null });
  });
});
