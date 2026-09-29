import { z } from "zod";

import { LocalizedTextSchema } from "../localized-text";
import { CountryCodeSchema, SlugSchema } from "../primitives";
import { RecordProvenanceShape, SourcesSchema } from "../provenance";
import { RuleSchema } from "../rules";

export const AdmissionRouteRecordSchema = z.strictObject({
  slug: SlugSchema,
  origin: CountryCodeSchema,
  credentialType: SlugSchema,
  destination: CountryCodeSchema,
  level: z.literal("bachelor"),
  outcome: z.enum(["direct", "foundation", "not_eligible", "check"]),
  conditions: z
    .array(RuleSchema)
    .refine((rules) => new Set(rules.map((r) => r.id)).size === rules.length, {
      message: "rule ids must be unique",
    })
    .default([]),
  note: LocalizedTextSchema.optional(),
  applicationChannels: z.array(SlugSchema),
  ...RecordProvenanceShape,
  sources: SourcesSchema,
});

export type AdmissionRouteRecord = z.infer<typeof AdmissionRouteRecordSchema>;
