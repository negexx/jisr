import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_CONSENT_VERSION } from "@/lib/auth/consent";

// The Google path end to end through the real Better Auth instance on PGlite: /sign-in/social
// stores the OAuth state (with the client's additionalData) in the verification table, then
// /callback/google parses it back and creates the user. Only the code-for-token exchange with
// Google is replaced, by a spy on the provider that returns an unsigned ID token; the provider's
// own getUserInfo decodes it, so nothing contacts Google.

const TIMEOUT_MS = 60_000;
const ORIGIN = "http://localhost:3000";
const GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = "test-google-client-secret";
const LANDING = "/fr/welcome";

vi.mock("@/lib/server/email", () => ({ sendAuthEmail: async () => {} }));

type AuthModule = typeof import("@/lib/auth/server");

let testDb: TestDatabase;
let pool: Pool;
let auth: ReturnType<AuthModule["getAuth"]>;
let closeAppPool: () => Promise<void>;

type UserRow = { email: string; consent_version: string | null; consented_at: Date | null };

async function users(): Promise<UserRow[]> {
  const { rows } = await pool.query<UserRow>(
    'select email, consent_version, consented_at from "user" order by email',
  );
  return rows;
}

async function count(table: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(`select count(*) as count from "${table}"`);
  return Number(rows[0]?.count);
}

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function unsignedIdToken(email: string, emailVerified: boolean): string {
  const nowS = Math.floor(Date.now() / 1000);
  const claims = {
    iss: "https://accounts.google.com",
    aud: GOOGLE_CLIENT_ID,
    sub: `google-sub-${email}`,
    email,
    email_verified: emailVerified,
    name: "Student",
    iat: nowS,
    exp: nowS + 3600,
  };
  return `${base64url({ alg: "RS256", typ: "JWT" })}.${base64url(claims)}.signature`;
}

async function googleProvider() {
  const context = await auth.$context;
  const provider = context.socialProviders.find((candidate) => candidate.id === "google");
  if (!provider) throw new Error("the google provider is not registered");
  return provider;
}

const RAW_ACCESS_TOKEN = "test-access-token";
const RAW_REFRESH_TOKEN = "test-refresh-token";

async function stubGoogleTokenExchange(email: string, emailVerified = true): Promise<void> {
  const provider = await googleProvider();
  vi.spyOn(provider, "validateAuthorizationCode").mockResolvedValue({
    tokenType: "Bearer",
    accessToken: RAW_ACCESS_TOKEN,
    refreshToken: RAW_REFRESH_TOKEN,
    idToken: unsignedIdToken(email, emailVerified),
  });
}

async function insertPending(email: string, consentVersion: string): Promise<void> {
  await pool.query(
    "insert into pending_signups (email, age_confirmed, consent_version, consented_at, expires_at) values ($1, true, $2, now(), $3)",
    [email, consentVersion, new Date(Date.now() + 60 * 60 * 1000)],
  );
}

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

type Started = { state: string; cookie: string };

async function startGoogleSignIn(additionalData?: Record<string, unknown>): Promise<Started> {
  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: LANDING, additionalData }),
    }),
  );
  expect(response.status).toBe(200);
  const { url } = (await response.json()) as { url: string };
  const state = new URL(url).searchParams.get("state");
  if (state === null) throw new Error("the authorization URL carries no state");
  return { state, cookie: cookieHeader(response) };
}

async function finishGoogleSignIn({ state, cookie }: Started): Promise<Response> {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth/callback/google?code=test-code&state=${state}`, {
      method: "GET",
      headers: { cookie },
    }),
  );
}

// Returns the error code Better Auth put on the redirect, or null for a successful sign-in.
async function signInWithGoogle(
  email: string,
  additionalData?: Record<string, unknown>,
  emailVerified = true,
): Promise<string | null> {
  await stubGoogleTokenExchange(email, emailVerified);
  const response = await finishGoogleSignIn(await startGoogleSignIn(additionalData));
  expect(response.status).toBe(302);
  const location = new URL(response.headers.get("location") ?? "", ORIGIN);
  const error = location.searchParams.get("error");
  if (error === null) expect(location.pathname).toBe(LANDING);
  return error;
}

beforeAll(async () => {
  testDb = await startTestDatabase({ port: 0 });
  pool = new Pool({ connectionString: testDb.databaseUrl });
  process.env.DATABASE_URL = testDb.databaseUrl;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
  process.env.BETTER_AUTH_URL = ORIGIN;
  process.env.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = GOOGLE_CLIENT_SECRET;
  auth = (await import("@/lib/auth/server")).getAuth();
  const { db } = await import("@/db");
  closeAppPool = () => db.$client.end();
}, TIMEOUT_MS);

beforeEach(async () => {
  await pool.query("delete from account");
  await pool.query('delete from "user"');
  await pool.query("delete from verification");
  await pool.query("delete from session");
  await pool.query("delete from pending_signups");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await closeAppPool?.();
  await pool?.end();
  await testDb?.stop();
}, TIMEOUT_MS);

describe("google provider config", () => {
  it("reads the client id and secret from env and the base URL explicitly", () => {
    const google = auth.options.socialProviders?.google;
    expect(google?.clientId).toBe(GOOGLE_CLIENT_ID);
    expect(google?.clientSecret).toBe(GOOGLE_CLIENT_SECRET);
    expect(auth.options.baseURL).toBe(ORIGIN);
  });

  it("registers Google as the only social provider", () => {
    expect(Object.keys(auth.options.socialProviders ?? {})).toEqual(["google"]);
  });

  it("sends Google the callback route under the explicit base URL", async () => {
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    const response = await auth.handler(
      new Request(`${ORIGIN}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL: LANDING }),
      }),
    );
    const { url } = (await response.json()) as { url: string };
    const authorization = new URL(url);
    expect(authorization.origin).toBe("https://accounts.google.com");
    expect(authorization.searchParams.get("client_id")).toBe(GOOGLE_CLIENT_ID);
    expect(authorization.searchParams.get("redirect_uri")).toBe(
      `${ORIGIN}/api/auth/callback/google`,
    );
  });
});

describe("google sign-up admission", () => {
  beforeEach(() => {
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
  });

  it("creates the user with the current consent version stamped by the server clock", async () => {
    const before = Date.now();
    const error = await signInWithGoogle("new@example.com", {
      ageConfirmed: true,
      consentVersion: CURRENT_CONSENT_VERSION,
      consentedAt: "2020-01-01T00:00:00.000Z",
    });
    const after = Date.now();
    expect(error).toBeNull();
    const rows = await users();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.consent_version).toBe(CURRENT_CONSENT_VERSION);
    // The column is a timestamp without time zone written as UTC by the app pool; node-postgres
    // would read it back in the machine's zone, so compare epoch milliseconds computed in SQL.
    const { rows: stamped } = await pool.query<{ ms: string }>(
      'select extract(epoch from consented_at) * 1000 as ms from "user"',
    );
    const consentedAt = Number(stamped[0]?.ms);
    expect(consentedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(consentedAt).toBeLessThanOrEqual(after + 1000);
  });

  it.each<[string, Record<string, unknown> | undefined]>([
    ["no additionalData at all", undefined],
    ["a missing ageConfirmed", { consentVersion: CURRENT_CONSENT_VERSION }],
    ["ageConfirmed false", { ageConfirmed: false, consentVersion: CURRENT_CONSENT_VERSION }],
    [
      'ageConfirmed as the string "true"',
      { ageConfirmed: "true", consentVersion: CURRENT_CONSENT_VERSION },
    ],
  ])("creates no user for %s", async (_label, additionalData) => {
    expect(await signInWithGoogle("new@example.com", additionalData)).toBe("AGE_NOT_CONFIRMED");
    expect(await count("user")).toBe(0);
    expect(await count("account")).toBe(0);
    expect(await count("session")).toBe(0);
  });

  it.each<[string, unknown]>([
    ["an older version", "2026-01-01"],
    ["an unknown version", "tampered"],
    ["a non-string version", 20261014],
  ])("creates the user with NULL consent (gated, never stamped) for %s", async (_label, version) => {
    expect(
      await signInWithGoogle("new@example.com", { ageConfirmed: true, consentVersion: version }),
    ).toBeNull();
    expect(await users()).toEqual([
      { email: "new@example.com", consent_version: null, consented_at: null },
    ]);
  });

  it("cannot be steered by additionalData keys that shadow Better Auth's state", async () => {
    const started = await startGoogleSignIn({
      ageConfirmed: true,
      consentVersion: CURRENT_CONSENT_VERSION,
      callbackURL: "https://evil.example/steal",
      serverContext: { ageConfirmed: true },
    });
    await stubGoogleTokenExchange("new@example.com");
    const response = await finishGoogleSignIn(started);
    expect(new URL(response.headers.get("location") ?? "", ORIGIN).pathname).toBe(LANDING);
  });

  it("does not create, re-stamp or alter consent when Google matches an existing user", async () => {
    // Better Auth 1.7 links a Google account to an existing user with the same verified email
    // by default; the create hook does not run, so the finish-signup gate must handle consent.
    await pool.query(
      `insert into "user" (id, name, email, email_verified, consent_version, consented_at)
       values ('existing', 'Student', 'known@example.com', true, '2026-01-01', '2026-01-02')`,
    );
    expect(
      await signInWithGoogle("known@example.com", {
        ageConfirmed: true,
        consentVersion: CURRENT_CONSENT_VERSION,
      }),
    ).toBeNull();
    expect(await count("user")).toBe(1);
    expect((await users())[0]?.consent_version).toBe("2026-01-01");
    const { rows } = await pool.query<{ user_id: string; provider_id: string }>(
      "select user_id, provider_id from account",
    );
    expect(rows).toEqual([{ user_id: "existing", provider_id: "google" }]);
  });

  it("ignores a current pending row for the Google email when the OAuth state has no evidence", async () => {
    // A pending row is typed by whoever submitted the signup form, possibly not the owner.
    await insertPending("new@example.com", CURRENT_CONSENT_VERSION);
    expect(await signInWithGoogle("new@example.com")).toBe("AGE_NOT_CONFIRMED");
    expect(await count("user")).toBe(0);
    expect(await count("account")).toBe(0);
  });

  it("does not let a pending row stamp consent the OAuth state lacks", async () => {
    await insertPending("new@example.com", CURRENT_CONSENT_VERSION);
    expect(await signInWithGoogle("new@example.com", { ageConfirmed: true })).toBeNull();
    expect(await users()).toEqual([
      { email: "new@example.com", consent_version: null, consented_at: null },
    ]);
  });

  it.each([
    ["Google's ID-token sign-in", { path: "/sign-in/social" }],
    ["a server call with no request context", null],
  ])("rejects a create from %s even with a current pending row", async (_label, ctx) => {
    await insertPending("new@example.com", CURRENT_CONSENT_VERSION);
    const before = auth.options.databaseHooks?.user?.create?.before;
    if (!before) throw new Error("the create.before gate hook is not registered");
    await expect(
      before(
        { email: "new@example.com", name: "Student", emailVerified: true } as never,
        ctx as never,
      ),
    ).rejects.toMatchObject({ status: "BAD_REQUEST", body: { code: "AGE_NOT_CONFIRMED" } });
    expect(await count("user")).toBe(0);
  });

  it("rejects the callback path uniformly when no OAuth state is in scope", async () => {
    const before = auth.options.databaseHooks?.user?.create?.before;
    if (!before) throw new Error("the create.before gate hook is not registered");
    await expect(
      before(
        { email: "new@example.com", name: "Student", emailVerified: true } as never,
        { path: "/callback/:id" } as never,
      ),
    ).rejects.toMatchObject({ status: "BAD_REQUEST", body: { code: "AGE_NOT_CONFIRMED" } });
  });

  it("creates no user for a Google identity whose email is not verified", async () => {
    const error = await signInWithGoogle(
      "new@example.com",
      { ageConfirmed: true, consentVersion: CURRENT_CONSENT_VERSION },
      false,
    );
    expect(error).toBe("OAUTH_EMAIL_NOT_VERIFIED");
    expect(await count("user")).toBe(0);
    expect(await count("account")).toBe(0);
  });

  it("never stores the Google ID token, on sign-up or on a repeat sign-in", async () => {
    const evidence = { ageConfirmed: true, consentVersion: CURRENT_CONSENT_VERSION };
    const idTokens = async () =>
      (await pool.query<{ id_token: string | null }>("select id_token from account")).rows;

    expect(await signInWithGoogle("new@example.com", evidence)).toBeNull();
    expect(await idTokens()).toEqual([{ id_token: null }]);

    // The second sign-in finds the linked account and updates its tokens (the update path).
    vi.restoreAllMocks();
    expect(await signInWithGoogle("new@example.com", evidence)).toBeNull();
    expect(await idTokens()).toEqual([{ id_token: null }]);
    expect(await count("user")).toBe(1);
    expect(await count("session")).toBe(2);
  });

  it("stores the Google access and refresh tokens encrypted", async () => {
    expect(
      await signInWithGoogle("new@example.com", {
        ageConfirmed: true,
        consentVersion: CURRENT_CONSENT_VERSION,
      }),
    ).toBeNull();
    const { rows } = await pool.query<{ access_token: string; refresh_token: string }>(
      "select access_token, refresh_token from account",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.access_token).toBeTruthy();
    expect(rows[0]?.access_token).not.toContain(RAW_ACCESS_TOKEN);
    expect(rows[0]?.refresh_token).toBeTruthy();
    expect(rows[0]?.refresh_token).not.toContain(RAW_REFRESH_TOKEN);
  });
});

describe("google sign-up with the accounts switch off", () => {
  it("refuses the callback of a flow started while on and creates nothing", async () => {
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    await stubGoogleTokenExchange("new@example.com");
    const started = await startGoogleSignIn({
      ageConfirmed: true,
      consentVersion: CURRENT_CONSENT_VERSION,
    });
    vi.stubEnv("ACCOUNTS_ENABLED", "");
    const response = await finishGoogleSignIn(started);
    expect(response.status).toBe(403);
    expect(await count("user")).toBe(0);
    expect(await count("account")).toBe(0);
  });

  it("refuses to start a Google sign-in", async () => {
    vi.stubEnv("ACCOUNTS_ENABLED", "");
    const response = await auth.handler(
      new Request(`${ORIGIN}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL: LANDING }),
      }),
    );
    expect(response.status).toBe(403);
    expect(await count("verification")).toBe(0);
  });
});
