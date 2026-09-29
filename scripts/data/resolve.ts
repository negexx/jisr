import type { LocalizedText } from "@/data-schema/localized-text";
import type { InfoKind } from "@/data-schema/primitives";
import type { RawFact, SourcesMap } from "@/data-schema/provenance";
import type { AdmissionRouteRecord } from "@/data-schema/records/admission-route";
import type { ApplicationChannelRecord } from "@/data-schema/records/application-channel";
import type { CollectionName } from "@/data-schema/records/collections";
import type { CostProfileRecord } from "@/data-schema/records/cost-profile";
import { LIVING_COST_CATEGORIES } from "@/data-schema/records/cost-profile";
import type { CountryRecord } from "@/data-schema/records/country";
import type { CredentialTypeRecord } from "@/data-schema/records/credential-type";
import type { FieldRecord } from "@/data-schema/records/field";
import type { GradeConversionRecord } from "@/data-schema/records/grade-conversion";
import type { GradingScaleRecord } from "@/data-schema/records/grading-scale";
import type { InstitutionRecord } from "@/data-schema/records/institution";
import type { LanguageCertificateRecord } from "@/data-schema/records/language-certificate";
import type { ProgramRecord } from "@/data-schema/records/program";
import type { ScholarshipRecord } from "@/data-schema/records/scholarship";
import type { SubjectRecord } from "@/data-schema/records/subject";
import type {
  AdmissionRoute,
  ApplicationChannel,
  CostProfile,
  Country,
  CredentialType,
  FactMeta,
  Field,
  GradeConversion,
  GradingScale,
  Institution,
  LanguageCertificate,
  Program,
  ResolvedDocument,
  ResolvedFact,
  ResolvedRequirements,
  ResolvedRule,
  Scholarship,
  Subject,
  TextKey,
} from "@/data-schema/resolved";
import type { RequirementsRecord, RuleRecord } from "@/data-schema/rules";
import type { StalenessClass } from "@/data-schema/staleness";

import { BuildError } from "./build-error";
import type { Catalog } from "./validate";

export type TextBag = Map<TextKey, LocalizedText>;
export type Resolved<T> = { value: T; texts: TextBag };
export type ResolvedCatalog = {
  countries: Resolved<Country>[];
  fields: Resolved<Field>[];
  subjects: Resolved<Subject>[];
  languageCertificates: Resolved<LanguageCertificate>[];
  gradingScales: Resolved<GradingScale>[];
  gradeConversions: Resolved<GradeConversion>[];
  credentialTypes: Resolved<CredentialType>[];
  applicationChannels: Resolved<ApplicationChannel>[];
  routes: Resolved<AdmissionRoute>[];
  institutions: Resolved<Institution>[];
  programs: Resolved<Program>[];
  costProfiles: Resolved<CostProfile>[];
  scholarships: Resolved<Scholarship>[];
};

export function textKey(collection: CollectionName, id: string, path: string): TextKey {
  return `${collection}/${id}#${path}`;
}

// One scope per record: it knows where the record's texts are registered and which sources it owns.
type Scope = {
  collection: CollectionName;
  id: string;
  sources: SourcesMap;
  texts: TextBag;
};

function scopeOf(collection: CollectionName, id: string, sources: SourcesMap): Scope {
  return { collection, id, sources, texts: new Map() };
}

function text(scope: Scope, path: string, value: LocalizedText): TextKey {
  const key = textKey(scope.collection, scope.id, path);
  scope.texts.set(key, value);
  return key;
}

function optionalText(
  scope: Scope,
  path: string,
  value: LocalizedText | undefined,
): TextKey | null {
  return value === undefined ? null : text(scope, path, value);
}

function meta(
  scope: Scope,
  source: string,
  infoKind: InfoKind,
  cls: StalenessClass,
  basis?: TextKey,
): FactMeta {
  const resolved = Object.hasOwn(scope.sources, source) ? scope.sources[source] : undefined;
  if (resolved === undefined) {
    throw new BuildError(`${scope.collection}/${scope.id}: unknown source key "${source}"`);
  }
  return {
    source_url: resolved.url,
    info_kind: infoKind,
    last_verified_at: resolved.last_verified_at,
    class: cls,
    ...(basis === undefined ? {} : { basis }),
  };
}

function recordFact(scope: Scope, source: string, infoKind: InfoKind): FactMeta {
  return meta(scope, source, infoKind, "stable");
}

function fact<T, U = T>(
  scope: Scope,
  path: string,
  raw: RawFact<T>,
  mapValue: (value: T) => U,
): ResolvedFact<U> {
  const basis = optionalText(scope, `${path}.basis`, raw.basis) ?? undefined;
  return {
    ...meta(scope, raw.source, raw.info_kind, raw.class, basis),
    value: raw.value === null ? null : mapValue(raw.value),
  };
}

function copied<T>(value: T): T {
  return structuredClone(value);
}

function documents(
  scope: Scope,
  path: string,
  raw: RawFact<NonNullable<ProgramRecord["documents"]["value"]>>,
): ResolvedFact<ResolvedDocument[]> {
  return fact(scope, path, raw, (docs) =>
    docs.map((doc, index) => ({
      slug: doc.slug,
      name: text(scope, `${path}.${index}.name`, doc.name),
      translationRequired: doc.translationRequired,
    })),
  );
}

function rule(scope: Scope, pathPrefix: string, raw: RuleRecord): ResolvedRule {
  const base = { id: raw.id, fact: recordFact(scope, raw.source, raw.info_kind) };
  switch (raw.kind) {
    case "credential_type_in":
      return { ...base, kind: raw.kind, types: [...raw.types] };
    case "credential_track_in":
      return { ...base, kind: raw.kind, tracks: [...raw.tracks] };
    case "overall_grade_min":
      return { ...base, kind: raw.kind, scale: raw.scale, threshold: raw.threshold };
    case "subject_grade_min":
      return {
        ...base,
        kind: raw.kind,
        subject: raw.subject,
        scale: raw.scale,
        threshold: raw.threshold,
      };
    case "subject_taken":
      return { ...base, kind: raw.kind, subjects: [...raw.subjects], mode: raw.mode };
    case "language_proficiency":
      return {
        ...base,
        kind: raw.kind,
        language: raw.language,
        minCefr: raw.minCefr,
        certificateRequired: raw.certificateRequired,
        acceptedTests: [...raw.acceptedTests],
      };
    case "prior_study_years_min":
      return { ...base, kind: raw.kind, years: raw.years };
    case "manual_check":
      return {
        ...base,
        kind: raw.kind,
        note: text(scope, `${pathPrefix}.${raw.id}.note`, raw.note),
      };
  }
}

function requirements(scope: Scope, raw: RequirementsRecord): ResolvedRequirements {
  return {
    coverage: raw.coverage,
    fact: recordFact(scope, raw.source, raw.info_kind),
    rules: raw.rules.map((r) => rule(scope, "requirements.rules", r)),
  };
}

function done<T>(scope: Scope, value: T): Resolved<T> {
  return { value, texts: scope.texts };
}

function resolveCountry(record: CountryRecord): Resolved<Country> {
  const scope = scopeOf("countries", record.code, {});
  return done(scope, {
    code: record.code,
    name: text(scope, "name", record.name),
    currency: record.currency,
  });
}

function resolveField(record: FieldRecord): Resolved<Field> {
  const scope = scopeOf("fields", record.slug, {});
  return done(scope, { slug: record.slug, name: text(scope, "name", record.name) });
}

function resolveSubject(record: SubjectRecord): Resolved<Subject> {
  const scope = scopeOf("subjects", record.slug, {});
  return done(scope, { slug: record.slug, name: text(scope, "name", record.name) });
}

function resolveLanguageCertificate(
  record: LanguageCertificateRecord,
): Resolved<LanguageCertificate> {
  const scope = scopeOf("language-certificates", record.slug, {});
  return done(scope, {
    slug: record.slug,
    name: record.name,
    language: record.language,
    url: record.url,
  });
}

function resolveGradingScale(record: GradingScaleRecord): Resolved<GradingScale> {
  const scope = scopeOf("grading-scales", record.slug, record.sources);
  return done(scope, {
    slug: record.slug,
    country: record.country,
    min: record.min,
    max: record.max,
    pass: record.pass,
    direction: record.direction,
    fact: recordFact(scope, record.source, record.info_kind),
  });
}

function resolveGradeConversion(record: GradeConversionRecord): Resolved<GradeConversion> {
  const scope = scopeOf("grade-conversions", record.slug, record.sources);
  return done(scope, {
    slug: record.slug,
    from: record.from,
    to: record.to,
    conversion: copied(record.conversion),
    fact: recordFact(scope, record.source, record.info_kind),
  });
}

function resolveCredentialType(record: CredentialTypeRecord): Resolved<CredentialType> {
  const scope = scopeOf("credential-types", record.slug, record.sources);
  return done(scope, {
    slug: record.slug,
    country: record.country,
    name: record.name,
    gloss: text(scope, "gloss", record.gloss),
    gradingScale: record.gradingScale,
    tracks: record.tracks.map((track, index) => ({
      slug: track.slug,
      name: track.name,
      gloss: optionalText(scope, `tracks.${index}.gloss`, track.gloss),
      subjects: track.subjects === null ? null : [...track.subjects],
    })),
    fact: recordFact(scope, record.source, record.info_kind),
  });
}

function resolveApplicationChannel(record: ApplicationChannelRecord): Resolved<ApplicationChannel> {
  const scope = scopeOf("application-channels", record.slug, record.sources);
  return done(scope, {
    slug: record.slug,
    name: record.name,
    country: record.country,
    kind: record.kind,
    url: record.url,
    accountRequired: record.accountRequired,
    summary: text(scope, "summary", record.summary),
    fact: recordFact(scope, record.source, record.info_kind),
  });
}

function resolveRoute(record: AdmissionRouteRecord): Resolved<AdmissionRoute> {
  const scope = scopeOf("admission-routes", record.slug, record.sources);
  return done(scope, {
    slug: record.slug,
    origin: record.origin,
    credentialType: record.credentialType,
    destination: record.destination,
    level: record.level,
    outcome: record.outcome,
    conditions: record.conditions.map((c) => rule(scope, "conditions", c)),
    note: optionalText(scope, "note", record.note),
    applicationChannels: [...record.applicationChannels],
    fact: recordFact(scope, record.source, record.info_kind),
  });
}

function resolveInstitution(record: InstitutionRecord): Resolved<Institution> {
  const scope = scopeOf("institutions", record.slug, record.sources);
  return done(scope, {
    slug: record.slug,
    name: record.name,
    country: record.country,
    city: { slug: record.city.slug, name: record.city.name },
    type: record.type,
    website: record.website,
    fact: recordFact(scope, record.source, record.info_kind),
  });
}

function resolveProgram(record: ProgramRecord, catalog: Catalog): Resolved<Program> {
  const institution = catalog.institutions.get(record.institution);
  if (institution === undefined) {
    throw new BuildError(`programs/${record.slug}: unknown institution "${record.institution}"`);
  }
  const scope = scopeOf("programs", record.slug, record.sources);
  return done(scope, {
    slug: record.slug,
    institution: record.institution,
    institutionType: institution.record.type,
    country: record.country,
    city: record.city,
    field: record.field,
    level: record.level,
    name: record.name,
    summary: text(scope, "summary", record.summary),
    officialUrl: record.officialUrl,
    durationYears: fact(scope, "durationYears", record.durationYears, copied),
    teachingLanguages: fact(scope, "teachingLanguages", record.teachingLanguages, copied),
    tuition: fact(scope, "tuition", record.tuition, copied),
    intakes: fact(scope, "intakes", record.intakes, copied),
    applicationChannel: fact(scope, "applicationChannel", record.applicationChannel, copied),
    documents: documents(scope, "documents", record.documents),
    requirements: requirements(scope, record.requirements),
    scholarships: [...record.scholarships],
  });
}

function resolveCostProfile(record: CostProfileRecord): Resolved<CostProfile> {
  const scope = scopeOf("cost-profiles", record.slug, record.sources);
  const lines: CostProfile["lines"] = {};
  for (const category of LIVING_COST_CATEGORIES) {
    const raw = record.lines[category];
    if (raw !== undefined) lines[category] = fact(scope, `lines.${category}`, raw, copied);
  }
  return done(scope, { slug: record.slug, country: record.country, city: record.city, lines });
}

function resolveScholarship(record: ScholarshipRecord): Resolved<Scholarship> {
  const scope = scopeOf("scholarships", record.slug, record.sources);
  return done(scope, {
    slug: record.slug,
    name: record.name,
    provider: record.provider,
    destinations: [...record.destinations],
    eligibleNationalities: [...record.eligibleNationalities],
    fields: [...record.fields],
    level: record.level,
    summary: text(scope, "summary", record.summary),
    support: fact(scope, "support", record.support, copied),
    deadline: fact(scope, "deadline", record.deadline, copied),
    requirements: requirements(scope, record.requirements),
    documents: documents(scope, "documents", record.documents),
    howToApply: text(scope, "howToApply", record.howToApply),
    officialUrl: record.officialUrl,
  });
}

// Top-level records are sorted by id so shard bytes never depend on file walk order.
function resolveAll<R, T>(
  entries: ReadonlyMap<string, { record: R }>,
  resolve: (record: R) => Resolved<T>,
): Resolved<T>[] {
  return [...entries.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, entry]) => resolve(entry.record));
}

export function resolveCatalog(catalog: Catalog): ResolvedCatalog {
  return {
    countries: resolveAll(catalog.countries, resolveCountry),
    fields: resolveAll(catalog.fields, resolveField),
    subjects: resolveAll(catalog.subjects, resolveSubject),
    languageCertificates: resolveAll(catalog["language-certificates"], resolveLanguageCertificate),
    gradingScales: resolveAll(catalog["grading-scales"], resolveGradingScale),
    gradeConversions: resolveAll(catalog["grade-conversions"], resolveGradeConversion),
    credentialTypes: resolveAll(catalog["credential-types"], resolveCredentialType),
    applicationChannels: resolveAll(catalog["application-channels"], resolveApplicationChannel),
    routes: resolveAll(catalog["admission-routes"], resolveRoute),
    institutions: resolveAll(catalog.institutions, resolveInstitution),
    programs: resolveAll(catalog.programs, (record) => resolveProgram(record, catalog)),
    costProfiles: resolveAll(catalog["cost-profiles"], resolveCostProfile),
    scholarships: resolveAll(catalog.scholarships, resolveScholarship),
  };
}
