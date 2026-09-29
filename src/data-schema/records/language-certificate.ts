import { z } from "zod";

import { HttpsUrlSchema, LanguageCodeSchema, SlugSchema } from "../primitives";

export const LanguageCertificateRecordSchema = z.strictObject({
  slug: SlugSchema,
  name: z.string().min(1),
  language: LanguageCodeSchema,
  url: HttpsUrlSchema,
});

export type LanguageCertificateRecord = z.infer<typeof LanguageCertificateRecordSchema>;
