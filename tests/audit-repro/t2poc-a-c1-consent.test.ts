import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CURRENT_CONSENT_VERSION } from "@/lib/auth/consent";
import type { SignInLinkRequest } from "@/lib/server/signup";

// PoC A / C1 — self-asserted consent and age evidence.
//
// A crafted, unauthenticated POST /api/auth/sign-in/social with `additionalData` is the ONLY thing
// that ends up as the user's consent record: the flags ride the OAuth state into the create hook and
// stamp consent_version/consented_at on the new row. The Google code-for-token exchange is the only
// thing stubbed (spy on the provider, per tests/lib/auth/google.test.ts); nothing contacts Google and
// only reserved @example.org addresses are used. The magic-link twin shows the same self-assertion:
// requestSignInLink writes the pending row's values from the request's own booleans.

const TIMEOUT_MS = 60_000;
const ORIGIN = "http://localhost:3000";
const GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = "test-google-client-secret";
const LANDING = "/fr/welcome";

const io = vi.hoisted(() => ({ requestHeaders: new Headers() }));

vi.mock("next/headers", () => ({ headers: async () => io.requestHeaders }));

vi.mock("@/lib/server/email", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/email")>();
  return { ...original, sendAuthEmail: async () => {} };
});

type AuthModule = typeof import("@/lib/auth/server");
type SignupModule = typeof import("@/lib/server/signup");

let testDb: TestDatabase;
let pool: Pool;
let auth: ReturnType<AuthModule["getAuth"]>;
let requestSignInLink: SignupModule["requestSignInLink"];
let closeAppPool: () => Promise<void>;

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

async function stubGoogleTokenExchange(email: string, emailVerified = true): Promise<void> {
  const provider = await googleProvider();
  vi.spyOn(provider, "validateAuthorizationCode").mockResolvedValue({
    tokenType: "Bearer",
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    idToken: unsignedIdToken(email, emailVerified),
  });
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

async function oauthStateRows(): Promise<{ identifier: string; value: string }[]> {
  const { rows } = await pool.query<{ identifier: string; value: string }>(
    "select identifier, value from verification where identifier like 'auth-state:%' order by identifier",
  );
  return rows;
}

function request(overrides: Partial<SignInLinkRequest> = {}): SignInLinkRequest {
  return {
    email: "self-asserted-ml@example.org",
    consent: true,
    ageConfirmed: true,
    locale: "fr",
    returnPath: "/fr/welcome",
    ...overrides,
  };
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
  ({ requestSignInLink } = await import("@/lib/server/signup"));
  const { db } = await import("@/db");
  closeAppPool = () => db.$client.end();
}, TIMEOUT_MS);

beforeEach(async () => {
  vi.stubEnv("ACCOUNTS_ENABLED", "true");
  io.requestHeaders = new Headers({ origin: ORIGIN });
  for (const table of ["session", "account", "user", "verification", "pending_signups"]) {
    await pool.query(`delete from "${table}"`);
  }
  await pool.query("delete from email_cooldowns");
  await pool.query("delete from auth_email_days");
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

describe("C1 — Google: crafted additionalData is written into the OAuth state and stamps the user", () => {
  it("stores the client's own consent booleans in the auth-state row, then stamps the created user", async () => {
    await stubGoogleTokenExchange("self-asserted@example.org");
    const started = await startGoogleSignIn({
      ageConfirmed: true,
      consentVersion: CURRENT_CONSENT_VERSION,
    });

    // (i) The state row carries the crafted flags at its top level (spread from additionalData).
    const states = await oauthStateRows();
    expect(states).toHaveLength(1);
    const stored = JSON.parse(states[0]?.value ?? "{}") as Record<string, unknown>;
    expect(stored.ageConfirmed).toBe(true);
    expect(stored.consentVersion).toBe(CURRENT_CONSENT_VERSION);

    // (ii) Completing the callback creates the user and stamps the consent, with no form/notice shown.
    const response = await finishGoogleSignIn(started);
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "", ORIGIN);
    expect(location.searchParams.get("error")).toBeNull();
    expect(location.pathname).toBe(LANDING);

    const { rows } = await pool.query<{
      email: string;
      consent_version: string | null;
      has_consented_at: boolean;
    }>(
      `select email, consent_version, (consented_at is not null) as has_consented_at
       from "user" order by email`,
    );
    expect(rows).toEqual([
      {
        email: "self-asserted@example.org",
        consent_version: CURRENT_CONSENT_VERSION,
        has_consented_at: true,
      },
    ]);
  });

  it("is self-inflicted only: without the initiator's state cookie the same callback is refused", async () => {
    await stubGoogleTokenExchange("self-asserted@example.org");
    const started = await startGoogleSignIn({
      ageConfirmed: true,
      consentVersion: CURRENT_CONSENT_VERSION,
    });
    const response = await auth.handler(
      new Request(`${ORIGIN}/api/auth/callback/google?code=test-code&state=${started.state}`, {
        method: "GET",
      }),
    );
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "", ORIGIN);
    expect(location.searchParams.get("error")).not.toBeNull();
    expect(await count("user")).toBe(0);
  });
});

describe("C1 — magic-link twin: requestSignInLink hardcodes the request's own booleans", () => {
  it("writes the pending row with ageConfirmed true and the current consent version", async () => {
    expect(await requestSignInLink(request())).toEqual({ ok: true });
    const { rows } = await pool.query<{
      email: string;
      age_confirmed: boolean;
      consent_version: string | null;
      has_consented_at: boolean;
    }>(
      `select email, age_confirmed, consent_version, (consented_at is not null) as has_consented_at
       from pending_signups`,
    );
    expect(rows).toEqual([
      {
        email: "self-asserted-ml@example.org",
        age_confirmed: true,
        consent_version: CURRENT_CONSENT_VERSION,
        has_consented_at: true,
      },
    ]);
  });

  it("writes nothing when the request's own boolean is false (the boolean is the whole gate)", async () => {
    expect(await requestSignInLink(request({ consent: false }))).toEqual({
      ok: false,
      error: "confirmation_required",
    });
    expect(await count("pending_signups")).toBe(0);
  });
});
