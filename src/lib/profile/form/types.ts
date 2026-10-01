import type { Cefr } from "@/data-schema/primitives";
import type { TextKey } from "@/data-schema/resolved";

export type LanguageLevel = "" | Cefr | "unknown";
export type CredentialStatus = "" | "obtained" | "expected";
export type InstitutionType = "public" | "private" | "any";
export type BudgetPeriod = "month" | "year";

export type SubjectRow = { subject: string; grade: string };
export type LanguageRow = { language: string; level: LanguageLevel; certificate: string };

// Everything is a string as typed ("14," survives); the numbers are made in build.ts.
export type FormState = {
  nationality: string;
  credential: {
    country: string;
    type: string;
    track: string;
    status: CredentialStatus;
    overall: string;
    subjects: SubjectRow[];
  };
  priorHigherEducationYears: string;
  languages: LanguageRow[];
  fields: string[];
  studyLanguages: string[];
  destinations: string[];
  institutionType: InstitutionType;
  budget: { amount: string; currency: string; period: BudgetPeriod };
};

export type CountryOption = { code: string; name: TextKey };

export type StepIssueCode =
  | "required"
  | "not_a_number"
  | "ambiguous_number"
  | "too_many_decimals"
  | "out_of_range"
  | "unknown_option"
  | "certificate_language_mismatch"
  | "duplicate_subject"
  | "duplicate_language"
  | "too_many_rows"
  | "not_a_whole_number"
  | "years_out_of_range";

// `params` are already formatted for display (plain ASCII digits as strings), see src/lib/i18n/vocabulary.ts.
export type StepIssue = {
  code: StepIssueCode;
  path: string;
  params?: Record<string, string | number>;
};
