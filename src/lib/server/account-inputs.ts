import { z } from "zod";

import { IsoDateSchema, SlugSchema } from "@/data-schema/primitives";
import { ProfileSchema } from "@/data-schema/profile";
import { CHECKLIST_STEP_IDS } from "@/domain/types";

// Server-side input bounds for the account Server Actions. Each is tighter than the column
// bound in src/db/schema/app.ts, which only stops an unvalidated writer from filling a row.
export const SLUG_MAX_LENGTH = 120;
export const FIELD_MAX_LENGTH = 64;
export const FEEDBACK_NOTE_LIMIT = 500;
export const FEEDBACK_RECORD_LIMIT = 120;
export const FEEDBACK_PATH_LIMIT = 120;
export const FEEDBACK_SOURCE_URL_LIMIT = 1500;
// A real profile serialises to about 1 KB; the limit stops a well-formed but padded document.
export const PROFILE_JSON_LIMIT = 16_384;
// The profile revision is a Postgres integer.
const MAX_REVISION = 2_147_483_647;

const ProgramSlugSchema = SlugSchema.max(SLUG_MAX_LENGTH);

export const SavedProgramInputSchema = z.strictObject({
  slug: ProgramSlugSchema,
  country: z.string().regex(/^[A-Z]{2}$/),
  field: SlugSchema.max(FIELD_MAX_LENGTH),
  snapshotVersion: z.string().regex(/^[0-9a-f]{12}$/),
  savedAt: IsoDateSchema,
});

export const ProfileInputSchema = ProfileSchema.refine(
  (profile) => JSON.stringify(profile).length <= PROFILE_JSON_LIMIT,
  { message: "profile too large" },
);

export const ProfileWriteInputSchema = z.strictObject({
  profile: ProfileInputSchema,
  expectedRevision: z.number().int().min(0).max(MAX_REVISION),
});

export const StepToggleInputSchema = z.strictObject({
  slug: ProgramSlugSchema,
  step: z.enum(CHECKLIST_STEP_IDS),
  done: z.boolean(),
});

export const FeedbackInputSchema = z.strictObject({
  record: z
    .string()
    .max(FEEDBACK_RECORD_LIMIT)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/),
  // Empty for a record-level fact; otherwise dotted segments such as "requirements.rules.r-math".
  path: z
    .string()
    .max(FEEDBACK_PATH_LIMIT)
    .regex(/^(?:[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)?$/),
  sourceUrl: z.url({ protocol: /^https?$/ }).max(FEEDBACK_SOURCE_URL_LIMIT),
  snapshotVersion: z.string().regex(/^[0-9a-f]{12}$/),
  note: z.string().trim().max(FEEDBACK_NOTE_LIMIT).optional(),
});

export const ProgramSlugInputSchema = ProgramSlugSchema;
