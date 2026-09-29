import { z } from "zod";

import { type CountryCode, type Locale, LocaleSchema, type Slug } from "./primitives";
import type {
  AdmissionRoute,
  ApplicationChannel,
  CostProfile,
  Country,
  CredentialType,
  Field,
  GradeConversion,
  GradingScale,
  Institution,
  LanguageCertificate,
  Program,
  Scholarship,
  Subject,
  TextEntry,
  TextKey,
} from "./resolved";

export const SNAPSHOT_FORMAT_VERSION = 1;
export const SHARD_GZIP_BUDGET_BYTES = 300 * 1024; // build fails above this
export const shardNames = {
  core: () => "core",
  routes: (origin: CountryCode) => `routes.${origin}`,
  institutions: (destination: CountryCode) => `institutions.${destination}`,
  costs: (destination: CountryCode) => `costs.${destination}`,
  programs: (destination: CountryCode, field: Slug) => `programs.${destination}.${field}`,
  scholarships: (destination: CountryCode) => `scholarships.${destination}`,
  text: (locale: Locale, shard: string) => `text.${locale}.${shard}`,
} as const;

export type CoreShard = {
  kind: "core";
  countries: Country[];
  fields: Field[];
  subjects: Subject[];
  languageCertificates: LanguageCertificate[];
  gradingScales: GradingScale[];
  gradeConversions: GradeConversion[];
  credentialTypes: CredentialType[];
  applicationChannels: ApplicationChannel[];
};
export type RoutesShard = { kind: "routes"; origin: CountryCode; routes: AdmissionRoute[] };
export type InstitutionsShard = {
  kind: "institutions";
  destination: CountryCode;
  institutions: Institution[];
};
export type CostsShard = { kind: "costs"; destination: CountryCode; profiles: CostProfile[] };
export type ProgramsShard = {
  kind: "programs";
  destination: CountryCode;
  field: Slug;
  programs: Program[];
};
// multi-destination scholarships are duplicated
export type ScholarshipsShard = {
  kind: "scholarships";
  destination: CountryCode;
  scholarships: Scholarship[];
};
export type TextShard = {
  kind: "text";
  locale: Locale;
  shard: string;
  entries: Record<TextKey, TextEntry>;
};
export type Shard =
  | CoreShard
  | RoutesShard
  | InstitutionsShard
  | CostsShard
  | ProgramsShard
  | ScholarshipsShard
  | TextShard;

export const ManifestShardSchema = z.strictObject({
  file: z.string().regex(/^s\/[A-Za-z0-9.-]+\.[0-9a-f]{12}\.json$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.number().int().positive(),
  gzipBytes: z.number().int().positive(),
});
export const ManifestSchema = z.strictObject({
  formatVersion: z.literal(1),
  snapshotVersion: z.string().regex(/^[0-9a-f]{12}$/),
  generatedAt: z.string(), // ISO 8601 datetime; excluded from all hashes
  locales: z.array(LocaleSchema).min(1), // always ["fr","en","ar"]
  shards: z.record(z.string(), ManifestShardSchema),
});
export type Manifest = z.infer<typeof ManifestSchema>;
