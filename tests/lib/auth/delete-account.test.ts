import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { type Profile, ProfileSchema } from "@/data-schema/profile";
import type { SignInLinkRequest } from "@/lib/server/signup";

import { confirmRequest } from "../../support/magic-link";

// Account deletion end to end on PGlite (todo 19): request -> emailed token (file transport) ->
// confirm, through the real /api/auth route. Students sign up through the real magic-link flow and
// the account actions seed their rows; residue Better Auth does not cascade (verification rows,
// email_cooldowns, pending_signups) is inserted as Better Auth itself would write it.

const TIMEOUT_MS = 60_000;
const ORIGIN = "http://localhost:3000";
const USER_AGENT = "SENTINEL-browser/1.0";

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

type RouteModule = typeof import("@/app/api/auth/[...all]/route");
type Actions = typeof import("@/lib/server/account-actions");

type Student = { cookie: string; id: string; email: string };
type Mail = { kind: string; to: string; subject: string; text: string; url: string };

let testDb: TestDatabase;
let pool: Pool;
let route: RouteModule;
let actions: Actions;
let closeAppPool: () => Promise<void>;
let serial = 0;

const PROFILE: Profile = ProfileSchema.parse({
  schemaVersion: 1,
  nationality: "MA",
  credential: {
    country: "MA",
    type: "bac",
    track: "sciences-maths-a",
    status: "expected",
    overall: { scale: "ma-20", value: 14 },
    subjects: [{ subject: "mathematics", grade: { scale: "ma-20", value: 16 } }],
  },
  priorHigherEducationYears: 0,
  languages: [{ language: "fr", level: "B2", certificate: null }],
  fields: ["computer-science"],
  studyLanguages: ["fr"],
  destinations: ["FR"],
  budget: { amountMinor: 800_00, currency: "EUR", period: "month" },
  institutionType: "any",
});

async function mails(): Promise<Mail[]> {
  const files = (await readdir(io.mailDir)).sort();
  return Promise.all(
    files.map(async (file) => JSON.parse(await readFile(join(io.mailDir, file), "utf8")) as Mail),
  );
}

async function lastMail(): Promise<Mail> {
  const last = (await mails()).at(-1);
  if (last === undefined) throw new Error("no mail was written");
  return last;
}

function cookieOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

async function signUp(name: string): Promise<Student> {
  serial += 1;
  const email = `${name}-${serial}@example.com`;
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
  const response = await route.POST(
    confirmRequest((await lastMail()).url, { "user-agent": USER_AGENT }),
  );
  expect(response.status).toBe(200);
  const { rows } = await pool.query<{ id: string }>('select id from "user" where email = $1', [
    email,
  ]);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("sign-up created no user");
  return { cookie: cookieOf(response), id, email };
}

async function expectOk(result: Promise<{ ok: boolean }>): Promise<void> {
  expect(await result).toMatchObject({ ok: true });
}

// Every row a student leaves behind: the app's own rows through the actions, and the verification
// rows Better Auth writes for a magic link (JSON value holding the address as typed), an OAuth link
// state (JSON value holding the user id and address) and a user-id-valued token.
async function seed(student: Student): Promise<void> {
  io.requestHeaders = new Headers({ cookie: student.cookie, origin: ORIGIN });
  await expectOk(actions.saveProfile(PROFILE, 0));
  await expectOk(
    actions.saveProgram({
      slug: "xx-prog-a",
      country: "FR",
      field: "computer-science",
      snapshotVersion: "0123456789ab",
      savedAt: "2026-10-01",
    }),
  );
  await expectOk(actions.setStepDone("xx-prog-a", "visa", true));
  await expectOk(
    actions.createFeedbackReport({
      record: "programs/xx-test-a",
      path: "tuition",
      sourceUrl: "https://example.org/fees",
      snapshotVersion: "0123456789ab",
    }),
  );
  await pool.query("insert into user_data_state (user_id, profile_revision) values ($1, 1)", [
    student.id,
  ]);
  await pool.query(
    `insert into account (id, account_id, provider_id, user_id, created_at, updated_at)
     values ($1, $2, 'google', $3, now(), now())`,
    [`acc-${student.id}`, `google-${student.id}`, student.id],
  );
  await insertVerification(
    `magic-link:hashed-${student.id}`,
    JSON.stringify({ type: "magic-link", email: student.email.toUpperCase(), name: "" }),
  );
  await insertVerification(
    `auth-state:state-${student.id}`,
    JSON.stringify({
      callbackURL: "/fr/welcome",
      codeVerifier: "verifier",
      expiresAt: Date.now() + 600_000,
      link: { email: student.email, userId: student.id },
    }),
  );
  await insertVerification(`reset-password:token-${student.id}`, student.id);
}

async function insertVerification(identifier: string, value: string, expiresAt?: Date) {
  await pool.query(
    `insert into verification (id, identifier, value, expires_at, created_at, updated_at)
     values ($1, $2, $3, $4, now(), now())`,
    // An ISO string: the column is timestamp without time zone, read back as UTC (a Date
    // parameter would be written in the machine's local time).
    [
      `ver-${identifier}`,
      identifier,
      value,
      (expiresAt ?? new Date(Date.now() + 3_600_000)).toISOString(),
    ],
  );
}

async function scalar(sql: string, params: unknown[]): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(sql, params);
  return Number(rows[0]?.count);
}

// Everything that can identify the student, table by table.
async function footprint(student: Student): Promise<Record<string, number>> {
  const byUser = async (table: string) =>
    scalar(`select count(*) as count from "${table}" where user_id = $1`, [student.id]);
  return {
    user: await scalar('select count(*) as count from "user" where id = $1', [student.id]),
    session: await byUser("session"),
    account: await byUser("account"),
    profiles: await byUser("profiles"),
    savedPrograms: await byUser("saved_programs"),
    checklistProgress: await byUser("checklist_progress"),
    feedbackReports: await byUser("feedback_reports"),
    userDataState: await byUser("user_data_state"),
    verificationById: await scalar(
      "select count(*) as count from verification where value = $1 or strpos(value, $1) > 0",
      [student.id],
    ),
    verificationByEmail: await scalar(
      "select count(*) as count from verification where strpos(lower(value), $1) > 0",
      [`"${student.email}"`],
    ),
    emailCooldowns: await scalar("select count(*) as count from email_cooldowns where email = $1", [
      student.email,
    ]),
    pendingSignups: await scalar("select count(*) as count from pending_signups where email = $1", [
      student.email,
    ]),
  };
}

function post(student: Student | null, path: string, body: unknown): Promise<Response> {
  return route.POST(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        ...(student ? { cookie: student.cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

function get(student: Student | null, path: string): Promise<Response> {
  return route.GET(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "GET",
      headers: { origin: ORIGIN, ...(student ? { cookie: student.cookie } : {}) },
    }),
  );
}

async function requestDeletion(student: Student, locale = "fr"): Promise<Response> {
  return post(student, "/delete-user", { callbackURL: `/${locale}/account/delete` });
}

function tokenFrom(mail: Mail): string {
  // The token rides the fragment, which no server or request log ever receives.
  const token = new URLSearchParams(new URL(mail.url).hash.slice(1)).get("token");
  if (token === null) throw new Error("the deletion mail carries no token");
  return token;
}

beforeAll(async () => {
  io.mailDir = await mkdtemp(join(tmpdir(), "jisr-delete-mail-"));
  testDb = await startTestDatabase({ port: 0 });
  pool = new Pool({ connectionString: testDb.databaseUrl });
  process.env.DATABASE_URL = testDb.databaseUrl;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
  process.env.BETTER_AUTH_URL = ORIGIN;
  vi.stubEnv("ACCOUNTS_ENABLED", "true");
  route = await import("@/app/api/auth/[...all]/route");
  actions = await import("@/lib/server/account-actions");
  const { db } = await import("@/db");
  closeAppPool = () => db.$client.end();
}, TIMEOUT_MS);

beforeEach(() => {
  vi.stubEnv("ACCOUNTS_ENABLED", "true");
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

describe("a completed deletion", () => {
  let alice: Student;
  let bob: Student;

  beforeEach(async () => {
    alice = await signUp("alice");
    bob = await signUp("bob");
    await seed(alice);
    await seed(bob);
  }, TIMEOUT_MS);

  it("erases every row of the student and leaves another student's rows as they were", async () => {
    // Look-alikes that must survive: an address that contains alice's, and a value that is not JSON.
    await insertVerification(
      "magic-link:look-alike",
      JSON.stringify({ type: "magic-link", email: `x${alice.email}`, name: "" }),
    );
    await insertVerification("magic-link:not-json", "not json at all");
    const aliceBefore = await footprint(alice);
    expect(Object.values(aliceBefore).every((count) => count > 0)).toBe(true);
    const bobBefore = await footprint(bob);

    const requested = await requestDeletion(alice, "ar");
    expect(requested.status).toBe(200);
    expect(await requested.json()).toEqual({ success: true, message: "Verification email sent" });
    const mail = await lastMail();
    expect(mail).toMatchObject({ kind: "delete-account", to: alice.email });
    expect(mail.subject).toBe("تأكيد حذف حسابك في جسر");
    expect(mail.url).toMatch(/^http:\/\/localhost:3000\/ar\/account\/delete#token=[0-9a-z]{32}$/);
    expect(mail.text).toContain(mail.url);
    expect(mail.text).not.toContain("/api/auth");

    const confirmed = await post(alice, "/delete-user", { token: tokenFrom(mail) });
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toEqual({ success: true, message: "User deleted" });
    const cleared = confirmed.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith("better-auth.session_token="));
    expect(cleared).toMatch(/^better-auth\.session_token=;/);
    expect(cleared).toMatch(/Max-Age=0/i);

    expect(await footprint(alice)).toEqual(
      Object.fromEntries(Object.keys(aliceBefore).map((key) => [key, 0])),
    );
    expect(await footprint(bob)).toEqual(bobBefore);
    expect(
      await scalar("select count(*) as count from verification where identifier in ($1, $2)", [
        "magic-link:look-alike",
        "magic-link:not-json",
      ]),
    ).toBe(2);
  });

  it("rejects the old session afterwards with a typed error", async () => {
    const requested = await requestDeletion(alice);
    expect(requested.status).toBe(200);
    expect((await post(alice, "/delete-user", { token: tokenFrom(await lastMail()) })).status).toBe(
      200,
    );

    const session = await get(alice, "/get-session");
    expect(session.status).toBe(200);
    expect(await session.json()).toBeNull();
    const again = await requestDeletion(alice);
    expect(again.status).toBe(401);
    expect(await again.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("does not need the current consent (ruling Q1)", async () => {
    await pool.query('update "user" set consent_version = $2 where id = $1', [
      alice.id,
      "2020-01-01",
    ]);
    expect((await requestDeletion(alice)).status).toBe(200);
    expect((await post(alice, "/delete-user", { token: tokenFrom(await lastMail()) })).status).toBe(
      200,
    );
    expect((await footprint(alice)).user).toBe(0);
  });

  it("sweeps a sign-in link and cooldown written for the address while the deletion ran", async () => {
    const { getAuth } = await import("@/lib/auth/server");
    const deleteUser = getAuth().options.user?.deleteUser;
    const original = deleteUser?.beforeDelete;
    if (deleteUser === undefined || original === undefined) throw new Error("no beforeDelete");
    // A magic link asked for between the sweep before and the delete itself.
    vi.spyOn(deleteUser, "beforeDelete").mockImplementation(async (user) => {
      await original(user);
      await insertVerification(
        "magic-link:during-delete",
        JSON.stringify({ type: "magic-link", email: alice.email, name: "" }),
      );
      await pool.query(
        "insert into email_cooldowns (email, kind, last_sent_at) values ($1, 'magic-link', now()) on conflict do nothing",
        [alice.email],
      );
    });
    expect((await requestDeletion(alice)).status).toBe(200);
    expect((await post(alice, "/delete-user", { token: tokenFrom(await lastMail()) })).status).toBe(
      200,
    );
    expect(await footprint(alice)).toMatchObject({ verificationByEmail: 0, emailCooldowns: 0 });
  });
});

describe("a refused confirmation deletes nothing", () => {
  let alice: Student;
  let bob: Student;

  beforeAll(async () => {
    alice = await signUp("alice");
    bob = await signUp("bob");
    await seed(alice);
    await seed(bob);
  }, TIMEOUT_MS);

  it("a garbage token is INVALID_TOKEN", async () => {
    const before = [await footprint(alice), await footprint(bob)];
    const response = await post(alice, "/delete-user", { token: "garbage" });
    expect(response.status).toBe(404);
    expect(response.headers.getSetCookie().join("\n")).not.toContain("session_token=;");
    expect(await response.json()).toMatchObject({ code: "INVALID_TOKEN" });
    expect([await footprint(alice), await footprint(bob)]).toEqual(before);
  });

  it("an expired token is INVALID_TOKEN (Better Auth consumes the expired row itself)", async () => {
    const before = [await footprint(alice), await footprint(bob)];
    await insertVerification(
      "delete-account-expiredtoken",
      alice.id,
      new Date(Date.now() - 60_000),
    );
    const response = await post(alice, "/delete-user", { token: "expiredtoken" });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "INVALID_TOKEN" });
    expect([await footprint(alice), await footprint(bob)]).toEqual(before);
  });

  it("another student's token is INVALID_TOKEN for this session", async () => {
    await insertVerification("delete-account-alicestoken", alice.id);
    const before = [await footprint(alice), await footprint(bob)];
    const response = await post(bob, "/delete-user", { token: "alicestoken" });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "INVALID_TOKEN" });
    const after = [await footprint(alice), await footprint(bob)];
    // The one change is the consumed token row itself.
    expect(after).toEqual([
      { ...before[0], verificationById: (before[0]?.verificationById ?? 0) - 1 },
      before[1],
    ]);
  });

  it("without a session the confirmation is UNAUTHORIZED", async () => {
    await insertVerification("delete-account-nosession", alice.id);
    const before = await footprint(alice);
    const response = await post(null, "/delete-user", { token: "nosession" });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "UNAUTHORIZED" });
    expect(await footprint(alice)).toEqual(before);
  });

  it("the GET callback never deletes, even with the session and a valid token (ruling Q2)", async () => {
    await insertVerification("delete-account-viaget", alice.id);
    const before = await footprint(alice);
    const response = await get(alice, "/delete-user/callback?token=viaget&callbackURL=%2F");
    expect(response.status).toBe(404);
    expect(await footprint(alice)).toEqual(before);
  });

  it("while accounts are off the route refuses with ACCOUNTS_DISABLED", async () => {
    await insertVerification("delete-account-flagoff", alice.id);
    const before = await footprint(alice);
    vi.stubEnv("ACCOUNTS_ENABLED", "false");
    const response = await post(alice, "/delete-user", { token: "flagoff" });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "ACCOUNTS_DISABLED" });
    expect(await footprint(alice)).toEqual(before);
  });

  it("while accounts are off a server-side call refuses too, after the token check", async () => {
    await insertVerification("delete-account-serverside", alice.id);
    const { getAuth } = await import("@/lib/auth/server");
    const auth = getAuth();
    const headers = new Headers({ cookie: alice.cookie, origin: ORIGIN });
    const before = await footprint(alice);
    vi.stubEnv("ACCOUNTS_ENABLED", "false");
    await expect(
      auth.api.deleteUser({ body: { token: "serverside" }, headers }),
    ).rejects.toMatchObject({ body: { code: "ACCOUNTS_DISABLED" } });
    // Only the consumed token row is gone.
    expect(await footprint(alice)).toEqual({
      ...before,
      verificationById: (before.verificationById ?? 0) - 1,
    });
  });
});

describe("requesting the email", () => {
  it("answers 'sent' but writes no second mail inside the cooldown (UX note for todo 20)", async () => {
    const carol = await signUp("carol");
    expect((await requestDeletion(carol)).status).toBe(200);
    const sent = (await mails()).length;
    const second = await requestDeletion(carol);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ success: true, message: "Verification email sent" });
    expect((await mails()).length).toBe(sent);
  });

  it("writes a deletion token that expires one hour after it is issued", async () => {
    const erin = await signUp("erin");
    const before = Date.now();
    expect((await requestDeletion(erin)).status).toBe(200);
    const after = Date.now();
    const { rows } = await pool.query<{ ms: string }>(
      `select extract(epoch from expires_at) * 1000 as ms from verification
       where identifier like 'delete-account-%' and value = $1`,
      [erin.id],
    );
    expect(rows).toHaveLength(1);
    const expiresMs = Number(rows[0]?.ms);
    expect(expiresMs).toBeGreaterThanOrEqual(before + 3_600_000 - 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + 3_600_000 + 1000);
  });

  it("falls back to French for a callback URL without a known locale", async () => {
    const dan = await signUp("dan");
    expect((await post(dan, "/delete-user", { callbackURL: "/" })).status).toBe(200);
    const mail = await lastMail();
    expect(mail.url).toMatch(/^http:\/\/localhost:3000\/fr\/account\/delete#token=/);
    expect(mail.subject).toBe("Confirmez la suppression de votre compte Jisr");
  });

  it("refuses without a session", async () => {
    const response = await post(null, "/delete-user", { callbackURL: "/fr/account/delete" });
    expect(response.status).toBe(401);
  });
});

describe("sessions", () => {
  it("store no device information and no IP (ruling Q3)", async () => {
    const erin = await signUp("erin");
    const { rows } = await pool.query<{ user_agent: string | null; ip_address: string | null }>(
      "select user_agent, ip_address from session where user_id = $1",
      [erin.id],
    );
    expect(rows).toEqual([{ user_agent: null, ip_address: null }]);
  });
});
