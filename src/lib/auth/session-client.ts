// The one place the browser asks the server whether it has a session. It runs only after a
// sign-in left the hint (or on the post-auth landing), and the auth client is a lazy chunk, so a
// guest page never loads it. Zod-free.

export type SessionLookup =
  | { status: "signed-in"; consentVersion: string | null }
  | { status: "signed-out" }
  | { status: "unavailable" };

function readConsentVersion(user: object): string | null {
  return "consentVersion" in user && typeof user.consentVersion === "string"
    ? user.consentVersion
    : null;
}

async function fetchSession(): Promise<SessionLookup> {
  try {
    const { authClient } = await import("./client");
    const { data, error } = await authClient.getSession();
    if (error) return { status: "unavailable" };
    if (data === null) return { status: "signed-out" };
    return { status: "signed-in", consentVersion: readConsentVersion(data.user) };
  } catch {
    return { status: "unavailable" };
  }
}

let lookup: Promise<SessionLookup> | null = null;

// A signed-in answer is kept for the life of the page so the menu and the landing share one
// request; any other answer is forgotten so a retry asks again.
export function lookupSession(): Promise<SessionLookup> {
  if (lookup === null) {
    lookup = fetchSession().then((result) => {
      if (result.status !== "signed-in") lookup = null;
      return result;
    });
  }
  return lookup;
}

export function forgetSession(): void {
  lookup = null;
}
