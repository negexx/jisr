import { z } from "zod";

import { IsoDateSchema, SlugSchema } from "@/data-schema/primitives";
import { ProfileSchema } from "@/data-schema/profile";
import { CHECKLIST_STEP_IDS } from "@/domain/types";
import { MAX_SAVED_PROGRAMS } from "@/lib/constants";
import { MAX_PLAN_PROGRAMS } from "@/lib/plan/progress";

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

const StepIdSchema = z.enum(CHECKLIST_STEP_IDS);

function distinct(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

// A device's guest data as the guest parsers read it (decodeProfile, parseSaved,
// parsePlanProgress), bounded like the per-item actions above. Empty is refused: an import that
// carries nothing must not mark the account as imported.
export const GuestImportPayloadSchema = z
  .strictObject({
    profile: ProfileInputSchema.nullable(),
    saved: z
      .array(SavedProgramInputSchema)
      .max(MAX_SAVED_PROGRAMS)
      .refine((items) => distinct(items.map((item) => item.slug)), { message: "duplicate slug" }),
    plan: z
      .record(ProgramSlugSchema, z.array(StepIdSchema).min(1).max(CHECKLIST_STEP_IDS.length))
      .refine((done) => Object.keys(done).length <= MAX_PLAN_PROGRAMS, {
        message: "too many programmes",
      })
      .refine((done) => Object.values(done).every(distinct), { message: "duplicate step" }),
  })
  .refine(
    (payload) =>
      payload.profile !== null || payload.saved.length > 0 || Object.keys(payload.plan).length > 0,
    { message: "nothing to import" },
  );

export const ImportModeSchema = z.enum(["auto", "replace"]);

export const GuestImportInputSchema = z.strictObject({
  payload: GuestImportPayloadSchema,
  mode: ImportModeSchema,
});
