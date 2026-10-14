import "server-only";

import { toNextJsHandler } from "better-auth/next-js";

import { accountsEnabled } from "./accounts-enabled";
import { AUTH_BASE_PATH, accountsOffResponse } from "./accounts-gate";
import { AuthMisconfiguredError, getAuth } from "./server";

export const AUTH_MISCONFIGURED_CODE = "AUTH_MISCONFIGURED";

type Handlers = Pick<ReturnType<typeof toNextJsHandler>, "GET" | "POST">;

let handlers: Handlers | undefined;

function enabledHandlers(): Handlers {
  if (handlers === undefined) {
    const { GET, POST } = toNextJsHandler(getAuth());
    handlers = { GET, POST };
  }
  return handlers;
}

function authMisconfigured(): Response {
  return Response.json(
    { code: AUTH_MISCONFIGURED_CODE },
    { status: 500, headers: { "cache-control": "no-store" } },
  );
}

// Better Auth must not initialise while accounts are off, so while off this answers on its own
// and never touches getAuth(). While on, the first request creates the instance; a missing
// secret or base URL is a 500 with no detail, and is retried on the next request.
async function handle(method: keyof Handlers, request: Request): Promise<Response> {
  if (!accountsEnabled()) return accountsOffResponse(request, AUTH_BASE_PATH);
  try {
    return await enabledHandlers()[method](request);
  } catch (error) {
    if (error instanceof AuthMisconfiguredError) return authMisconfigured();
    throw error;
  }
}

export const authHandler: Handlers = {
  GET: (request) => handle("GET", request),
  POST: (request) => handle("POST", request),
};
