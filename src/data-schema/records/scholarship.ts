import { z } from "zod";

import { LocalizedTextSchema } from "../localized-text";
import {
  CountryCodeSchema,
  CurrencySchema,
  HttpsUrlSchema,
  IsoDateSchema,
  MinorAmountSchema,
  SlugSchema,
} from "../primitives";
import { SourcesSchema, stableFact, volatileFact } from "../provenance";
import { RequirementsSchema } from "../rules";
import { DocumentListSchema } from "./program";

export const SUPPORT_COVERS = [
  "tuition",
  "living",
  "housing",
  "travel",
  "insurance",
  "other",
] as const;

export const ScholarshipSupportSchema = z.strictObject({
  amount: z
    .strictObject({
      min: MinorAmountSchema,
      max: MinorAmountSchema,
      currency: CurrencySchema,
      per: z.enum(["month", "year", "once", "total"]),
    })
    .refine((a) => a.min <= a.max, { message: "min must be <= max" })
    .nullable(),
  covers: z.array(z.enum(SUPPORT_COVERS)),
});

export const ScholarshipRecordSchema = z.strictObject({
  slug: SlugSchema,
  name: z.string().min(1),
  provider: z.string().min(1),
  destinations: z.array(CountryCodeSchema).min(1),
  eligibleNationalities: z.array(CountryCodeSchema),
  fields: z.array(SlugSchema),
  level: z.literal("bachelor"),
  summary: LocalizedTextSchema,
  support: volatileFact(ScholarshipSupportSchema),
  deadline: volatileFact(IsoDateSchema),
  requirements: RequirementsSchema,
  documents: stableFact(DocumentListSchema),
  howToApply: LocalizedTextSchema,
  officialUrl: HttpsUrlSchema,
  sources: SourcesSchema,
});

export type ScholarshipSupport = z.infer<typeof ScholarshipSupportSchema>;
export type ScholarshipRecord = z.infer<typeof ScholarshipRecordSchema>;
