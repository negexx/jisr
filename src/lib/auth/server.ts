import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { sendAuthEmail } from "@/lib/server/email";

import { type AdmissionConfirmation, evaluateAdmission } from "./admission";
import { readPendingSignup } from "./pending-signup";

const MAGIC_LINK_EXPIRY_S = 15 * 60;

// Todo 9 wires the Google path by reading the server-validated OAuth state out of `ctx`
// (client-supplied additionalData is untrusted). Until then there is no server-validated
// OAuth evidence, so the gate fails closed for a Google create.
function admissionConfirmationFromHookContext(_ctx: unknown): AdmissionConfirmation {
  return { ageConfirmed: false, consentVersion: null };
}

export const auth = betterAuth({
  appName: "Jisr",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // Project rule: never record IPs. Better Auth then also skips its IP-keyed rate limiter, so
  // throttling of auth emails must live in our own code (the pending_signups cooldown).
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
        await sendAuthEmail({ kind: "delete-account", to: user.email, url, token });
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
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
  },
  plugins: [
    magicLink({
      expiresIn: MAGIC_LINK_EXPIRY_S,
      disableSignUp: false,
      storeToken: "hashed",
      sendMagicLink: async ({ email, url, token }) => {
        await sendAuthEmail({ kind: "magic-link", to: email, url, token });
      },
    }),
    // Must stay last: it reads Set-Cookie off every other plugin's response.
    nextCookies(),
  ],
});
