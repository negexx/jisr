// The one definition of a normalised email: pending_signups rows are keyed by it, and
// Better Auth keeps `user.email` lowercase. Every writer of pending_signups must store
// normalizeEmail(email); readPendingSignup normalises the lookup the same way.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
