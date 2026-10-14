import "server-only";

// The accounts kill switch (plan M-12/B6, ADR 0004): accounts are served only when this
// env var says so, and it is read per call — never frozen at build time — so flipping it
// takes effect without a rebuild. Blank/unset means guest-only.
//
// A kill switch must fail safe: `ACCOUNTS_ENABLED=false` must mean disabled, not "enabled
// because the string is non-empty". Explicit falsy tokens are therefore treated as off.
const DISABLED_TOKENS = new Set(["false", "0", "off", "no"]);

export function accountsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.ACCOUNTS_ENABLED;
  if (typeof raw !== "string") return false;
  const token = raw.trim().toLowerCase();
  if (token === "") return false;
  return !DISABLED_TOKENS.has(token);
}
