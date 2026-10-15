// The one place the browser asks the server whether it has a session. It runs only after a
// sign-in left the hint (or on the post-auth landing), and the auth client is a lazy chunk, so a
// guest page never loads it. Zod-free.

export type SessionLookup =
  | {
      status: "signed-in";
      email: string;
      consentVersion: string | null;
      // The calendar day (ISO 8601, UTC) the student accepted that version, for the account page.
      consentedOn: string | null;
    }
  | { status: "signed-out" }
  | { status: "unavailable" };

function readConsentVersion(user: object): string | null {
  return "consentVersion" in user && typeof user.consentVersion === "string"
    ? user.consentVersion
    : null;
}

// Better Auth's client revives ISO timestamps into Dates; a plain string is accepted too.
function readConsentedOn(user: object): string | null {
  if (!("consentedAt" in user)) return null;
  const { consentedAt } = user;
  const iso =
    consentedAt instanceof Date && !Number.isNaN(consentedAt.getTime())
      ? consentedAt.toISOString()
      : consentedAt;
  return typeof iso === "string" && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null;
}

async function fetchSession(): Promise<SessionLookup> {
  try {
    const { authClient } = await import("./client");
    const { data, error } = await authClient.getSession();
    if (error) return { status: "unavailable" };
    if (data === null) return { status: "signed-out" };
    return {
      status: "signed-in",
      email: data.user.email,
      consentVersion: readConsentVersion(data.user),
      consentedOn: readConsentedOn(data.user),
    };
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
