import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AuthEmailAccountsDisabled,
  AuthEmailTransportNotConfigured,
  renderAuthEmail,
  resolveAuthEmailLocale,
  sendAuthEmail,
} from "@/lib/server/email";

const TOKEN = "tok3n-SECRET-0123456789abcdef";
const ADDRESS = "ana.student@example.com";
const URL_IN = `http://localhost:3000/api/auth/magic-link/verify?token=${TOKEN}&callbackURL=%2Far%2Fprofile`;

const BASE_ENV = {
  ACCOUNTS_ENABLED: "true",
  NODE_ENV: "test",
  BREVO_API_KEY: "",
  BREVO_SENDER: "",
  JISR_EMAIL_FILE_TRANSPORT: "",
};

const BREVO_ENV = {
  ...BASE_ENV,
  BREVO_API_KEY: "xkeysib-test-key",
  BREVO_SENDER: "Jisr <no-reply@jisrr.org>",
};

function request(overrides: Partial<Parameters<typeof sendAuthEmail>[0]> = {}) {
  return { kind: "magic-link" as const, to: ADDRESS, url: URL_IN, token: TOKEN, ...overrides };
}

function okResponse(): Response {
  return new Response(JSON.stringify({ messageId: "<abc@smtp-relay.mailin.fr>" }), {
    status: 201,
  });
}

type FetchCall = [RequestInfo | URL, RequestInit | undefined];

function recordingFetch() {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push([input, init]);
    return okResponse();
  });
  return { fetchMock, calls };
}

function sentBody(calls: FetchCall[]) {
  return JSON.parse(String(calls[0]?.[1]?.body));
}

const waitUntilNoop = (promise: Promise<unknown>): void => {
  void promise;
};

let mailDir: string;

beforeEach(async () => {
  mailDir = await mkdtemp(join(tmpdir(), "jisr-mail-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(mailDir, { recursive: true, force: true });
});

describe("resolveAuthEmailLocale", () => {
  const url = (callback: string) =>
    `http://localhost:3000/api/auth/magic-link/verify?token=t&callbackURL=${encodeURIComponent(callback)}`;

  it("prefers a valid metadata locale", () => {
    expect(resolveAuthEmailLocale(url("/ar/profile"), { locale: "en" })).toBe("en");
  });

  it("ignores an unsupported or non-string metadata locale", () => {
    expect(resolveAuthEmailLocale(url("/ar/profile"), { locale: "de" })).toBe("ar");
    expect(resolveAuthEmailLocale(url("/en"), { locale: 3 })).toBe("en");
  });

  it("reads the locale prefix of a relative callback path", () => {
    expect(resolveAuthEmailLocale(url("/ar/profile"))).toBe("ar");
    expect(resolveAuthEmailLocale(url("/en/matches"))).toBe("en");
    expect(resolveAuthEmailLocale(url("/fr"))).toBe("fr");
  });

  it("reads the locale prefix of an absolute callback URL", () => {
    expect(resolveAuthEmailLocale(url("https://jisr.example/en/plan"))).toBe("en");
  });

  it("falls back to fr", () => {
    expect(resolveAuthEmailLocale(url("/"))).toBe("fr");
    expect(resolveAuthEmailLocale(url("/arabic/page"))).toBe("fr");
    expect(resolveAuthEmailLocale("http://localhost:3000/api/auth/magic-link/verify?token=t")).toBe(
      "fr",
    );
    expect(resolveAuthEmailLocale("not a url")).toBe("fr");
  });
});

describe("renderAuthEmail", () => {
  const LINK = "https://jisr.example/api/auth/x?token=abc";

  it.each(["fr", "en", "ar"] as const)("renders both kinds in %s with the link", (locale) => {
    for (const kind of ["magic-link", "delete-account"] as const) {
      const email = renderAuthEmail(kind, locale, LINK);
      expect(email.subject.length).toBeGreaterThan(0);
      expect(email.text).toContain(LINK);
      expect(email.text).not.toMatch(/<[a-z]/i);
    }
  });

  it("states the 15 minute expiry of a magic link in every language", () => {
    expect(renderAuthEmail("magic-link", "fr", LINK).text).toContain("15 minutes");
    expect(renderAuthEmail("magic-link", "en", LINK).text).toContain("15 minutes");
    expect(renderAuthEmail("magic-link", "ar", LINK).text).toContain("15");
  });

  it("renders different subjects per kind and per locale", () => {
    const subjects = new Set<string>();
    for (const locale of ["fr", "en", "ar"] as const) {
      for (const kind of ["magic-link", "delete-account"] as const) {
        subjects.add(renderAuthEmail(kind, locale, LINK).subject);
      }
    }
    expect(subjects.size).toBe(6);
  });

  it("writes Arabic in Arabic script", () => {
    expect(renderAuthEmail("magic-link", "ar", LINK).text).toMatch(/[؀-ۿ]/);
  });
});

describe("sendAuthEmail transport selection", () => {
  it("sends through Brevo when an API key is set, and writes no file", async () => {
    const { fetchMock } = recordingFetch();
    await sendAuthEmail(request(), {
      env: BREVO_ENV,
      fetch: fetchMock,
      waitUntil: waitUntilNoop,
      mailDir,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await readdir(mailDir)).toEqual([]);
  });

  it("writes the rendered email to the file transport when no key is set outside production", async () => {
    const { fetchMock } = recordingFetch();
    await sendAuthEmail(request(), { env: BASE_ENV, fetch: fetchMock, mailDir });
    expect(fetchMock).not.toHaveBeenCalled();
    const files = await readdir(mailDir);
    expect(files).toHaveLength(1);
    const written = JSON.parse(await readFile(join(mailDir, files[0] ?? ""), "utf8"));
    expect(written).toMatchObject({ kind: "magic-link", to: ADDRESS, url: URL_IN });
    expect(written.subject).toEqual(expect.any(String));
    expect(written.text).toContain(URL_IN);
  });

  it("throws a named error in production with no key and no file-transport opt-in", async () => {
    const { fetchMock } = recordingFetch();
    await expect(
      sendAuthEmail(request(), {
        env: { ...BASE_ENV, NODE_ENV: "production" },
        fetch: fetchMock,
        mailDir,
      }),
    ).rejects.toBeInstanceOf(AuthEmailTransportNotConfigured);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await readdir(mailDir)).toEqual([]);
  });

  it.each([
    "true",
    "yes",
    "0",
    " ",
  ])("does not treat JISR_EMAIL_FILE_TRANSPORT=%j as the opt-in", async (value) => {
    await expect(
      sendAuthEmail(request(), {
        env: { ...BASE_ENV, NODE_ENV: "production", JISR_EMAIL_FILE_TRANSPORT: value },
        mailDir,
      }),
    ).rejects.toBeInstanceOf(AuthEmailTransportNotConfigured);
    expect(await readdir(mailDir)).toEqual([]);
  });

  it("allows the file transport in production only with JISR_EMAIL_FILE_TRANSPORT=1", async () => {
    await sendAuthEmail(request(), {
      env: { ...BASE_ENV, NODE_ENV: "production", JISR_EMAIL_FILE_TRANSPORT: "1" },
      mailDir,
    });
    expect(await readdir(mailDir)).toHaveLength(1);
  });

  it("treats a blank-only API key as unset", async () => {
    const { fetchMock } = recordingFetch();
    await sendAuthEmail(request(), {
      env: { ...BASE_ENV, BREVO_API_KEY: "   " },
      fetch: fetchMock,
      mailDir,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await readdir(mailDir)).toHaveLength(1);
  });

  it("throws a named error when a key is set but the sender is missing or malformed", async () => {
    for (const sender of ["", "not-an-address", "Jisr <broken>"]) {
      const { fetchMock } = recordingFetch();
      await expect(
        sendAuthEmail(request(), {
          env: { ...BREVO_ENV, BREVO_SENDER: sender },
          fetch: fetchMock,
          mailDir,
        }),
      ).rejects.toBeInstanceOf(AuthEmailTransportNotConfigured);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it("names no address, URL or token in its transport errors", async () => {
    const error = await sendAuthEmail(request(), {
      env: { ...BASE_ENV, NODE_ENV: "production" },
      mailDir,
    }).catch((caught: unknown) => caught);
    const text = `${String(error)} ${error instanceof Error ? error.stack : ""}`;
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain(ADDRESS);
    expect(text).not.toContain("localhost");
  });
});

describe("sendAuthEmail while accounts are off", () => {
  it.each([
    undefined,
    "",
    "false",
    "0",
  ])("refuses, sends nothing and writes nothing (ACCOUNTS_ENABLED=%j)", async (value) => {
    const { fetchMock } = recordingFetch();
    const waitUntil = vi.fn();
    for (const env of [BREVO_ENV, BASE_ENV]) {
      await expect(
        sendAuthEmail(request(), {
          env: { ...env, ACCOUNTS_ENABLED: value },
          fetch: fetchMock,
          waitUntil,
          mailDir,
        }),
      ).rejects.toBeInstanceOf(AuthEmailAccountsDisabled);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
    expect(await readdir(mailDir)).toEqual([]);
  });
});

describe("sendAuthEmail through Brevo", () => {
  it("posts the documented transactional request", async () => {
    const { fetchMock, calls } = recordingFetch();
    await sendAuthEmail(request(), {
      env: BREVO_ENV,
      fetch: fetchMock,
      waitUntil: waitUntilNoop,
    });
    const [input, init] = calls[0] ?? [];
    expect(input).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("api-key")).toBe("xkeysib-test-key");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("accept")).toBe("application/json");
    const rendered = renderAuthEmail("magic-link", "ar", URL_IN);
    expect(sentBody(calls)).toEqual({
      sender: { email: "no-reply@jisrr.org", name: "Jisr" },
      to: [{ email: ADDRESS }],
      subject: rendered.subject,
      textContent: rendered.text,
    });
  });

  it("accepts a bare sender address", async () => {
    const { fetchMock, calls } = recordingFetch();
    await sendAuthEmail(request(), {
      env: { ...BREVO_ENV, BREVO_SENDER: "no-reply@jisrr.org" },
      fetch: fetchMock,
      waitUntil: waitUntilNoop,
    });
    expect(sentBody(calls).sender).toEqual({ email: "no-reply@jisrr.org", name: "Jisr" });
  });

  it("sends the delete-account email with its own subject", async () => {
    const { fetchMock, calls } = recordingFetch();
    await sendAuthEmail(request({ kind: "delete-account" }), {
      env: BREVO_ENV,
      fetch: fetchMock,
      waitUntil: waitUntilNoop,
    });
    expect(sentBody(calls).subject).toBe(renderAuthEmail("delete-account", "ar", URL_IN).subject);
  });

  it("uses the metadata locale over the callback path", async () => {
    const { fetchMock, calls } = recordingFetch();
    await sendAuthEmail(request({ metadata: { locale: "en" } }), {
      env: BREVO_ENV,
      fetch: fetchMock,
      waitUntil: waitUntilNoop,
    });
    expect(sentBody(calls).subject).toBe(renderAuthEmail("magic-link", "en", URL_IN).subject);
  });

  it("returns before the Brevo call finishes and hands the call to waitUntil", async () => {
    let finish: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const fetchMock = vi.fn(() => pending);
    const handed: Promise<unknown>[] = [];
    await sendAuthEmail(request(), {
      env: BREVO_ENV,
      fetch: fetchMock,
      waitUntil: (promise) => {
        handed.push(promise);
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(handed).toHaveLength(1);
    let settled = false;
    void handed[0]?.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish(okResponse());
    await handed[0];
    expect(settled).toBe(true);
  });
});

describe("sendAuthEmail when Brevo fails", () => {
  async function runFailing(fetchMock: typeof fetch) {
    const logged: unknown[][] = [];
    for (const method of ["error", "warn", "log", "info"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
    }
    const handed: Promise<unknown>[] = [];
    await expect(
      sendAuthEmail(request(), {
        env: BREVO_ENV,
        fetch: fetchMock,
        waitUntil: (promise) => {
          handed.push(promise);
        },
      }),
    ).resolves.toBeUndefined();
    await expect(Promise.all(handed)).resolves.toBeDefined();
    return logged;
  }

  function expectNoSecrets(logged: unknown[][]) {
    const everything = JSON.stringify(logged);
    expect(everything).not.toContain(TOKEN);
    expect(everything).not.toContain(ADDRESS);
    expect(everything).not.toContain("localhost");
    expect(everything).not.toContain("xkeysib");
    expect(everything).not.toContain("magic-link/verify");
  }

  it("does not throw on a 500, and records only the kind and status", async () => {
    const body = JSON.stringify({ message: `bad address ${ADDRESS} ${TOKEN}` });
    const logged = await runFailing(vi.fn(async () => new Response(body, { status: 500 })));
    expect(logged).toHaveLength(1);
    expect(JSON.stringify(logged[0])).toContain("magic-link");
    expect(JSON.stringify(logged)).toContain("500");
    expectNoSecrets(logged);
  });

  it("does not throw on a 4xx", async () => {
    const logged = await runFailing(vi.fn(async () => new Response("{}", { status: 401 })));
    expect(JSON.stringify(logged)).toContain("401");
    expectNoSecrets(logged);
  });

  it("does not throw on a network error, and logs nothing from the error", async () => {
    const logged = await runFailing(
      vi.fn(async () => {
        throw new TypeError(`fetch failed for ${ADDRESS} with ${TOKEN}`);
      }),
    );
    expect(logged).toHaveLength(1);
    expectNoSecrets(logged);
  });

  it("logs nothing on success", async () => {
    const logged = await runFailing(vi.fn(async () => okResponse()));
    expect(logged).toEqual([]);
  });
});
