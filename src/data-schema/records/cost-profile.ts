import { z } from "zod";

import { CountryCodeSchema, CurrencySchema, MinorAmountSchema, SlugSchema } from "../primitives";
import { SourcesSchema, stableFact, volatileFact } from "../provenance";

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

// Rent, food and transport are stable estimates; fees (insurance, visa, setup) change yearly and age on the volatile clock (owner decision 2026-10-07).
export const CostProfileRecordSchema = z.strictObject({
  slug: SlugSchema,
  country: CountryCodeSchema,
  city: SlugSchema.nullable(),
  lines: z.strictObject({
    housing: stableFact(CostAmountSchema).optional(),
    food: stableFact(CostAmountSchema).optional(),
    transport: stableFact(CostAmountSchema).optional(),
    insurance: volatileFact(CostAmountSchema).optional(),
    application_visa: volatileFact(CostAmountSchema).optional(),
    setup: volatileFact(CostAmountSchema).optional(),
  }),
  sources: SourcesSchema,
});

export type LivingCostCategory = (typeof LIVING_COST_CATEGORIES)[number];
export type CostAmount = z.infer<typeof CostAmountSchema>;
export type CostProfileRecord = z.infer<typeof CostProfileRecordSchema>;
