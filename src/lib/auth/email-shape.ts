// Client-side first pass only, so a typo is caught before a round trip; the signup Server Action
// validates the address with Zod. Zod-free because the sign-in form ships it to the browser.

// Mirrors EMAIL_MAX_LENGTH in src/db/schema/app.ts (tests/lib/auth/email-shape.test.ts ties them).
export const EMAIL_SHAPE_MAX_LENGTH = 320;

const SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length <= EMAIL_SHAPE_MAX_LENGTH && SHAPE.test(trimmed);
}
