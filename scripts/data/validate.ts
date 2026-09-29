import type { IsoDate } from "@/data-schema/dates";
import { compareIso, diffDays } from "@/data-schema/dates";
import type { Locale } from "@/data-schema/primitives";
import { LOCALES } from "@/data-schema/primitives";
import type { CollectionName, RecordOf } from "@/data-schema/records/collections";
import { COLLECTION_NAMES, COLLECTIONS } from "@/data-schema/records/collections";
import type { Freshness } from "@/data-schema/staleness";
import { freshnessOf } from "@/data-schema/staleness";

import type { FactUse } from "./facts";
import { factUses, localizedTexts } from "./facts";
import type { Issue, LoadedFile, LoadResult } from "./load-data";
import { checkReferences } from "./references";

export type { FactUse } from "./facts";
export { factUses, localizedTexts } from "./facts";

export type Entry<C extends CollectionName> = { file: string; record: RecordOf<C> };
export type Catalog = { [C in CollectionName]: Map<string, Entry<C>> };
export type FreshnessRow = FactUse & {
  lastVerifiedAt: IsoDate;
  ageDays: number;
  freshness: Freshness;
};
export type TranslationCoverage = Record<
  Locale,
  { present: number; reviewed: number; total: number }
>;
export type ValidationResult = {
  recordCount: number;
  catalog: Catalog;
  errors: Issue[];
  warnings: Issue[];
  freshness: FreshnessRow[];
  translations: TranslationCoverage;
};

function emptyCatalog(): Catalog {
  return {
    countries: new Map(),
    fields: new Map(),
    subjects: new Map(),
    "language-certificates": new Map(),
    "grading-scales": new Map(),
    "grade-conversions": new Map(),
    "credential-types": new Map(),
    "application-channels": new Map(),
    "admission-routes": new Map(),
    institutions: new Map(),
    programs: new Map(),
    "cost-profiles": new Map(),
    scholarships: new Map(),
  };
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function idOf(collection: CollectionName, record: RecordOf<CollectionName>): string {
  return String(Reflect.get(record, COLLECTIONS[collection].idKey));
}

function registerRecord(
  catalog: Catalog,
  file: LoadedFile,
  record: RecordOf<CollectionName>,
): Issue | null {
  const id = idOf(file.collection, record);
  if (id !== file.id) {
    return {
      file: file.file,
      path: "",
      message: `id "${id}" must equal the file name "${file.id}"`,
    };
  }
  // The collection tag pairs this record with its own map; the union view is only for insertion.
  const entries: Map<string, Entry<CollectionName>> = catalog[file.collection];
  const existing = entries.get(id);
  if (existing !== undefined) {
    return {
      file: file.file,
      path: "",
      message: `duplicate id "${id}" (also in ${existing.file})`,
    };
  }
  entries.set(id, { file: file.file, record });
  return null;
}

function schemaAndIdentity(loaded: LoadResult, catalog: Catalog): Issue[] {
  const errors: Issue[] = [];
  for (const file of loaded.files) {
    const parsed = COLLECTIONS[file.collection].schema.safeParse(file.raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ file: file.file, path: issue.path.join("."), message: issue.message });
      }
      continue;
    }
    const error = registerRecord(catalog, file, parsed.data);
    if (error !== null) errors.push(error);
  }
  return errors;
}

function entriesOf(catalog: Catalog): Array<{
  collection: CollectionName;
  file: string;
  record: RecordOf<CollectionName>;
}> {
  return COLLECTION_NAMES.flatMap((collection) =>
    [...catalog[collection].values()].map((entry) => ({ collection, ...entry })),
  );
}

function provenance(
  catalog: Catalog,
  now: IsoDate,
): { errors: Issue[]; warnings: Issue[]; freshness: FreshnessRow[] } {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const freshness: FreshnessRow[] = [];

  for (const { collection, file, record } of entriesOf(catalog)) {
    if (!("sources" in record)) continue;
    const { sources } = record;
    const used = new Set<string>();

    for (const use of factUses(collection, record, file)) {
      used.add(use.sourceKey);
      const source = Object.hasOwn(sources, use.sourceKey) ? sources[use.sourceKey] : undefined;
      if (source === undefined) {
        errors.push({
          file,
          path: use.path === "" ? "source" : `${use.path}.source`,
          message: `unknown source key "${use.sourceKey}"`,
        });
        continue;
      }
      freshness.push({
        ...use,
        lastVerifiedAt: source.last_verified_at,
        ageDays: diffDays(now, source.last_verified_at),
        freshness: freshnessOf(use.class, source.last_verified_at, now),
      });
    }

    for (const [key, source] of Object.entries(sources)) {
      if (!used.has(key)) {
        warnings.push({ file, path: `sources.${key}`, message: `source "${key}" is never used` });
      }
      if (compareIso(source.last_verified_at, now) > 0) {
        errors.push({
          file,
          path: `sources.${key}.last_verified_at`,
          message: `${source.last_verified_at} is in the future`,
        });
      }
    }
  }

  freshness.sort((a, b) => compareText(a.file, b.file) || compareText(a.path, b.path));
  return { errors, warnings, freshness };
}

function coverageWarnings(catalog: Catalog): Issue[] {
  const warnings: Issue[] = [];
  const requirementsOf = [
    ...[...catalog.programs.values()].map((e) => ({ file: e.file, req: e.record.requirements })),
    ...[...catalog.scholarships.values()].map((e) => ({
      file: e.file,
      req: e.record.requirements,
    })),
  ];
  for (const { file, req } of requirementsOf) {
    if (req.coverage !== "complete") continue;
    if (req.rules.length === 0) {
      warnings.push({
        file,
        path: "requirements",
        message: "coverage is complete but there are no rules",
      });
    }
    for (const rule of req.rules) {
      if (rule.kind === "manual_check") {
        warnings.push({
          file,
          path: "requirements",
          message: `coverage is complete but rule "${rule.id}" is manual_check`,
        });
      }
    }
  }
  return warnings;
}

function translationCoverage(catalog: Catalog): TranslationCoverage {
  const coverage: TranslationCoverage = {
    fr: { present: 0, reviewed: 0, total: 0 },
    en: { present: 0, reviewed: 0, total: 0 },
    ar: { present: 0, reviewed: 0, total: 0 },
  };
  for (const { collection, record } of entriesOf(catalog)) {
    for (const text of localizedTexts(collection, record)) {
      for (const locale of LOCALES) {
        const entry = text[locale];
        const row = coverage[locale];
        row.total += 1;
        if (entry !== undefined) row.present += 1;
        if (entry?.status === "reviewed") row.reviewed += 1;
      }
    }
  }
  return coverage;
}

export function validateData(loaded: LoadResult, opts: { now: IsoDate }): ValidationResult {
  const catalog = emptyCatalog();
  const schemaErrors = schemaAndIdentity(loaded, catalog);
  const prov = provenance(catalog, opts.now);
  return {
    recordCount: loaded.files.length,
    catalog,
    errors: [...loaded.errors, ...schemaErrors, ...prov.errors, ...checkReferences(catalog)],
    warnings: [...prov.warnings, ...coverageWarnings(catalog)],
    freshness: prov.freshness,
    translations: translationCoverage(catalog),
  };
}
