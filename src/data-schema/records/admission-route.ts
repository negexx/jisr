import { z } from "zod";

import { LocalizedTextSchema } from "../localized-text";
import { CountryCodeSchema, SlugSchema, SourceKeySchema } from "../primitives";
import { RecordProvenanceShape, SourcesSchema } from "../provenance";
import { RuleSchema } from "../rules";

// Advice about the destination country's own student aid (for example a national need-based grant).
// It is never an admission requirement: nothing evaluates it and match status never reads it, which
// is why it is not a route condition. `info_kind` can only say "guidance", so it never reads as official.
export const RouteGuidanceSchema = z.strictObject({
  id: SlugSchema,
  source: SourceKeySchema,
  info_kind: z.literal("guidance"),
  note: LocalizedTextSchema,
});

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
  guidance: z
    .array(RouteGuidanceSchema)
    .refine((items) => new Set(items.map((g) => g.id)).size === items.length, {
      message: "guidance ids must be unique",
    })
    .default([]),
  applicationChannels: z.array(SlugSchema),
  ...RecordProvenanceShape,
  sources: SourcesSchema,
});

export type AdmissionRouteRecord = z.infer<typeof AdmissionRouteRecordSchema>;
