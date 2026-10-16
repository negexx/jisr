// Zod-free copies of the few runtime values client code needs. `@/data-schema` builds Zod schemas
// at module load (about 120 KB gzipped in any client chunk), so the browser must not import it at
// runtime. tests/lib/profile/validate.test.ts and tests/lib/snapshot/manifest-guard.test.ts fail
// if a value here drifts from the schema it mirrors.
export const LOCALES = ["fr", "en", "ar"] as const;
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const INFO_KINDS = ["official", "estimate", "guidance"] as const;
export const PROFILE_SCHEMA_VERSION = 1;
export const MATCH_FILTERS_VERSION = 1;
export const DRAFT_SCHEMA_VERSION = 1;
// 2 since the official fee range (tuition.maxAmountMinor, tuition.basis); see ADR 0010.
export const SNAPSHOT_FORMAT_VERSION = 2;
export const SAVED_SCHEMA_VERSION = 1;
export const PLAN_SCHEMA_VERSION = 1;
export const MAX_SAVED_PROGRAMS = 12;
export const MIN_COMPARE = 2;
export const MAX_COMPARE = 4;
// Account input bounds (src/lib/server/account-inputs.ts), here so that client code can drop what
// the server would refuse without importing Zod.
export const ACCOUNT_SLUG_MAX_LENGTH = 120;
export const ACCOUNT_FIELD_MAX_LENGTH = 64;
// A real profile serialises to about 1 KB; the limit stops a well-formed but padded document.
export const ACCOUNT_PROFILE_JSON_LIMIT = 16_384;
// Auth emails (magic links and deletion confirmations together) released per UTC day, across all
// addresses: below Brevo's free quota of about 300 a day, so a flood of requests is refused with the
// cooldown answer instead of exhausting the sender (src/lib/server/email-cooldown.ts).
export const AUTH_EMAILS_PER_DAY = 250;
// The last sends of the day are kept for deletion confirmations: sign-in and sign-up links stop at
// AUTH_EMAILS_PER_DAY - this, so a flood of made-up addresses cannot block an erasure (GDPR).
export const AUTH_EMAILS_RESERVED_FOR_DELETION = 20;
