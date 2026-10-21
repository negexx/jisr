import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspect } from "node:util";

import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { type Profile, ProfileSchema } from "@/data-schema/profile";
import { JOURNEY_EVENTS, track } from "@/lib/analytics";
import { runAsSignup } from "@/lib/auth/signup-intent";
import type { SignInLinkRequest } from "@/lib/server/signup";

import { confirmRequest } from "../../support/magic-link";

// ADR 0004 and the project rules: no grade, nationality, address, session token, magic-link token,
// cookie or user agent may reach a log. This drives the real account flows on PGlite (sign-up,
// sign-in failures, every account action, export, deletion, mail failures, Better Auth's own error
// paths) with every console method recorded, and searches the recorded output, error stacks and
// causes included, for values only a leak could carry. Sentry is not wired (no instrumentation file),
// so console is the only sink; a test below fails the day one is added without joining this suite.

const TIMEOUT_MS = 60_000;
const ORIGIN = "http://localhost:3000";
const ADDRESS = "ines.canary@example.com";
const OTHER_ADDRESS = "omar.canary@example.com";
const USER_AGENT = "SENTINEL-browser/1.0 (canary)";
const SENTINEL_TOKEN = "SENTINEL-token-0123456789abcdef";

const io = vi.hoisted(() => ({
  mailDir: "",
  requestHeaders: new Headers(),
  offend: false,
  sendFailure: null as Error | null,
}));

vi.mock("next/headers", () => ({ headers: async () => io.requestHeaders }));

vi.mock("@/lib/server/email", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/email")>();
  return {
    ...original,
    sendAuthEmail: async (request: Parameters<typeof original.sendAuthEmail>[0]) => {
      if (io.sendFailure !== null) throw io.sendFailure;
      await original.sendAuthEmail(request, { mailDir: io.mailDir });
    },
  };
});

// The failure-mode proof's offender: while `io.offend` is set, the real profile-saving path logs the
// profile it was given, which is exactly the mistake this suite exists to catch.
vi.mock("@/lib/server/account-store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/account-store")>();
  return {
    ...original,
    saveProfileFor: async (...args: Parameters<typeof original.saveProfileFor>) => {
      if (io.offend) console.error("saving profile", args[2]);
      return original.saveProfileFor(...args);
    },
  };
});

type RouteModule = typeof import("@/app/api/auth/[...all]/route");
type Actions = typeof import("@/lib/server/account-actions");

type Student = { cookie: string; id: string; email: string; sessionToken: string };

const PROFILE: Profile = ProfileSchema.parse({
  schemaVersion: 2,
  nationality: "MA",
  credential: {
    country: "MA",
    type: "bac",
    track: "sciences-maths-a",
    status: "expected",
    overall: { scale: "ma-20", value: 13.37 },
    subjects: [{ subject: "mathematics", grade: { scale: "ma-20", value: 16.42 } }],
  },
  priorHigherEducationYears: 0,
  languages: [{ language: "fr", level: "B2", certificate: null }],
});

// What a leak would carry. Strings are searched case-insensitively.
const PROFILE_CANARIES = [
  "13.37",
  "16.42",
  "sciences-maths-a",
  "ma-20",
  "nationality",
  '"MA"',
  "'MA'",
  "credential",
];

let testDb: TestDatabase;
let pool: Pool;
let route: RouteModule;
let actions: Actions;
let closeAppPool: () => Promise<void>;
let alice: Student;
let signUpLogs = "";
let signUpLeaks: string[] = [];

const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug", "trace"] as const;

// Everything the run wrote to the console, with Error stacks, causes and own properties spelled out.
async function recording(run: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  const spies = CONSOLE_METHODS.map((method) =>
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(inspect(args, { depth: 8, breakLength: Number.POSITIVE_INFINITY }));
    }),
  );
  try {
    await run();
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
  return lines.join("\n");
}

function leaksIn(output: string, canaries: readonly string[]): string[] {
  const haystack = output.toLowerCase();
  return canaries.filter((canary) => haystack.includes(canary.toLowerCase()));
}

function identityCanaries(student: Student, extra: readonly string[] = []): string[] {
  return [
    student.email,
    student.email.split("@")[0] ?? student.email,
    student.sessionToken,
    student.cookie,
    "better-auth.session_token",
    USER_AGENT,
    SENTINEL_TOKEN,
    ...extra,
  ];
}

async function lastMailUrl(): Promise<string> {
  const files = (await readdir(io.mailDir)).sort();
  const last = files.at(-1);
  if (last === undefined) throw new Error("no mail was written");
  const mail: { url: string } = JSON.parse(await readFile(join(io.mailDir, last), "utf8"));
  return mail.url;
}

function tokenOfLink(url: string): string {
  const parsed = new URL(url);
  const token =
    parsed.searchParams.get("token") ?? new URLSearchParams(parsed.hash.slice(1)).get("token");
  if (token === null) throw new Error("the mail carries no token");
  return token;
}

function cookieOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

function sessionTokenOf(cookie: string): string {
  const value = cookie.split("; ").find((part) => part.startsWith("better-auth.session_token="));
  const raw = value?.slice("better-auth.session_token=".length) ?? "";
  return decodeURIComponent(raw).split(".")[0] ?? raw;
}

function signedInAs(student: Student): void {
  io.requestHeaders = new Headers({
    cookie: student.cookie,
    origin: ORIGIN,
    "user-agent": USER_AGENT,
  });
}

function signedOut(): void {
  io.requestHeaders = new Headers({ origin: ORIGIN, "user-agent": USER_AGENT });
}

function signUpRequest(email: string): SignInLinkRequest {
  return {
    email,
    consent: true,
    ageConfirmed: true,
    locale: "fr",
    returnPath: null,
  };
}

async function signUp(email: string): Promise<{ student: Student; magicToken: string }> {
  const { requestSignInLink } = await import("@/lib/server/signup");
  signedOut();
  expect(await requestSignInLink(signUpRequest(email))).toEqual({ ok: true });
  const url = await lastMailUrl();
  const response = await route.POST(confirmRequest(url, { "user-agent": USER_AGENT }));
  expect(response.status).toBe(200);
  const cookie = cookieOf(response);
  const { rows } = await pool.query<{ id: string }>('select id from "user" where email = $1', [
    email,
  ]);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("sign-up created no user");
  return {
    student: { cookie, id, email, sessionToken: sessionTokenOf(cookie) },
    magicToken: tokenOfLink(url),
  };
}

function post(student: Student | null, path: string, body: unknown): Promise<Response> {
  return route.POST(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        "user-agent": USER_AGENT,
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
      headers: {
        origin: ORIGIN,
        "user-agent": USER_AGENT,
        ...(student ? { cookie: student.cookie } : {}),
      },
    }),
  );
}

beforeAll(async () => {
  io.mailDir = await mkdtemp(join(tmpdir(), "jisr-no-pii-mail-"));
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

  let magicToken = "";
  signUpLogs = await recording(async () => {
    ({ student: alice, magicToken } = await signUp(ADDRESS));
  });
  signUpLeaks = leaksIn(signUpLogs, [...identityCanaries(alice), magicToken]);
}, TIMEOUT_MS);

const DATA_TABLES = ["saved_programs", "checklist_progress", "profiles", "feedback_reports"];

beforeEach(async () => {
  vi.stubEnv("ACCOUNTS_ENABLED", "true");
  for (const table of DATA_TABLES) await pool.query(`delete from "${table}"`);
  await pool.query("delete from request_throttles");
  signedInAs(alice);
});

afterEach(() => {
  io.offend = false;
  io.sendFailure = null;
  vi.restoreAllMocks();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await closeAppPool?.();
  await pool?.end();
  await testDb?.stop();
  await rm(io.mailDir, { recursive: true, force: true });
}, TIMEOUT_MS);

describe("the detector", () => {
  it("catches a profile field logged inside an account action", async () => {
    io.offend = true;
    const logs = await recording(async () => {
      expect(await actions.saveProfile(PROFILE, 0)).toMatchObject({ ok: true });
    });
    const found = leaksIn(logs, PROFILE_CANARIES);
    expect(found).toEqual(expect.arrayContaining(["13.37", "16.42", "nationality"]));
  });

  it("sees an address inside an error's cause chain", async () => {
    const logs = await recording(async () => {
      console.error("failed", new Error("outer", { cause: new Error(`for ${ADDRESS}`) }));
    });
    expect(leaksIn(logs, [ADDRESS])).toEqual([ADDRESS]);
  });
});

describe("sign-up and sign-in", () => {
  it("writes nothing identifying while a student signs up through the magic link", () => {
    expect(signUpLeaks).toEqual([]);
  });

  it("logs only a code when the sign-in link cannot be sent", async () => {
    const { getAuth } = await import("@/lib/auth/server");
    const { requestSignInLink } = await import("@/lib/server/signup");
    vi.spyOn(getAuth().api, "signInMagicLink").mockRejectedValue(
      new Error(`insert into verification values ($1) params: ${OTHER_ADDRESS}, ${SENTINEL_TOKEN}`),
    );
    signedOut();
    const logs = await recording(async () => {
      expect(await requestSignInLink(signUpRequest(OTHER_ADDRESS))).toEqual({
        ok: false,
        error: "failed",
      });
    });
    expect(logs).toContain("sign-in link request failed");
    expect(leaksIn(logs, [OTHER_ADDRESS, "omar.canary", SENTINEL_TOKEN])).toEqual([]);
  });

  it("logs nothing for an invalid address, an unknown account or a repeated request", async () => {
    const { requestSignInLink } = await import("@/lib/server/signup");
    signedOut();
    const logs = await recording(async () => {
      expect(await requestSignInLink(signUpRequest("not an address"))).toEqual({
        ok: false,
        error: "invalid_email",
      });
      await requestSignInLink(signUpRequest("nobody.canary@example.com"));
      expect(await requestSignInLink(signUpRequest("repeat.canary@example.com"))).toEqual({
        ok: true,
      });
      expect(await requestSignInLink(signUpRequest("repeat.canary@example.com"))).toEqual({
        ok: false,
        error: "cooldown",
      });
    });
    expect(leaksIn(logs, ["canary", USER_AGENT])).toEqual([]);
  });

  it("never writes the magic-link nonce cookie's value while a link is requested", async () => {
    signedOut();
    let nonce = "";
    const logs = await recording(async () => {
      const response = await runAsSignup("nonce.canary@example.com", () =>
        post(null, "/sign-in/magic-link", {
          email: "nonce.canary@example.com",
          callbackURL: "/fr/welcome",
        }),
      );
      expect(response.status).toBe(200);
      const setCookie = response.headers
        .getSetCookie()
        .find((value) => value.startsWith("jisr.ml-nonce="));
      nonce = (setCookie ?? "").split(";")[0]?.split("=")[1] ?? "";
    });
    expect(nonce).not.toBe("");
    expect(leaksIn(logs, [nonce])).toEqual([]);
  });

  it("scrubs a mail failure that carries the address and the link", async () => {
    const { requestSignInLink } = await import("@/lib/server/signup");
    io.sendFailure = new Error(
      `smtp refused ${OTHER_ADDRESS} for http://localhost:3000/api/auth/magic-link/verify?token=${SENTINEL_TOKEN}`,
    );
    signedOut();
    const logs = await recording(async () => {
      await requestSignInLink(signUpRequest("flaky.canary@example.com"));
    });
    expect(leaksIn(logs, [OTHER_ADDRESS, "flaky.canary", SENTINEL_TOKEN, USER_AGENT])).toEqual([]);
  });

  it("records a failed Brevo delivery as a kind and a status only", async () => {
    const original =
      await vi.importActual<typeof import("@/lib/server/email")>("@/lib/server/email");
    const env = {
      ACCOUNTS_ENABLED: "true",
      NODE_ENV: "test",
      BREVO_API_KEY: "xkeysib-canary-key",
      BREVO_SENDER: "Jisrr <no-reply@jisrr.org>",
      JISR_EMAIL_FILE_TRANSPORT: "",
    };
    const request = {
      kind: "magic-link" as const,
      to: ADDRESS,
      url: `http://localhost:3000/api/auth/magic-link/verify?token=${SENTINEL_TOKEN}`,
      token: SENTINEL_TOKEN,
    };
    const pending: Promise<unknown>[] = [];
    const responses: (() => Promise<Response>)[] = [
      async () => new Response(`bad address ${ADDRESS}`, { status: 400 }),
      async () => {
        throw new TypeError(`fetch failed for ${ADDRESS} key xkeysib-canary-key`);
      },
    ];
    const logs = await recording(async () => {
      for (const respond of responses) {
        await original.sendAuthEmail(request, {
          env,
          fetch: respond,
          waitUntil: (promise) => {
            pending.push(promise);
          },
        });
      }
      await Promise.all(pending);
    });
    expect(logs).toContain("auth email delivery failed");
    expect(leaksIn(logs, [ADDRESS, "ines.canary", SENTINEL_TOKEN, "xkeysib-canary-key"])).toEqual(
      [],
    );
  });
});

describe("account actions", () => {
  it("log nothing about a student whose actions succeed", async () => {
    signedInAs(alice);
    const logs = await recording(async () => {
      expect(await actions.saveProfile(PROFILE, 0)).toMatchObject({ ok: true });
      expect(
        await actions.saveProgram({
          slug: "xx-prog-a",
          country: "FR",
          field: "computer-science",
          snapshotVersion: "0123456789ab",
          savedAt: "2026-10-01",
        }),
      ).toMatchObject({ ok: true });
      expect(await actions.setStepDone("xx-prog-a", "visa", true)).toMatchObject({ ok: true });
      expect(await actions.loadAccountData()).toMatchObject({ ok: true });
    });
    expect(leaksIn(logs, [...identityCanaries(alice), ...PROFILE_CANARIES])).toEqual([]);
  });

  it("log nothing when the request is refused, invalid or signed out", async () => {
    const logs = await recording(async () => {
      signedInAs(alice);
      expect(await actions.saveProgram({ slug: "Not A Slug" } as never)).toMatchObject({
        ok: false,
      });
      expect(await actions.saveProfile({ ...PROFILE, schemaVersion: 3 } as never, 0)).toMatchObject(
        {
          ok: false,
        },
      );
      signedOut();
      expect(await actions.saveProfile(PROFILE, 0)).toMatchObject({ ok: false });
      expect(await actions.loadAccountData()).toMatchObject({ ok: false });
    });
    expect(leaksIn(logs, [...identityCanaries(alice), ...PROFILE_CANARIES])).toEqual([]);
  });

  it("log only the action and the SQLSTATE when a query fails", async () => {
    await pool.query(
      "alter table profiles add constraint boom_check check (revision < 0) not valid",
    );
    try {
      signedInAs(alice);
      const logs = await recording(async () => {
        await expect(actions.saveProfile(PROFILE, 0)).rejects.toThrow(
          "account action saveProfile failed",
        );
      });
      expect(logs).toContain("saveProfile");
      expect(logs).toContain("23514");
      expect(leaksIn(logs, [...identityCanaries(alice), ...PROFILE_CANARIES])).toEqual([]);
    } finally {
      await pool.query("alter table profiles drop constraint boom_check");
    }
  });

  it("log no token when the session lookup fails", async () => {
    const { getAuth } = await import("@/lib/auth/server");
    vi.spyOn(getAuth().api, "getSession").mockRejectedValue(
      new Error(
        `Failed query: select * from "session" where token = $1 params: ${alice.sessionToken}`,
      ),
    );
    signedInAs(alice);
    const logs = await recording(async () => {
      await expect(actions.loadAccountData()).rejects.toThrow(
        "account action loadAccountData failed",
      );
    });
    expect(leaksIn(logs, [alice.sessionToken, "where token"])).toEqual([]);
  });
});

describe("export", () => {
  it("logs nothing for a signed-in export, a signed-out request or a switched-off deployment", async () => {
    const exportRoute = await import("@/app/api/account/export/route");
    signedInAs(alice);
    await actions.saveProgram({
      slug: "xx-prog-a",
      country: "FR",
      field: "computer-science",
      snapshotVersion: "0123456789ab",
      savedAt: "2026-10-01",
    });
    const logs = await recording(async () => {
      signedInAs(alice);
      const exported = await exportRoute.GET();
      expect(exported.status).toBe(200);
      expect(JSON.stringify(await exported.json())).toContain("xx-prog-a");
      signedOut();
      expect((await exportRoute.GET()).status).toBe(401);
      vi.stubEnv("ACCOUNTS_ENABLED", "");
      expect((await exportRoute.GET()).status).toBe(403);
    });
    expect(leaksIn(logs, [...identityCanaries(alice), ...PROFILE_CANARIES])).toEqual([]);
  });
});

describe("Better Auth's own error paths", () => {
  it("writes no session token when the session cannot be read from the database", async () => {
    await pool.query('alter table "session" rename to session_moved');
    try {
      const logs = await recording(async () => {
        await get(alice, "/get-session");
      });
      // The error path really ran and went through the scrubbed logger, so the leak check below
      // cannot pass on an empty log.
      expect(logs).toContain("[better-auth]");
      expect(leaksIn(logs, [alice.sessionToken, alice.cookie, ADDRESS])).toEqual([]);
    } finally {
      await pool.query('alter table session_moved rename to "session"');
    }
  });

  it("writes no address or link when sending a sign-in link throws an unexpected error", async () => {
    io.sendFailure = new Error(
      `provider said no to ${OTHER_ADDRESS} at http://localhost:3000/x?token=${SENTINEL_TOKEN}`,
    );
    signedOut();
    const logs = await recording(async () => {
      await runAsSignup("direct.canary@example.com", () =>
        post(null, "/sign-in/magic-link", {
          email: "direct.canary@example.com",
          callbackURL: "/fr/welcome",
        }),
      );
    });
    expect(logs).toContain("[better-auth]");
    expect(leaksIn(logs, [OTHER_ADDRESS, "direct.canary", SENTINEL_TOKEN, USER_AGENT])).toEqual([]);
  });
});

describe("deletion", () => {
  async function requestedToken(student: Student): Promise<string> {
    const requested = await post(student, "/delete-user", { callbackURL: "/fr/account/delete" });
    expect(requested.status).toBe(200);
    return tokenOfLink(await lastMailUrl());
  }

  it("logs nothing for the request, a refused token and a failed erasure", async () => {
    const { student: bob, magicToken } = await signUp("bob.canary@example.com");
    const logs = await recording(async () => {
      const deleteToken = await requestedToken(bob);
      const wrong = await post(bob, "/delete-user", { token: `${deleteToken}-wrong` });
      expect(wrong.status).toBeGreaterThanOrEqual(400);
      const anonymous = await post(null, "/delete-user", { token: deleteToken });
      expect(anonymous.status).toBeGreaterThanOrEqual(400);

      const { db } = await import("@/db");
      vi.spyOn(db, "transaction").mockRejectedValueOnce(
        Object.assign(
          new Error(
            `Failed query: delete from email_cooldowns where email = $1 params: ${bob.email}`,
          ),
          { cause: { code: "08006" } },
        ),
      );
      const failed = await post(bob, "/delete-user", { token: deleteToken });
      expect(failed.status).toBeGreaterThanOrEqual(400);
    });
    expect(logs).toContain("eraseAccountResidue failed");
    expect(leaksIn(logs, [...identityCanaries(bob), magicToken, "bob.canary"])).toEqual([]);
  });

  it("logs nothing for the confirmed deletion", async () => {
    const { student: carol, magicToken } = await signUp("carol.canary@example.com");
    const logs = await recording(async () => {
      const deleteToken = await requestedToken(carol);
      const confirmed = await post(carol, "/delete-user", { token: deleteToken });
      expect(confirmed.status).toBe(200);
      expect(await (await get(carol, "/get-session")).json()).toBeNull();
    });
    expect(leaksIn(logs, [...identityCanaries(carol), magicToken, "carol.canary"])).toEqual([]);
  });
});

describe("match filters and analytics", () => {
  it("sends only the matches-viewed event name, never a match filter value", () => {
    const count = vi.fn();
    vi.stubGlobal("window", { __jisrAnalytics: true, goatcounter: { count } });
    try {
      track("matches-viewed");
      expect(count).toHaveBeenCalledTimes(1);
      expect(count).toHaveBeenCalledWith({ path: "matches-viewed", event: true });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(JOURNEY_EVENTS.filter((event) => event.includes("matches"))).toEqual(["matches-viewed"]);
  });
});

describe("other sinks", () => {
  it("has no Sentry or custom logger wired that this suite does not cover", async () => {
    const { existsSync } = await import("node:fs");
    for (const file of [
      "src/instrumentation.ts",
      "src/instrumentation-client.ts",
      "sentry.server.config.ts",
    ]) {
      expect(existsSync(file), `${file} exists: add its error paths to this suite`).toBe(false);
    }
  });
});
