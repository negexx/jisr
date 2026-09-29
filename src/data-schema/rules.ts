import { z } from "zod";

import { LocalizedTextSchema } from "./localized-text";
import {
  CefrSchema,
  InfoKindSchema,
  LanguageCodeSchema,
  SlugSchema,
  SourceKeySchema,
} from "./primitives";

const RuleBase = { id: SlugSchema, source: SourceKeySchema, info_kind: InfoKindSchema };
const GradeScaleSlug = SlugSchema;

export const RuleSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...RuleBase,
    kind: z.literal("credential_type_in"),
    types: z.array(SlugSchema).min(1),
  }),
  z.strictObject({
    ...RuleBase,
    kind: z.literal("credential_track_in"),
    tracks: z.array(SlugSchema).min(1),
  }),
  z.strictObject({
    ...RuleBase,
    kind: z.literal("overall_grade_min"),
    scale: GradeScaleSlug,
    threshold: z.number().nullable(),
  }),
  z.strictObject({
    ...RuleBase,
    kind: z.literal("subject_grade_min"),
    subject: SlugSchema,
    scale: GradeScaleSlug,
    threshold: z.number().nullable(),
  }),
  z.strictObject({
    ...RuleBase,
    kind: z.literal("subject_taken"),
    subjects: z.array(SlugSchema).min(1),
    mode: z.enum(["all", "any"]),
  }),
  z.strictObject({
    ...RuleBase,
    kind: z.literal("language_proficiency"),
    language: LanguageCodeSchema,
    minCefr: CefrSchema.nullable(),
    certificateRequired: z.boolean().nullable(),
    acceptedTests: z.array(SlugSchema),
  }),
  z.strictObject({
    ...RuleBase,
    kind: z.literal("prior_study_years_min"),
    years: z.number().int().min(1),
  }),
  z.strictObject({ ...RuleBase, kind: z.literal("manual_check"), note: LocalizedTextSchema }),
]);

export const RequirementsSchema = z
  .strictObject({
    coverage: z.enum(["complete", "partial"]),
    source: SourceKeySchema,
    info_kind: InfoKindSchema,
    rules: z.array(RuleSchema),
  })
  .refine((r) => new Set(r.rules.map((x) => x.id)).size === r.rules.length, {
    message: "rule ids must be unique",
  });

export type RuleRecord = z.infer<typeof RuleSchema>;
export type RuleKind = RuleRecord["kind"];
export type RequirementsRecord = z.infer<typeof RequirementsSchema>;
export type Coverage = RequirementsRecord["coverage"];
