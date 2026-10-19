import { afterEach, describe, expect, it, vi } from "vitest";

import { accountsGate } from "@/lib/auth/accounts-gate";

type GateResult = { response: Response } | undefined;

function gateHandler(): (request: Request, context: { baseURL: string }) => Promise<GateResult> {
  const onRequest = accountsGate().onRequest;
  if (typeof onRequest !== "function") throw new Error("accounts gate has no onRequest");
  return onRequest as unknown as (
    request: Request,
    context: { baseURL: string },
  ) => Promise<GateResult>;
}

function getRequest(path: string): Request {
  return new Request(`http://localhost:3000${path}`, { method: "GET" });
}

describe("accountsGate while accounts are off", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers get-session as signed-out when the base URL carries a path (audit T1c-F2)", async () => {
    vi.stubEnv("ACCOUNTS_ENABLED", "false");
    const result = await gateHandler()(getRequest("/api/auth/get-session"), {
      baseURL: "http://localhost:3000/app",
    });
    expect(result?.response.status).toBe(200);
    expect(await result?.response.json()).toBeNull();
  });

  it("still refuses another /api/auth request under a path-carrying base URL", async () => {
    vi.stubEnv("ACCOUNTS_ENABLED", "false");
    const result = await gateHandler()(getRequest("/api/auth/sign-in/magic-link"), {
      baseURL: "http://localhost:3000/app",
    });
    expect(result?.response.status).toBe(403);
    expect(await result?.response.json()).toEqual({ code: "ACCOUNTS_DISABLED" });
  });

  it("answers get-session as signed-out with a bare-origin base URL too", async () => {
    vi.stubEnv("ACCOUNTS_ENABLED", "false");
    const result = await gateHandler()(getRequest("/api/auth/get-session"), {
      baseURL: "http://localhost:3000",
    });
    expect(result?.response.status).toBe(200);
  });
});
