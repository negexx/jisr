import { z } from "zod";

import { CountryCodeSchema, CurrencySchema, MinorAmountSchema, SlugSchema } from "../primitives";
import { SourcesSchema, stableFact } from "../provenance";

export const LIVING_COST_CATEGORIES = [
  "housing",
  "food",
  "transport",
  "insurance",
  "application_visa",
  "setup",
] as const;

export const CostAmountSchema = z
  .strictObject({
    min: MinorAmountSchema,
    max: MinorAmountSchema,
    currency: CurrencySchema,
    per: z.enum(["month", "year", "once"]),
  })
  .refine((a) => a.min <= a.max, { message: "min must be <= max" });

export const CostProfileRecordSchema = z.strictObject({
  slug: SlugSchema,
  country: CountryCodeSchema,
  city: SlugSchema.nullable(),
  lines: z.strictObject({
    housing: stableFact(CostAmountSchema).optional(),
    food: stableFact(CostAmountSchema).optional(),
    transport: stableFact(CostAmountSchema).optional(),
    insurance: stableFact(CostAmountSchema).optional(),
    application_visa: stableFact(CostAmountSchema).optional(),
    setup: stableFact(CostAmountSchema).optional(),
  }),
  sources: SourcesSchema,
});

export type LivingCostCategory = (typeof LIVING_COST_CATEGORIES)[number];
export type CostAmount = z.infer<typeof CostAmountSchema>;
export type CostProfileRecord = z.infer<typeof CostProfileRecordSchema>;
