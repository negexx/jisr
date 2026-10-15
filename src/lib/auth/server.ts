import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getOAuthState } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { EMAIL_MAX_LENGTH } from "@/db/schema/app";
import { eraseAccountResidue } from "@/lib/server/account-erasure";
import { type AuthEmailRequest, resolveAuthEmailLocale, sendAuthEmail } from "@/lib/server/email";
import { claimEmailSendSlot } from "@/lib/server/email-cooldown";
import { accountsEnabled } from "./accounts-enabled";
import { ACCOUNTS_DISABLED_CODE, accountsGate } from "./accounts-gate";
import {
  type AdmissionConfirmation,
  confirmationFromOAuthState,
  evaluateAdmission,
} from "./admission";
import { accountDeleteConfirmPath } from "./callback-urls";
import { CURRENT_CONSENT_VERSION } from "./consent";
import { readPendingSignup } from "./pending-signup";

export const MAGIC_LINK_EXPIRY_S = 15 * 60;

const OAUTH_CALLBACK_PATH = "/callback/:id";
const MAGIC_LINK_VERIFY_PATH = "/magic-link/verify";
const MAGIC_LINK_SIGN_IN_PATH = "/sign-in/magic-link";
const DELETE_USER_CALLBACK_PATH = "/delete-user/callback";

// getOAuthState throws outside a Better Auth request scope; that is simply "no evidence".
async function readOAuthState(): Promise<unknown> {
  try {
    return await getOAuthState();
  } catch {
    return null;
  }
}

function googleEmailNotVerifiedError(): APIError {
  return new APIError("BAD_REQUEST", {
    message: "Google has not verified this email address.",
    code: "OAUTH_EMAIL_NOT_VERIFIED",
  });
}

// Evidence is scoped to the path that creates the user (see admission.ts). Google evidence rides
// the OAuth state: the client's additionalData is stored server side at /sign-in/social and parsed
// back on the callback, so it cannot change in between, but it is self-declared and
// confirmationFromOAuthState validates it strictly. The pending row is read only on the
// magic-link verify, where following the emailed link proves the address. Every other path
// (Google's ID-token sign-in, server calls) has no evidence and is rejected.
async function admissionEvidence(
  user: { email: string; emailVerified?: boolean },
  ctx: { path?: string } | null,
): Promise<AdmissionConfirmation | null> {
  switch (ctx?.path) {
    case OAUTH_CALLBACK_PATH:
      // Without a verified address a Google identity could pre-create an account for an email it
      // does not own, which the real owner would later be linked into.
      if (user.emailVerified !== true) throw googleEmailNotVerifiedError();
      return confirmationFromOAuthState(await readOAuthState());
    case MAGIC_LINK_VERIFY_PATH:
      return readPendingSignup(user.email);
    default:
      return null;
  }
}

function accountsDisabledError(): APIError {
  return new APIError("FORBIDDEN", {
    message: "Accounts are not available yet.",
    code: ACCOUNTS_DISABLED_CODE,
  });
}

function emailCooldownError(): APIError {
  return new APIError("TOO_MANY_REQUESTS", {
    message: "An email was sent a moment ago. Wait a minute before asking for another.",
    code: "EMAIL_COOLDOWN",
  });
}

// The switch is checked before the slot is claimed so a disabled instance writes no cooldown
// row. The refusal names no address.
async function claimSendSlot(kind: AuthEmailRequest["kind"], email: string): Promise<void> {
  if (!accountsEnabled()) throw accountsDisabledError();
  if (!(await claimEmailSendSlot(kind, email))) throw emailCooldownError();
}

async function sendAuthEmailWhileEnabled(request: AuthEmailRequest): Promise<void> {
  if (!accountsEnabled()) throw accountsDisabledError();
  await sendAuthEmail(request);
}

function notFoundError(): APIError {
  return new APIError("NOT_FOUND", { message: "Not found.", code: "NOT_FOUND" });
}

// Exactly one claim per magic-link send, taken before the plugin writes its verification row, so
// a refused request leaves no unused token behind. Hooks run for the HTTP route and for
// auth.api.signInMagicLink alike (both dispatch through the hook pipeline), which covers the
// signup Server Action and a direct POST. The body is not validated yet at this point: a value
// that is not a plausible address is left to the endpoint's own validation, unclaimed.
//
// Better Auth's GET /delete-user/callback deletes the signed-in account on a plain GET (ruling Q2:
// a GET must never delete), so it is closed; deletion is confirmed only by POST /delete-user with
// the token, from the confirm page. That POST reaches the same callback logic as a plain function
// call, which skips hooks, so closing the route here does not close it.
const beforeAuthEndpoint = createAuthMiddleware(async (ctx) => {
  if (ctx.path === DELETE_USER_CALLBACK_PATH) throw notFoundError();
  if (ctx.path !== MAGIC_LINK_SIGN_IN_PATH) return;
  if (!accountsEnabled()) throw accountsDisabledError();
  const email: unknown = ctx.body?.email;
  if (typeof email !== "string" || !email.includes("@")) return;
  if (email.trim().length > EMAIL_MAX_LENGTH) return;
  await claimSendSlot("magic-link", email);
});

// The message names variables, never their values, so it is safe to log.
export class AuthMisconfiguredError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Accounts are on but the auth configuration is invalid: ${problems.join(", ")}`);
    this.name = "AuthMisconfiguredError";
  }
}

function presentEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? undefined : value;
}

// Magic-link URLs and the OAuth redirect URI are built from it, so a relative or non-web value
// must stop the instance rather than produce broken links.
function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

// The address Better Auth puts in front of every token URL it builds, so the emailed link is on the
// same origin as the sign-in links. A base URL that carries a path keeps only its origin here.
function deleteConfirmUrl(baseURL: string, url: string, token: string) {
  const locale = resolveAuthEmailLocale(url);
  return { locale, url: new URL(accountDeleteConfirmPath(locale, token), baseURL).toString() };
}

function createAuth(secret: string, baseURL: string) {
  return betterAuth({
    appName: "Jisr",
    baseURL,
    secret,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    // Project rule: never record IPs. Better Auth then also skips its IP-keyed rate limiter, so
    // throttling of auth emails must live in our own code (the email_cooldowns slot).
    advanced: { ipAddress: { disableIpTracking: true } },
    hooks: { before: beforeAuthEndpoint },
    // Encrypts the stored provider access and refresh tokens with the auth secret.
    account: { encryptOAuthTokens: true },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      },
    },
    user: {
      additionalFields: {
        // Nullable by design (plan R2-2): "consent missing -> created, features gated" needs
        // a row without consent, which required: true would forbid. input: false keeps all
        // three out of user input, so only this server instance can set them.
        consentVersion: { type: "string", required: false, input: false },
        consentedAt: { type: "date", required: false, input: false },
        role: { type: "string", required: false, defaultValue: "student", input: false },
      },
      deleteUser: {
        enabled: true,
        // Google-only users have no password, so deletion is always confirmed by email: with a
        // sender configured, POST /delete-user without a token only sends, never deletes, whatever
        // the session's age. Better Auth runs this through runInBackgroundOrAwait, which swallows
        // a throw: a refused cooldown or a failed send still answers "Verification email sent".
        sendDeleteAccountVerification: async ({ user, url: callbackUrl, token }) => {
          await claimSendSlot("delete-account", user.email);
          const { locale, url } = deleteConfirmUrl(baseURL, callbackUrl, token);
          await sendAuthEmailWhileEnabled({
            kind: "delete-account",
            to: user.email,
            url,
            token,
            metadata: { locale },
          });
        },
        // Better Auth deletes the user, session and account rows, and the app tables cascade from
        // user.id; everything else that names the student is erased here. Before, so nothing is
        // left if the delete itself fails after it; after too, for a sign-in link or cooldown
        // written for the address while the delete ran.
        beforeDelete: async (user) => {
          if (!accountsEnabled()) throw accountsDisabledError();
          await eraseAccountResidue(db, user);
        },
        afterDelete: async (user) => {
          await eraseAccountResidue(db, user);
        },
      },
    },
    databaseHooks: {
      // Ruling Q3: nothing reads the device or address of a session, so neither is stored.
      session: {
        create: { before: async () => ({ data: { userAgent: null, ipAddress: null } }) },
      },
      user: {
        create: {
          before: async (user, ctx) => {
            // Defence in depth behind the accounts gate plugin: auth.api.* server calls and
            // anything else that skips the HTTP handler still cannot create a user while off.
            if (!accountsEnabled()) throw accountsDisabledError();
            const decision = evaluateAdmission(
              await admissionEvidence(user, ctx),
              new Date(),
              CURRENT_CONSENT_VERSION,
            );
            if (decision.kind === "reject") {
              throw new APIError("BAD_REQUEST", {
                message: "Age 16 or over must be confirmed before an account can be created.",
                code: "AGE_NOT_CONFIRMED",
              });
            }
            return {
              data: {
                ...user,
                consentVersion: decision.consentVersion,
                consentedAt: decision.consentedAt,
              },
            };
          },
        },
      },
      // Jisr never reads the provider ID token, and Better Auth stores it unencrypted even with
      // encryptOAuthTokens (only access and refresh tokens go through it), so it is never kept.
      account: {
        create: { before: async () => ({ data: { idToken: null } }) },
        update: { before: async () => ({ data: { idToken: null } }) },
      },
      verification: {
        create: {
          // Magic-link and deletion tokens are verification rows written before any email goes
          // out. Refusing them here keeps a disabled instance from storing tokens at all, for
          // callers that skip the HTTP gate (auth.api.* on the server).
          before: async () => {
            if (!accountsEnabled()) throw accountsDisabledError();
          },
        },
      },
    },
    plugins: [
      accountsGate(),
      magicLink({
        expiresIn: MAGIC_LINK_EXPIRY_S,
        disableSignUp: false,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url, token, metadata }) => {
          // The cooldown slot was claimed by the before hook (claimMagicLinkSlot).
          await sendAuthEmailWhileEnabled({ kind: "magic-link", to: email, url, token, metadata });
        },
      }),
      // Must stay last: it reads Set-Cookie off every other plugin's response.
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

// Better Auth is created on first use, never at import: constructing it with
// NODE_ENV=production and no secret rejects ("You are using the default secret"), and until
// launch production runs exactly that way. The base URL is always explicit, so it is never
// inferred from a request's Host header (magic-link URLs would be poisonable).
export function getAuth(): Auth {
  if (instance) return instance;
  const secret = presentEnv("BETTER_AUTH_SECRET");
  const baseURL = presentEnv("BETTER_AUTH_URL");
  const problems = [
    ...(secret === undefined ? ["BETTER_AUTH_SECRET is missing"] : []),
    ...(baseURL === undefined ? ["BETTER_AUTH_URL is missing"] : []),
    ...(baseURL !== undefined && !isAbsoluteHttpUrl(baseURL)
      ? ["BETTER_AUTH_URL is not an absolute http(s) URL"]
      : []),
  ];
  if (secret === undefined || baseURL === undefined || problems.length > 0) {
    throw new AuthMisconfiguredError(problems);
  }
  instance = createAuth(secret, baseURL);
  return instance;
}
