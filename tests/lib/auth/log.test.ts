import { APIError } from "better-auth/api";
import { afterEach, describe, expect, it, vi } from "vitest";

import { onAuthApiError, redactLogText, scrubbedAuthLog } from "@/lib/auth/log";

afterEach(() => {
  vi.restoreAllMocks();
});

function spyOnConsole() {
  return {
    error: vi.spyOn(console, "error").mockImplementation(() => undefined),
    warn: vi.spyOn(console, "warn").mockImplementation(() => undefined),
    log: vi.spyOn(console, "log").mockImplementation(() => undefined),
  };
}

describe("redactLogText", () => {
  it("blanks addresses and URLs and bounds the length", () => {
    expect(
      redactLogText("Invalid callbackURL: http://evil.example/x?token=abc for ana@example.com"),
    ).toBe("Invalid callbackURL: <url> for <address>");
    expect(redactLogText("x".repeat(500))).toHaveLength(200);
  });

  it("blanks a token in a relative URL's query or fragment", () => {
    expect(redactLogText("Invalid callbackURL: /fr/welcome?token=abc123SECRET&return=/fr")).toBe(
      "Invalid callbackURL: /fr/welcome?token=<token>&return=/fr",
    );
    expect(redactLogText("rejected /api/auth/magic-link/verify?a=1&TOKEN=xyz789")).toBe(
      "rejected /api/auth/magic-link/verify?a=1&TOKEN=<token>",
    );
    expect(redactLogText("/fr/account/delete#token=tok123")).toBe(
      "/fr/account/delete#token=<token>",
    );
  });

  it("blanks a token at the start of the text or after whitespace", () => {
    expect(redactLogText("token=abc123SECRET&x=1")).toBe("token=<token>&x=1");
    expect(redactLogText("bad value token=abc123SECRET in body")).toBe(
      "bad value token=<token> in body",
    );
    expect(redactLogText("rejected	token=abc")).toBe("rejected	token=<token>");
  });

  it("leaves a word that only ends in token= alone", () => {
    expect(redactLogText("csrftoken=abc")).toBe("csrftoken=abc");
  });

  it("blanks a percent-encoded address", () => {
    expect(redactLogText("Invalid callbackURL: /fr/welcome?email=ana.b%40example.com&x=1")).toBe(
      "Invalid callbackURL: /fr/welcome?email=<address>&x=1",
    );
    expect(redactLogText("Ana%40Example.COM")).toBe("<address>");
  });
});

describe("scrubbedAuthLog", () => {
  it("keeps an Error's name and code and drops its message, stack and every object", () => {
    const spies = spyOnConsole();
    const driver = Object.assign(new Error("password authentication failed for user ana"), {
      code: "28P01",
    });
    const failure = new Error("Failed query: select ... params: tok-123", { cause: driver });
    failure.name = "DrizzleQueryError";
    scrubbedAuthLog("error", "Failed to read session from database", failure, { userId: "u-1" });
    expect(spies.error).toHaveBeenCalledExactlyOnceWith(
      "[better-auth] Failed to read session from database",
      ["DrizzleQueryError 28P01"],
    );
  });

  it("routes by level", () => {
    const spies = spyOnConsole();
    scrubbedAuthLog("warn", "careful");
    scrubbedAuthLog("info", "fyi");
    expect(spies.warn).toHaveBeenCalledExactlyOnceWith("[better-auth] careful");
    expect(spies.log).toHaveBeenCalledExactlyOnceWith("[better-auth] fyi");
    expect(spies.error).not.toHaveBeenCalled();
  });
});

describe("onAuthApiError", () => {
  it("leaves an ordinary refusal alone and logs a 500 without its message", () => {
    const spies = spyOnConsole();
    expect(
      onAuthApiError(new APIError("BAD_REQUEST", { message: "ana@example.com" })),
    ).toBeUndefined();
    expect(spies.error).not.toHaveBeenCalled();
    onAuthApiError(new APIError("INTERNAL_SERVER_ERROR", { message: "ana@example.com" }));
    expect(spies.error).toHaveBeenCalledExactlyOnceWith("[better-auth] INTERNAL_SERVER_ERROR", [
      "APIError",
    ]);
  });

  it("turns any other error into a 500 whose body is only its code, after one scrubbed line", () => {
    const spies = spyOnConsole();
    const thrown = (() => {
      try {
        onAuthApiError(new Error("boom ana@example.com"));
      } catch (error) {
        return error;
      }
      return null;
    })();
    expect(thrown).toBeInstanceOf(APIError);
    expect(thrown).toMatchObject({
      status: "INTERNAL_SERVER_ERROR",
      body: { code: "INTERNAL_SERVER_ERROR" },
    });
    expect(spies.error).toHaveBeenCalledExactlyOnceWith("[better-auth] unexpected error", [
      "Error",
    ]);
  });
});
