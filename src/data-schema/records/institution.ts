import { z } from "zod";

import { CountryCodeSchema, HttpsUrlSchema, SlugSchema } from "../primitives";
import { RecordProvenanceShape, SourcesSchema } from "../provenance";

export const InstitutionRecordSchema = z.strictObject({
  slug: SlugSchema,
  // Same alias mechanism as program formerSlugs: published into the manifest alias map, which is
  // one namespace across collections, so data:check resolves renamed institutions too.
  formerSlugs: z.array(SlugSchema).optional(),
  name: z.string().min(1),
  country: CountryCodeSchema,
  city: z.strictObject({ slug: SlugSchema, name: z.string().min(1) }),
  // null = the registers do not say (yet): shown as "to be checked", never guessed
  type: z.enum(["public", "private"]).nullable(),
  website: HttpsUrlSchema.nullable(),
  ...RecordProvenanceShape,
  sources: SourcesSchema,
});

export type InstitutionRecord = z.infer<typeof InstitutionRecordSchema>;
