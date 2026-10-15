"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { z } from "zod";

import { accountsEnabled } from "@/lib/auth/accounts-enabled";
import { ACCOUNTS_DISABLED_CODE } from "@/lib/auth/accounts-gate";
import { authCallbackUrls } from "@/lib/auth/callback-urls";
import { normalizeEmail } from "@/lib/auth/normalize-email";
import { AuthMisconfiguredError, getAuth } from "@/lib/auth/server";
import { runAsSignup } from "@/lib/auth/signup-intent";
import { LOCALES } from "@/lib/constants";

import { SignInEmailSchema } from "./account-inputs";

export type SignInLinkMode = "signup" | "signin";

export type SignInLinkRequest = {
  // "signup" creates an account and needs both confirmations; "signin" is for an existing account
  // and records nothing (ruling P5). A "signin" link for an unknown address is refused at verify.
  mode: SignInLinkMode;
  email: string;
  consent: boolean;
  ageConfirmed: boolean;
  locale: (typeof LOCALES)[number];
  returnPath: string | null;
};

export type SignInLinkError =
  | "accounts_disabled"
  | "invalid_request"
  | "invalid_email"
  | "confirmation_required"
  | "cooldown"
  | "failed";

export type SignInLinkResult = { ok: true } | { ok: false; error: SignInLinkError };

const RETURN_PATH_MAX_LENGTH = 2048;

const RequestSchema = z.object({
  mode: z.enum(["signup", "signin"]),
  email: z.string(),
  consent: z.boolean(),
  ageConfirmed: z.boolean(),
  locale: z.enum(LOCALES),
  returnPath: z.string().max(RETURN_PATH_MAX_LENGTH).nullable(),
});

function errorCode(error: unknown): string | undefined {
  if (!isAPIError(error)) return undefined;
  const code: unknown = error.body?.code;
  return typeof code === "string" ? code : undefined;
}

// Never logs the address, the link or the error text: only the kind of failure.
function failureOf(error: unknown): SignInLinkError {
  const code = errorCode(error);
  if (code === "EMAIL_COOLDOWN") return "cooldown";
  if (code === ACCOUNTS_DISABLED_CODE) return "accounts_disabled";
  if (error instanceof AuthMisconfiguredError) console.error(error.message);
  else console.error("sign-in link request failed", { code: code ?? "unexpected" });
  return "failed";
}

export async function requestSignInLink(input: SignInLinkRequest): Promise<SignInLinkResult> {
  // First, before any parsing or database work: while accounts are off this action processes no
  // personal data at all (plan B6).
  if (!accountsEnabled()) return { ok: false, error: "accounts_disabled" };
  const request = RequestSchema.safeParse(input);
  if (!request.success) return { ok: false, error: "invalid_request" };
  const parsedEmail = SignInEmailSchema.safeParse(request.data.email);
  if (!parsedEmail.success) return { ok: false, error: "invalid_email" };
  const { mode, consent, ageConfirmed, locale, returnPath } = request.data;
  if (mode === "signup" && !(consent && ageConfirmed)) {
    return { ok: false, error: "confirmation_required" };
  }
  const email = normalizeEmail(parsedEmail.data);
  try {
    // Resolved first so a misconfigured deployment records nothing.
    const auth = getAuth();
    const requestHeaders = await headers();
    // The auth instance's before hook claims the send slot inside this call and, for a signup
    // (marked by runAsSignup, which only this action can set), writes the pending row right
    // after the claim and before the verification row and the email.
    const send = () =>
      auth.api.signInMagicLink({
        body: { email, ...authCallbackUrls(locale, returnPath), metadata: { locale, mode } },
        headers: requestHeaders,
      });
    await (mode === "signup" ? runAsSignup(email, send) : send());
  } catch (error) {
    return { ok: false, error: failureOf(error) };
  }
  return { ok: true };
}
