import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { startTestDatabase, type TestDatabase } from "../../db/harness";

const TIMEOUT_MS = 60_000;
const ORIGIN = "http://localhost:3000";
const sentEmails: string[] = [];

vi.mock("@/lib/server/email", () => ({
  sendAuthEmail: async (request: { to: string }) => {
    sentEmails.push(request.to);
  },
}));

type AuthModule = typeof import("@/lib/auth/server");
type RouteModule = typeof import("@/app/api/auth/[...all]/route");

let testDb: TestDatabase;
let pool: Pool;
let auth: ReturnType<AuthModule["getAuth"]>;
let route: RouteModule;
let closeAppPool: () => Promise<void>;

async function count(table: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(`select count(*) as count from "${table}"`);
  return Number(rows[0]?.count);
}

function getRequest(path: string): Request {
  return new Request(`${ORIGIN}${path}`, { method: "GET", headers: { origin: ORIGIN } });
}

function postRequest(path: string, body: unknown): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function expectDisabled(response: Response): Promise<void> {
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ code: "ACCOUNTS_DISABLED" });
}

beforeAll(async () => {
  testDb = await startTestDatabase({ port: 0 });
  pool = new Pool({ connectionString: testDb.databaseUrl });
  process.env.DATABASE_URL = testDb.databaseUrl;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
  process.env.BETTER_AUTH_URL = ORIGIN;
  auth = (await import("@/lib/auth/server")).getAuth();
  route = await import("@/app/api/auth/[...all]/route");
  const { db } = await import("@/db");
  closeAppPool = () => db.$client.end();
}, TIMEOUT_MS);

beforeEach(async () => {
  sentEmails.length = 0;
  await pool.query('delete from "user"');
  await pool.query("delete from verification");
  await pool.query("delete from session");
  await pool.query("delete from pending_signups");
  await pool.query("delete from email_cooldowns");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await closeAppPool?.();
  await pool?.end();
  await testDb?.stop();
}, TIMEOUT_MS);

describe("route file", () => {
  it("exports exactly GET and POST and nothing else lives in it", () => {
    expect(Object.keys(route).sort()).toEqual(["GET", "POST"]);
    const source = readFileSync(
      fileURLToPath(new URL("../../../src/app/api/auth/[...all]/route.ts", import.meta.url)),
      "utf8",
    );
    expect(
      source
        .trim()
        .split(/\r?\n/)
        .filter((line) => line.trim() !== ""),
    ).toEqual([
      'import { authHandler } from "@/lib/auth/handler";',
      "export const { GET, POST } = authHandler;",
    ]);
  });
});

describe.each([
  ["unset", undefined],
  ["empty", ""],
  ["false", "false"],
  ["0", "0"],
  ["a typo", "fasle"],
  ["yes", "yes"],
])("with ACCOUNTS_ENABLED %s", (_label, value) => {
  beforeEach(() => {
    if (value === undefined) vi.stubEnv("ACCOUNTS_ENABLED", undefined);
    else vi.stubEnv("ACCOUNTS_ENABLED", value);
  });

  it("refuses a magic-link sign-in and writes no row and no email", async () => {
    const response = await route.POST(
      postRequest("/api/auth/sign-in/magic-link", { email: "new@example.com" }),
    );
    await expectDisabled(response);
    expect(await count("user")).toBe(0);
    expect(await count("verification")).toBe(0);
    expect(await count("pending_signups")).toBe(0);
    expect(sentEmails).toEqual([]);
  });

  it("refuses the Google callback GET", async () => {
    const response = await route.GET(getRequest("/api/auth/callback/google?code=abc&state=def"));
    await expectDisabled(response);
    expect(await count("user")).toBe(0);
  });

  it("refuses the magic-link verify GET", async () => {
    const response = await route.GET(getRequest("/api/auth/magic-link/verify?token=x"));
    await expectDisabled(response);
    expect(await count("user")).toBe(0);
  });

  it("refuses an unknown path the same way", async () => {
    await expectDisabled(await route.GET(getRequest("/api/auth/does-not-exist")));
    await expectDisabled(await route.POST(postRequest("/api/auth/sign-up/email", {})));
  });

  it("still answers get-session as a signed-out visitor", async () => {
    const response = await route.GET(getRequest("/api/auth/get-session"));
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it("refuses get-session variants: trailing slash, other casing and POST", async () => {
    await expectDisabled(await route.GET(getRequest("/api/auth/get-session/")));
    await expectDisabled(await route.GET(getRequest("/api/auth/Get-Session")));
    await expectDisabled(await route.POST(postRequest("/api/auth/get-session", {})));
  });

  it("answers get-session as signed out even when the visitor holds a cookie", async () => {
    const request = new Request(`${ORIGIN}/api/auth/get-session`, {
      method: "GET",
      headers: { cookie: "better-auth.session_token=anything.signature" },
    });
    const response = await route.GET(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it("rejects a server-side user create at the database hook, so no row is written", async () => {
    const before = auth.options.databaseHooks?.user?.create?.before;
    if (!before) throw new Error("the create.before gate hook is not registered");
    await expect(
      before({ email: "student@example.com", name: "Student" } as never, null),
    ).rejects.toMatchObject({ status: "FORBIDDEN", body: { code: "ACCOUNTS_DISABLED" } });
    expect(await count("user")).toBe(0);
  });

  it("creates no user through the internal adapter used by auth.api flows", async () => {
    const context = await auth.$context;
    await expect(
      context.internalAdapter.createUser(
        { email: "api@example.com", name: "Api" },
        { method: "magic-link" },
      ),
    ).rejects.toMatchObject({ body: { code: "ACCOUNTS_DISABLED" } });
    expect(await count("user")).toBe(0);
  });
});

describe("with ACCOUNTS_ENABLED on", () => {
  beforeEach(() => {
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
  });

  it("answers get-session 200 null without a cookie", async () => {
    const response = await route.GET(getRequest("/api/auth/get-session"));
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it("passes other requests through to Better Auth", async () => {
    const response = await route.POST(
      postRequest("/api/auth/sign-in/magic-link", { email: "new@example.com" }),
    );
    expect(response.status).toBe(200);
    expect(sentEmails).toEqual(["new@example.com"]);
    expect(await count("user")).toBe(0);
  });
});

describe("flag is read per request", () => {
  it("changes behaviour between requests of one test", async () => {
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    const open = await route.POST(
      postRequest("/api/auth/sign-in/magic-link", { email: "a@example.com" }),
    );
    expect(open.status).toBe(200);

    vi.stubEnv("ACCOUNTS_ENABLED", "false");
    await expectDisabled(
      await route.POST(postRequest("/api/auth/sign-in/magic-link", { email: "b@example.com" })),
    );

    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    const reopened = await route.POST(
      postRequest("/api/auth/sign-in/magic-link", { email: "c@example.com" }),
    );
    expect(reopened.status).toBe(200);
    expect(sentEmails).toEqual(["a@example.com", "c@example.com"]);
  });
});
