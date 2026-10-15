import type { AppLocale } from "@/i18n/routing";
import { clearAllLocalData } from "@/lib/local-data";

import { accountDeleteRequest, DELETE_TOKEN_PARAM } from "./callback-urls";
import { forgetSession } from "./session-client";
import { clearAccountLocalState } from "./session-hint";

// The browser half of account deletion (todo 19). Zod-free, and the auth client is imported only
// when a request is made, so a page that mounts these helpers loads it on click, not on render.

export type DeletionRequestOutcome = "sent" | "signed-out" | "unavailable" | "failed";
export type DeletionConfirmOutcome =
  | "deleted"
  | "invalid-token"
  | "signed-out"
  | "unavailable"
  | "failed";

type AuthError = { status: number; code?: string } | null;

function refusal(error: NonNullable<AuthError>): "signed-out" | "unavailable" | "failed" {
  if (error.status === 401) return "signed-out";
  if (error.code === "ACCOUNTS_DISABLED") return "unavailable";
  return "failed";
}

/**
 * Asks for the confirmation email (the "Delete my account" button). "sent" does not prove an email
 * left: Better Auth answers the same when the one-a-minute cooldown refused the send.
 */
export async function requestAccountDeletion(locale: AppLocale): Promise<DeletionRequestOutcome> {
  try {
    const { authClient } = await import("./client");
    const { error } = await authClient.deleteUser(accountDeleteRequest(locale));
    return error ? refusal(error) : "sent";
  } catch {
    return "failed";
  }
}

// Better Auth's token is 32 characters of [0-9a-z]; the bound only keeps junk out of the request.
const TOKEN = /^[0-9A-Za-z_-]{1,128}$/;

/** The token from the link's fragment (`location.hash`, with or without its leading `#`). */
export function readDeletionToken(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get(DELETE_TOKEN_PARAM);
  return token !== null && TOKEN.test(token) ? token : null;
}

// Ruling Q6: the student asked to erase everything, so this device keeps nothing either: the guest
// keys, the account cache and the sign-in hint. Same-tab removals fire no `storage` event, so the
// stores and the hint listeners are told explicitly.
export function eraseThisDevice(): void {
  clearAllLocalData();
  clearAccountLocalState();
  forgetSession();
}

/** Completes the deletion from the emailed link's page, then erases this device. */
export async function confirmAccountDeletion(token: string): Promise<DeletionConfirmOutcome> {
  let error: AuthError;
  try {
    const { authClient } = await import("./client");
    ({ error } = await authClient.deleteUser({ token }));
  } catch {
    return "failed";
  }
  if (error) return error.code === "INVALID_TOKEN" ? "invalid-token" : refusal(error);
  eraseThisDevice();
  return "deleted";
}
