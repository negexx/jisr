import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignInLinkRequest } from "@/lib/server/signup";

const TIMEOUT_MS = 60_000;
const ORIGIN = "http://localhost:3000";
const FAILED_LINE = "sign-in link request failed";
const CODE = /^(INTERNAL_SERVER_ERROR|unexpected)$/;

const io = vi.hoisted(() => ({ requestHeaders: new Headers() }));

vi.mock("next/headers", () => ({ headers: async () => io.requestHeaders }));

type SignupModule = typeof import("@/lib/server/signup");
type DbModule = typeof import("@/db");

let testDb: TestDatabase;
let requestSignInLink: SignupModule["requestSignInLink"];
let db: DbModule["db"];
let closeAppPool: () => Promise<void>;

function request(overrides: Partial<SignInLinkRequest> = {}): SignInLinkRequest {
  return {
    email: "layer-transport@example.com",
    consent: true,
    ageConfirmed: true,
    locale: "fr",
    returnPath: null,
    ...overrides,
  };
}

function spyOnConsoleError() {
  return vi.spyOn(console, "error").mockImplementation(() => undefined);
}

function loggedFailure(spy: ReturnType<typeof spyOnConsoleError>) {
  return spy.mock.calls.find((call) => call[0] === FAILED_LINE);
}

beforeAll(async () => {
  testDb = await startTestDatabase({ port: 0 });
  process.env.DATABASE_URL = testDb.databaseUrl;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
  process.env.BETTER_AUTH_URL = ORIGIN;
  ({ requestSignInLink } = await import("@/lib/server/signup"));
  ({ db } = await import("@/db"));
  closeAppPool = () => db.$client.end();
}, TIMEOUT_MS);

beforeEach(() => {
  io.requestHeaders = new Headers({ origin: ORIGIN });
  vi.stubEnv("ACCOUNTS_ENABLED", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeAppPool?.();
  await testDb?.stop();
}, TIMEOUT_MS);

describe("a refused sign-in link", () => {
  it("names the transport layer without leaking the address", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("BREVO_API_KEY", "");
    const errors = spyOnConsoleError();
    const email = "layer-transport@example.com";

    expect(await requestSignInLink(request({ email }))).toEqual({ ok: false, error: "failed" });

    const failure = loggedFailure(errors);
    expect(failure).toBeDefined();
    expect(failure?.[1]).toMatchObject({
      code: expect.stringMatching(CODE),
      reason: expect.stringContaining("BREVO_API_KEY"),
    });
    expect(JSON.stringify(errors.mock.calls)).not.toContain(email);
  });

  it("names the database layer with its SQLSTATE without leaking the address", async () => {
    await db.execute(sql`drop table email_cooldowns`);
    const errors = spyOnConsoleError();
    const email = "layer-database@example.com";

    expect(await requestSignInLink(request({ email }))).toEqual({ ok: false, error: "failed" });

    const failure = loggedFailure(errors);
    expect(failure).toBeDefined();
    expect(failure?.[1]).toMatchObject({
      code: expect.stringMatching(CODE),
      sqlState: "42P01",
    });
    expect(JSON.stringify(errors.mock.calls)).not.toContain(email);
  });
});
