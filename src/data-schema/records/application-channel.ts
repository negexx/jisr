import { z } from "zod";

import { LocalizedTextSchema } from "../localized-text";
import { CountryCodeSchema, HttpsUrlSchema, SlugSchema } from "../primitives";
import { RecordProvenanceShape, SourcesSchema } from "../provenance";

export const ApplicationChannelRecordSchema = z.strictObject({
  slug: SlugSchema,
  name: z.string().min(1),
  country: CountryCodeSchema,
  kind: z.enum(["national_portal", "intermediary", "direct"]),
  url: HttpsUrlSchema,
  accountRequired: z.boolean().nullable(),
  summary: LocalizedTextSchema,
  ...RecordProvenanceShape,
  sources: SourcesSchema,
});

export type ApplicationChannelRecord = z.infer<typeof ApplicationChannelRecordSchema>;
