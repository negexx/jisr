import "server-only";

export type AuthEmailKind = "magic-link" | "delete-account";

export type AuthEmailRequest = {
  kind: AuthEmailKind;
  to: string;
  url: string;
  token: string;
};

export class AuthEmailTransportNotConfigured extends Error {
  constructor(kind: AuthEmailKind) {
    super(
      `Auth email transport is not configured (kind: ${kind}). Todo 8 completes ` +
        "src/lib/server/email.ts: Brevo via fetch when BREVO_API_KEY is set, otherwise a " +
        "dev/test file transport. No email was sent.",
    );
    this.name = "AuthEmailTransportNotConfigured";
  }
}

// Handoff to todo 8. The single named export every auth email callback delegates to. It
// throws a loud, named error instead of silently succeeding with no transport: a magic
// link or deletion email that never leaves the process must fail visibly, never look sent.
export async function sendAuthEmail(request: AuthEmailRequest): Promise<void> {
  throw new AuthEmailTransportNotConfigured(request.kind);
}
