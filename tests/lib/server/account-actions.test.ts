import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { type Profile, ProfileSchema } from "@/data-schema/profile";
import { CHECKLIST_STEP_IDS } from "@/domain/types";
import { MAX_SAVED_PROGRAMS } from "@/lib/constants";
import { MAX_PLAN_PROGRAMS } from "@/lib/plan/progress";
import type { SavedProgram } from "@/lib/saved/saved";
import { FEEDBACK_REPORTS_PER_DAY } from "@/lib/server/account-store";
import type { SignInLinkRequest } from "@/lib/server/signup";

import { confirmRequest } from "../../support/magic-link";

// The account Server Actions end to end on PGlite with real sessions: a user signs up through the
// real magic-link flow and every action reads that session through requireAccountReady. Only the
// request headers are stubbed (no Next request scope in Vitest) and the mail goes to a temp folder.
// Concurrent behaviour (the cap lock, the compare-and-set) is in tests/db-race/.

const TIMEOUT_MS = 60_000;
const ORIGIN = "http://localhost:3000";

const io = vi.hoisted(() => ({ mailDir: "", requestHeaders: new Headers() }));

vi.mock("next/headers", () => ({ headers: async () => io.requestHeaders }));

vi.mock("@/lib/server/email", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/email")>();
  return {
    ...original,
    sendAuthEmail: async (request: Parameters<typeof original.sendAuthEmail>[0]) => {
      await original.sendAuthEmail(request, { mailDir: io.mailDir });
    },
  };
});

type Actions = typeof import("@/lib/server/account-actions");

let testDb: TestDatabase;
let pool: Pool;
let actions: Actions;
let closeAppPool: () => Promise<void>;
let aliceCookie = "";
let bobCookie = "";
let aliceId = "";
let bobId = "";

const DATA_TABLES = ["saved_programs", "checklist_progress", "profiles", "feedback_reports"];

async function count(table: string, where = "true"): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `select count(*) as count from "${table}" where ${where}`,
  );
  return Number(rows[0]?.count);
}

async function totalRows(): Promise<number> {
  const counts = await Promise.all(DATA_TABLES.map((table) => count(table)));
  return counts.reduce((sum, value) => sum + value, 0);
}

async function lastLink(): Promise<string> {
  const files = (await readdir(io.mailDir)).sort();
  const last = files.at(-1);
  if (last === undefined) throw new Error("no magic-link mail was written");
  const mail: { url: string } = JSON.parse(await readFile(join(io.mailDir, last), "utf8"));
  return mail.url;
}

async function signUp(email: string): Promise<{ cookie: string; id: string }> {
  const { requestSignInLink } = await import("@/lib/server/signup");
  const request: SignInLinkRequest = {
    mode: "signup",
    email,
    consent: true,
    ageConfirmed: true,
    locale: "fr",
    returnPath: null,
  };
  io.requestHeaders = new Headers({ origin: ORIGIN });
  expect(await requestSignInLink(request)).toEqual({ ok: true });
  const response = await (await import("@/lib/auth/server"))
    .getAuth()
    .handler(confirmRequest(await lastLink()));
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const { rows } = await pool.query<{ id: string }>('select id from "user" where email = $1', [
    email,
  ]);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("sign-up created no user");
  return { cookie, id };
}

function signedInAs(cookie: string): void {
  io.requestHeaders = new Headers({ cookie, origin: ORIGIN });
}

function signedOut(): void {
  io.requestHeaders = new Headers({ origin: ORIGIN });
}

function program(slug: string, overrides: Partial<SavedProgram> = {}): SavedProgram {
  return {
    slug,
    country: "FR",
    field: "computer-science",
    snapshotVersion: "0123456789ab",
    savedAt: "2026-10-01",
    ...overrides,
  };
}

const PROFILE: Profile = ProfileSchema.parse({
  schemaVersion: 1,
  nationality: "MA",
  credential: {
    country: "MA",
    type: "bac",
    track: "sciences-maths-a",
    status: "expected",
    overall: { scale: "ma-20", value: 13.37 },
    subjects: [{ subject: "mathematics", grade: { scale: "ma-20", value: 17 } }],
  },
  priorHigherEducationYears: 0,
  languages: [{ language: "fr", level: "B2", certificate: null }],
  fields: ["computer-science"],
  studyLanguages: ["fr", "en"],
  destinations: ["FR", "DE"],
  budget: { amountMinor: 900_00, currency: "EUR", period: "month" },
  institutionType: "any",
});

const OTHER_PROFILE: Profile = { ...PROFILE, destinations: ["NL"] };

const FEEDBACK = {
  record: "programs/xx-test-prog",
  path: "tuition",
  sourceUrl: "https://example.org/fees",
  snapshotVersion: "0123456789ab",
};

async function savedSlugs(userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ slug: string }>(
    "select slug from saved_programs where user_id = $1 order by slug",
    [userId],
  );
  return rows.map((row) => row.slug);
}

async function stepRows(userId: string, slug: string): Promise<string[]> {
  const { rows } = await pool.query<{ step_id: string }>(
    "select step_id from checklist_progress where user_id = $1 and program_slug = $2 order by step_id",
    [userId, slug],
  );
  return rows.map((row) => row.step_id);
}

beforeAll(async () => {
  io.mailDir = await mkdtemp(join(tmpdir(), "jisr-actions-mail-"));
  testDb = await startTestDatabase({ port: 0 });
  pool = new Pool({ connectionString: testDb.databaseUrl });
  process.env.DATABASE_URL = testDb.databaseUrl;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
  process.env.BETTER_AUTH_URL = ORIGIN;
  vi.stubEnv("ACCOUNTS_ENABLED", "true");
  actions = await import("@/lib/server/account-actions");
  ({ cookie: aliceCookie, id: aliceId } = await signUp("alice@example.com"));
  ({ cookie: bobCookie, id: bobId } = await signUp("bob@example.com"));
  const { db } = await import("@/db");
  closeAppPool = () => db.$client.end();
}, TIMEOUT_MS);

beforeEach(async () => {
  vi.stubEnv("ACCOUNTS_ENABLED", "true");
  for (const table of DATA_TABLES) await pool.query(`delete from "${table}"`);
  signedInAs(aliceCookie);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await closeAppPool?.();
  await pool?.end();
  await testDb?.stop();
  await rm(io.mailDir, { recursive: true, force: true });
}, TIMEOUT_MS);

describe("every action refuses first and writes nothing", () => {
  const calls: [string, () => Promise<unknown>][] = [
    ["saveProgram", () => actions.saveProgram(program("xx-prog-a"))],
    ["unsaveProgram", () => actions.unsaveProgram("xx-prog-a")],
    ["setStepDone", () => actions.setStepDone("xx-prog-a", "visa", true)],
    ["forgetProgress", () => actions.forgetProgress("xx-prog-a")],
    ["saveProfile", () => actions.saveProfile(PROFILE, 0)],
    ["createFeedbackReport", () => actions.createFeedbackReport(FEEDBACK)],
  ];

  it.each(calls)("%s without a session returns unauthenticated", async (_name, call) => {
    signedOut();
    expect(await call()).toEqual({ ok: false, error: "unauthenticated" });
    expect(await totalRows()).toBe(0);
  });

  it.each(calls)("%s while accounts are off returns unauthenticated", async (_name, call) => {
    vi.stubEnv("ACCOUNTS_ENABLED", "");
    expect(await call()).toEqual({ ok: false, error: "unauthenticated" });
    expect(await totalRows()).toBe(0);
  });

  describe("a user whose consent is not the current privacy-notice version", () => {
    let currentVersion: string | null = null;

    beforeEach(async () => {
      const { rows } = await pool.query<{ consent_version: string | null }>(
        'select consent_version from "user" where id = $1',
        [aliceId],
      );
      currentVersion = rows[0]?.consent_version ?? null;
      await pool.query('update "user" set consent_version = $2 where id = $1', [
        aliceId,
        "2020-01-01",
      ]);
    });

    afterEach(async () => {
      await pool.query('update "user" set consent_version = $2 where id = $1', [
        aliceId,
        currentVersion,
      ]);
    });

    it.each(calls)("%s returns consent_required", async (_name, call) => {
      expect(await call()).toEqual({ ok: false, error: "consent_required" });
      expect(await totalRows()).toBe(0);
    });
  });
});

describe("saveProgram", () => {
  it("stores the programme and returns the full server list", async () => {
    const result = await actions.saveProgram(program("xx-prog-a"));
    expect(result).toEqual({ ok: true, value: { items: [program("xx-prog-a")] } });
    expect(await savedSlugs(aliceId)).toEqual(["xx-prog-a"]);
  });

  it("is idempotent: the same call twice leaves the same rows and keeps the first saved_at", async () => {
    await actions.saveProgram(program("xx-prog-a", { savedAt: "2026-10-01" }));
    const before = await pool.query("select * from saved_programs");
    const again = await actions.saveProgram(program("xx-prog-a", { savedAt: "2026-10-09" }));
    const after = await pool.query("select * from saved_programs");
    expect(after.rows).toEqual(before.rows);
    expect(again).toMatchObject({ ok: true, value: { items: [{ savedAt: "2026-10-01" }] } });
  });

  it("keeps A saved on one device and B saved on another, with no shared client state", async () => {
    await actions.saveProgram(program("xx-prog-a"));
    const second = await actions.saveProgram(program("xx-prog-b"));
    expect(second.ok && second.value.items.map((item) => item.slug)).toEqual([
      "xx-prog-a",
      "xx-prog-b",
    ]);
    expect(await savedSlugs(aliceId)).toEqual(["xx-prog-a", "xx-prog-b"]);
  });

  it("returns saved_limit for a new programme at the cap and stores nothing more", async () => {
    for (let index = 0; index < MAX_SAVED_PROGRAMS; index += 1) {
      expect((await actions.saveProgram(program(`xx-prog-${index}`))).ok).toBe(true);
    }
    expect(await actions.saveProgram(program("xx-prog-extra"))).toEqual({
      ok: false,
      error: "saved_limit",
    });
    expect(await count("saved_programs")).toBe(MAX_SAVED_PROGRAMS);
  });

  it("still accepts a programme that is already saved when the list is full", async () => {
    for (let index = 0; index < MAX_SAVED_PROGRAMS; index += 1) {
      await actions.saveProgram(program(`xx-prog-${index}`));
    }
    const result = await actions.saveProgram(program("xx-prog-3"));
    expect(result.ok && result.value.items).toHaveLength(MAX_SAVED_PROGRAMS);
  });

  it("counts the cap per user", async () => {
    for (let index = 0; index < MAX_SAVED_PROGRAMS; index += 1) {
      await actions.saveProgram(program(`xx-prog-${index}`));
    }
    signedInAs(bobCookie);
    expect((await actions.saveProgram(program("xx-prog-0"))).ok).toBe(true);
    expect(await savedSlugs(bobId)).toEqual(["xx-prog-0"]);
    expect(await count("saved_programs", `user_id = '${aliceId}'`)).toBe(MAX_SAVED_PROGRAMS);
  });

  it.each<[string, unknown]>([
    ["an uppercase slug", program("XX-Prog")],
    ["a slug with a path", program("../etc/passwd")],
    ["an empty slug", program("")],
    ["a slug over the bound", program(`xx-${"a".repeat(120)}`)],
    ["a lowercase country", program("xx-prog-a", { country: "fr" })],
    ["a three-letter country", program("xx-prog-a", { country: "FRA" })],
    ["a field that is not a slug", program("xx-prog-a", { field: "Computer Science" })],
    ["a snapshot version of the wrong shape", program("xx-prog-a", { snapshotVersion: "latest" })],
    ["an impossible date", program("xx-prog-a", { savedAt: "2026-02-30" })],
    ["an extra key", { ...program("xx-prog-a"), userId: "someone-else" }],
    ["null", null],
    ["a string", "xx-prog-a"],
  ])("rejects %s as invalid and writes nothing", async (_label, input) => {
    expect(await actions.saveProgram(input as SavedProgram)).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await totalRows()).toBe(0);
  });
});

describe("unsaveProgram", () => {
  it("removes only that programme and returns what is left", async () => {
    await actions.saveProgram(program("xx-prog-x"));
    await actions.saveProgram(program("xx-prog-y"));
    const result = await actions.unsaveProgram("xx-prog-x");
    expect(result.ok && result.value.items.map((item) => item.slug)).toEqual(["xx-prog-y"]);
    expect(await savedSlugs(aliceId)).toEqual(["xx-prog-y"]);
  });

  it("is idempotent, and deleting an absent programme is ok", async () => {
    await actions.saveProgram(program("xx-prog-x"));
    expect((await actions.unsaveProgram("xx-prog-x")).ok).toBe(true);
    expect((await actions.unsaveProgram("xx-prog-x")).ok).toBe(true);
    expect((await actions.unsaveProgram("xx-never-saved")).ok).toBe(true);
    expect(await count("saved_programs")).toBe(0);
  });

  it("deletes that programme's ticked steps and no other programme's", async () => {
    await actions.saveProgram(program("xx-prog-x"));
    await actions.saveProgram(program("xx-prog-y"));
    await actions.setStepDone("xx-prog-x", "visa", true);
    await actions.setStepDone("xx-prog-y", "visa", true);
    await actions.unsaveProgram("xx-prog-x");
    expect(await stepRows(aliceId, "xx-prog-x")).toEqual([]);
    expect(await stepRows(aliceId, "xx-prog-y")).toEqual(["visa"]);
  });

  it("never touches another user's rows for the same slug", async () => {
    signedInAs(bobCookie);
    await actions.saveProgram(program("xx-prog-x"));
    await actions.setStepDone("xx-prog-x", "visa", true);
    signedInAs(aliceCookie);
    await actions.unsaveProgram("xx-prog-x");
    expect(await savedSlugs(bobId)).toEqual(["xx-prog-x"]);
    expect(await stepRows(bobId, "xx-prog-x")).toEqual(["visa"]);
  });

  it.each(["", "Not A Slug", "x".repeat(121)])("rejects the slug %j as invalid", async (slug) => {
    expect(await actions.unsaveProgram(slug)).toEqual({ ok: false, error: "invalid" });
  });
});

describe("setStepDone", () => {
  it("ticks a step and returns the programme's steps in checklist order", async () => {
    await actions.setStepDone("xx-prog-a", "visa", true);
    const result = await actions.setStepDone("xx-prog-a", "documents", true);
    expect(result).toEqual({ ok: true, value: { steps: ["documents", "visa"] } });
  });

  it("is idempotent in both directions", async () => {
    await actions.setStepDone("xx-prog-a", "visa", true);
    const ticked = await pool.query("select * from checklist_progress");
    await actions.setStepDone("xx-prog-a", "visa", true);
    expect((await pool.query("select * from checklist_progress")).rows).toEqual(ticked.rows);
    await actions.setStepDone("xx-prog-a", "visa", false);
    expect(await actions.setStepDone("xx-prog-a", "visa", false)).toEqual({
      ok: true,
      value: { steps: [] },
    });
    expect(await count("checklist_progress")).toBe(0);
  });

  it("unticking one step leaves the programme's other steps and other programmes alone", async () => {
    await actions.setStepDone("xx-prog-a", "visa", true);
    await actions.setStepDone("xx-prog-a", "submit", true);
    await actions.setStepDone("xx-prog-b", "visa", true);
    await actions.setStepDone("xx-prog-a", "visa", false);
    expect(await stepRows(aliceId, "xx-prog-a")).toEqual(["submit"]);
    expect(await stepRows(aliceId, "xx-prog-b")).toEqual(["visa"]);
  });

  it("accepts every checklist step", async () => {
    for (const step of CHECKLIST_STEP_IDS) await actions.setStepDone("xx-prog-a", step, true);
    expect(await count("checklist_progress")).toBe(CHECKLIST_STEP_IDS.length);
  });

  it.each<[string, () => Promise<unknown>]>([
    ["an unknown step", () => actions.setStepDone("xx-prog-a", "not-a-step" as never, true)],
    ["a bad slug", () => actions.setStepDone("Not A Slug", "visa", true)],
    ["a non-boolean flag", () => actions.setStepDone("xx-prog-a", "visa", "yes" as never)],
  ])("rejects %s as invalid and writes nothing", async (_label, call) => {
    expect(await call()).toEqual({ ok: false, error: "invalid" });
    expect(await count("checklist_progress")).toBe(0);
  });

  it("stops storing steps for a new programme at the plan-programme bound, but not for known ones", async () => {
    for (let index = 0; index < MAX_PLAN_PROGRAMS; index += 1) {
      expect((await actions.setStepDone(`xx-prog-${index}`, "visa", true)).ok).toBe(true);
    }
    expect(await actions.setStepDone("xx-prog-over", "visa", true)).toEqual({
      ok: false,
      error: "invalid",
    });
    expect((await actions.setStepDone("xx-prog-0", "submit", true)).ok).toBe(true);
    expect((await actions.setStepDone("xx-prog-over", "visa", false)).ok).toBe(true);
    expect(await count("checklist_progress", "program_slug = 'xx-prog-over'")).toBe(0);
  });
});

describe("forgetProgress", () => {
  it("removes every step of that programme only, and is idempotent", async () => {
    await actions.setStepDone("xx-prog-a", "visa", true);
    await actions.setStepDone("xx-prog-a", "submit", true);
    await actions.setStepDone("xx-prog-b", "visa", true);
    expect(await actions.forgetProgress("xx-prog-a")).toEqual({ ok: true, value: undefined });
    expect(await actions.forgetProgress("xx-prog-a")).toEqual({ ok: true, value: undefined });
    expect(await stepRows(aliceId, "xx-prog-a")).toEqual([]);
    expect(await stepRows(aliceId, "xx-prog-b")).toEqual(["visa"]);
  });

  it("leaves the saved programme in place", async () => {
    await actions.saveProgram(program("xx-prog-a"));
    await actions.setStepDone("xx-prog-a", "visa", true);
    await actions.forgetProgress("xx-prog-a");
    expect(await savedSlugs(aliceId)).toEqual(["xx-prog-a"]);
  });

  it("rejects a bad slug as invalid", async () => {
    expect(await actions.forgetProgress("")).toEqual({ ok: false, error: "invalid" });
  });
});

describe("saveProfile compare-and-set", () => {
  async function stored(userId: string) {
    const { rows } = await pool.query<{ data: Profile; revision: number }>(
      "select data, revision from profiles where user_id = $1",
      [userId],
    );
    return rows[0];
  }

  it("creates the row at revision 1 when the caller expects revision 0", async () => {
    expect(await actions.saveProfile(PROFILE, 0)).toEqual({ ok: true, value: { revision: 1 } });
    expect(await stored(aliceId)).toEqual({ data: PROFILE, revision: 1 });
  });

  it("bumps the revision by one on each write against the revision it read", async () => {
    await actions.saveProfile(PROFILE, 0);
    expect(await actions.saveProfile(OTHER_PROFILE, 1)).toEqual({
      ok: true,
      value: { revision: 2 },
    });
    expect(await stored(aliceId)).toEqual({ data: OTHER_PROFILE, revision: 2 });
  });

  it("returns conflict with the current profile for a stale revision and leaves the row unchanged", async () => {
    await actions.saveProfile(PROFILE, 0);
    await actions.saveProfile(OTHER_PROFILE, 1);
    const before = await pool.query("select * from profiles");
    const stale = await actions.saveProfile({ ...PROFILE, destinations: ["IT"] }, 1);
    expect(stale).toEqual({
      ok: false,
      error: "conflict",
      current: { profile: OTHER_PROFILE, revision: 2 },
    });
    expect((await pool.query("select * from profiles")).rows).toEqual(before.rows);
  });

  it("returns conflict when a second device still expects revision 0", async () => {
    await actions.saveProfile(PROFILE, 0);
    expect(await actions.saveProfile(OTHER_PROFILE, 0)).toEqual({
      ok: false,
      error: "conflict",
      current: { profile: PROFILE, revision: 1 },
    });
    expect((await stored(aliceId))?.data).toEqual(PROFILE);
  });

  it("returns a revision ahead of the server as invalid, with no row to offer", async () => {
    expect(await actions.saveProfile(PROFILE, 5)).toEqual({ ok: false, error: "invalid" });
    expect(await count("profiles")).toBe(0);
  });

  it("keeps each user's profile separate", async () => {
    await actions.saveProfile(PROFILE, 0);
    signedInAs(bobCookie);
    expect(await actions.saveProfile(OTHER_PROFILE, 0)).toEqual({
      ok: true,
      value: { revision: 1 },
    });
    expect((await stored(aliceId))?.data).toEqual(PROFILE);
    expect((await stored(bobId))?.data).toEqual(OTHER_PROFILE);
  });

  it.each<[string, unknown, unknown]>([
    ["a profile that fails the schema", { ...PROFILE, nationality: "morocco" }, 0],
    ["an extra profile key", { ...PROFILE, email: "a@b.c" }, 0],
    [
      "a profile padded past the size bound",
      { ...PROFILE, fields: Array(3000).fill("computer-science") },
      0,
    ],
    ["a negative revision", PROFILE, -1],
    ["a fractional revision", PROFILE, 1.5],
    ["a revision past the integer column", PROFILE, 2 ** 31],
    ["a string revision", PROFILE, "0"],
  ])("rejects %s as invalid and writes nothing", async (_label, profile, revision) => {
    expect(await actions.saveProfile(profile as Profile, revision as number)).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await count("profiles")).toBe(0);
  });
});

describe("loadAccountData", () => {
  it.each<[string, () => void]>([
    ["without a session", signedOut],
    ["while accounts are off", () => vi.stubEnv("ACCOUNTS_ENABLED", "")],
  ])("returns unauthenticated %s", async (_label, arrange) => {
    await actions.saveProgram(program("xx-prog-a"));
    arrange();
    expect(await actions.loadAccountData()).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("returns consent_required for a user at the finish-signup gate", async () => {
    const { rows } = await pool.query<{ consent_version: string | null }>(
      'select consent_version from "user" where id = $1',
      [aliceId],
    );
    await pool.query('update "user" set consent_version = $2 where id = $1', [
      aliceId,
      "2020-01-01",
    ]);
    try {
      expect(await actions.loadAccountData()).toEqual({ ok: false, error: "consent_required" });
    } finally {
      await pool.query('update "user" set consent_version = $2 where id = $1', [
        aliceId,
        rows[0]?.consent_version ?? null,
      ]);
    }
  });

  it("returns an empty account as no profile at revision 0, no saves and no ticks", async () => {
    expect(await actions.loadAccountData()).toEqual({
      ok: true,
      value: { profile: null, revision: 0, saved: [], plan: { schemaVersion: 1, done: {} } },
    });
  });

  it("returns what the other actions stored, for this user only", async () => {
    await actions.saveProfile(PROFILE, 0);
    await actions.saveProfile(OTHER_PROFILE, 1);
    await actions.saveProgram(program("xx-prog-b", { savedAt: "2026-10-02" }));
    await actions.saveProgram(program("xx-prog-a"));
    await actions.setStepDone("xx-prog-a", "visa", true);
    await actions.setStepDone("xx-prog-a", "documents", true);
    signedInAs(bobCookie);
    await actions.saveProgram(program("xx-prog-bob"));
    await actions.setStepDone("xx-prog-bob", "visa", true);
    signedInAs(aliceCookie);
    expect(await actions.loadAccountData()).toEqual({
      ok: true,
      value: {
        profile: OTHER_PROFILE,
        revision: 2,
        saved: [program("xx-prog-a"), program("xx-prog-b", { savedAt: "2026-10-02" })],
        plan: { schemaVersion: 1, done: { "xx-prog-a": ["documents", "visa"] } },
      },
    });
  });

  it("returns a stored profile this build cannot read as none, keeping its revision", async () => {
    await actions.saveProfile(PROFILE, 0);
    await pool.query(
      `update profiles set data = '{"schemaVersion":99}'::jsonb, revision = 4 where user_id = $1`,
      [aliceId],
    );
    expect(await actions.loadAccountData()).toMatchObject({
      ok: true,
      value: { profile: null, revision: 4 },
    });
  });
});

describe("createFeedbackReport", () => {
  it("stores a FactRef-shaped report for the signed-in user", async () => {
    expect(
      await actions.createFeedbackReport({ ...FEEDBACK, note: "  the fee changed  " }),
    ).toEqual({ ok: true, value: undefined });
    const { rows } = await pool.query(
      "select user_id, record, path, source_url, snapshot_version, note from feedback_reports",
    );
    expect(rows).toEqual([
      {
        user_id: aliceId,
        record: FEEDBACK.record,
        path: FEEDBACK.path,
        source_url: FEEDBACK.sourceUrl,
        snapshot_version: FEEDBACK.snapshotVersion,
        note: "the fee changed",
      },
    ]);
  });

  it("accepts a record-level fact (empty path) and stores a blank note as null", async () => {
    await actions.createFeedbackReport({
      ...FEEDBACK,
      record: "admission-routes/ma-bac-fr",
      path: "",
      note: "   ",
    });
    const { rows } = await pool.query("select path, note from feedback_reports");
    expect(rows).toEqual([{ path: "", note: null }]);
  });

  it(`refuses the ${FEEDBACK_REPORTS_PER_DAY + 1}th report of the day with rate_limited`, async () => {
    for (let index = 0; index < FEEDBACK_REPORTS_PER_DAY; index += 1) {
      expect((await actions.createFeedbackReport(FEEDBACK)).ok).toBe(true);
    }
    expect(await actions.createFeedbackReport(FEEDBACK)).toEqual({
      ok: false,
      error: "rate_limited",
    });
    expect(await count("feedback_reports")).toBe(FEEDBACK_REPORTS_PER_DAY);
  });

  it("counts per user, and only the last 24 hours", async () => {
    for (let index = 0; index < FEEDBACK_REPORTS_PER_DAY; index += 1) {
      await actions.createFeedbackReport(FEEDBACK);
    }
    signedInAs(bobCookie);
    expect((await actions.createFeedbackReport(FEEDBACK)).ok).toBe(true);
    await pool.query(
      "update feedback_reports set created_at = now() - interval '25 hours' where user_id = $1",
      [aliceId],
    );
    signedInAs(aliceCookie);
    expect((await actions.createFeedbackReport(FEEDBACK)).ok).toBe(true);
  });

  it.each<[string, Record<string, unknown>]>([
    ["a javascript: source", { sourceUrl: "javascript:alert(1)" }],
    ["a data: source", { sourceUrl: "data:text/html,x" }],
    ["a source that is not a URL", { sourceUrl: "example.org/fees" }],
    ["a source over the bound", { sourceUrl: `https://example.org/${"a".repeat(1500)}` }],
    ["a note over 500 characters", { note: "n".repeat(501) }],
    ["a record without a collection", { record: "xx-test-prog" }],
    ["a record over the bound", { record: `programs/${"a".repeat(120)}` }],
    ["a path over the bound", { path: "a".repeat(121) }],
    ["a path with a slash", { path: "requirements/rules" }],
    ["a snapshot version of the wrong shape", { snapshotVersion: "latest" }],
    ["an extra key", { userId: "someone-else" }],
  ])("rejects %s as invalid and writes nothing", async (_label, overrides) => {
    const result = await actions.createFeedbackReport({ ...FEEDBACK, ...overrides } as never);
    expect(result).toEqual({ ok: false, error: "invalid" });
    expect(await count("feedback_reports")).toBe(0);
  });

  it("accepts a note of exactly 500 characters and an http source", async () => {
    const result = await actions.createFeedbackReport({
      ...FEEDBACK,
      sourceUrl: "http://example.org/fees",
      note: "n".repeat(500),
    });
    expect(result.ok).toBe(true);
  });
});

describe("a failing query never leaks the profile", () => {
  const MARKER = String(PROFILE.credential.overall?.value);

  beforeEach(async () => {
    await pool.query(
      "alter table profiles add constraint boom_check check (revision < 0) not valid",
    );
  });

  afterEach(async () => {
    await pool.query("alter table profiles drop constraint boom_check");
  });

  it("throws a fixed error and logs only the action and the SQLSTATE", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const failure = await actions.saveProfile(PROFILE, 0).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    const thrown = `${(failure as Error).message}${(failure as Error).stack ?? ""}`;
    for (const output of [logged, thrown]) {
      expect(output).not.toContain(MARKER);
      expect(output).not.toContain("sciences-maths-a");
      expect(output).not.toContain("nationality");
    }
    expect((failure as Error).cause).toBeUndefined();
    expect(logged).toContain("saveProfile");
    expect(logged).toContain("23514");
    expect(await count("profiles")).toBe(0);
  });
});

describe("a failing session lookup never leaks its parameters", () => {
  const TOKEN = "tok_SECRET_session_0123456789";

  it("surfaces only the fixed error and logs no token-like content", async () => {
    const { getAuth } = await import("@/lib/auth/server");
    vi.spyOn(getAuth().api, "getSession").mockRejectedValue(
      new Error(`Failed query: select * from "session" where token = $1
params: ${TOKEN}`),
    );
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const failure = await actions.saveProgram(program("xx-prog-a")).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    const output = `${(failure as Error).message}${(failure as Error).stack ?? ""}${JSON.stringify(
      spies.flatMap((spy) => spy.mock.calls),
    )}`;
    expect(output).not.toContain(TOKEN);
    expect(output).not.toContain("session");
    expect(output).toContain("saveProgram");
    expect(await totalRows()).toBe(0);
  });
});

describe("saveProfile for an account deleted while its session was presented", () => {
  async function storeDb() {
    return (await import("@/db")).db;
  }

  it.each([
    0, 3,
  ])("returns unauthenticated for expected revision %i and writes nothing", async (revision) => {
    const { saveProfileFor } = await import("@/lib/server/account-store");
    expect(await saveProfileFor(await storeDb(), "deleted-user", PROFILE, revision)).toEqual({
      ok: false,
      error: "unauthenticated",
    });
    expect(await count("profiles")).toBe(0);
  });
});
