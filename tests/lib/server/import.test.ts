import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { type Profile, ProfileSchema } from "@/data-schema/profile";
import { MAX_SAVED_PROGRAMS } from "@/lib/constants";
import { MAX_PLAN_PROGRAMS } from "@/lib/plan/progress";
import type { SavedProgram } from "@/lib/saved/saved";
import type { GuestImportPayload } from "@/lib/server/import";
import type { SignInLinkRequest } from "@/lib/server/signup";

// The guest import and the signed-in Clear my data end to end on PGlite with real sessions, like
// account-actions.test.ts. Two imports racing on separate connections are in
// tests/db-race/import.test.ts (PGlite has one connection, so it cannot show the lock).

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

let testDb: TestDatabase;
let pool: Pool;
let importer: typeof import("@/lib/server/import");
let actions: typeof import("@/lib/server/account-actions");
let closeAppPool: () => Promise<void>;
let aliceCookie = "";
let bobCookie = "";
let aliceId = "";
let bobId = "";

const USER_DATA_TABLES = ["saved_programs", "checklist_progress", "profiles", "user_data_state"];
const DATA_TABLES = [...USER_DATA_TABLES, "feedback_reports"];

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

// Every user-data row, in a stable order, for deep-equal before/after checks.
async function snapshotRows(): Promise<Record<string, unknown[]>> {
  const entries = await Promise.all(
    DATA_TABLES.map(
      async (table) =>
        [table, (await pool.query(`select * from "${table}" order by 1, 2`)).rows] as const,
    ),
  );
  return Object.fromEntries(entries);
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
    .handler(new Request(await lastLink(), { method: "GET" }));
  expect(response.status).toBe(302);
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

const SERVER_PROFILE: Profile = { ...PROFILE, destinations: ["NL"] };

// Same-day saves on purpose: their order can only come from created_at.
const GUEST: GuestImportPayload = {
  profile: PROFILE,
  saved: [program("xx-prog-c"), program("xx-prog-a"), program("xx-prog-b")],
  plan: { "xx-prog-a": ["documents", "visa"], "xx-prog-gone": ["visa"] },
};

async function importedAt(userId: string): Promise<Date | null | undefined> {
  const { rows } = await pool.query<{ imported_at: Date | null }>(
    "select imported_at from user_data_state where user_id = $1",
    [userId],
  );
  return rows[0]?.imported_at;
}

async function profileRow(userId: string) {
  const { rows } = await pool.query<{ data: Profile; revision: number }>(
    "select data, revision from profiles where user_id = $1",
    [userId],
  );
  return rows[0];
}

// What the account holds now, through the same read the stores hydrate from.
async function accountData() {
  const loaded = await actions.loadAccountData();
  if (!loaded.ok) throw new Error(`loadAccountData refused: ${loaded.error}`);
  return loaded.value;
}

// The account already holds data from another device: a profile at revision 2, one save, one tick.
async function seedServerData(): Promise<void> {
  expect(await actions.saveProfile(PROFILE, 0)).toMatchObject({ ok: true });
  expect(await actions.saveProfile(SERVER_PROFILE, 1)).toEqual({
    ok: true,
    value: { revision: 2 },
  });
  expect(await actions.saveProgram(program("xx-prog-server"))).toMatchObject({ ok: true });
  expect(await actions.setStepDone("xx-prog-server", "visa", true)).toMatchObject({ ok: true });
}

beforeAll(async () => {
  io.mailDir = await mkdtemp(join(tmpdir(), "jisr-import-mail-"));
  testDb = await startTestDatabase({ port: 0 });
  pool = new Pool({ connectionString: testDb.databaseUrl });
  process.env.DATABASE_URL = testDb.databaseUrl;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
  process.env.BETTER_AUTH_URL = ORIGIN;
  vi.stubEnv("ACCOUNTS_ENABLED", "true");
  importer = await import("@/lib/server/import");
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

describe("importGuestData refuses first and writes nothing", () => {
  it.each(["auto", "replace"] as const)("in %s mode without a session", async (mode) => {
    signedOut();
    expect(await importer.importGuestData(GUEST, mode)).toEqual({
      ok: false,
      error: "unauthenticated",
    });
    expect(await totalRows()).toBe(0);
  });

  it("while accounts are off", async () => {
    vi.stubEnv("ACCOUNTS_ENABLED", "");
    expect(await importer.importGuestData(GUEST, "auto")).toEqual({
      ok: false,
      error: "unauthenticated",
    });
    expect(await totalRows()).toBe(0);
  });

  it.each([
    "auto",
    "replace",
  ] as const)("in %s mode for a user held at the finish-signup gate", async (mode) => {
    const { rows } = await pool.query<{ consent_version: string | null }>(
      'select consent_version from "user" where id = $1',
      [aliceId],
    );
    await pool.query('update "user" set consent_version = $2 where id = $1', [
      aliceId,
      "2020-01-01",
    ]);
    try {
      expect(await importer.importGuestData(GUEST, mode)).toEqual({
        ok: false,
        error: "consent_required",
      });
      expect(await totalRows()).toBe(0);
    } finally {
      await pool.query('update "user" set consent_version = $2 where id = $1', [
        aliceId,
        rows[0]?.consent_version ?? null,
      ]);
    }
  });

  it.each<[string, unknown, unknown]>([
    ["an empty payload", { profile: null, saved: [], plan: {} }, "auto"],
    ["an unknown mode", GUEST, "merge"],
    [
      "a profile that fails the schema",
      { ...GUEST, profile: { ...PROFILE, nationality: "x" } },
      "auto",
    ],
    ["an extra payload key", { ...GUEST, draft: {} }, "auto"],
    ["the same slug saved twice", { ...GUEST, saved: [program("xx-a"), program("xx-a")] }, "auto"],
    [
      `more than ${MAX_SAVED_PROGRAMS} saved programmes`,
      {
        ...GUEST,
        saved: Array.from({ length: MAX_SAVED_PROGRAMS + 1 }, (_, i) => program(`xx-p-${i}`)),
      },
      "auto",
    ],
    [
      `ticks for more than ${MAX_PLAN_PROGRAMS} programmes`,
      {
        ...GUEST,
        plan: Object.fromEntries(
          Array.from({ length: MAX_PLAN_PROGRAMS + 1 }, (_, i) => [`xx-p-${i}`, ["visa"]]),
        ),
      },
      "auto",
    ],
    ["a step outside the checklist", { ...GUEST, plan: { "xx-a": ["lunch"] } }, "auto"],
    ["the same step twice", { ...GUEST, plan: { "xx-a": ["visa", "visa"] } }, "auto"],
    ["a programme with no steps", { ...GUEST, plan: { "xx-a": [] } }, "auto"],
    ["a bad plan slug", { ...GUEST, plan: { "XX A": ["visa"] } }, "auto"],
  ])("rejects %s as invalid", async (_label, payload, mode) => {
    expect(await importer.importGuestData(payload as GuestImportPayload, mode as "auto")).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await totalRows()).toBe(0);
  });
});

describe("importGuestData auto on an empty account", () => {
  it("stores the profile at revision 1, the saves in the guest's order and the ticks, once", async () => {
    expect(await importer.importGuestData(GUEST, "auto")).toEqual({ ok: true, value: undefined });
    expect(await accountData()).toEqual({
      profile: PROFILE,
      revision: 1,
      saved: GUEST.saved,
      plan: { schemaVersion: 1, done: GUEST.plan },
    });
    expect(await importedAt(aliceId)).toBeInstanceOf(Date);
    expect(await count("saved_programs")).toBe(3);
    expect(await count("checklist_progress")).toBe(3);
  });

  it("re-run: refuses with has_server_data and adds no duplicate rows", async () => {
    await importer.importGuestData(GUEST, "auto");
    const before = await snapshotRows();
    expect(await importer.importGuestData(GUEST, "auto")).toEqual({
      ok: false,
      error: "has_server_data",
    });
    expect(await snapshotRows()).toEqual(before);
  });

  it("keeps a save made after the import after the imported ones", async () => {
    await importer.importGuestData(GUEST, "auto");
    await actions.saveProgram(program("xx-prog-later"));
    expect((await accountData()).saved.map((item) => item.slug)).toEqual([
      "xx-prog-c",
      "xx-prog-a",
      "xx-prog-b",
      "xx-prog-later",
    ]);
  });

  it("imports a device that holds only saves, or only a profile", async () => {
    expect(
      await importer.importGuestData({ profile: null, saved: [program("xx-a")], plan: {} }, "auto"),
    ).toEqual({ ok: true, value: undefined });
    expect(await accountData()).toMatchObject({ profile: null, revision: 0 });
    signedInAs(bobCookie);
    expect(
      await importer.importGuestData({ profile: PROFILE, saved: [], plan: {} }, "auto"),
    ).toEqual({ ok: true, value: undefined });
    expect(await profileRow(bobId)).toEqual({ data: PROFILE, revision: 1 });
    expect(await count("saved_programs", `user_id = '${bobId}'`)).toBe(0);
  });

  it("is per account: another user's data does not block it", async () => {
    signedInAs(bobCookie);
    await seedServerData();
    signedInAs(aliceCookie);
    expect(await importer.importGuestData(GUEST, "auto")).toMatchObject({ ok: true });
    expect(await count("saved_programs", `user_id = '${bobId}'`)).toBe(1);
  });
});

describe("importGuestData auto on an account that already holds data", () => {
  it.each<[string, () => Promise<void>]>([
    ["a profile, saves and ticks", seedServerData],
    [
      "only a saved programme",
      async () => {
        await actions.saveProgram(program("xx-prog-server"));
      },
    ],
    [
      "only a ticked step",
      async () => {
        await actions.setStepDone("xx-prog-server", "visa", true);
      },
    ],
    [
      "only a profile",
      async () => {
        await actions.saveProfile(SERVER_PROFILE, 0);
      },
    ],
    [
      "nothing, but an earlier import marker",
      async () => {
        await pool.query("insert into user_data_state (user_id, imported_at) values ($1, now())", [
          aliceId,
        ]);
      },
    ],
  ])("with %s: returns has_server_data and leaves every row unchanged", async (_label, seed) => {
    await seed();
    const before = await snapshotRows();
    expect(await importer.importGuestData(GUEST, "auto")).toEqual({
      ok: false,
      error: "has_server_data",
    });
    expect(await snapshotRows()).toEqual(before);
  });

  it("imports when the marker row exists but was never set", async () => {
    await pool.query("insert into user_data_state (user_id, imported_at) values ($1, null)", [
      aliceId,
    ]);
    expect(await importer.importGuestData(GUEST, "auto")).toMatchObject({ ok: true });
    expect(await importedAt(aliceId)).toBeInstanceOf(Date);
  });
});

describe("importGuestData replace (the student's explicit choice)", () => {
  it("makes the account hold exactly this device's data and moves the profile revision on", async () => {
    await seedServerData();
    expect(await importer.importGuestData(GUEST, "replace")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await accountData()).toEqual({
      profile: PROFILE,
      revision: 3,
      saved: GUEST.saved,
      plan: { schemaVersion: 1, done: GUEST.plan },
    });
    expect(await importedAt(aliceId)).toBeInstanceOf(Date);
  });

  it("makes the other device's next profile save a conflict, not an overwrite", async () => {
    await seedServerData();
    await importer.importGuestData(GUEST, "replace");
    expect(await actions.saveProfile({ ...SERVER_PROFILE, destinations: ["IT"] }, 2)).toEqual({
      ok: false,
      error: "conflict",
      current: { profile: PROFILE, revision: 3 },
    });
    expect(await profileRow(aliceId)).toEqual({ data: PROFILE, revision: 3 });
  });

  it("removes the account's profile when this device has none", async () => {
    await seedServerData();
    await importer.importGuestData(
      { profile: null, saved: [program("xx-a")], plan: {} },
      "replace",
    );
    expect(await accountData()).toEqual({
      profile: null,
      revision: 0,
      saved: [program("xx-a")],
      plan: { schemaVersion: 1, done: {} },
    });
  });

  it("can run twice without duplicates", async () => {
    await importer.importGuestData(GUEST, "replace");
    await importer.importGuestData(GUEST, "replace");
    expect(await count("saved_programs")).toBe(3);
    expect(await count("checklist_progress")).toBe(3);
    expect(await profileRow(aliceId)).toEqual({ data: PROFILE, revision: 2 });
  });

  it("leaves another user's rows alone", async () => {
    signedInAs(bobCookie);
    await seedServerData();
    const bobBefore = (await pool.query("select * from saved_programs where user_id = $1", [bobId]))
      .rows;
    signedInAs(aliceCookie);
    await importer.importGuestData(GUEST, "replace");
    expect(
      (await pool.query("select * from saved_programs where user_id = $1", [bobId])).rows,
    ).toEqual(bobBefore);
    expect(await profileRow(bobId)).toEqual({ data: SERVER_PROFILE, revision: 2 });
  });
});

describe("importGuestData for an account deleted while its session was presented", () => {
  it("returns unauthenticated and writes nothing", async () => {
    const { importGuestDataFor } = await import("@/lib/server/import-store");
    const { db } = await import("@/db");
    expect(await importGuestDataFor(db, "deleted-user", GUEST, "auto")).toEqual({
      ok: false,
      error: "unauthenticated",
    });
    expect(await totalRows()).toBe(0);
  });
});

describe("a failing import never leaks the profile", () => {
  const MARKER = String(PROFILE.credential.overall?.value);

  beforeEach(async () => {
    await pool.query(
      "alter table profiles add constraint boom_check check (revision < 0) not valid",
    );
  });

  afterEach(async () => {
    await pool.query("alter table profiles drop constraint boom_check");
  });

  it("throws a fixed error, logs only the action and the SQLSTATE, and commits nothing", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const failure = await importer.importGuestData(GUEST, "auto").then(
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
      expect(output).not.toContain("xx-prog-a");
    }
    expect((failure as Error).cause).toBeUndefined();
    expect(logged).toContain("importGuestData");
    expect(logged).toContain("23514");
    expect(await totalRows()).toBe(0);
  });
});

describe("clearAccountData (Clear my data while signed in)", () => {
  const FEEDBACK = {
    record: "programs/xx-test-prog",
    path: "tuition",
    sourceUrl: "https://example.org/fees",
    snapshotVersion: "0123456789ab",
  };

  it("removes the account's profile, saves, ticks and import marker, and nothing else", async () => {
    await importer.importGuestData(GUEST, "auto");
    await actions.createFeedbackReport(FEEDBACK);
    signedInAs(bobCookie);
    await seedServerData();
    const bobBefore = await snapshotRows();
    signedInAs(aliceCookie);

    expect(await actions.clearAccountData()).toEqual({ ok: true, value: undefined });

    for (const table of USER_DATA_TABLES) {
      expect(await count(table, `user_id = '${aliceId}'`), table).toBe(0);
    }
    expect(await count("feedback_reports", `user_id = '${aliceId}'`)).toBe(1);
    expect(await count("user", `id = '${aliceId}'`)).toBe(1);
    expect(await count("session", `user_id = '${aliceId}'`)).toBeGreaterThan(0);
    const after = await snapshotRows();
    const bobs = (rows: unknown[] | undefined) =>
      rows?.filter((row) => (row as { user_id: string }).user_id === bobId);
    for (const table of USER_DATA_TABLES) {
      expect(bobs(after[table]), table).toEqual(bobs(bobBefore[table]));
    }
  });

  it("lets the next sign-in with guest data import automatically again", async () => {
    await importer.importGuestData(GUEST, "auto");
    await actions.clearAccountData();
    expect(await importer.importGuestData(GUEST, "auto")).toMatchObject({ ok: true });
  });

  it.each<[string, () => void, string]>([
    ["without a session", signedOut, "unauthenticated"],
    ["while accounts are off", () => vi.stubEnv("ACCOUNTS_ENABLED", ""), "unauthenticated"],
  ])("refuses %s and removes nothing", async (_label, arrange, error) => {
    await importer.importGuestData(GUEST, "auto");
    const before = await snapshotRows();
    arrange();
    expect(await actions.clearAccountData()).toEqual({ ok: false, error });
    expect(await snapshotRows()).toEqual(before);
  });

  it("refuses a user held at the finish-signup gate and removes nothing", async () => {
    await importer.importGuestData(GUEST, "auto");
    const before = await snapshotRows();
    const { rows } = await pool.query<{ consent_version: string | null }>(
      'select consent_version from "user" where id = $1',
      [aliceId],
    );
    await pool.query('update "user" set consent_version = $2 where id = $1', [
      aliceId,
      "2020-01-01",
    ]);
    try {
      expect(await actions.clearAccountData()).toEqual({ ok: false, error: "consent_required" });
      expect(await snapshotRows()).toEqual(before);
    } finally {
      await pool.query('update "user" set consent_version = $2 where id = $1', [
        aliceId,
        rows[0]?.consent_version ?? null,
      ]);
    }
  });
});
