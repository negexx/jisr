import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CURRENT_CONSENT_VERSION } from "@/lib/auth/consent";
import type { SignInLinkRequest } from "@/lib/server/signup";

import { confirmRequest, cookieOf } from "../support/magic-link";

// The signup surface's server side end to end on PGlite: the Server Action writes the pending row,
// the real auth instance claims the cooldown slot and sends through the real file transport, and
// following the emailed link creates the user. Only the request headers are stubbed (no Next
// request scope in Vitest) and the mail directory is a temp folder instead of tests/e2e/.mail.

const TIMEOUT_MS = 60_000;
const ORIGIN = "http://localhost:3000";

const io = vi.hoisted(() => ({
  mailDir: "",
  requestHeaders: new Headers(),
  pendingRowsAtSend: [] as number[],
  countPending: async (): Promise<number> => 0,
}));

vi.mock("next/headers", () => ({ headers: async () => io.requestHeaders }));

vi.mock("@/lib/server/email", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/email")>();
  return {
    ...original,
    sendAuthEmail: async (request: Parameters<typeof original.sendAuthEmail>[0]) => {
      io.pendingRowsAtSend.push(await io.countPending());
      await original.sendAuthEmail(request, { mailDir: io.mailDir });
    },
  };
});

type SignupModule = typeof import("@/lib/server/signup");
type SessionModule = typeof import("@/lib/server/session");
type ConsentModule = typeof import("@/lib/server/consent");
type AuthModule = typeof import("@/lib/auth/server");

let testDb: TestDatabase;
let pool: Pool;
let auth: ReturnType<AuthModule["getAuth"]>;
let requestSignInLink: SignupModule["requestSignInLink"];
let requireAccountReady: SessionModule["requireAccountReady"];
let acceptCurrentConsent: ConsentModule["acceptCurrentConsent"];
let closeAppPool: () => Promise<void>;

async function count(table: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(`select count(*) as count from "${table}"`);
  return Number(rows[0]?.count);
}

type MailRecord = { kind: string; to: string; url: string; text: string };

async function mails(): Promise<MailRecord[]> {
  const files = (await readdir(io.mailDir).catch(() => [])).sort();
  return Promise.all(
    files.map(async (file) => JSON.parse(await readFile(join(io.mailDir, file), "utf8"))),
  );
}

async function lastLink(): Promise<string> {
  const url = (await mails()).at(-1)?.url;
  if (url === undefined) throw new Error("no magic-link mail was written");
  return url;
}

function request(overrides: Partial<SignInLinkRequest> = {}): SignInLinkRequest {
  return {
    email: "new@example.com",
    consent: true,
    ageConfirmed: true,
    locale: "fr",
    returnPath: "/fr/plan",
    ...overrides,
  };
}

async function requestDirectLink(email: string): Promise<void> {
  await auth.api.signInMagicLink({
    body: { email, callbackURL: "/fr/welcome" },
    headers: io.requestHeaders,
  });
}

// Follows an emailed link the way a browser does: the link opens the confirm page, whose button posts
// the token from the fragment (todo 28, F3). `error` is the refusal code, null on success.
async function follow(link: string): Promise<{ error: string | null; cookie: string }> {
  const response = await auth.handler(confirmRequest(link));
  if (response.status === 200) return { error: null, cookie: cookieOf(response) };
  expect(response.status).toBe(400);
  const body: { code?: string } = await response.json();
  return { error: body.code ?? null, cookie: "" };
}

function signedInAs(cookie: string): void {
  io.requestHeaders = new Headers({ cookie, origin: ORIGIN });
}

beforeAll(async () => {
  testDb = await startTestDatabase({ port: 0 });
  pool = new Pool({ connectionString: testDb.databaseUrl });
  process.env.DATABASE_URL = testDb.databaseUrl;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
  process.env.BETTER_AUTH_URL = ORIGIN;
  io.countPending = () => count("pending_signups");
  auth = (await import("@/lib/auth/server")).getAuth();
  ({ requestSignInLink } = await import("@/lib/server/signup"));
  ({ requireAccountReady } = await import("@/lib/server/session"));
  ({ acceptCurrentConsent } = await import("@/lib/server/consent"));
  const { db } = await import("@/db");
  closeAppPool = () => db.$client.end();
}, TIMEOUT_MS);

beforeEach(async () => {
  io.mailDir = await mkdtemp(join(tmpdir(), "jisr-signup-mail-"));
  io.requestHeaders = new Headers({ origin: ORIGIN });
  io.pendingRowsAtSend = [];
  for (const table of ["session", "account", "user", "verification", "pending_signups"]) {
    await pool.query(`delete from "${table}"`);
  }
  await pool.query("delete from email_cooldowns");
  await pool.query("delete from request_throttles");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(io.mailDir, { recursive: true, force: true });
});

afterAll(async () => {
  await closeAppPool?.();
  await pool?.end();
  await testDb?.stop();
}, TIMEOUT_MS);

describe.each([
  ["unset", undefined],
  ["empty", ""],
  ["false", "false"],
])("requestSignInLink with ACCOUNTS_ENABLED %s", (_label, value) => {
  beforeEach(() => {
    vi.stubEnv("ACCOUNTS_ENABLED", value);
  });

  it("refuses a request and processes nothing", async () => {
    expect(await requestSignInLink(request())).toEqual({
      ok: false,
      error: "accounts_disabled",
    });
    expect(await count("pending_signups")).toBe(0);
    expect(await count("email_cooldowns")).toBe(0);
    expect(await count("verification")).toBe(0);
    expect(await mails()).toEqual([]);
  });

  it("refuses before looking at the input, even a malformed one", async () => {
    expect(await requestSignInLink({ nonsense: true } as never)).toEqual({
      ok: false,
      error: "accounts_disabled",
    });
  });

  it("reports no session and does not stamp consent", async () => {
    expect(await requireAccountReady()).toEqual({ ok: false, error: "unauthenticated" });
    expect(await acceptCurrentConsent()).toEqual({ ok: false, error: "accounts_disabled" });
  });
});

describe("requestSignInLink with accounts on", () => {
  beforeEach(() => {
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
  });

  it("writes the pending row with the server clock before it sends the link", async () => {
    const before = Date.now();
    expect(await requestSignInLink(request({ email: "  New@Example.COM " }))).toEqual({ ok: true });
    const after = Date.now();
    const { rows } = await pool.query<{
      email: string;
      consent_version: string;
      age_confirmed: boolean;
      consented_ms: string;
      ttl_s: string;
    }>(
      `select email, consent_version, age_confirmed,
              extract(epoch from consented_at) * 1000 as consented_ms,
              extract(epoch from (expires_at - consented_at)) as ttl_s
       from pending_signups`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: "new@example.com",
      consent_version: CURRENT_CONSENT_VERSION,
      age_confirmed: true,
    });
    expect(Number(rows[0]?.consented_ms)).toBeGreaterThanOrEqual(before);
    expect(Number(rows[0]?.consented_ms)).toBeLessThanOrEqual(after);
    expect(Number(rows[0]?.ttl_s)).toBe(15 * 60);
    expect(io.pendingRowsAtSend).toEqual([1]);
    const sent = await mails();
    expect(sent.map((mail) => [mail.kind, mail.to])).toEqual([["magic-link", "new@example.com"]]);
  });

  it("emails a link to the confirm page that carries the return path in its fragment", async () => {
    await requestSignInLink(request({ locale: "ar", returnPath: "/ar/compare" }));
    const link = new URL(await lastLink());
    expect(link.pathname).toBe("/ar/sign-in/confirm");
    expect(link.search).toBe("");
    expect(new URLSearchParams(link.hash.slice(1)).get("return")).toBe("/ar/compare");
    expect((await mails())[0]?.text).toContain("جسر");
  });

  it("creates the user with the current consent when the link is followed", async () => {
    await requestSignInLink(request());
    const { error, cookie } = await follow(await lastLink());
    expect(error).toBeNull();
    const { rows } = await pool.query<{ consent_version: string | null }>(
      'select consent_version from "user"',
    );
    expect(rows).toEqual([{ consent_version: CURRENT_CONSENT_VERSION }]);
    signedInAs(cookie);
    const ready = await requireAccountReady();
    expect(ready.ok).toBe(true);
  });

  it.each<[string, Partial<SignInLinkRequest>]>([
    ["consent unticked", { consent: false }],
    ["age unticked", { ageConfirmed: false }],
    ["both unticked", { consent: false, ageConfirmed: false }],
  ])("refuses a signup with %s and writes nothing", async (_label, overrides) => {
    expect(await requestSignInLink(request(overrides))).toEqual({
      ok: false,
      error: "confirmation_required",
    });
    expect(await count("pending_signups")).toBe(0);
    expect(await count("email_cooldowns")).toBe(0);
    expect(await mails()).toEqual([]);
  });

  it.each([
    "",
    "not-an-address",
    "a@",
    `${"a".repeat(320)}@example.com`,
  ])("refuses the address %j without writing anything", async (email) => {
    expect(await requestSignInLink(request({ email }))).toEqual({
      ok: false,
      error: "invalid_email",
    });
    expect(await count("pending_signups")).toBe(0);
    expect(await mails()).toEqual([]);
  });

  it.each<[string, unknown]>([
    ["an unknown locale", { ...request(), locale: "de" }],
    ["a string consent", { ...request(), consent: "true" }],
    ["a missing field", { email: "new@example.com" }],
  ])("refuses %s as an invalid request", async (_label, input) => {
    expect(await requestSignInLink(input as SignInLinkRequest)).toEqual({
      ok: false,
      error: "invalid_request",
    });
    expect(await count("pending_signups")).toBe(0);
  });

  it("maps a second request inside the cooldown to a cooldown error, sending once", async () => {
    expect(await requestSignInLink(request())).toEqual({ ok: true });
    expect(await requestSignInLink(request())).toEqual({
      ok: false,
      error: "cooldown",
    });
    expect(await mails()).toHaveLength(1);
    expect(await count("verification")).toBe(2);
  });

  it("refuses a link with no signup intent for an unknown address, creating nothing", async () => {
    await requestDirectLink("unknown@example.com");
    expect(await count("pending_signups")).toBe(0);
    const { error } = await follow(await lastLink());
    expect(error).toBe("AGE_NOT_CONFIRMED");
    expect(await count("user")).toBe(0);
  });

  it("signs an existing user in through the form, writing the pending row and leaving consent untouched", async () => {
    await pool.query(
      `insert into "user" (id, name, email, email_verified, consent_version, consented_at)
       values ('existing', 'Student', 'known@example.com', true, '2026-01-01', '2026-01-02')`,
    );
    expect(await requestSignInLink(request({ email: "known@example.com" }))).toEqual({ ok: true });
    expect(await count("pending_signups")).toBe(1);
    const { error, cookie } = await follow(await lastLink());
    expect(error).toBeNull();
    signedInAs(cookie);
    expect(await requireAccountReady()).toEqual({ ok: false, error: "consent_required" });
    const { rows } = await pool.query<{ consent_version: string | null }>(
      `select consent_version from "user" where id = 'existing'`,
    );
    expect(rows).toEqual([{ consent_version: "2026-01-01" }]);
  });

  it("emails the sign-up wording for every form request", async () => {
    await requestSignInLink(request({ locale: "en" }));
    await requestSignInLink(request({ locale: "en", email: "other@example.com" }));
    const sent = await mails();
    expect(sent).toHaveLength(2);
    for (const mail of sent) {
      expect(mail.text).toMatch(/opening this link signs you in/i);
      expect(mail.text).toContain(CURRENT_CONSENT_VERSION);
    }
  });

  it("does not let a direct POST claim the sign-up wording through the metadata", async () => {
    const response = await auth.handler(
      new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({
          email: "forged@example.com",
          metadata: { locale: "en", mode: "signup" },
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect((await mails())[0]?.text).not.toMatch(/opening this link signs you in/i);
    expect(await count("pending_signups")).toBe(0);
  });

  it("writes no pending row for a signup the cooldown refuses", async () => {
    await requestDirectLink("new@example.com");
    expect(await count("pending_signups")).toBe(0);
    expect(await requestSignInLink(request())).toEqual({ ok: false, error: "cooldown" });
    expect(await count("pending_signups")).toBe(0);
  });

  it("does not refresh a planted pending row when the cooldown refuses the signup", async () => {
    await pool.query(
      `insert into pending_signups (email, consent_version, consented_at, age_confirmed, expires_at)
       values ('new@example.com', '2026-01-01', '2026-01-02T00:00:00Z', true, now() + interval '5 minutes')`,
    );
    await requestDirectLink("new@example.com");
    const before = await pool.query("select * from pending_signups");
    expect(await requestSignInLink(request())).toEqual({ ok: false, error: "cooldown" });
    const afterRows = await pool.query("select * from pending_signups");
    expect(afterRows.rows).toEqual(before.rows);
  });

  it("creates no user from an expired pending row", async () => {
    await requestSignInLink(request());
    await pool.query("update pending_signups set expires_at = now() - interval '1 second'");
    const { error } = await follow(await lastLink());
    expect(error).toBe("AGE_NOT_CONFIRMED");
    expect(await count("user")).toBe(0);
  });
});

describe("finish-signup gate on the server", () => {
  beforeEach(() => {
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
  });

  async function signUpUnder(version: string): Promise<string> {
    await requestSignInLink(request());
    await pool.query("update pending_signups set consent_version = $1", [version]);
    const { cookie } = await follow(await lastLink());
    signedInAs(cookie);
    return cookie;
  }

  it("holds a user created from a pending row of an older version until they consent", async () => {
    await signUpUnder("2026-01-01");
    const { rows } = await pool.query<{ consent_version: string | null }>(
      'select consent_version from "user"',
    );
    expect(rows).toEqual([{ consent_version: null }]);
    expect(await requireAccountReady()).toEqual({ ok: false, error: "consent_required" });

    const before = Date.now();
    expect(await acceptCurrentConsent()).toEqual({ ok: true });
    const ready = await requireAccountReady();
    expect(ready.ok).toBe(true);
    const { rows: stamped } = await pool.query<{ version: string; ms: string }>(
      'select consent_version as version, extract(epoch from consented_at) * 1000 as ms from "user"',
    );
    expect(stamped[0]?.version).toBe(CURRENT_CONSENT_VERSION);
    expect(Number(stamped[0]?.ms)).toBeGreaterThanOrEqual(before - 1000);
  });

  it("sends a user who consented to an older notice back through the gate", async () => {
    await signUpUnder(CURRENT_CONSENT_VERSION);
    expect((await requireAccountReady()).ok).toBe(true);
    await pool.query(`update "user" set consent_version = '2026-01-01'`);
    expect(await requireAccountReady()).toEqual({ ok: false, error: "consent_required" });
  });

  it("refuses to stamp consent without a session", async () => {
    await pool.query(
      `insert into "user" (id, name, email, email_verified) values ('u1', 'S', 'u1@example.com', true)`,
    );
    expect(await acceptCurrentConsent()).toEqual({ ok: false, error: "unauthenticated" });
    expect(await requireAccountReady()).toEqual({ ok: false, error: "unauthenticated" });
    const { rows } = await pool.query<{ consent_version: string | null }>(
      'select consent_version from "user"',
    );
    expect(rows).toEqual([{ consent_version: null }]);
  });

  it("stamps only the signed-in user's row", async () => {
    await pool.query(
      `insert into "user" (id, name, email, email_verified) values ('other', 'O', 'other@example.com', true)`,
    );
    await signUpUnder("2026-01-01");
    await acceptCurrentConsent();
    const { rows } = await pool.query<{ consent_version: string | null }>(
      `select consent_version from "user" where id = 'other'`,
    );
    expect(rows).toEqual([{ consent_version: null }]);
  });

  it("surfaces only the fixed error and logs no token-like content when the session lookup fails", async () => {
    const TOKEN = "tok_SECRET_session_0123456789";
    vi.spyOn(auth.api, "getSession").mockRejectedValue(
      new Error(`Failed query: select * from "session" where token = $1
params: ${TOKEN}`),
    );
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const failure = await acceptCurrentConsent().then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    const output = `${(failure as Error).message}${(failure as Error).stack ?? ""}${JSON.stringify(
      spies.flatMap((spy) => spy.mock.calls),
    )}`;
    expect(output).not.toContain(TOKEN);
    expect(output).not.toContain("session");
    expect(output).toContain("acceptCurrentConsent");
  });
});
