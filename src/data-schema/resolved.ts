import type { IsoDate } from "./dates";
import type { Cefr, CountryCode, Currency, InfoKind, LanguageCode, Slug } from "./primitives";
import type { CostAmount, LivingCostCategory } from "./records/cost-profile";
import type { GradeConversionMethod } from "./records/grade-conversion";
import type { Intake, Tuition } from "./records/program";
import type { ScholarshipSupport } from "./records/scholarship";
import type { Coverage } from "./rules";
import type { StalenessClass } from "./staleness";

// "<collection>/<id>#<dotted.path>", e.g. "programs/xx-test-prog#summary",
// "programs/xx-test-prog#documents.0.name", "programs/xx-test-prog#requirements.rules.r-math.note"
export type TextKey = string;

export type FactMeta = {
  source_url: string;
  info_kind: InfoKind;
  last_verified_at: IsoDate;
  class: StalenessClass;
  basis?: TextKey;
};
export type ResolvedFact<T> = FactMeta & { value: T | null };

type RuleBase = { id: Slug; fact: FactMeta }; // rule facts are class "stable"
export type ResolvedRule =
  | (RuleBase & { kind: "credential_type_in"; types: Slug[] })
  | (RuleBase & { kind: "credential_track_in"; tracks: Slug[] })
  | (RuleBase & { kind: "overall_grade_min"; scale: Slug; threshold: number | null })
  | (RuleBase & { kind: "subject_grade_min"; subject: Slug; scale: Slug; threshold: number | null })
  | (RuleBase & { kind: "subject_taken"; subjects: Slug[]; mode: "all" | "any" })
  | (RuleBase & {
      kind: "language_proficiency";
      language: LanguageCode;
      minCefr: Cefr | null;
      certificateRequired: boolean | null;
      acceptedTests: Slug[];
    })
  | (RuleBase & { kind: "prior_study_years_min"; years: number })
  | (RuleBase & { kind: "manual_check"; note: TextKey });
export type ResolvedRequirements = { coverage: Coverage; fact: FactMeta; rules: ResolvedRule[] };

export type RouteOutcome = "direct" | "foundation" | "not_eligible" | "check";
export type ResolvedDocument = { slug: Slug; name: TextKey; translationRequired: boolean | null };

export type Country = { code: CountryCode; name: TextKey; currency: Currency };
export type Field = { slug: Slug; name: TextKey };
export type Subject = { slug: Slug; name: TextKey };
export type LanguageCertificate = { slug: Slug; name: string; language: LanguageCode; url: string };
export type GradingScale = {
  slug: Slug;
  country: CountryCode | null;
  min: number;
  max: number;
  pass: number;
  direction: "higher_better" | "lower_better";
  fact: FactMeta;
};
export type GradeConversion = {
  slug: Slug;
  from: Slug;
  to: Slug;
  conversion: GradeConversionMethod;
  fact: FactMeta;
};
export type CredentialTrack = {
  slug: Slug;
  name: string;
  gloss: TextKey | null;
  subjects: Slug[] | null;
};
export type CredentialType = {
  slug: Slug;
  country: CountryCode;
  name: string;
  gloss: TextKey;
  gradingScale: Slug;
  tracks: CredentialTrack[];
  fact: FactMeta;
};
export type ApplicationChannel = {
  slug: Slug;
  name: string;
  country: CountryCode;
  kind: "national_portal" | "intermediary" | "direct";
  url: string;
  accountRequired: boolean | null;
  summary: TextKey;
  fact: FactMeta;
};
export type AdmissionRoute = {
  slug: Slug;
  origin: CountryCode;
  credentialType: Slug;
  destination: CountryCode;
  level: "bachelor";
  outcome: RouteOutcome;
  conditions: ResolvedRule[];
  note: TextKey | null;
  applicationChannels: Slug[];
  fact: FactMeta;
};
export type Institution = {
  slug: Slug;
  name: string;
  country: CountryCode;
  city: { slug: Slug; name: string };
  type: "public" | "private" | null;
  website: string | null;
  fact: FactMeta;
};
export type Program = {
  slug: Slug;
  institution: Slug;
  institutionType: "public" | "private" | null; // denormalised from institution
  country: CountryCode;
  city: Slug;
  field: Slug;
  level: "bachelor";
  name: string;
  summary: TextKey;
  officialUrl: string;
  durationYears: ResolvedFact<number>;
  teachingLanguages: ResolvedFact<LanguageCode[]>;
  tuition: ResolvedFact<Tuition>;
  intakes: ResolvedFact<Intake[]>;
  applicationChannel: ResolvedFact<Slug>;
  documents: ResolvedFact<ResolvedDocument[]>;
  requirements: ResolvedRequirements;
  scholarships: Slug[];
};
export type CostProfile = {
  slug: Slug;
  country: CountryCode;
  city: Slug | null;
  lines: Partial<Record<LivingCostCategory, ResolvedFact<CostAmount>>>;
};
export type Scholarship = {
  slug: Slug;
  name: string;
  provider: string;
  destinations: CountryCode[];
  eligibleNationalities: CountryCode[];
  fields: Slug[];
  institutions?: Slug[];
  level: "bachelor";
  summary: TextKey;
  support: ResolvedFact<ScholarshipSupport>;
  deadline: ResolvedFact<IsoDate>;
  requirements: ResolvedRequirements;
  documents: ResolvedFact<ResolvedDocument[]>;
  howToApply: TextKey;
  officialUrl: string;
};
export type TextEntry = { text: string; status: "draft" | "reviewed"; fallback: boolean }; // fallback: fr substituted
