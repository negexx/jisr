import { z } from "zod";

import { LocalizedTextSchema } from "../localized-text";
import { CountryCodeSchema, SlugSchema } from "../primitives";
import { RecordProvenanceShape, SourcesSchema } from "../provenance";

const CredentialTrackSchema = z.strictObject({
  slug: SlugSchema,
  name: z.string().min(1),
  gloss: LocalizedTextSchema.optional(),
  subjects: z.array(SlugSchema).nullable(),
});

export const CredentialTypeRecordSchema = z.strictObject({
  slug: SlugSchema,
  country: CountryCodeSchema,
  name: z.string().min(1),
  gloss: LocalizedTextSchema,
  gradingScale: SlugSchema,
  tracks: z
    .array(CredentialTrackSchema)
    .min(1)
    .refine((tracks) => new Set(tracks.map((t) => t.slug)).size === tracks.length, {
      message: "track slugs must be unique",
    }),
  ...RecordProvenanceShape,
  sources: SourcesSchema,
});

export type CredentialTypeRecord = z.infer<typeof CredentialTypeRecordSchema>;
