import { z } from "zod";

import { LocalizedTextSchema } from "../localized-text";
import {
  CountryCodeSchema,
  CurrencySchema,
  HttpsUrlSchema,
  IsoDateSchema,
  LanguageCodeSchema,
  MinorAmountSchema,
  SlugSchema,
} from "../primitives";
import { SourcesSchema, stableFact, volatileFact } from "../provenance";
import { RequirementsSchema } from "../rules";

export const TuitionSchema = z.strictObject({
  amountMinor: MinorAmountSchema,
  currency: CurrencySchema,
  period: z.enum(["year", "semester"]),
});
export const IntakeSchema = z.strictObject({
  startDate: IsoDateSchema.nullable(),
  applicationOpens: IsoDateSchema.nullable(),
  applicationDeadline: IsoDateSchema.nullable(),
});
export const DocumentSchema = z.strictObject({
  slug: SlugSchema,
  name: LocalizedTextSchema,
  translationRequired: z.boolean().nullable(),
});
export const DocumentListSchema = z
  .array(DocumentSchema)
  .refine((docs) => new Set(docs.map((d) => d.slug)).size === docs.length, {
    message: "document slugs must be unique",
  });

export const ProgramRecordSchema = z.strictObject({
  slug: SlugSchema,
  institution: SlugSchema,
  country: CountryCodeSchema,
  city: SlugSchema,
  field: SlugSchema,
  level: z.literal("bachelor"),
  name: z.string().min(1),
  summary: LocalizedTextSchema,
  officialUrl: HttpsUrlSchema,
  durationYears: stableFact(z.number().positive()),
  teachingLanguages: stableFact(z.array(LanguageCodeSchema).min(1)),
  tuition: volatileFact(TuitionSchema),
  intakes: volatileFact(z.array(IntakeSchema)),
  applicationChannel: stableFact(SlugSchema),
  documents: stableFact(DocumentListSchema),
  requirements: RequirementsSchema,
  scholarships: z.array(SlugSchema),
  sources: SourcesSchema,
});

export type Tuition = z.infer<typeof TuitionSchema>;
export type Intake = z.infer<typeof IntakeSchema>;
export type ProgramRecord = z.infer<typeof ProgramRecordSchema>;
