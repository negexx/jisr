import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TIMEOUT_MS = 60_000;

type SentRequest = { kind: string; to: string; metadata?: Record<string, unknown> };
const sent: SentRequest[] = [];

vi.mock("@/lib/server/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/email")>()),
  sendAuthEmail: async (request: SentRequest) => {
    sent.push({ kind: request.kind, to: request.to, metadata: request.metadata });
  },
}));

type AuthModule = typeof import("@/lib/auth/server");

let testDb: TestDatabase;
let pool: Pool;
let auth: ReturnType<AuthModule["getAuth"]>;
let closeAppPool: () => Promise<void>;

async function count(table: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(`select count(*) as count from "${table}"`);
  return Number(rows[0]?.count);
}

function signIn(email: string, metadata?: Record<string, unknown>) {
  return auth.api.signInMagicLink({
    body: { email, ...(metadata ? { metadata } : {}) },
    headers: new Headers(),
  });
}

function sendDeleteVerification(email: string) {
  const send = auth.options.user?.deleteUser?.sendDeleteAccountVerification;
  if (!send) throw new Error("sendDeleteAccountVerification is not registered");
  return send({ user: { email } as never, url: "http://localhost:3000/x", token: "tok" });
}

beforeAll(async () => {
  testDb = await startTestDatabase({ port: 0 });
  pool = new Pool({ connectionString: testDb.databaseUrl });
  process.env.DATABASE_URL = testDb.databaseUrl;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  auth = (await import("@/lib/auth/server")).getAuth();
  const { db } = await import("@/db");
  closeAppPool = () => db.$client.end();
}, TIMEOUT_MS);

beforeEach(async () => {
  sent.length = 0;
  await pool.query("delete from verification");
  await pool.query("delete from email_cooldowns");
  await pool.query("delete from auth_email_days");
  await pool.query("delete from request_throttles");
});

afterEach(() => {
  vi.unstubAllEnvs();
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
])("with ACCOUNTS_ENABLED %s", (_label, value) => {
  beforeEach(() => {
    if (value === undefined) vi.stubEnv("ACCOUNTS_ENABLED", undefined);
    else vi.stubEnv("ACCOUNTS_ENABLED", value);
  });

  it("refuses a direct server-side magic-link request and leaves no verification row, cooldown row or email", async () => {
    await expect(signIn("new@example.com")).rejects.toMatchObject({
      status: "FORBIDDEN",
      body: { code: "ACCOUNTS_DISABLED" },
    });
    expect(await count("verification")).toBe(0);
    expect(await count("email_cooldowns")).toBe(0);
    expect(sent).toEqual([]);
  });

  it("refuses a delete-account email without claiming a slot", async () => {
    await expect(sendDeleteVerification("new@example.com")).rejects.toMatchObject({
      status: "FORBIDDEN",
      body: { code: "ACCOUNTS_DISABLED" },
    });
    expect(await count("email_cooldowns")).toBe(0);
    expect(sent).toEqual([]);
  });
});

describe("with ACCOUNTS_ENABLED on", () => {
  beforeEach(() => {
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
  });

  it("sends the first magic link and claims the address slot", async () => {
    await signIn("new@example.com");
    expect(sent.map((request) => [request.kind, request.to])).toEqual([
      ["magic-link", "new@example.com"],
    ]);
    const { rows } = await pool.query<{ email: string; kind: string }>(
      "select email, kind from email_cooldowns",
    );
    expect(rows).toEqual([{ email: "new@example.com", kind: "magic-link" }]);
  });

  it("refuses a second request for the same address inside the window, without naming it", async () => {
    await signIn("new@example.com");
    const refusal = await signIn("New@Example.com").catch((error: unknown) => error);
    expect(refusal).toMatchObject({
      status: "TOO_MANY_REQUESTS",
      body: { code: "EMAIL_COOLDOWN" },
    });
    const text = `${JSON.stringify(refusal)} ${refusal instanceof Error ? refusal.message : ""}`;
    expect(text.toLowerCase()).not.toContain("example.com");
    // The same answer covers the daily ceiling, which can last until midnight.
    expect(text).not.toMatch(/minute/i);
    expect(text).toMatch(/try again later/i);
    expect(sent).toHaveLength(1);
  });

  it("claims once per send and leaves no verification row behind a refusal", async () => {
    await signIn("new@example.com");
    await expect(signIn("new@example.com")).rejects.toMatchObject({
      body: { code: "EMAIL_COOLDOWN" },
    });
    expect(await count("verification")).toBe(2);
    expect(await count("email_cooldowns")).toBe(1);
  });

  it("claims the slot for a direct POST to the magic-link route too", async () => {
    const post = () =>
      auth.handler(
        new Request("http://localhost:3000/api/auth/sign-in/magic-link", {
          method: "POST",
          headers: { origin: "http://localhost:3000", "content-type": "application/json" },
          body: JSON.stringify({ email: "direct@example.com" }),
        }),
      );
    expect((await post()).status).toBe(200);
    const refused = await post();
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ code: "EMAIL_COOLDOWN" });
    expect(sent.map((request) => request.to)).toEqual(["direct@example.com"]);
    expect(await count("verification")).toBe(2);
  });

  it("refuses a value that is not an address with a 400, without claiming a slot", async () => {
    await expect(signIn("not-an-address")).rejects.toMatchObject({ status: "BAD_REQUEST" });
    expect(await count("email_cooldowns")).toBe(0);
    expect(await count("verification")).toBe(0);
    expect(sent).toEqual([]);
  });

  it.each([
    ["an oversize address", `${"a".repeat(320)}@example.com`],
    ["a malformed address", "two@@example.com"],
    ["an address with no domain dot", "ana@localhost"],
  ])("answers a direct POST of %s with 400 and writes no verification row", async (_label, email) => {
    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ email }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await count("verification")).toBe(0);
    expect(await count("email_cooldowns")).toBe(0);
    expect(sent).toEqual([]);
  });

  it("shares one slot between +tag forms of one address", async () => {
    await signIn("a+1@example.com");
    await expect(signIn("a+2@example.com")).rejects.toMatchObject({
      status: "TOO_MANY_REQUESTS",
      body: { code: "EMAIL_COOLDOWN" },
    });
    expect(sent.map((request) => request.to)).toEqual(["a+1@example.com"]);
  });

  it("stops sign-in links at the sign-in ceiling but keeps the reserve for deletion emails", async () => {
    const { AUTH_EMAILS_PER_DAY, AUTH_EMAILS_RESERVED_FOR_DELETION } = await import(
      "@/lib/constants"
    );
    const signInCeiling = AUTH_EMAILS_PER_DAY - AUTH_EMAILS_RESERVED_FOR_DELETION;
    await pool.query(
      "insert into auth_email_days (day, sent) values ((now() at time zone 'utc')::date, $1)",
      [signInCeiling - 1],
    );
    await signIn("last@example.com");
    const refusal = await signIn("over@example.com").catch((error: unknown) => error);
    expect(refusal).toMatchObject({
      status: "TOO_MANY_REQUESTS",
      body: { code: "EMAIL_COOLDOWN" },
    });
    // A flood of made-up sign-in addresses cannot block the erasure confirmation (GDPR).
    await sendDeleteVerification("keep-deleting@example.com");
    expect(sent.map((request) => request.to)).toEqual([
      "last@example.com",
      "keep-deleting@example.com",
    ]);
    expect(await count("verification")).toBe(2);
  });

  it("refuses a deletion email once the whole day's budget is spent", async () => {
    const { AUTH_EMAILS_PER_DAY } = await import("@/lib/constants");
    await pool.query(
      "insert into auth_email_days (day, sent) values ((now() at time zone 'utc')::date, $1)",
      [AUTH_EMAILS_PER_DAY],
    );
    await expect(sendDeleteVerification("over-delete@example.com")).rejects.toMatchObject({
      status: "TOO_MANY_REQUESTS",
      body: { code: "EMAIL_COOLDOWN" },
    });
    expect(sent).toEqual([]);
  });

  it("lets another address through while one is cooling down", async () => {
    await signIn("one@example.com");
    await signIn("two@example.com");
    expect(sent.map((request) => request.to)).toEqual(["one@example.com", "two@example.com"]);
  });

  it("hands the sign-in metadata to the email sender, marked as a sign-in", async () => {
    await signIn("new@example.com", { locale: "ar" });
    expect(sent[0]?.metadata).toEqual({ locale: "ar", mode: "signin" });
  });

  it("treats a caller-supplied signup mode as a sign-in without the signup intent", async () => {
    await signIn("new@example.com", { locale: "en", mode: "signup" });
    expect(sent[0]?.metadata).toEqual({ locale: "en", mode: "signin" });
    expect(await count("pending_signups")).toBe(0);
  });

  it("throttles delete-account emails on their own slot", async () => {
    await signIn("new@example.com");
    await sendDeleteVerification("new@example.com");
    await expect(sendDeleteVerification("New@Example.com")).rejects.toMatchObject({
      status: "TOO_MANY_REQUESTS",
      body: { code: "EMAIL_COOLDOWN" },
    });
    expect(sent.map((request) => request.kind)).toEqual(["magic-link", "delete-account"]);
  });
});
