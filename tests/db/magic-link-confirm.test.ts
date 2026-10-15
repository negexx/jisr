import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CURRENT_CONSENT_VERSION } from "@/lib/auth/consent";
import type { SignInLinkRequest } from "@/lib/server/signup";

import {
  confirmRequest,
  cookieOf,
  MAGIC_LINK_CONFIRM_PATH,
  tokenOfLink,
} from "../support/magic-link";

// Todo 28, F3 (ruling Q16): the emailed sign-in link opens a page, and only the page's POST signs in.
// Better Auth's GET /magic-link/verify, which signs in whoever opens the URL (a mail scanner, or a
// victim sent an attacker's link) and puts the token in host request logs, is closed. End to end on
// PGlite through the real /api/auth route, the real Server Action and the real file transport.

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

type RouteModule = typeof import("@/app/api/auth/[...all]/route");
type SignupModule = typeof import("@/lib/server/signup");

let testDb: TestDatabase;
let pool: Pool;
let route: RouteModule;
let requestSignInLink: SignupModule["requestSignInLink"];
let closeAppPool: () => Promise<void>;

async function count(table: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(`select count(*) as count from "${table}"`);
  return Number(rows[0]?.count);
}

type Mail = { kind: string; to: string; url: string; text: string };

async function lastMail(): Promise<Mail> {
  const files = (await readdir(io.mailDir)).sort();
  const last = files.at(-1);
  if (last === undefined) throw new Error("no mail was written");
  return JSON.parse(await readFile(join(io.mailDir, last), "utf8"));
}

function request(overrides: Partial<SignInLinkRequest> = {}): SignInLinkRequest {
  return {
    mode: "signup",
    email: "new@example.com",
    consent: true,
    ageConfirmed: true,
    locale: "fr",
    returnPath: "/fr/compare",
    ...overrides,
  };
}

async function signupLink(overrides: Partial<SignInLinkRequest> = {}): Promise<string> {
  expect(await requestSignInLink(request(overrides))).toEqual({ ok: true });
  return (await lastMail()).url;
}

async function sessionOf(cookie: string): Promise<unknown> {
  const response = await route.GET(
    new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie } }),
  );
  return response.json();
}

beforeAll(async () => {
  testDb = await startTestDatabase({ port: 0 });
  pool = new Pool({ connectionString: testDb.databaseUrl });
  process.env.DATABASE_URL = testDb.databaseUrl;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
  process.env.BETTER_AUTH_URL = ORIGIN;
  route = await import("@/app/api/auth/[...all]/route");
  ({ requestSignInLink } = await import("@/lib/server/signup"));
  const { db } = await import("@/db");
  closeAppPool = () => db.$client.end();
}, TIMEOUT_MS);

beforeEach(async () => {
  vi.stubEnv("ACCOUNTS_ENABLED", "true");
  io.mailDir = await mkdtemp(join(tmpdir(), "jisr-confirm-mail-"));
  io.requestHeaders = new Headers({ origin: ORIGIN });
  for (const table of ["session", "account", "user", "verification", "pending_signups"]) {
    await pool.query(`delete from "${table}"`);
  }
  await pool.query("delete from email_cooldowns");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(io.mailDir, { recursive: true, force: true });
});

afterAll(async () => {
  await closeAppPool?.();
  await pool?.end();
  await testDb?.stop();
}, TIMEOUT_MS);

describe("the emailed link", () => {
  it("opens the confirm page with the token in the fragment and an empty query", async () => {
    const link = new URL(await signupLink({ locale: "ar", returnPath: "/ar/compare" }));
    expect(link.origin).toBe(ORIGIN);
    expect(link.pathname).toBe("/ar/sign-in/confirm");
    expect(link.search).toBe("");
    const fragment = new URLSearchParams(link.hash.slice(1));
    expect(fragment.get("token")).toMatch(/^[A-Za-z]{32}$/);
    expect(fragment.get("mode")).toBe("signup");
    expect(fragment.get("return")).toBe("/ar/compare");
    // The mail still goes out in the student's language, read from the request, not the link.
    expect((await lastMail()).text).toContain("جسر");
  });

  it("says signin for a sign-in request", async () => {
    const link = new URL(await signupLink({ mode: "signin", consent: false, ageConfirmed: false }));
    expect(new URLSearchParams(link.hash.slice(1)).get("mode")).toBe("signin");
  });

  it("opening the link alone signs nobody in: the page is static, the token never reaches the server", async () => {
    const link = await signupLink();
    expect(new URL(link).search).toBe("");
    expect(await count("user")).toBe(0);
    expect(await count("session")).toBe(0);
    expect(await count("verification")).toBe(1);
  });
});

describe("GET /magic-link/verify is closed", () => {
  it("answers 404 with a valid token, creates no session and leaves the token usable", async () => {
    const link = await signupLink();
    const token = tokenOfLink(link);
    const response = await route.GET(
      new Request(
        `${ORIGIN}/api/auth/magic-link/verify?token=${token}&callbackURL=${encodeURIComponent("/fr/welcome")}`,
      ),
    );
    expect(response.status).toBe(404);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await count("user")).toBe(0);
    expect(await count("session")).toBe(0);
    expect(await count("verification")).toBe(1);
    // Still usable through the page.
    expect((await route.POST(confirmRequest(link))).status).toBe(200);
  });

  it("refuses a server-side call too", async () => {
    const link = await signupLink();
    const { getAuth } = await import("@/lib/auth/server");
    await expect(
      getAuth().api.magicLinkVerify({
        query: { token: tokenOfLink(link) },
        headers: new Headers({ origin: ORIGIN }),
      }),
    ).rejects.toMatchObject({ status: "NOT_FOUND" });
    expect(await count("verification")).toBe(1);
  });
});

describe("POST /magic-link/confirm", () => {
  it("signs in with a valid token, runs the admission gate and consumes the token", async () => {
    const link = await signupLink();
    const response = await route.POST(confirmRequest(link));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: true });
    expect(response.headers.get("cache-control")).toContain("no-store");
    const cookie = cookieOf(response);
    expect(cookie).toMatch(/better-auth\.session_token=/);
    const { rows } = await pool.query<{ consent_version: string | null; email: string }>(
      'select email, consent_version from "user"',
    );
    expect(rows).toEqual([{ email: "new@example.com", consent_version: CURRENT_CONSENT_VERSION }]);
    expect(await count("verification")).toBe(0);
    expect(await sessionOf(cookie)).toMatchObject({ user: { email: "new@example.com" } });
  });

  it("stores no IP address and no user agent on the session it creates", async () => {
    const link = await signupLink();
    const response = await route.POST(
      confirmRequest(link, { "x-forwarded-for": "203.0.113.7", "user-agent": "SENTINEL/1.0" }),
    );
    expect(response.status).toBe(200);
    const { rows } = await pool.query<{ ip: string | null; ua: string | null }>(
      "select ip_address as ip, user_agent as ua from session",
    );
    expect(rows).toHaveLength(1);
    expect([null, ""]).toContain(rows[0]?.ip);
    expect([null, ""]).toContain(rows[0]?.ua);
  });

  it("signs an existing account in from a signin link without touching its consent", async () => {
    await pool.query(
      `insert into "user" (id, name, email, email_verified, consent_version, consented_at)
       values ('existing', 'Student', 'known@example.com', true, '2026-01-01', '2026-01-02')`,
    );
    const link = await signupLink({ mode: "signin", email: "known@example.com", consent: false });
    const response = await route.POST(confirmRequest(link));
    expect(response.status).toBe(200);
    const { rows } = await pool.query<{ consent_version: string | null }>(
      'select consent_version from "user"',
    );
    expect(rows).toEqual([{ consent_version: "2026-01-01" }]);
  });

  it("refuses a signin link for an unknown address with AGE_NOT_CONFIRMED and creates nothing", async () => {
    const link = await signupLink({ mode: "signin", consent: false, ageConfirmed: false });
    const response = await route.POST(confirmRequest(link));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "AGE_NOT_CONFIRMED" });
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await count("user")).toBe(0);
    expect(await count("session")).toBe(0);
  });

  it("refuses a direct POST's link (no signup intent) for a new address", async () => {
    const response = await route.POST(
      new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ email: "forged@example.com", metadata: { mode: "signup" } }),
      }),
    );
    expect(response.status).toBe(200);
    const link = (await lastMail()).url;
    expect(new URLSearchParams(new URL(link).hash.slice(1)).get("mode")).toBe("signin");
    const confirm = await route.POST(confirmRequest(link));
    expect(await confirm.json()).toMatchObject({ code: "AGE_NOT_CONFIRMED" });
    expect(await count("user")).toBe(0);
  });

  it.each([
    ["an unknown token", "NotARealTokenNotARealTokenNotARe"],
    ["a malformed token", "a b/c"],
    ["an empty token", ""],
  ])("answers %s with INVALID_TOKEN and creates nothing", async (_label, token) => {
    await signupLink();
    const response = await route.POST(
      new Request(`${ORIGIN}${MAGIC_LINK_CONFIRM_PATH}`, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ token }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_TOKEN" });
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await count("user")).toBe(0);
    expect(await count("verification")).toBe(1);
  });

  it("answers a body with no token string as a 400 and creates nothing", async () => {
    const response = await route.POST(
      new Request(`${ORIGIN}${MAGIC_LINK_CONFIRM_PATH}`, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ token: 42 }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await count("user")).toBe(0);
  });

  it("is single use: a second confirm with the same token is INVALID_TOKEN", async () => {
    const link = await signupLink();
    expect((await route.POST(confirmRequest(link))).status).toBe(200);
    const again = await route.POST(confirmRequest(link));
    expect(again.status).toBe(400);
    expect(await again.json()).toMatchObject({ code: "INVALID_TOKEN" });
    expect(await count("session")).toBe(1);
  });

  it("refuses a cross-site request (login CSRF) and leaves the token unused", async () => {
    const link = await signupLink();
    const response = await route.POST(
      confirmRequest(link, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }),
    );
    expect(response.status).toBe(403);
    expect(await count("user")).toBe(0);
    expect(await count("verification")).toBe(1);
  });

  it("refuses a cross-site form navigation even without an Origin it can read", async () => {
    const link = await signupLink();
    const response = await route.POST(
      confirmRequest(link, {
        origin: "null",
        "sec-fetch-site": "cross-site",
        "sec-fetch-mode": "navigate",
        "sec-fetch-dest": "document",
      }),
    );
    expect(response.status).toBe(403);
    expect(await count("verification")).toBe(1);
  });

  it("while accounts are off the route refuses and the token stays unused", async () => {
    const link = await signupLink();
    vi.stubEnv("ACCOUNTS_ENABLED", "false");
    const response = await route.POST(confirmRequest(link));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "ACCOUNTS_DISABLED" });
    expect(await count("user")).toBe(0);
    expect(await count("verification")).toBe(1);
  });

  it("while accounts are off a server-side call refuses before the token is read", async () => {
    const link = await signupLink();
    const { getAuth } = await import("@/lib/auth/server");
    const auth = getAuth();
    vi.stubEnv("ACCOUNTS_ENABLED", "false");
    await expect(
      auth.api.magicLinkConfirm({
        body: { token: tokenOfLink(link) },
        headers: new Headers({ origin: ORIGIN }),
      }),
    ).rejects.toMatchObject({ body: { code: "ACCOUNTS_DISABLED" } });
    expect(await count("verification")).toBe(1);
    expect(await count("user")).toBe(0);
  });
});
