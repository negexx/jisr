// Zod-free copies of the few runtime values client code needs. `@/data-schema` builds Zod schemas
// at module load (about 120 KB gzipped in any client chunk), so the browser must not import it at
// runtime. tests/lib/profile/validate.test.ts and tests/lib/snapshot/manifest-guard.test.ts fail
// if a value here drifts from the schema it mirrors.
export const LOCALES = ["fr", "en", "ar"] as const;
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const INFO_KINDS = ["official", "estimate", "guidance"] as const;
export const PROFILE_SCHEMA_VERSION = 1;
export const DRAFT_SCHEMA_VERSION = 1;
// 2 since the official fee range (tuition.maxAmountMinor, tuition.basis); see ADR 0010.
export const SNAPSHOT_FORMAT_VERSION = 2;
export const SAVED_SCHEMA_VERSION = 1;
export const PLAN_SCHEMA_VERSION = 1;
export const MAX_SAVED_PROGRAMS = 12;
export const MIN_COMPARE = 2;
export const MAX_COMPARE = 4;
