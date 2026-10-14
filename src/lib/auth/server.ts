import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError, getOAuthState } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { type AuthEmailRequest, sendAuthEmail } from "@/lib/server/email";
import { claimEmailSendSlot } from "@/lib/server/email-cooldown";
import { accountsEnabled } from "./accounts-enabled";
import { ACCOUNTS_DISABLED_CODE, accountsGate } from "./accounts-gate";
import {
  type AdmissionConfirmation,
  confirmationFromOAuthState,
  evaluateAdmission,
} from "./admission";
import { CURRENT_CONSENT_VERSION } from "./consent";
import { readPendingSignup } from "./pending-signup";

const MAGIC_LINK_EXPIRY_S = 15 * 60;

const OAUTH_CALLBACK_PATH = "/callback/:id";
const MAGIC_LINK_VERIFY_PATH = "/magic-link/verify";

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

// The switch is checked before the slot is claimed so a disabled instance writes no cooldown
// row; the slot is claimed before the send so a refused request sends nothing. The refusal
// names no address.
async function sendAuthEmailWithCooldown(request: AuthEmailRequest): Promise<void> {
  if (!accountsEnabled()) throw accountsDisabledError();
  if (!(await claimEmailSendSlot(request.kind, request.to))) {
    throw new APIError("TOO_MANY_REQUESTS", {
      message: "An email was sent a moment ago. Wait a minute before asking for another.",
      code: "EMAIL_COOLDOWN",
    });
  }
  await sendAuthEmail(request);
}

export class AuthMisconfiguredError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(`Accounts are on but required environment variables are missing: ${missing.join(", ")}`);
    this.name = "AuthMisconfiguredError";
  }
}

function presentEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? undefined : value;
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
        sendDeleteAccountVerification: async ({ user, url, token }) => {
          await sendAuthEmailWithCooldown({ kind: "delete-account", to: user.email, url, token });
        },
      },
    },
    databaseHooks: {
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
          await sendAuthEmailWithCooldown({ kind: "magic-link", to: email, url, token, metadata });
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
  if (secret === undefined || baseURL === undefined) {
    throw new AuthMisconfiguredError([
      ...(secret === undefined ? ["BETTER_AUTH_SECRET"] : []),
      ...(baseURL === undefined ? ["BETTER_AUTH_URL"] : []),
    ]);
  }
  instance = createAuth(secret, baseURL);
  return instance;
}
