// T1c audit probes (READ-ONLY): DB-backed edge cases for the account stores, erasure and the
// auth kill-switch gate. Uses the PGlite harness (tests/db/README.md). A failure is audit
// evidence, not a test to fix.
import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Profile } from "@/data-schema/profile";
import * as schema from "@/db/schema";
import type { AccountDb } from "@/lib/server/account-store";

const TIMEOUT_MS = 60_000;
const USER_ID = "probe-user";
const EMAIL = "probe@example.com";

const PROFILE = {
  schemaVersion: 2,
  nationality: "MA",
  credential: {
    country: "MA",
    type: "bac",
    track: "sciences-maths-a",
    status: "expected",
    overall: null,
    subjects: [],
  },
  priorHigherEducationYears: 0,
  languages: [],
} as unknown as Profile;

let testDb: TestDatabase;
let admin: Pool;
let db: AccountDb;
let closeAppPool: () => Promise<void>;

beforeAll(async () => {
  testDb = await startTestDatabase({ port: 0 });
  admin = new Pool({ connectionString: testDb.databaseUrl });
  process.env.DATABASE_URL = testDb.databaseUrl;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  const appDb = await import("@/db");
  closeAppPool = () => appDb.db.$client.end();
  db = drizzle({ client: appDb.db.$client, schema });
}, TIMEOUT_MS);

beforeEach(async () => {
  await admin.query('delete from "user"');
  await admin.query("delete from email_cooldowns");
  await admin.query("delete from pending_signups");
  await admin.query("delete from auth_email_days");
  await admin.query('insert into "user" (id, name, email) values ($1, $2, $3)', [
    USER_ID,
    "Probe",
    EMAIL,
  ]);
});

afterAll(async () => {
  await Promise.allSettled([closeAppPool?.(), admin?.end(), testDb?.stop()]);
}, TIMEOUT_MS);

describe("per-item caps and idempotency", () => {
  it("refuses a new programme at the saved cap, accepts a re-save, and frees a slot on unsave", async () => {
    const { saveProgramFor, unsaveProgramFor } = await import("@/lib/server/account-store");
    const { MAX_SAVED_PROGRAMS } = await import("@/lib/constants");
    const item = (slug: string) => ({
      slug,
      country: "FR",
      field: "computer-science",
      snapshotVersion: "0123456789ab",
      savedAt: "2026-10-01",
    });
    for (let index = 0; index < MAX_SAVED_PROGRAMS; index += 1) {
      expect((await saveProgramFor(db, USER_ID, item(`xx-prog-${index}`))).ok).toBe(true);
    }
    expect(await saveProgramFor(db, USER_ID, item("xx-prog-extra"))).toEqual({
      ok: false,
      error: "saved_limit",
    });
    expect((await saveProgramFor(db, USER_ID, item("xx-prog-0"))).ok).toBe(true);
    expect((await unsaveProgramFor(db, USER_ID, "xx-prog-0")).ok).toBe(true);
    expect((await saveProgramFor(db, USER_ID, item("xx-prog-extra"))).ok).toBe(true);
  });

  it("caps plan programmes but lets a known programme gain steps", async () => {
    const { setStepDoneFor } = await import("@/lib/server/account-store");
    const { MAX_PLAN_PROGRAMS } = await import("@/lib/plan/progress");
    for (let index = 0; index < MAX_PLAN_PROGRAMS; index += 1) {
      expect((await setStepDoneFor(db, USER_ID, `xx-prog-${index}`, "visa", true)).ok).toBe(true);
    }
    expect(await setStepDoneFor(db, USER_ID, "xx-prog-over", "visa", true)).toEqual({
      ok: false,
      error: "invalid",
    });
    expect((await setStepDoneFor(db, USER_ID, "xx-prog-0", "documents", true)).ok).toBe(true);
  });

  it("counts feedback reports in a rolling 24h window, not a calendar day", async () => {
    const { createFeedbackReportFor, FEEDBACK_REPORTS_PER_DAY } = await import(
      "@/lib/server/account-store"
    );
    const report = {
      record: "programs/xx-test-prog",
      path: "tuition",
      sourceUrl: "https://example.org/fees",
      snapshotVersion: "0123456789ab",
    };
    for (let index = 0; index < FEEDBACK_REPORTS_PER_DAY; index += 1) {
      expect((await createFeedbackReportFor(db, USER_ID, report)).ok).toBe(true);
    }
    expect(await createFeedbackReportFor(db, USER_ID, report)).toEqual({
      ok: false,
      error: "rate_limited",
    });
    // Still inside the window (24h - 1s) they count; just outside they do not.
    await admin.query(
      "update feedback_reports set created_at = now() - interval '23 hours 59 minutes 59 seconds' where user_id = $1",
      [USER_ID],
    );
    expect(await createFeedbackReportFor(db, USER_ID, report)).toEqual({
      ok: false,
      error: "rate_limited",
    });
    await admin.query(
      "update feedback_reports set created_at = now() - interval '24 hours 1 second' where user_id = $1",
      [USER_ID],
    );
    expect((await createFeedbackReportFor(db, USER_ID, report)).ok).toBe(true);
  });
});

describe("erasure of pre-account rows (no FK cascade)", () => {
  it("removes a cooldown keyed by the mailbox and a pending row for the account address", async () => {
    await admin.query(
      "insert into email_cooldowns (email, kind, last_sent_at) values ($1, 'magic-link', now())",
      ["probe@example.com"],
    );
    await admin.query(
      `insert into pending_signups (email, consent_version, consented_at, age_confirmed, expires_at)
       values ('probe@example.com', 'v', now(), true, now() + interval '10 minutes')`,
    );
    const { eraseAccountResidue } = await import("@/lib/server/account-erasure");
    await eraseAccountResidue(db, { id: USER_ID, email: EMAIL });
    const cooldowns = await admin.query("select count(*)::int as n from email_cooldowns");
    const pending = await admin.query("select count(*)::int as n from pending_signups");
    expect(cooldowns.rows[0]).toEqual({ n: 0 });
    expect(pending.rows[0]).toEqual({ n: 0 });
  });

  it("removes a cooldown keyed only by the collapsed mailbox key", async () => {
    // As recordPendingSignup/claimEmailSendSlot write it for "probe@example.com" is exact;
    // for a Gmail-style address the cooldown key drops dots/tags. Probe the Gmail case.
    await admin.query('update "user" set email = $1 where id = $2', ["a.b+t@googlemail.com", USER_ID]);
    await admin.query(
      "insert into email_cooldowns (email, kind, last_sent_at) values ($1, 'magic-link', now())",
      ["ab@gmail.com"],
    );
    const { eraseAccountResidue } = await import("@/lib/server/account-erasure");
    await eraseAccountResidue(db, { id: USER_ID, email: "a.b+t@googlemail.com" });
    const cooldowns = await admin.query("select count(*)::int as n from email_cooldowns");
    expect(cooldowns.rows[0]).toEqual({ n: 0 });
  });

  it("erases a pending row for another spelling of the account's Gmail mailbox", async () => {
    // ADR 0013 decision 9: deletion removes the pending_signups rows "for the address".
    // pending_signups is keyed by normalizeEmail (dots/tags kept), unlike email_cooldowns
    // (cooldownKey, which collapses them), so a dotless Gmail spelling may survive. See F1.
    await admin.query('update "user" set email = $1 where id = $2', ["a.b@gmail.com", USER_ID]);
    await admin.query(
      `insert into pending_signups (email, consent_version, consented_at, age_confirmed, expires_at)
       values ('ab@gmail.com', 'v', now(), true, now() + interval '10 minutes')`,
    );
    const { eraseAccountResidue } = await import("@/lib/server/account-erasure");
    await eraseAccountResidue(db, { id: USER_ID, email: "a.b@gmail.com" });
    const pending = await admin.query("select email from pending_signups");
    // Invariant asserted by ADR 0013 decision 9; see F1 in the draft.
    expect(pending.rows).toEqual([]);
  });
});

describe("import replace / clear round trips", () => {
  it("replace with a null profile retires the profile and swaps saved/plan", async () => {
    const { saveProfileFor, saveProgramFor, setStepDoneFor } = await import(
      "@/lib/server/account-store"
    );
    const { importGuestDataFor } = await import("@/lib/server/import-store");
    expect((await saveProfileFor(db, USER_ID, PROFILE, 0)).ok).toBe(true);
    await saveProgramFor(db, USER_ID, {
      slug: "xx-prog-old",
      country: "FR",
      field: "computer-science",
      snapshotVersion: "0123456789ab",
      savedAt: "2026-10-01",
    });
    await setStepDoneFor(db, USER_ID, "xx-prog-old", "visa", true);

    const result = await importGuestDataFor(
      db,
      USER_ID,
      {
        profile: null,
        saved: [
          {
            slug: "xx-prog-new",
            country: "DE",
            field: "engineering",
            snapshotVersion: "0123456789ab",
            savedAt: "2026-10-02",
          },
        ],
        plan: {},
      },
      "replace",
    );
    expect(result.ok).toBe(true);
    const profile = await admin.query("select count(*)::int as n from profiles");
    const saved = await admin.query("select slug from saved_programs order by slug");
    const steps = await admin.query("select count(*)::int as n from checklist_progress");
    expect(profile.rows[0]).toEqual({ n: 0 });
    expect(saved.rows).toEqual([{ slug: "xx-prog-new" }]);
    expect(steps.rows[0]).toEqual({ n: 0 });
  });

  it("auto import is refused after data exists, and works again after clear", async () => {
    const { saveProfileFor, clearAccountDataFor } = await import("@/lib/server/account-store");
    const { importGuestDataFor } = await import("@/lib/server/import-store");
    expect((await saveProfileFor(db, USER_ID, PROFILE, 0)).ok).toBe(true);
    const refused = await importGuestDataFor(
      db,
      USER_ID,
      { profile: PROFILE, saved: [], plan: {} },
      "auto",
    );
    expect(refused).toEqual({ ok: false, error: "has_server_data" });

    expect((await clearAccountDataFor(db, USER_ID)).ok).toBe(true);
    const again = await importGuestDataFor(
      db,
      USER_ID,
      { profile: PROFILE, saved: [], plan: {} },
      "auto",
    );
    expect(again.ok).toBe(true);
    const state = await admin.query("select imported_at from user_data_state where user_id = $1", [
      USER_ID,
    ]);
    expect(state.rows[0]?.imported_at).not.toBeNull();
  });

  it("keeps the revision floor after a clear: a stale save is refused, a re-import starts above", async () => {
    const { saveProfileFor, clearAccountDataFor } = await import("@/lib/server/account-store");
    expect(await saveProfileFor(db, USER_ID, PROFILE, 0)).toEqual({ ok: true, value: { revision: 1 } });
    expect((await clearAccountDataFor(db, USER_ID)).ok).toBe(true);
    // A device still holding revision 1 must not overwrite silently.
    const stale = await saveProfileFor(db, USER_ID, PROFILE, 1);
    expect(stale.ok).toBe(false);
    expect(stale).toMatchObject({ ok: false, error: "invalid" });
    const fresh = await saveProfileFor(db, USER_ID, PROFILE, 0);
    expect(fresh).toEqual({ ok: true, value: { revision: 2 } });
  });
});

describe("auth kill-switch gate answers after the instance exists", () => {
  it("returns a signed-out get-session while the flag is off, without touching Better Auth", async () => {
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    const { getAuth } = await import("@/lib/auth/server");
    const auth = getAuth();
    vi.stubEnv("ACCOUNTS_ENABLED", "false");
    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/get-session", {
        method: "GET",
        headers: { origin: "http://localhost:3000" },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });
});
