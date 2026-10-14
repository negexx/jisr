import "server-only";

import type { BetterAuthPlugin } from "better-auth";

import { accountsEnabled } from "./accounts-enabled";

export const ACCOUNTS_DISABLED_CODE = "ACCOUNTS_DISABLED";

const NO_STORE = { "cache-control": "no-store" };

// Better Auth's own answer to a signed-out visitor, so the browser client behaves the same
// whether accounts are off or the visitor simply has no session.
function signedOutSession(): Response {
  return Response.json(null, { status: 200, headers: NO_STORE });
}

function accountsDisabled(): Response {
  return Response.json({ code: ACCOUNTS_DISABLED_CODE }, { status: 403, headers: NO_STORE });
}

function isSessionRead(request: Request, baseURL: string): boolean {
  if (request.method !== "GET") return false;
  const basePath = new URL(baseURL).pathname.replace(/\/+$/, "");
  return new URL(request.url).pathname === `${basePath}/get-session`;
}

// The kill switch (plan M-12): while accounts are off, every /api/auth request is refused,
// not just sign-up. Google and magic-link accounts are created on GET callbacks, so a
// POST-only block would leave creation open. Runs first in the router, before any DB work,
// and reads the flag per request.
export function accountsGate(): BetterAuthPlugin {
  return {
    id: "accounts-gate",
    onRequest: async (request, context) => {
      if (accountsEnabled()) return;
      return {
        response: isSessionRead(request, context.baseURL) ? signedOutSession() : accountsDisabled(),
      };
    },
  };
}
