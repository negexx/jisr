// Shared by client and server, so it stays zod-free and has no `server-only` import.
// Any change to the privacy notice bumps this value in the same commit as
// `frontmatter.consentVersion` in content/{fr,en,ar}/privacy.mdx (tests/app/legal-pages.test.tsx).
export const CURRENT_CONSENT_VERSION = "2026-10-14";

export function hasCurrentConsent(user: { consentVersion: string | null | undefined }): boolean {
  return user.consentVersion === CURRENT_CONSENT_VERSION;
}
