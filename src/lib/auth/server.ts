import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getOAuthState } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { eraseAccountResidue } from "@/lib/server/account-erasure";
import { type AuthEmailRequest, resolveAuthEmailLocale, sendAuthEmail } from "@/lib/server/email";
import { claimAuthEmailSend } from "@/lib/server/email-cooldown";
import { accountsEnabled } from "./accounts-enabled";
import { ACCOUNTS_DISABLED_CODE, accountsGate } from "./accounts-gate";
import {
  type AdmissionConfirmation,
  confirmationFromOAuthState,
  evaluateAdmission,
} from "./admission";
import {
  accountDeleteConfirmPath,
  RETURN_PARAM,
  type SignInLinkMode,
  signInConfirmPath,
} from "./callback-urls";
import { CURRENT_CONSENT_VERSION } from "./consent";
import { looksLikeEmail } from "./email-shape";
import { onAuthApiError, scrubbedAuthLog } from "./log";
import { MAGIC_LINK_CONFIRM_PATH, magicLinkConfirm } from "./magic-link-confirm";
import {
  hashNonce,
  NONCE_COOKIE,
  newNonce,
  nonceCookieAttributes,
  nonceIdentifier,
} from "./magic-link-nonce";
import { PENDING_SIGNUP_TTL_S, readPendingSignup, recordPendingSignup } from "./pending-signup";
import { isSignupFor } from "./signup-intent";

// The pending row and the link that can use it expire together.
export const MAGIC_LINK_EXPIRY_S = PENDING_SIGNUP_TTL_S;
export const DELETE_TOKEN_EXPIRY_S = 60 * 60;

const OAUTH_CALLBACK_PATH = "/callback/:id";
const MAGIC_LINK_VERIFY_PATH = "/magic-link/verify";
const MAGIC_LINK_SIGN_IN_PATH = "/sign-in/magic-link";
const DELETE_USER_PATH = "/delete-user";
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
// magic-link confirm (the POST the confirm page sends; it runs the plugin's verify handler inside
// this request, so the hook sees this path), where holding the emailed token proves the address.
// Every other path (Google's ID-token sign-in, the closed GET verify, server calls) has no
// evidence and is rejected.
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
    case MAGIC_LINK_CONFIRM_PATH:
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
    // Also the daily ceiling's answer, which can last until UTC midnight: no time is promised.
    message: "No email can be sent for this address right now. Try again later.",
    code: "EMAIL_COOLDOWN",
  });
}

// The switch is checked before the slot is claimed so a disabled instance writes no cooldown
// row. The mailbox cooldown and the daily ceiling refuse with the same answer, which names no
// address and does not tell a caller which limit it hit.
async function claimSendSlot(kind: AuthEmailRequest["kind"], email: string): Promise<void> {
  if (!accountsEnabled()) throw accountsDisabledError();
  if (!(await claimAuthEmailSend(kind, email))) throw emailCooldownError();
}

function invalidEmailError(): APIError {
  return new APIError("BAD_REQUEST", { message: "Invalid email address.", code: "INVALID_EMAIL" });
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
// signup Server Action and a direct POST. The body is not validated yet at this point, so the
// address is checked here: anything the signup form would refuse (not a string, malformed, longer
// than EMAIL_MAX_LENGTH) is a 400 before any claim, verification row or email. Without that, an
// oversize address skipped the claim yet still passed the endpoint's own check and was sent.
//
// Better Auth's GET /delete-user/callback deletes the signed-in account on a plain GET (ruling Q2:
// a GET must never delete), so it is closed; deletion is confirmed only by POST /delete-user with
// the token, from the confirm page. That POST reaches the same callback logic as a plain function
// call, which skips hooks, so closing the route here does not close it.
//
// GET /magic-link/verify is closed the same way (todo 28, F3, ruling Q16): it signs in whoever opens
// the URL (a prefetching mail scanner spends the token, an attacker's link signs the victim into the
// attacker's account) and carries the token in the query, which reaches host request logs. The
// emailed link opens /<locale>/sign-in/confirm#token=…, and its button posts the token to
// /magic-link/confirm, which runs the same verify handler as a plain call.
const beforeAuthEndpoint = createAuthMiddleware(async (ctx) => {
  if (ctx.path === DELETE_USER_CALLBACK_PATH || ctx.path === MAGIC_LINK_VERIFY_PATH) {
    throw notFoundError();
  }
  if (ctx.path !== MAGIC_LINK_SIGN_IN_PATH) return;
  if (!accountsEnabled()) throw accountsDisabledError();
  const email: unknown = ctx.body?.email;
  if (typeof email !== "string" || !looksLikeEmail(email)) throw invalidEmailError();
  await claimSendSlot("magic-link", email);
  // Only after the claim, so a refused request cannot write or refresh a planted row (todo 28, F2).
  if (isSignupFor(email)) await recordPendingSignup(email);
});

// POST /delete-user with a token runs Better Auth's deletion callback as a plain function call, so the
// session cookie that callback expires is set on a context whose headers are dropped (1.7.7,
// update-user.mjs): the response would leave the dead cookie in the browser. A successful token
// deletion expires it here, on the real response. A refusal returns an APIError and keeps it.
const afterAuthEndpoint = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== DELETE_USER_PATH || typeof ctx.body?.token !== "string") return;
  if (ctx.context.returned instanceof Error) return;
  deleteSessionCookie(ctx);
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

// The emailed sign-in link: our confirm page on the auth base URL's origin, never the plugin's GET
// verify URL. The plugin's URL is read only for what the sign-in request named: its callbackURL
// carries the locale and the landing's return path (authCallbackUrls).
function signInLinkUrl(
  baseURL: string,
  verifyUrl: string,
  token: string,
  mode: SignInLinkMode,
  metadata: Record<string, unknown> | undefined,
) {
  const locale = resolveAuthEmailLocale(verifyUrl, metadata);
  let returnPath: string | null = null;
  try {
    const callback = new URL(verifyUrl).searchParams.get("callbackURL");
    if (callback !== null) {
      returnPath = new URL(callback, "http://placeholder.invalid").searchParams.get(RETURN_PARAM);
    }
  } catch {
    // An unparsable URL keeps no return path: the landing then continues to the plan.
  }
  const path = signInConfirmPath(locale, token, mode, returnPath);
  return { locale, url: new URL(path, baseURL).toString() };
}

function createAuth(secret: string, baseURL: string) {
  const magicLinkPlugin = magicLink({
    expiresIn: MAGIC_LINK_EXPIRY_S,
    disableSignUp: false,
    storeToken: "hashed",
    sendMagicLink: async ({ email, url: verifyUrl, token, metadata }, ctx) => {
      // The cooldown slot was claimed by the before hook (beforeAuthEndpoint). The sign-up
      // wording is chosen by the mode the Server Action sent, but only when the signup intent
      // backs it: metadata alone is caller-controlled on a direct POST.
      const mode = metadata?.mode === "signup" && isSignupFor(email) ? "signup" : "signin";
      const { locale, url } = signInLinkUrl(baseURL, verifyUrl, token, mode, metadata);
      // Ruling Q19: bind this link, softly, to the browser that asked for it. The cookie holds a
      // random nonce; only its hash is stored, keyed to the token, in a second verification row that
      // expires with the link (Better Auth's own record is `.strict()`, so it has no metadata slot).
      // Written before the email, so the persisted state is in place whether or not the send lands.
      if (ctx !== undefined) {
        const nonce = newNonce();
        await ctx.context.internalAdapter.createVerificationValue({
          identifier: nonceIdentifier(token),
          value: hashNonce(nonce),
          expiresAt: new Date(Date.now() + MAGIC_LINK_EXPIRY_S * 1000),
        });
        ctx.setCookie(NONCE_COOKIE, nonce, nonceCookieAttributes(baseURL, MAGIC_LINK_EXPIRY_S));
      }
      await sendAuthEmailWhileEnabled({
        kind: "magic-link",
        to: email,
        url,
        token,
        metadata: { ...metadata, locale, mode },
      });
    },
  });
  return betterAuth({
    appName: "Jisr",
    baseURL,
    secret,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    // Project rule: never record IPs. Better Auth then also skips its IP-keyed rate limiter, so
    // throttling of auth emails must live in our own code (the email_cooldowns slot).
    // disableOriginCheck: false is the production default already; Better Auth turns the origin and
    // CSRF checks off by default under NODE_ENV=test, so stating it keeps the test suites on the
    // production behaviour (the magic-link confirm's login-CSRF guard is tested through it).
    advanced: { ipAddress: { disableIpTracking: true }, disableOriginCheck: false },
    // The default logger and better-call print raw errors, which carry query parameters (tokens,
    // addresses): see log.ts.
    logger: { log: scrubbedAuthLog },
    onAPIError: { onError: onAuthApiError },
    hooks: { before: beforeAuthEndpoint, after: afterAuthEndpoint },
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
        // The emailed confirmation link is a deletion credential: one hour, not Better Auth's 24 h
        // default, keeps a mailbox read later (or by someone else) from deleting the account.
        deleteTokenExpiresIn: DELETE_TOKEN_EXPIRY_S,
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
      magicLinkPlugin,
      magicLinkConfirm(magicLinkPlugin.endpoints.magicLinkVerify),
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
