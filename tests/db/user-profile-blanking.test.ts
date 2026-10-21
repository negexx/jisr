import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { SignInLinkRequest } from "@/lib/server/signup";

import { confirmRequest, cookieOf } from "../support/magic-link";

// The name and picture a provider or a caller sends are never kept (S7): nothing in Jisrr reads
// them, so an unbounded `name` is only storage and a liability. Real Better Auth on PGlite; the
// Google create path is covered in tests/lib/auth/google.test.ts.

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

type AuthModule = typeof import("@/lib/auth/server");

let testDb: TestDatabase;
let pool: Pool;
let auth: ReturnType<AuthModule["getAuth"]>;
let closeAppPool: () => Promise<void>;
let cookie: string;

async function lastLink(): Promise<string> {
  const files = (await readdir(io.mailDir)).sort();
  const last = files.at(-1);
  if (last === undefined) throw new Error("no magic-link mail was written");
  const mail: { url: string } = JSON.parse(await readFile(join(io.mailDir, last), "utf8"));
  return mail.url;
}

async function storedProfile(): Promise<{ name: string; image: string | null }> {
  const { rows } = await pool.query<{ name: string; image: string | null }>(
    'select name, image from "user" where email = $1',
    ["student@example.com"],
  );
  const row = rows[0];
  if (row === undefined) throw new Error("the student row is missing");
  return row;
}

function updateUser(body: Record<string, unknown>): Promise<Response> {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth/update-user`, {
      method: "POST",
      headers: { origin: ORIGIN, cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeAll(async () => {
  io.mailDir = await mkdtemp(join(tmpdir(), "jisr-blanking-mail-"));
  testDb = await startTestDatabase({ port: 0 });
  pool = new Pool({ connectionString: testDb.databaseUrl });
  process.env.DATABASE_URL = testDb.databaseUrl;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
  process.env.BETTER_AUTH_URL = ORIGIN;
  vi.stubEnv("ACCOUNTS_ENABLED", "true");
  auth = (await import("@/lib/auth/server")).getAuth();
  const { requestSignInLink } = await import("@/lib/server/signup");
  const request: SignInLinkRequest = {
    email: "student@example.com",
    consent: true,
    ageConfirmed: true,
    locale: "fr",
    returnPath: null,
  };
  io.requestHeaders = new Headers({ origin: ORIGIN });
  expect(await requestSignInLink(request)).toEqual({ ok: true });
  const response = await auth.handler(confirmRequest(await lastLink()));
  expect(response.status).toBe(200);
  cookie = cookieOf(response);
  const { db } = await import("@/db");
  closeAppPool = () => db.$client.end();
}, TIMEOUT_MS);

afterAll(async () => {
  vi.unstubAllEnvs();
  await closeAppPool?.();
  await pool?.end();
  await testDb?.stop();
  await rm(io.mailDir, { recursive: true, force: true });
}, TIMEOUT_MS);

describe("a signed-up student's stored profile", () => {
  it("starts with an empty name and no image", async () => {
    expect(await storedProfile()).toEqual({ name: "", image: null });
  });

  it("stays blank when POST /update-user sends a name of 10 000 characters and an image", async () => {
    const response = await updateUser({
      name: "x".repeat(10_000),
      image: "https://example.org/avatar.png",
    });
    expect(response.status).toBe(200);
    expect(await storedProfile()).toEqual({ name: "", image: null });
  });

  it("stays blank when only the name is sent", async () => {
    const response = await updateUser({ name: "Real Name" });
    expect(response.status).toBe(200);
    expect(await storedProfile()).toEqual({ name: "", image: null });
  });
});
