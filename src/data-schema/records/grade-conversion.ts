import { z } from "zod";

import { SlugSchema } from "../primitives";
import { RecordProvenanceShape, SourcesSchema } from "../provenance";

export const GradeConversionMethodSchema = z.discriminatedUnion("method", [
  z.strictObject({ method: z.literal("identity"), params: z.strictObject({}) }),
  z.strictObject({
    method: z.literal("linear"),
    params: z
      .strictObject({
        fromMin: z.number(),
        fromMax: z.number(),
        toMin: z.number(),
        toMax: z.number(),
      })
      .refine((p) => p.fromMin !== p.fromMax, { message: "fromMin must differ from fromMax" }),
  }),
  z.strictObject({
    method: z.literal("modified_bavarian"),
    params: z
      .strictObject({
        nMax: z.number(),
        nMin: z.number(),
        truncateDecimals: z.number().int().min(0).nullable(),
      })
      .refine((p) => p.nMax !== p.nMin, { message: "nMax must differ from nMin" }),
  }),
]);

export const GradeConversionRecordSchema = z.strictObject({
  slug: SlugSchema,
  from: SlugSchema,
  to: SlugSchema,
  conversion: GradeConversionMethodSchema,
  ...RecordProvenanceShape,
  sources: SourcesSchema,
});

export type GradeConversionMethod = z.infer<typeof GradeConversionMethodSchema>;
export type GradeConversionRecord = z.infer<typeof GradeConversionRecordSchema>;
