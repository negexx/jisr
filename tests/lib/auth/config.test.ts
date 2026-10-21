import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as dbSchema from "@/db/schema";
import { accountsEnabled } from "@/lib/auth/accounts-enabled";
import { AUTH_RATE_LIMIT_RULES, getAuth } from "@/lib/auth/server";

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`auth config: ${label} is missing`);
  return value;
}

describe("better auth server config", () => {
  let options: ReturnType<typeof getAuth>["options"];

  beforeAll(() => {
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-0123");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    options = getAuth().options;
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("declares the server-owned consent, age and role fields as non-input", () => {
    const fields = required(options.user?.additionalFields, "user.additionalFields");
    expect(Object.keys(fields).sort()).toEqual(["consentVersion", "consentedAt", "role"]);

    expect(fields.consentVersion.type).toBe("string");
    expect(fields.consentVersion.required).toBe(false);
    expect(fields.consentVersion.input).toBe(false);

    expect(fields.consentedAt.type).toBe("date");
    expect(fields.consentedAt.required).toBe(false);
    expect(fields.consentedAt.input).toBe(false);

    expect(fields.role.type).toBe("string");
    expect(fields.role.input).toBe(false);
    expect(fields.role.defaultValue).toBe("student");
  });

  it("maps every additional user field to a column of the generated user table", () => {
    const fields = required(options.user?.additionalFields, "user.additionalFields");
    const columns = Object.keys(dbSchema.user);
    for (const name of Object.keys(fields)) {
      expect(
        columns,
        `schema.user has no "${name}" column; regenerate src/db/schema/auth.ts`,
      ).toContain(name);
    }
  });

  it("keeps IP tracking on, reading only x-forwarded-for with IPv6 collapsed to its /64", () => {
    const ipAddress: {
      disableIpTracking?: boolean;
      ipAddressHeaders?: string[];
      ipv6Subnet?: number;
      trustedProxies?: string[];
    } = required(options.advanced?.ipAddress, "advanced.ipAddress");
    expect(ipAddress.disableIpTracking).not.toBe(true);
    expect(ipAddress.ipAddressHeaders).toEqual(["x-forwarded-for"]);
    expect(ipAddress.ipv6Subnet).toBe(64);
    expect(ipAddress.trustedProxies).toBeUndefined();
  });

  it("turns Better Auth's request limiter on, with our rules and hashed storage", () => {
    const rateLimit = required(options.rateLimit, "rateLimit");
    expect(rateLimit.enabled).toBe(true);
    expect(rateLimit.window).toBe(60);
    expect(rateLimit.max).toBe(100);
    expect(rateLimit.customRules).toEqual(AUTH_RATE_LIMIT_RULES);
    expect(typeof rateLimit.customStorage?.consume).toBe("function");
  });

  it("leaves get-session out of the limiter so page loads write no throttle row", () => {
    expect(AUTH_RATE_LIMIT_RULES["/get-session"]).toBe(false);
  });

  it("limits sign-in links, Google starts, link confirms and deletions", () => {
    expect(AUTH_RATE_LIMIT_RULES).toEqual({
      "/get-session": false,
      "/sign-in/magic-link": { window: 60, max: 3 },
      "/sign-in/social": { window: 60, max: 5 },
      "/magic-link/confirm": { window: 60, max: 5 },
      "/delete-user": { window: 3600, max: 5 },
    });
  });

  it("enables account deletion with a verification email callback", () => {
    const deleteUser = required(options.user?.deleteUser, "user.deleteUser");
    expect(deleteUser.enabled).toBe(true);
    expect(typeof deleteUser.sendDeleteAccountVerification).toBe("function");
  });

  it("registers the magic-link provider and lists nextCookies() last", () => {
    const plugins = required(options.plugins, "plugins");
    expect(plugins.map((plugin) => plugin.id)).toContain("magic-link");
    expect(plugins.at(-1)?.id).toBe("next-cookies");
  });

  it("registers the create-before admission gate hook", () => {
    const before = options.databaseHooks?.user?.create?.before;
    expect(typeof before).toBe("function");
  });

  it("configures the Google social provider from env", () => {
    expect(required(options.socialProviders, "socialProviders").google).toBeDefined();
  });
});

describe("accountsEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each<[string, Record<string, string | undefined>, boolean]>([
    ["unset", {}, false],
    ["an empty string", { ACCOUNTS_ENABLED: "" }, false],
    ["only whitespace", { ACCOUNTS_ENABLED: "   " }, false],
    ["1", { ACCOUNTS_ENABLED: "1" }, true],
    ["the literal true", { ACCOUNTS_ENABLED: "true" }, true],
    ["TRUE with padding", { ACCOUNTS_ENABLED: "  TRUE " }, true],
    ["the literal false", { ACCOUNTS_ENABLED: "false" }, false],
    ["an explicit off token", { ACCOUNTS_ENABLED: "OFF" }, false],
    ["a zero token", { ACCOUNTS_ENABLED: "0" }, false],
    ["no", { ACCOUNTS_ENABLED: "no" }, false],
    ["disabled", { ACCOUNTS_ENABLED: "disabled" }, false],
    ["a typo of false", { ACCOUNTS_ENABLED: "fasle" }, false],
    ["an unrecognised word", { ACCOUNTS_ENABLED: "yes-please" }, false],
    ["on", { ACCOUNTS_ENABLED: "on" }, false],
    ["yes", { ACCOUNTS_ENABLED: "yes" }, false],
    ["2", { ACCOUNTS_ENABLED: "2" }, false],
  ])("is %s -> %s", (_label, env, expected) => {
    expect(accountsEnabled(env)).toBe(expected);
  });

  it("reads the process environment when called without an argument", () => {
    vi.stubEnv("ACCOUNTS_ENABLED", undefined);
    expect(accountsEnabled()).toBe(false);
    vi.stubEnv("ACCOUNTS_ENABLED", "true");
    expect(accountsEnabled()).toBe(true);
  });
});
