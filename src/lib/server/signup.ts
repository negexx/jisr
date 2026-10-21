"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { z } from "zod";

import { accountsEnabled } from "@/lib/auth/accounts-enabled";
import { ACCOUNTS_DISABLED_CODE } from "@/lib/auth/accounts-gate";
import { authCallbackUrls } from "@/lib/auth/callback-urls";
import { normalizeEmail } from "@/lib/auth/normalize-email";
import { AuthMisconfiguredError, getAuth, SIGN_IN_LINK_RULES } from "@/lib/auth/server";
// Node.js runtime only: runAsSignup is AsyncLocalStorage (node:async_hooks), and the auth hooks read
// it on this same request. Never give a page that renders the sign-in form, or the auth route, an
// edge runtime; tests/lib/server/signup-runtime.test.ts fails if any src/app segment declares one.
import { runAsSignup } from "@/lib/auth/signup-intent";
import { LOCALES } from "@/lib/constants";

import { SignInEmailSchema } from "./account-inputs";
import { sqlState } from "./account-store";
import { clientAddressKey } from "./client-address";
import {
  AuthEmailAccountsDisabled,
  AuthEmailTransportNotConfigured,
  mailStaysOnDisk,
} from "./email";
import { hasMailRoute } from "./email-domain";
import { consumeThrottle, throttleKey } from "./request-throttle";

export type SignInLinkRequest = {
  // Every form request carries the signup intent (consent evidence); an existing address simply
  // signs in and its pending row is never consumed. A direct POST never sets the intent.
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

// Only these three classes may contribute their own message: each names a variable or a state,
// never a value (see AuthMisconfiguredError, AuthEmailTransportNotConfigured,
// AuthEmailAccountsDisabled). Every other error contributes only its class name and SQLSTATE — a
// driver error's message can carry the address or the token as a query parameter.
function whitelistedMessage(error: Error): string | null {
  if (
    error instanceof AuthMisconfiguredError ||
    error instanceof AuthEmailTransportNotConfigured ||
    error instanceof AuthEmailAccountsDisabled
  ) {
    return error.message;
  }
  return null;
}

function reasonOf(error: unknown): string | null {
  let at: unknown = error;
  while (at instanceof Error) {
    const reason = whitelistedMessage(at);
    if (reason !== null) return reason;
    at = at.cause;
  }
  return null;
}

// Drizzle wraps the driver's error as `cause`; the class that matters is the innermost one. Its
// `name` is unusable (pg-protocol's DatabaseError sets it to "error"), so log the constructor name.
function deepestErrorName(error: unknown): string {
  let at: unknown = error;
  while (at instanceof Error && at.cause instanceof Error) {
    at = at.cause;
  }
  return at instanceof Error ? at.constructor.name : typeof at;
}

// Never logs the address, the link or an arbitrary error message: a whitelisted class's message
// names variables, never values; an unknown error is reduced to its name and SQLSTATE.
function failureOf(error: unknown): SignInLinkError {
  const code = errorCode(error);
  if (code === "EMAIL_COOLDOWN") return "cooldown";
  if (code === ACCOUNTS_DISABLED_CODE) return "accounts_disabled";
  const logCode = code ?? "unexpected";
  const reason = reasonOf(error);
  if (reason !== null) {
    console.error("sign-in link request failed", { code: logCode, reason });
  } else {
    console.error("sign-in link request failed", {
      code: logCode,
      error: deepestErrorName(error),
      sqlState: sqlState(error),
    });
  }
  return "failed";
}

// Hour first: a request the hour rule refuses never touches the day counter.
async function withinAddressLimits(address: string): Promise<boolean> {
  for (const [name, rule] of Object.entries(SIGN_IN_LINK_RULES)) {
    const { allowed } = await consumeThrottle(throttleKey(`sign-in-link-${name}`, address), rule);
    if (!allowed) {
      console.warn("sign-in link request refused by the address throttle", {
        bucket: `sign-in-link-${name}`,
      });
      return false;
    }
  }
  return true;
}

export async function requestSignInLink(input: SignInLinkRequest): Promise<SignInLinkResult> {
  // First, before any parsing or database work: while accounts are off this action processes no
  // personal data at all (plan B6).
  if (!accountsEnabled()) return { ok: false, error: "accounts_disabled" };
  const request = RequestSchema.safeParse(input);
  if (!request.success) return { ok: false, error: "invalid_request" };
  const parsedEmail = SignInEmailSchema.safeParse(request.data.email);
  if (!parsedEmail.success) return { ok: false, error: "invalid_email" };
  const { consent, ageConfirmed, locale, returnPath } = request.data;
  if (!(consent && ageConfirmed)) {
    return { ok: false, error: "confirmation_required" };
  }
  const email = normalizeEmail(parsedEmail.data);
  try {
    // Resolved first so a misconfigured deployment records nothing.
    const auth = getAuth();
    const requestHeaders = await headers();
    // auth.api calls skip Better Auth's request limiter, so this action takes its own per-address
    // slots. A refusal returns before the mail-route lookup, the mailbox cooldown and the daily
    // email counter, so it spends none of them.
    if (!(await withinAddressLimits(clientAddressKey(requestHeaders)))) {
      return { ok: false, error: "cooldown" };
    }
    // An address at a domain that cannot receive mail never reaches a budget or the provider
    // (bounces count against the sender). Skipped where the mail is written to disk.
    if (!mailStaysOnDisk() && !(await hasMailRoute(email))) {
      return { ok: false, error: "invalid_email" };
    }
    // The auth instance's before hook claims the send slot inside this call and, for a request
    // marked by runAsSignup (which only this action can set), writes the pending row right after
    // the claim and before the verification row and the email. The server derives the wording.
    const send = () =>
      auth.api.signInMagicLink({
        body: { email, ...authCallbackUrls(locale, returnPath), metadata: { locale } },
        headers: requestHeaders,
      });
    await runAsSignup(email, send);
  } catch (error) {
    return { ok: false, error: failureOf(error) };
  }
  return { ok: true };
}
