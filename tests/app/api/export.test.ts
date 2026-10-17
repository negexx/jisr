import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { type Profile, ProfileSchema } from "@/data-schema/profile";
import { CURRENT_CONSENT_VERSION } from "@/lib/auth/consent";
import type { SavedProgram } from "@/lib/saved/saved";
import type { AccountExport } from "@/lib/server/account-export-store";
import type { SignInLinkRequest } from "@/lib/server/signup";

import { confirmRequest } from "../../support/magic-link";

// GET /api/account/export end to end on PGlite with real sessions, like account-actions.test.ts:
// users sign up through the real magic-link flow, the account actions seed their data, and the route
// reads the session through readSessionUser. Only the request headers are stubbed (no Next request
// scope in Vitest) and the mail goes to a temp folder.

const TIMEOUT_MS = 60_000;
const ORIGIN = "http://localhost:3000";
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const iso = expect.stringMatching(ISO_INSTANT);

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

type RouteModule = typeof import("@/app/api/account/export/route");
type Actions = typeof import("@/lib/server/account-actions");

type Student = { cookie: string; id: string; email: string };

let testDb: TestDatabase;
let pool: Pool;
let route: RouteModule;
let actions: Actions;
let closeAppPool: () => Promise<void>;
let alice: Student;
let bob: Student;
let carol: Student;

// Values that must never appear anywhere in a response: they sit in the columns the export skips.
const SECRETS = {
  accessToken: "SENTINEL-oauth-access-token",
  refreshToken: "SENTINEL-oauth-refresh-token",
  idToken: "SENTINEL-oauth-id-token",
  passwordHash: "SENTINEL-password-hash",
  providerAccountId: "SENTINEL-provider-account-id",
  scope: "SENTINEL-oauth-scope",
  userAgent: "SENTINEL-user-agent/9.9",
  ipAddress: "203.0.113.77",
  verificationValue: "SENTINEL-verification-value",
  verificationIdentifier: "SENTINEL-verification-identifier",
};

const FORBIDDEN_KEY =
  /token|password|secret|hash|cookie|userAgent|user_agent|ipAddress|ip_address|accountId|account_id|scope|session|verification/i;

async function lastLink(): Promise<string> {
  const files = (await readdir(io.mailDir)).sort();
  const last = files.at(-1);
  if (last === undefined) throw new Error("no magic-link mail was written");
  const mail: { url: string } = JSON.parse(await readFile(join(io.mailDir, last), "utf8"));
  return mail.url;
}

async function signUp(email: string): Promise<Student> {
  const { requestSignInLink } = await import("@/lib/server/signup");
  const request: SignInLinkRequest = {
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
  return { cookie, id, email };
}

function signedInAs(student: Student): void {
  io.requestHeaders = new Headers({ cookie: student.cookie, origin: ORIGIN });
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

const ALICE_PROFILE: Profile = ProfileSchema.parse({
  schemaVersion: 2,
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
});

const ALICE_EDITED_PROFILE: Profile = { ...ALICE_PROFILE, priorHigherEducationYears: 1 };
const BOB_PROFILE: Profile = { ...ALICE_PROFILE, nationality: "TN" };

const ALICE_REPORT = {
  record: "programs/xx-test-alice",
  path: "tuition",
  sourceUrl: "https://example.org/alice-fees",
  snapshotVersion: "0123456789ab",
  note: "alice says the fee changed",
};
const ALICE_RECORD_LEVEL_REPORT = {
  record: "admission-routes/ma-bac-fr",
  path: "",
  sourceUrl: "https://example.org/alice-route",
  snapshotVersion: "ba9876543210",
};
const BOB_REPORT = {
  record: "programs/xx-test-bob",
  path: "deadline",
  sourceUrl: "https://example.org/bob-deadline",
  snapshotVersion: "0123456789ab",
  note: "BOB-PRIVATE-NOTE",
};

async function expectOk(result: Promise<{ ok: boolean }>): Promise<void> {
  expect(await result).toMatchObject({ ok: true });
}

async function seedAlice(): Promise<void> {
  signedInAs(alice);
  await expectOk(actions.saveProfile(ALICE_PROFILE, 0));
  await expectOk(actions.saveProfile(ALICE_EDITED_PROFILE, 1));
  await expectOk(actions.saveProgram(program("xx-prog-b", { savedAt: "2026-10-02" })));
  await expectOk(actions.saveProgram(program("xx-prog-a", { snapshotVersion: "ba9876543210" })));
  await expectOk(actions.setStepDone("xx-prog-a", "visa", true));
  await expectOk(actions.setStepDone("xx-prog-a", "documents", true));
  await expectOk(actions.createFeedbackReport(ALICE_REPORT));
  await expectOk(actions.createFeedbackReport(ALICE_RECORD_LEVEL_REPORT));
  // The two reports can land in the same millisecond, which is all a Date can tell apart.
  await pool.query("update feedback_reports set created_at = $2 where user_id = $1 and path = $3", [
    alice.id,
    "2026-10-01T10:00:00Z",
    ALICE_REPORT.path,
  ]);
  await pool.query("update feedback_reports set created_at = $2 where user_id = $1 and path = $3", [
    alice.id,
    "2026-10-01T11:00:00Z",
    ALICE_RECORD_LEVEL_REPORT.path,
  ]);
  await pool.query(
    "insert into user_data_state (user_id, imported_at, profile_revision) values ($1, $2, $3)",
    [alice.id, "2026-10-02T09:30:00Z", 3],
  );
  await pool.query(
    `insert into account (id, account_id, provider_id, user_id, access_token, refresh_token, id_token,
       access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at)
     values ('acc-alice', $2, 'google', $1, $3, $4, $5, '2026-12-01 00:00:00', '2027-01-01 00:00:00',
       $6, $7, '2026-09-30 08:00:00', '2026-09-30 08:00:00')`,
    [
      alice.id,
      SECRETS.providerAccountId,
      SECRETS.accessToken,
      SECRETS.refreshToken,
      SECRETS.idToken,
      SECRETS.scope,
      SECRETS.passwordHash,
    ],
  );
  await pool.query("update session set user_agent = $2, ip_address = $3 where user_id = $1", [
    alice.id,
    SECRETS.userAgent,
    SECRETS.ipAddress,
  ]);
  await pool.query(
    `insert into verification (id, identifier, value, expires_at, created_at, updated_at)
     values ('ver-alice', $1, $2, '2026-12-01 00:00:00', '2026-10-01 00:00:00', '2026-10-01 00:00:00')`,
    [SECRETS.verificationIdentifier, SECRETS.verificationValue],
  );
}

async function seedBob(): Promise<void> {
  signedInAs(bob);
  await expectOk(actions.saveProfile(BOB_PROFILE, 0));
  await expectOk(actions.saveProgram(program("xx-prog-a", { savedAt: "2026-10-05" })));
  await expectOk(actions.saveProgram(program("xx-prog-bob-only", { country: "DE" })));
  await expectOk(actions.setStepDone("xx-prog-a", "submit", true));
  await expectOk(actions.setStepDone("xx-prog-bob-only", "visa", true));
  await expectOk(actions.createFeedbackReport(BOB_REPORT));
  await pool.query(
    `insert into account (id, account_id, provider_id, user_id, access_token, password, created_at, updated_at)
     values ('acc-bob', 'SENTINEL-bob-provider-id', 'google', $1, 'SENTINEL-bob-access', 'SENTINEL-bob-hash',
       '2026-09-29 08:00:00', '2026-09-29 08:00:00')`,
    [bob.id],
  );
}

async function exportAs(student: Student): Promise<{ response: Response; text: string }> {
  signedInAs(student);
  const response = await route.GET();
  return { response, text: await response.text() };
}

async function exportedBody(student: Student): Promise<AccountExport> {
  const { response, text } = await exportAs(student);
  expect(response.status).toBe(200);
  return JSON.parse(text);
}

function keysDeep(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysDeep);
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, inner]) => [key, ...keysDeep(inner)]);
  }
  return [];
}

async function countRows(table: string, userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `select count(*) as count from "${table}" where user_id = $1`,
    [userId],
  );
  return Number(rows[0]?.count);
}

beforeAll(async () => {
  io.mailDir = await mkdtemp(join(tmpdir(), "jisr-export-mail-"));
  testDb = await startTestDatabase({ port: 0 });
  pool = new Pool({ connectionString: testDb.databaseUrl });
  process.env.DATABASE_URL = testDb.databaseUrl;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
  process.env.BETTER_AUTH_URL = ORIGIN;
  vi.stubEnv("ACCOUNTS_ENABLED", "true");
  route = await import("@/app/api/account/export/route");
  actions = await import("@/lib/server/account-actions");
  alice = await signUp("alice@example.com");
  bob = await signUp("bob@example.com");
  carol = await signUp("carol@example.com");
  await seedAlice();
  await seedBob();
  const { db } = await import("@/db");
  closeAppPool = () => db.$client.end();
}, TIMEOUT_MS);

beforeEach(() => {
  vi.stubEnv("ACCOUNTS_ENABLED", "true");
  signedInAs(alice);
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

describe("route file", () => {
  it("exports a GET handler that is never cached, on the Node runtime, and nothing else", () => {
    expect(Object.keys(route).sort()).toEqual(["GET", "dynamic", "runtime"]);
    expect(route.dynamic).toBe("force-dynamic");
    expect(route.runtime).toBe("nodejs");
  });
});

describe("a signed-in student", () => {
  it("gets the whole document as a download that is never stored", async () => {
    const before = Date.now();
    const { response, text } = await exportAs(alice);
    const after = Date.now();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const body: AccountExport = JSON.parse(text);
    const exportedAt = Date.parse(body.exportedAt);
    expect(exportedAt).toBeGreaterThanOrEqual(before);
    expect(exportedAt).toBeLessThanOrEqual(after);
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="jisr-export-${body.exportedAt.slice(0, 10)}.json"`,
    );

    expect(body).toEqual({
      format: "jisr-account-export",
      schemaVersion: 1,
      exportedAt: body.exportedAt,
      account: {
        email: "alice@example.com",
        emailVerified: true,
        name: expect.any(String),
        image: null,
        createdAt: iso,
        updatedAt: iso,
        signInMethods: [{ provider: "google", createdAt: "2026-09-30T08:00:00.000Z" }],
      },
      consent: { consentVersion: CURRENT_CONSENT_VERSION, consentedAt: iso },
      profile: { data: ALICE_EDITED_PROFILE, revision: 2, updatedAt: iso },
      savedPrograms: [
        {
          slug: "xx-prog-a",
          country: "FR",
          field: "computer-science",
          snapshotVersion: "ba9876543210",
          savedAt: "2026-10-01",
          createdAt: iso,
        },
        {
          slug: "xx-prog-b",
          country: "FR",
          field: "computer-science",
          snapshotVersion: "0123456789ab",
          savedAt: "2026-10-02",
          createdAt: iso,
        },
      ],
      checklistProgress: [
        { programSlug: "xx-prog-a", stepId: "documents", doneAt: iso },
        { programSlug: "xx-prog-a", stepId: "visa", doneAt: iso },
      ],
      feedbackReports: [
        {
          id: expect.any(String),
          ...ALICE_REPORT,
          createdAt: "2026-10-01T10:00:00.000Z",
        },
        {
          id: expect.any(String),
          ...ALICE_RECORD_LEVEL_REPORT,
          note: null,
          createdAt: "2026-10-01T11:00:00.000Z",
        },
      ],
      dataState: { importedAt: "2026-10-02T09:30:00.000Z", profileRevision: 3 },
      pendingSignup: {
        consentVersion: CURRENT_CONSENT_VERSION,
        consentedAt: iso,
        ageConfirmed: true,
        createdAt: iso,
        expiresAt: iso,
      },
    });
  });

  it("is an indented document a person can open in a text editor", async () => {
    const { text } = await exportAs(alice);
    expect(text.split("\n").length).toBeGreaterThan(40);
    expect(text).toContain('\n  "account": {');
  });

  it("keeps the snapshot version each programme was saved against, as stored", async () => {
    const body = await exportedBody(alice);
    const { rows } = await pool.query<{ slug: string; snapshot_version: string }>(
      "select slug, snapshot_version from saved_programs where user_id = $1 order by slug",
      [alice.id],
    );
    expect(rows.map((row) => row.snapshot_version)).toEqual(["ba9876543210", "0123456789ab"]);
    expect(body.savedPrograms.map((row) => [row.slug, row.snapshotVersion])).toEqual(
      rows.map((row) => [row.slug, row.snapshot_version]),
    );
  });

  it("gets the document even when the consent on record is an older privacy-notice version", async () => {
    await pool.query('update "user" set consent_version = $2 where id = $1', [
      alice.id,
      "2020-01-01",
    ]);
    try {
      const { response, text } = await exportAs(alice);
      expect(response.status).toBe(200);
      expect(JSON.parse(text).consent.consentVersion).toBe("2020-01-01");
    } finally {
      await pool.query('update "user" set consent_version = $2 where id = $1', [
        alice.id,
        CURRENT_CONSENT_VERSION,
      ]);
    }
  });

  it("gets empty collections, not missing keys, from an account that holds nothing", async () => {
    const body = await exportedBody(carol);
    expect(body).toMatchObject({
      account: { email: "carol@example.com", signInMethods: [] },
      profile: null,
      savedPrograms: [],
      checklistProgress: [],
      feedbackReports: [],
      dataState: null,
    });
    expect(body.consent.consentVersion).toBe(CURRENT_CONSENT_VERSION);
  });

  it("gets the stored profile as it is, even when this build cannot parse it", async () => {
    await pool.query(
      `update profiles set data = '{"schemaVersion":99,"future":true}'::jsonb where user_id = $1`,
      [alice.id],
    );
    try {
      const body = await exportedBody(alice);
      expect(body.profile?.data).toEqual({ schemaVersion: 99, future: true });
    } finally {
      await pool.query("update profiles set data = $2::jsonb where user_id = $1", [
        alice.id,
        JSON.stringify(ALICE_EDITED_PROFILE),
      ]);
    }
  });
});

describe("ownership", () => {
  it.each(["alice", "bob"] as const)("exports only %s's rows", async (name) => {
    const [own, other] = name === "alice" ? [alice, bob] : [bob, alice];
    const { text } = await exportAs(own);
    const body: AccountExport = JSON.parse(text);

    expect(body.account.email).toBe(own.email);
    expect(text).not.toContain(other.email);
    expect(text).not.toContain(other.id);
    expect(body.savedPrograms).toHaveLength(await countRows("saved_programs", own.id));
    expect(body.checklistProgress).toHaveLength(await countRows("checklist_progress", own.id));
    expect(body.feedbackReports).toHaveLength(await countRows("feedback_reports", own.id));
    expect(body.profile).not.toBeNull();
  });

  it("does not mix in another student's rows for a slug both saved", async () => {
    const aliceBody = await exportedBody(alice);
    const bobBody = await exportedBody(bob);

    expect(aliceBody.savedPrograms.map((row) => row.slug)).toEqual(["xx-prog-a", "xx-prog-b"]);
    expect(aliceBody.savedPrograms.find((row) => row.slug === "xx-prog-a")?.savedAt).toBe(
      "2026-10-01",
    );
    expect(aliceBody.checklistProgress.map((row) => row.stepId)).toEqual(["documents", "visa"]);
    expect(aliceBody.feedbackReports.map((row) => row.note)).toEqual([ALICE_REPORT.note, null]);

    expect(bobBody.savedPrograms.map((row) => row.slug)).toEqual(["xx-prog-bob-only", "xx-prog-a"]);
    expect(bobBody.savedPrograms.find((row) => row.slug === "xx-prog-a")?.savedAt).toBe(
      "2026-10-05",
    );
    expect(bobBody.checklistProgress).toEqual([
      { programSlug: "xx-prog-a", stepId: "submit", doneAt: iso },
      { programSlug: "xx-prog-bob-only", stepId: "visa", doneAt: iso },
    ]);
    expect(bobBody.feedbackReports.map((row) => row.note)).toEqual(["BOB-PRIVATE-NOTE"]);
    expect(bobBody.profile?.data).toEqual(BOB_PROFILE);
    expect(bobBody.account.signInMethods).toEqual([
      { provider: "google", createdAt: "2026-09-29T08:00:00.000Z" },
    ]);
  });

  it("includes the pending sign-up row of the student's own address only", async () => {
    const { rows } = await pool.query<{ consented_at: Date }>(
      "select consented_at from pending_signups where email = $1",
      [alice.email],
    );
    const body = await exportedBody(alice);
    expect(body.pendingSignup?.consentedAt).toBe(rows[0]?.consented_at.toISOString());

    const elsewhere = "elsewhere@example.com";
    await pool.query("update pending_signups set email = $2 where email = $1", [
      alice.email,
      elsewhere,
    ]);
    try {
      expect((await exportedBody(alice)).pendingSignup).toBeNull();
      expect((await exportedBody(bob)).pendingSignup).not.toBeNull();
    } finally {
      await pool.query("update pending_signups set email = $2 where email = $1", [
        elsewhere,
        alice.email,
      ]);
    }
  });
});

describe("secrets", () => {
  it("never reach the response, whatever the account tables hold", async () => {
    const stored = await pool.query<{ token: string; user_agent: string | null }>(
      "select token, user_agent from session where user_id = $1",
      [alice.id],
    );
    expect(stored.rows.length).toBeGreaterThan(0);
    expect(stored.rows.every((row) => row.user_agent === SECRETS.userAgent)).toBe(true);
    const held = await pool.query<{ access_token: string; password: string }>(
      "select access_token, password from account where user_id = $1",
      [alice.id],
    );
    expect(held.rows).toEqual([
      { access_token: SECRETS.accessToken, password: SECRETS.passwordHash },
    ]);
    const verification = await pool.query<{ count: string }>(
      "select count(*) as count from verification where value = $1",
      [SECRETS.verificationValue],
    );
    expect(Number(verification.rows[0]?.count)).toBe(1);

    const { text } = await exportAs(alice);

    const sessionTokens = stored.rows.map((row) => row.token);
    for (const secret of [...Object.values(SECRETS), ...sessionTokens, alice.cookie]) {
      expect(text).not.toContain(secret);
    }
  });

  it("have no key named like a token, a password hash, a device or a provider secret", async () => {
    for (const student of [alice, bob, carol]) {
      const keys = keysDeep(await exportedBody(student));
      expect(keys.length).toBeGreaterThan(20);
      expect(keys.filter((key) => FORBIDDEN_KEY.test(key))).toEqual([]);
    }
  });

  it("export a sign-in method as its provider and link date and nothing more", async () => {
    const body = await exportedBody(alice);
    expect(body.account.signInMethods).toEqual([
      { provider: "google", createdAt: "2026-09-30T08:00:00.000Z" },
    ]);
  });
});

describe("a visitor who is not signed in", () => {
  it("gets a typed 401 with no document and nothing to download", async () => {
    signedOut();
    const response = await route.GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(await response.json()).toEqual({ code: "UNAUTHENTICATED" });
  });

  it("gets the same 401 for a cookie that no session matches", async () => {
    io.requestHeaders = new Headers({
      cookie: "better-auth.session_token=not-a-real-token.not-a-real-signature",
      origin: ORIGIN,
    });
    const response = await route.GET();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: "UNAUTHENTICATED" });
  });

  it("gets a 401 when the account was deleted while its session was being presented", async () => {
    const { getAuth } = await import("@/lib/auth/server");
    vi.spyOn(getAuth().api, "getSession").mockResolvedValue({
      user: { id: "deleted-user", consentVersion: CURRENT_CONSENT_VERSION },
    } as never);
    const response = await route.GET();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: "UNAUTHENTICATED" });
  });
});

describe("while accounts are off", () => {
  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["false", "false"],
    ["a typo", "fasle"],
  ])("answers 403 ACCOUNTS_DISABLED with ACCOUNTS_ENABLED %s, even for a valid session", async (_label, value) => {
    vi.stubEnv("ACCOUNTS_ENABLED", value);
    const { db } = await import("@/db");
    const query = vi.spyOn(db.$client, "query");
    const connect = vi.spyOn(db.$client, "connect");

    signedInAs(alice);
    const response = await route.GET();

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(await response.json()).toEqual({ code: "ACCOUNTS_DISABLED" });
    expect(query).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("is observable: the pool spies above do see the traffic of a served request", async () => {
    const { db } = await import("@/db");
    const query = vi.spyOn(db.$client, "query");
    const connect = vi.spyOn(db.$client, "connect");

    expect((await route.GET()).status).toBe(200);

    expect(query.mock.calls.length + connect.mock.calls.length).toBeGreaterThan(0);
  });

  it("is read per request: the next request after switching on is served", async () => {
    vi.stubEnv("ACCOUNTS_ENABLED", "false");
    expect((await route.GET()).status).toBe(403);
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    expect((await route.GET()).status).toBe(200);
  });
});

describe("a failing query", () => {
  beforeEach(async () => {
    await pool.query("alter table feedback_reports rename column note to note_renamed");
  });

  afterEach(async () => {
    await pool.query("alter table feedback_reports rename column note_renamed to note");
  });

  it("throws a fixed error and logs only the action and the SQLSTATE", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const failure = await route.GET().then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("account action exportAccountData failed");
    expect((failure as Error).cause).toBeUndefined();
    const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    const thrown = `${(failure as Error).message}${(failure as Error).stack ?? ""}`;
    for (const output of [logged, thrown]) {
      expect(output).not.toContain(alice.id);
      expect(output).not.toContain("feedback_reports");
      expect(output).not.toContain(alice.email);
    }
    expect(logged).toContain("exportAccountData");
    expect(logged).toContain("42703");
  });
});

describe("exportFilename", () => {
  it("names the file after the UTC day of the export", async () => {
    const { exportFilename } = await import("@/lib/server/account-export");
    expect(exportFilename(new Date("2026-10-15T23:59:59.999Z"))).toBe(
      "jisr-export-2026-10-15.json",
    );
    expect(exportFilename(new Date("2026-10-16T00:00:00.000Z"))).toBe(
      "jisr-export-2026-10-16.json",
    );
  });
});

describe("exportAccountDataFor", () => {
  it("returns null for a user that does not exist", async () => {
    const { db } = await import("@/db");
    const { exportAccountDataFor } = await import("@/lib/server/account-export-store");
    expect(await exportAccountDataFor(db, "deleted-user", new Date())).toBeNull();
  });
});
