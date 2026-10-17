// T1c audit probes (README-ONLY audit): Server Actions / handlers / proxy.
// Each assertion encodes a documented invariant (ADR 0013, .claude/rules/*, existing specs).
// A failure is audit evidence, not a test to fix. Pure-function probes; DB probes live in
// t1c-server-db-probes.test.ts.
import { describe, expect, it } from "vitest";

import { accountsEnabled } from "@/lib/auth/accounts-enabled";
import { accountsOffResponse } from "@/lib/auth/accounts-gate";
import {
  landingReturnPath,
  readSignInLink,
  safeReturnPath,
  signInConfirmPath,
} from "@/lib/auth/callback-urls";
import { readDeletionToken } from "@/lib/auth/account-deletion";
import { exportFilenameFrom } from "@/lib/auth/account-export";
import { maskEmail } from "@/lib/auth/mask-email";
import { cooldownKey, normalizeEmail } from "@/lib/auth/normalize-email";
import { exportFilename } from "@/lib/server/account-export";

describe("kill switch + off response", () => {
  it("treats the flag as an allow-list", () => {
    for (const value of ["true", "1", " TRUE ", "True"]) {
      expect(accountsEnabled({ ACCOUNTS_ENABLED: value })).toBe(true);
    }
    for (const value of [undefined, "", "false", "yes", "on", "2", "true!"]) {
      expect(accountsEnabled({ ACCOUNTS_ENABLED: value })).toBe(false);
    }
  });

  it("answers an exact GET get-session as signed-out and everything else 403", async () => {
    const base = "/api/auth";
    const getSession = await accountsOffResponse(
      new Request("http://x.test/api/auth/get-session", { method: "GET" }),
      base,
    );
    expect(getSession.status).toBe(200);
    expect(await getSession.json()).toBeNull();
    expect(getSession.headers.get("cache-control")).toBe("no-store");

    for (const request of [
      new Request("http://x.test/api/auth/get-session/", { method: "GET" }),
      new Request("http://x.test/api/auth/get-session", { method: "POST" }),
      new Request("http://x.test/api/auth/sign-in/magic-link", { method: "POST" }),
    ]) {
      const response = await accountsOffResponse(request, base);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ code: "ACCOUNTS_DISABLED" });
    }
  });
});

describe("return-path safety", () => {
  it("falls back to the locale home for anything not a plain known-locale path", () => {
    expect(safeReturnPath(null, "fr")).toBe("/fr");
    expect(safeReturnPath("", "fr")).toBe("/fr");
    expect(safeReturnPath("//evil.example/x", "fr")).toBe("/fr");
    expect(safeReturnPath("https://evil.example", "fr")).toBe("/fr");
    expect(safeReturnPath("/de/x", "fr")).toBe("/fr");
    expect(safeReturnPath("/fr/../../en", "fr")).toBe("/fr");
    expect(safeReturnPath("/fr/%2e%2e/en", "fr")).toBe("/fr");
    expect(safeReturnPath("/fr/\\evil", "fr")).toBe("/fr");
    expect(safeReturnPath("/fr/a b", "fr")).toBe("/fr");
  });

  it("keeps a plain path under any known locale", () => {
    expect(safeReturnPath("/fr/compare", "fr")).toBe("/fr/compare");
    expect(safeReturnPath("/ar/programs/x", "fr")).toBe("/ar/programs/x");
    expect(safeReturnPath("/fr/", "fr")).toBe("/fr/");
    expect(safeReturnPath("/en", "fr")).toBe("/en");
  });

  it("defaults the landing return to the plan when absent, else the sanitised value", () => {
    expect(landingReturnPath(null, "fr")).toBe("/fr/plan");
    expect(landingReturnPath("", "fr")).toBe("/fr/plan");
    expect(landingReturnPath("//evil.example", "fr")).toBe("/fr");
  });
});

describe("link fragments", () => {
  it("reads the sign-in token and return path, rejecting unsafe values", () => {
    const good = readSignInLink("#token=abc&return=/fr/compare", "fr");
    expect(good).toEqual({ token: "abc", returnPath: "/fr/compare" });
    const bad = readSignInLink("#token=a b&return=//evil.example", "fr");
    expect(bad.token).toBeNull();
    expect(bad.returnPath).toBe("/fr");
  });

  it("builds a confirm path with an empty query and a safe fragment", () => {
    const path = signInConfirmPath("ar", "tok", "/ar/compare");
    expect(path.startsWith("/ar/sign-in/confirm#")).toBe(true);
    expect(path).not.toContain("?");
    const fragment = new URLSearchParams(path.slice(path.indexOf("#") + 1));
    expect(fragment.get("token")).toBe("tok");
    expect(fragment.get("return")).toBe("/ar/compare");
  });

  it("reads a deletion token only from a well-shaped fragment", () => {
    expect(readDeletionToken("#token=abc123")).toBe("abc123");
    expect(readDeletionToken("token=abc123")).toBe("abc123");
    expect(readDeletionToken("#token=a b")).toBeNull();
    expect(readDeletionToken("#other=abc")).toBeNull();
  });
});

describe("mailbox normalisation", () => {
  it("normalises case and surrounding space", () => {
    expect(normalizeEmail("  Ana@Example.COM ")).toBe("ana@example.com");
  });

  it("collapses +tags and Gmail dots for the cooldown key only", () => {
    expect(cooldownKey("a.b+news@googlemail.com")).toBe("ab@gmail.com");
    expect(cooldownKey("a.b@gmail.com")).toBe("ab@gmail.com");
    expect(cooldownKey("a+1@example.com")).toBe("a@example.com");
    expect(cooldownKey("a.b@example.com")).toBe("a.b@example.com");
  });
});

describe("masking + filenames", () => {
  it("masks the local part", () => {
    expect(maskEmail("alice@example.com")).toBe("a***@example.com");
    expect(maskEmail("no-at-sign")).toBe("***");
  });

  it("accepts only a safe server file name", () => {
    expect(exportFilenameFrom('attachment; filename="jisr-export-2026-10-15.json"')).toBe(
      "jisr-export-2026-10-15.json",
    );
    expect(exportFilenameFrom('attachment; filename="../../etc/passwd"')).toBe("jisr-export.json");
    expect(exportFilenameFrom(null)).toBe("jisr-export.json");
  });

  it("names the export after the UTC day", () => {
    expect(exportFilename(new Date("2026-10-15T23:59:59.999Z"))).toBe("jisr-export-2026-10-15.json");
    expect(exportFilename(new Date("2026-10-16T00:00:00.000Z"))).toBe("jisr-export-2026-10-16.json");
  });
});
