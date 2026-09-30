import { z } from "zod";

const TYPED = z.string().max(200);
// Grades stay strings exactly as typed ("14," must survive a reload); the final profile parses them.
const GradeInputSchema = z.strictObject({ scale: TYPED, value: TYPED });

// Same fields as the final profile, only lenient and optional. Strict objects keep anything the
// final profile would not contain out of local storage. Server, scripts and tests only: client code
// uses the hand-written twin in src/lib/profile/draft-validate.ts (differential-tested against this).
export const DraftSchema = z.strictObject({
  schemaVersion: z.literal(1),
  step: z.number().int().nonnegative(),
  nationality: TYPED.optional(),
  credential: z
    .strictObject({
      country: TYPED.optional(),
      type: TYPED.optional(),
      track: TYPED.optional(),
      status: z.enum(["obtained", "expected"]).optional(),
      overall: GradeInputSchema.nullable().optional(),
      subjects: z.array(z.strictObject({ subject: TYPED, grade: GradeInputSchema })).optional(),
    })
    .optional(),
  priorHigherEducationYears: TYPED.optional(),
  languages: z
    .array(
      z.strictObject({
        language: TYPED,
        level: TYPED.optional(),
        certificate: TYPED.nullable().optional(),
      }),
    )
    .optional(),
  fields: z.array(TYPED).optional(),
  studyLanguages: z.array(TYPED).optional(),
  destinations: z.array(TYPED).optional(),
  budget: z
    .strictObject({
      amount: TYPED.optional(),
      currency: TYPED.optional(),
      period: z.enum(["month", "year"]).optional(),
    })
    .nullable()
    .optional(),
  institutionType: z.enum(["public", "private", "any"]).optional(),
});

export type ProfileDraft = z.infer<typeof DraftSchema>;
