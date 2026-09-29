import { z } from "zod";

import { CountryCodeSchema, SlugSchema } from "../primitives";
import { RecordProvenanceShape, SourcesSchema } from "../provenance";

export const GradingScaleRecordSchema = z
  .strictObject({
    slug: SlugSchema,
    country: CountryCodeSchema.nullable(),
    min: z.number(),
    max: z.number(),
    pass: z.number(),
    direction: z.enum(["higher_better", "lower_better"]),
    ...RecordProvenanceShape,
    sources: SourcesSchema,
  })
  .refine((s) => s.min < s.max, { message: "min must be < max", path: ["min"] })
  .refine((s) => s.min <= s.pass && s.pass <= s.max, {
    message: "pass must be between min and max",
    path: ["pass"],
  });

export type GradingScaleRecord = z.infer<typeof GradingScaleRecordSchema>;
