import { z } from "zod";

import { LocalizedTextSchema } from "../localized-text";
import { SlugSchema } from "../primitives";

export const FieldRecordSchema = z.strictObject({
  slug: SlugSchema,
  name: LocalizedTextSchema,
});

export type FieldRecord = z.infer<typeof FieldRecordSchema>;
