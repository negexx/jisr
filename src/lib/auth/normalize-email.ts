// The one definition of a normalised email: pending_signups rows are keyed by it, and
// Better Auth keeps `user.email` lowercase. Every writer of pending_signups must store
// normalizeEmail(email); readPendingSignup normalises the lookup the same way.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

// The key of the resend cooldown only, never a stored or sent address: one key per mailbox, so
// "a+1@x" and "a+2@x" (and, at Gmail, "a.b@" and "ab@") cannot each get their own slot. Other
// providers may treat dots as significant, so dots are dropped only for Gmail.
export function cooldownKey(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at < 0) return normalized;
  const domain = normalized.slice(at + 1);
  const gmail = GMAIL_DOMAINS.has(domain);
  let local = normalized.slice(0, at).split("+")[0] ?? "";
  if (gmail) local = local.replaceAll(".", "");
  if (local === "") return normalized;
  return `${local}@${gmail ? "gmail.com" : domain}`;
}
