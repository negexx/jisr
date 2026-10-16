import "server-only";

import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, formCsrfMiddleware, isAPIError } from "better-auth/api";
import type { magicLink } from "better-auth/plugins";
import { z } from "zod";

import { accountsEnabled } from "./accounts-enabled";
import { ACCOUNTS_DISABLED_CODE } from "./accounts-gate";
import {
  NONCE_COOKIE,
  nonceCookieAttributes,
  nonceIdentifier,
  nonceMatches,
} from "./magic-link-nonce";

// Todo 28, F3 (ruling Q16). Better Auth 1.7.7's magic-link plugin verifies only on
// GET /magic-link/verify?token=… (plugins/magic-link/index.mjs: `method: "GET"`, `query:
// magicLinkVerifyQuerySchema`), which signs in whoever opens the URL: a mail scanner that prefetches
// it spends the token, a victim sent an attacker's link is signed into the attacker's account, and
// the token lands in host request logs. The emailed link opens our confirm page instead, and the
// page's button posts the token here in a JSON body. This endpoint runs the plugin's own verify
// handler as a plain function call with that token (the pattern Better Auth uses itself for
// POST /delete-user with a token, api/routes/update-user.mjs), so token consumption, user creation
// (and with it the user.create.before admission gate) and session creation stay the library's own.
// The GET route is closed by the auth instance's before hook; a plain call skips hooks.
export const MAGIC_LINK_CONFIRM_PATH = "/magic-link/confirm";

const INVALID_TOKEN_CODE = "INVALID_TOKEN";

// Better Auth's token is 32 letters; the bound only keeps junk away from the hasher and the database.
const TOKEN = /^[0-9A-Za-z_-]{1,128}$/;

type MagicLinkVerify = ReturnType<typeof magicLink>["endpoints"]["magicLinkVerify"];

function refusal(code: string): APIError {
  return new APIError("BAD_REQUEST", { message: "The sign-in link could not be used.", code });
}

// The verify handler answers every failure with a redirect to `?error=<code>` (its errorCallbackURL
// defaults to "/" on the base URL). The code is the only part kept; anything else is INVALID_TOKEN.
function codeOfRedirect(error: unknown): string | null {
  if (!isAPIError(error) || error.status !== "FOUND") return null;
  const location = error.headers instanceof Headers ? error.headers.get("location") : null;
  if (location === null) return INVALID_TOKEN_CODE;
  try {
    const code = new URL(location, "http://placeholder.invalid").searchParams.get("error");
    return code !== null && /^[A-Za-z0-9_-]{1,64}$/.test(code) ? code : INVALID_TOKEN_CODE;
  } catch {
    return INVALID_TOKEN_CODE;
  }
}

export function magicLinkConfirm(verify: MagicLinkVerify) {
  return {
    id: "magic-link-confirm",
    endpoints: {
      magicLinkConfirm: createAuthEndpoint(
        MAGIC_LINK_CONFIRM_PATH,
        {
          method: "POST",
          body: z.object({ token: z.string() }),
          // Login CSRF: a cross-site navigation is refused, and any browser request (Fetch Metadata,
          // Origin or Referer present) must come from a trusted origin, even without a cookie. The
          // global origin check covers only requests that carry cookies.
          use: [formCsrfMiddleware],
          // The response sets the session cookie, so no intermediary may keep it.
          metadata: { noStore: true },
        },
        async (ctx) => {
          // Defence in depth behind the gate plugin: an auth.api call skips the HTTP handler.
          if (!accountsEnabled()) {
            throw new APIError("FORBIDDEN", {
              message: "Accounts are not available yet.",
              code: ACCOUNTS_DISABLED_CODE,
            });
          }
          const { token } = ctx.body;
          if (!TOKEN.test(token)) throw refusal(INVALID_TOKEN_CODE);
          // Read the requesting browser's nonce, then consume and clear it: the token is single-use,
          // so its nonce is too. A match is "same browser"; a missing or mismatched one still signs
          // in (cross-device keeps working) but is marked, and the landing withholds the import.
          const nonce = ctx.getCookie(NONCE_COOKIE);
          const stored = await ctx.context.internalAdapter.consumeVerificationValue(
            nonceIdentifier(token),
          );
          ctx.setCookie(NONCE_COOKIE, "", nonceCookieAttributes(ctx.context.baseURL, 0));
          let result: Awaited<ReturnType<typeof callVerify>>;
          try {
            result = await callVerify(verify, ctx, token);
          } catch (error) {
            const code = codeOfRedirect(error);
            if (code !== null) throw refusal(code);
            throw error;
          }
          // The inner call's Set-Cookie headers (the session) live on its own context, which a plain
          // call drops: they are carried onto this response.
          for (const cookie of result.headers.getSetCookie()) {
            ctx.responseHeaders.append("set-cookie", cookie);
          }
          return ctx.json({
            status: true,
            sameBrowser: nonceMatches(nonce, stored?.value ?? null),
          });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

// No callbackURL: the handler then answers with JSON instead of a redirect on success. The inner
// call gets this request's auth context, request, headers and path, so the user.create.before hook
// sees MAGIC_LINK_CONFIRM_PATH and the session is created exactly as the GET route would create it.
type ConfirmContext = {
  context: Record<string, unknown>;
  request?: Request;
  headers?: Headers;
  path: string;
};

function callVerify(verify: MagicLinkVerify, ctx: ConfirmContext, token: string) {
  return verify({
    context: ctx.context,
    request: ctx.request,
    headers: ctx.headers ?? new Headers(),
    path: ctx.path,
    method: "GET",
    query: { token },
    asResponse: false,
    returnHeaders: true,
  });
}
