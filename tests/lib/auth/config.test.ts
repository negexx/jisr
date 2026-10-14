import { describe, expect, it } from "vitest";
import * as dbSchema from "@/db/schema";
import { accountsEnabled } from "@/lib/auth/accounts-enabled";
import { auth } from "@/lib/auth/server";

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`auth config: ${label} is missing`);
  return value;
}

describe("better auth server config", () => {
  const options = auth.options;

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

  it("disables IP tracking so session.ip_address is never filled", () => {
    expect(options.advanced?.ipAddress?.disableIpTracking).toBe(true);
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

  it("prints the instantiated auth config surface for manual QA", () => {
    const plugins = required(options.plugins, "plugins");
    const surface = {
      additionalFields: Object.keys(required(options.user?.additionalFields, "additionalFields")),
      deleteUserEnabled: options.user?.deleteUser?.enabled,
      lastPlugin: plugins.at(-1)?.id,
      gateHook: typeof options.databaseHooks?.user?.create?.before,
      accountsEnabled: {
        unset: accountsEnabled({}),
        empty: accountsEnabled({ ACCOUNTS_ENABLED: "" }),
        set: accountsEnabled({ ACCOUNTS_ENABLED: "1" }),
      },
    };
    console.log("[manual-qa] auth config surface:", JSON.stringify(surface, null, 2));
    expect(surface.additionalFields).toHaveLength(3);
  });
});

describe("accountsEnabled", () => {
  it.each<[string, Record<string, string | undefined>, boolean]>([
    ["unset", {}, false],
    ["an empty string", { ACCOUNTS_ENABLED: "" }, false],
    ["only whitespace", { ACCOUNTS_ENABLED: "   " }, false],
    ["a set flag", { ACCOUNTS_ENABLED: "1" }, true],
    ["the literal true", { ACCOUNTS_ENABLED: "true" }, true],
    ["the literal false", { ACCOUNTS_ENABLED: "false" }, false],
    ["an explicit off token", { ACCOUNTS_ENABLED: "OFF" }, false],
    ["a zero token", { ACCOUNTS_ENABLED: "0" }, false],
  ])("is %s -> %s", (_label, env, expected) => {
    expect(accountsEnabled(env)).toBe(expected);
  });

  it("reads the process environment when called without an argument", () => {
    expect(accountsEnabled()).toBe(false);
  });
});
