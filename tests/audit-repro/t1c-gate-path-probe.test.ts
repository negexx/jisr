// T1c audit probe (READ-ONLY): the accounts-gate plugin derives its path from Better Auth's
// context.baseURL (which carries the base path), while the route handler uses the AUTH_BASE_PATH
// constant. With a BETTER_AUTH_URL that carries a path the two disagree. See F2.
import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const TIMEOUT_MS = 60_000;

let testDb: TestDatabase;
let admin: Pool;
let closeAppPool: () => Promise<void>;

beforeAll(async () => {
  testDb = await startTestDatabase({ port: 0 });
  admin = new Pool({ connectionString: testDb.databaseUrl });
  process.env.DATABASE_URL = testDb.databaseUrl;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
  // A base URL that carries a path: accepted by getAuth (it only requires an absolute http(s) URL).
  process.env.BETTER_AUTH_URL = "http://localhost:3000/app";
  vi.stubEnv("ACCOUNTS_ENABLED", "true");
  const appDb = await import("@/db");
  closeAppPool = () => appDb.db.$client.end();
}, TIMEOUT_MS);

afterAll(async () => {
  vi.unstubAllEnvs();
  await Promise.allSettled([closeAppPool?.(), admin?.end(), testDb?.stop()]);
}, TIMEOUT_MS);

it("the gate still answers get-session as signed-out when the base URL carries a path", async () => {
  const { getAuth } = await import("@/lib/auth/server");
  const auth = getAuth();
  vi.stubEnv("ACCOUNTS_ENABLED", "false");
  const response = await auth.handler(
    new Request("http://localhost:3000/api/auth/get-session", {
      method: "GET",
      headers: { origin: "http://localhost:3000" },
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toBeNull();
});
