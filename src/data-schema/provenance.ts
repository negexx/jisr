import { z } from "zod";

import type { LocalizedText } from "./localized-text";
import { LocalizedTextSchema } from "./localized-text";
import type { InfoKind, SourceKey } from "./primitives";
import { HttpsUrlSchema, InfoKindSchema, IsoDateSchema, SourceKeySchema } from "./primitives";
import type { StalenessClass } from "./staleness";

export const SourceSchema = z.strictObject({
  url: HttpsUrlSchema,
  last_verified_at: IsoDateSchema,
});
export const SourcesSchema = z
  .record(SourceKeySchema, SourceSchema)
  .refine((m) => Object.keys(m).length > 0, { message: "at least one source" });

export type Source = z.infer<typeof SourceSchema>;
export type SourcesMap = z.infer<typeof SourcesSchema>;

export type RawFact<T> = {
  value: T | null;
  source: SourceKey;
  info_kind: InfoKind;
  basis?: LocalizedText;
  class: StalenessClass;
};

function makeFact<T extends z.ZodType>(
  inner: T,
  cls: StalenessClass,
): z.ZodType<RawFact<z.output<T>>, unknown> {
  return z
    .strictObject({
      value: inner.nullable(),
      source: SourceKeySchema,
      info_kind: InfoKindSchema,
      basis: LocalizedTextSchema.optional(),
    })
    .superRefine((fact, ctx) => {
      if (fact.info_kind === "estimate" && fact.basis === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["basis"],
          message: "basis is required when info_kind is estimate",
        });
      }
    })
    .transform((fact) => ({ ...fact, class: cls }) as RawFact<z.output<T>>);
}

// YAML authors write { value, source, info_kind, basis? }; parsing adds `class`.
// value: explicit null means "not published" (never omitted).
export function volatileFact<T extends z.ZodType>(
  inner: T,
): z.ZodType<RawFact<z.output<T>>, unknown> {
  return makeFact(inner, "volatile");
}

export function stableFact<T extends z.ZodType>(
  inner: T,
): z.ZodType<RawFact<z.output<T>>, unknown> {
  return makeFact(inner, "stable");
}

// Records that are themselves a claim carry record-level provenance; its class is always "stable".
export const RecordProvenanceShape = {
  source: SourceKeySchema,
  info_kind: InfoKindSchema,
} as const;
