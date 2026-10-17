import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { normalizeEmail } from "./normalize-email";

// Every form request is a signup intent: it may write a pending_signups row and gets the sign-up
// email wording. Only the signup Server Action can mark one, after it has checked both
// confirmations: the mark lives in this process's async context, which no HTTP body, header or
// metadata can set, so a direct POST to /sign-in/magic-link (whatever metadata it sends) is always
// a plain sign-in.
type SignupIntent = { email: string };

const intent = new AsyncLocalStorage<SignupIntent>();

export function runAsSignup<T>(email: string, run: () => Promise<T>): Promise<T> {
  return intent.run({ email: normalizeEmail(email) }, run);
}

export function isSignupFor(email: string): boolean {
  return intent.getStore()?.email === normalizeEmail(email);
}
