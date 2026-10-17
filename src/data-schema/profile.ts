import { z } from "zod";

import {
  CefrSchema,
  CountryCodeSchema,
  CurrencySchema,
  LanguageCodeSchema,
  SlugSchema,
} from "./primitives";

export const PROFILE_SCHEMA_VERSION = 2;

export const GradeValueSchema = z.strictObject({ scale: SlugSchema, value: z.number() });
// Kept here, but no longer part of the profile: budget is a match filter (MatchFiltersSchema).
export const BudgetSchema = z.strictObject({
  amountMinor: z.number().int().nonnegative(),
  currency: CurrencySchema,
  period: z.enum(["month", "year"]),
});

// Version 2: eligibility only (nationality, credential, prior years, languages). The five preference
// fields (fields, studyLanguages, destinations, budget, institutionType) moved to MatchFiltersSchema;
// a 1→2 migration strips them (src/lib/profile/storage.ts).
export const ProfileSchema = z
  .strictObject({
    schemaVersion: z.literal(PROFILE_SCHEMA_VERSION),
    nationality: CountryCodeSchema,
    credential: z.strictObject({
      country: CountryCodeSchema,
      type: SlugSchema,
      track: SlugSchema,
      status: z.enum(["obtained", "expected"]),
      overall: GradeValueSchema.nullable(),
      subjects: z.array(z.strictObject({ subject: SlugSchema, grade: GradeValueSchema })),
    }),
    priorHigherEducationYears: z.number().int().min(0).max(3),
    languages: z.array(
      z.strictObject({
        language: LanguageCodeSchema,
        level: z.union([CefrSchema, z.literal("unknown")]),
        certificate: SlugSchema.nullable(),
      }),
    ),
  })
  .superRefine((profile, ctx) => {
    const seenSubjects = new Set<string>();
    profile.credential.subjects.forEach((entry, index) => {
      if (seenSubjects.has(entry.subject)) {
        ctx.addIssue({
          code: "custom",
          message: "duplicate subject",
          path: ["credential", "subjects", index, "subject"],
        });
      }
      seenSubjects.add(entry.subject);
    });
    const seenLanguages = new Set<string>();
    profile.languages.forEach((entry, index) => {
      if (seenLanguages.has(entry.language)) {
        ctx.addIssue({
          code: "custom",
          message: "duplicate language",
          path: ["languages", index, "language"],
        });
      }
      seenLanguages.add(entry.language);
    });
  });

export type GradeValue = z.infer<typeof GradeValueSchema>;
export type Budget = z.infer<typeof BudgetSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
