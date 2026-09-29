import { z } from "zod";

export const TranslationStatusSchema = z.enum(["draft", "reviewed"]);
const LocalizedEntrySchema = z.strictObject({
  text: z.string().trim().min(1).max(400),
  status: TranslationStatusSchema,
});
export const LocalizedTextSchema = z.strictObject({
  fr: LocalizedEntrySchema,
  en: LocalizedEntrySchema.optional(),
  ar: LocalizedEntrySchema.optional(),
});

export type TranslationStatus = z.infer<typeof TranslationStatusSchema>;
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;
