import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { type AuthEmailRequest, sendAuthEmail } from "@/lib/server/email";
import { claimEmailSendSlot } from "@/lib/server/email-cooldown";
import { accountsEnabled } from "./accounts-enabled";
import { ACCOUNTS_DISABLED_CODE, accountsGate } from "./accounts-gate";
import { type AdmissionConfirmation, evaluateAdmission } from "./admission";
import { readPendingSignup } from "./pending-signup";

const MAGIC_LINK_EXPIRY_S = 15 * 60;

// Todo 9 wires the Google path by reading the server-validated OAuth state out of `ctx`
// (client-supplied additionalData is untrusted). Until then there is no server-validated
// OAuth evidence, so the gate fails closed for a Google create.
function admissionConfirmationFromHookContext(_ctx: unknown): AdmissionConfirmation {
  return { ageConfirmed: false, consentVersion: null };
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
  if (!(await claimEmailSendSlot(request.kind, request.to, new Date()))) {
    throw new APIError("TOO_MANY_REQUESTS", {
      message: "An email was sent a moment ago. Wait a minute before asking for another.",
      code: "EMAIL_COOLDOWN",
    });
  }
  await sendAuthEmail(request);
}

export const auth = betterAuth({
  appName: "Jisr",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // Project rule: never record IPs. Better Auth then also skips its IP-keyed rate limiter, so
  // throttling of auth emails must live in our own code (the email_cooldowns slot).
  advanced: { ipAddress: { disableIpTracking: true } },
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
          const pending = await readPendingSignup(user.email);
          const decision = evaluateAdmission(
            admissionConfirmationFromHookContext(ctx),
            pending,
            new Date(),
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
