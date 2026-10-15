import { MAGIC_LINK_CONFIRM_ENDPOINT } from "./callback-urls";
import { forgetSession } from "./session-client";

// The browser half of the magic-link confirm page (todo 28, F3). Zod-free and without the auth
// client: one same-origin fetch, so the page loads no Better Auth code. The token goes in a JSON
// body, never in a URL.

export type SignInConfirmOutcome =
  | { kind: "signed-in" }
  // A refusal with Better Auth's code (INVALID_TOKEN, AGE_NOT_CONFIRMED, …): the sign-in form shows it.
  | { kind: "refused"; code: string }
  | { kind: "unavailable" }
  | { kind: "failed" };

const CODE = /^[A-Za-z0-9_-]{1,64}$/;

async function codeOf(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !("code" in body)) return null;
    return typeof body.code === "string" && CODE.test(body.code) ? body.code : null;
  } catch {
    return null;
  }
}

export async function confirmSignIn(token: string): Promise<SignInConfirmOutcome> {
  let response: Response;
  try {
    response = await fetch(MAGIC_LINK_CONFIRM_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    // Any answer kept from before the sign-in is stale now.
    forgetSession();
    return { kind: "signed-in" };
  }
  const code = await codeOf(response);
  if (code === "ACCOUNTS_DISABLED") return { kind: "unavailable" };
  if (response.status === 400 && code !== null) return { kind: "refused", code };
  return { kind: "failed" };
}
