import { z } from "zod";

import { CountryCodeSchema, HttpsUrlSchema, SlugSchema } from "../primitives";
import { RecordProvenanceShape, SourcesSchema } from "../provenance";

export const InstitutionRecordSchema = z.strictObject({
  slug: SlugSchema,
  name: z.string().min(1),
  country: CountryCodeSchema,
  city: z.strictObject({ slug: SlugSchema, name: z.string().min(1) }),
  type: z.enum(["public", "private"]),
  website: HttpsUrlSchema,
  ...RecordProvenanceShape,
  sources: SourcesSchema,
});

export type InstitutionRecord = z.infer<typeof InstitutionRecordSchema>;
