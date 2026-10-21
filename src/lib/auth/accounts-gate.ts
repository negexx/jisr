import "server-only";

import type { BetterAuthPlugin } from "better-auth";

import { accountsEnabled } from "./accounts-enabled";

export const ACCOUNTS_DISABLED_CODE = "ACCOUNTS_DISABLED";

// Better Auth's default mount point, which the route file at src/app/api/auth/[...all] serves.
export const AUTH_BASE_PATH = "/api/auth";

const NO_STORE = { "cache-control": "no-store" };

// Better Auth's own answer to a signed-out visitor, so the browser client behaves the same
// whether accounts are off or the visitor simply has no session.
function signedOutSession(): Response {
  return Response.json(null, { status: 200, headers: NO_STORE });
}

function accountsDisabled(): Response {
  return Response.json({ code: ACCOUNTS_DISABLED_CODE }, { status: 403, headers: NO_STORE });
}

function isSessionRead(request: Request, basePath: string): boolean {
  if (request.method !== "GET") return false;
  return new URL(request.url).pathname === `${basePath.replace(/\/+$/, "")}/get-session`;
}

// The answer to every /api/auth request while accounts are off: an exact GET get-session is a
// signed-out visitor, everything else is refused. Shared by the gate plugin below and by the
// route handler, which uses it so Better Auth need not exist at all while accounts are off.
export function accountsOffResponse(request: Request, basePath: string): Response {
  return isSessionRead(request, basePath) ? signedOutSession() : accountsDisabled();
}

// The kill switch (plan M-12): while accounts are off, every /api/auth request is refused,
// not just sign-up. Google and magic-link accounts are created on GET callbacks, so a
// POST-only block would leave creation open. Reads the flag per request. The route handler
// answers first while off and never creates the instance, so nothing is written. This plugin is
// the defence for a flag flipped after the instance exists. It is not first in the router:
// Better Auth's request limiter runs before plugin onRequest hooks, so on such an instance a
// request could still write one hashed throttle row (no address, no personal data) before this
// plugin refuses it. That is the only write that can precede the gate.
export function accountsGate(): BetterAuthPlugin {
  return {
    id: "accounts-gate",
    onRequest: async (request) => {
      if (accountsEnabled()) return;
      return {
        response: accountsOffResponse(request, AUTH_BASE_PATH),
      };
    },
  };
}
