import { z } from "zod";

import { DRAFT_KEY, removeQuietly, type StorageLike } from "./storage";

export const DRAFT_SCHEMA_VERSION = 1;

const TYPED = z.string().max(200);
// Grades stay strings exactly as typed ("14," must survive a reload); the final profile parses them.
const GradeInputSchema = z.strictObject({ scale: TYPED, value: TYPED });

// Same fields as the final profile, only lenient and optional. Strict objects keep anything the
// final profile would not contain out of local storage.
export const DraftSchema = z.strictObject({
  schemaVersion: z.literal(DRAFT_SCHEMA_VERSION),
  step: z.number().int().nonnegative(),
  nationality: TYPED.optional(),
  credential: z
    .strictObject({
      country: TYPED.optional(),
      type: TYPED.optional(),
      track: TYPED.optional(),
      status: z.enum(["obtained", "expected"]).optional(),
      overall: GradeInputSchema.nullable().optional(),
      subjects: z.array(z.strictObject({ subject: TYPED, grade: GradeInputSchema })).optional(),
    })
    .optional(),
  priorHigherEducationYears: TYPED.optional(),
  languages: z
    .array(
      z.strictObject({
        language: TYPED,
        level: TYPED.optional(),
        certificate: TYPED.nullable().optional(),
      }),
    )
    .optional(),
  fields: z.array(TYPED).optional(),
  studyLanguages: z.array(TYPED).optional(),
  destinations: z.array(TYPED).optional(),
  budget: z
    .strictObject({
      amount: TYPED.optional(),
      currency: TYPED.optional(),
      period: z.enum(["month", "year"]).optional(),
    })
    .nullable()
    .optional(),
  institutionType: z.enum(["public", "private", "any"]).optional(),
});

export type ProfileDraft = z.infer<typeof DraftSchema>;
export type DraftWriteResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "storage_unavailable" };

// The draft is not part of the store's state and other tabs are not told about it; only the profile
// form should call this, and clearing the profile goes through the store (`clear`, `save`).
export function readDraft(storage: StorageLike): ProfileDraft | null {
  let raw: string | null;
  try {
    raw = storage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed = DraftSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // Corrupt JSON is handled like any other invalid draft.
  }
  removeQuietly(storage, DRAFT_KEY);
  return null;
}

// The draft is not part of the store's state and other tabs are not told about it; only the profile
// form should call this, and clearing the profile goes through the store (`clear`, `save`).
export function writeDraft(storage: StorageLike, draft: unknown): DraftWriteResult {
  const parsed = DraftSchema.safeParse(draft);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    storage.setItem(DRAFT_KEY, JSON.stringify(parsed.data));
  } catch {
    return { ok: false, reason: "storage_unavailable" };
  }
  return { ok: true };
}

// The draft is not part of the store's state and other tabs are not told about it; only the profile
// form should call this, and clearing the profile goes through the store (`clear`, `save`).
export function clearDraft(storage: StorageLike): void {
  removeQuietly(storage, DRAFT_KEY);
}
