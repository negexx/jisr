import { z } from "zod";

import { LocalizedTextSchema } from "../localized-text";
import { SlugSchema } from "../primitives";

export const SubjectRecordSchema = z.strictObject({
  slug: SlugSchema,
  name: LocalizedTextSchema,
});

export type SubjectRecord = z.infer<typeof SubjectRecordSchema>;
