import "server-only";

// The accounts kill switch (plan M-12/B6, ADR 0004, R22): accounts are served only when this
// env var says so, and it is read per call — never frozen at build time — so flipping it
// takes effect without a rebuild. It is the legal launch gate, so it is an allow-list: only
// "true" or "1" turn accounts on, and anything else (unset, blank, "false", a typo, "yes",
// "on") leaves them off.
const ENABLING_TOKENS = new Set(["true", "1"]);

export function accountsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.ACCOUNTS_ENABLED;
  if (typeof raw !== "string") return false;
  return ENABLING_TOKENS.has(raw.trim().toLowerCase());
}
