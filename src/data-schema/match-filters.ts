import { z } from "zod";

import { CountryCodeSchema, LanguageCodeSchema, SlugSchema } from "./primitives";
import { BudgetSchema } from "./profile";

// Own copy of the version constant, drift-tested against src/lib/constants.ts by
// tests/lib/matches/filters.test.ts (mirrors PROFILE_SCHEMA_VERSION).
export const MATCH_FILTERS_VERSION = 1;

export const MatchFiltersSchema = z.strictObject({
  schemaVersion: z.literal(MATCH_FILTERS_VERSION),
  fields: z.array(SlugSchema),
  studyLanguages: z.array(LanguageCodeSchema),
  destinations: z.array(CountryCodeSchema),
  institutionType: z.enum(["public", "private", "any"]),
  budget: BudgetSchema.nullable(),
});

export type MatchFilters = z.infer<typeof MatchFiltersSchema>;
