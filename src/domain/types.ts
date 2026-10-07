import type { IsoDate } from "@/data-schema/dates";
import type { Currency, InfoKind, Slug } from "@/data-schema/primitives";
import type { GradeValue } from "@/data-schema/profile";
import type { Intake, MonthDay } from "@/data-schema/records/program";
import type { ResolvedRule, RouteOutcome, TextKey } from "@/data-schema/resolved";
import type { Freshness, StalenessClass } from "@/data-schema/staleness";

// Record-level provenance FactRefs (grading-scales, grade-conversions, credential-types,
// admission-routes, application-channels) use path "". Rule FactRef path = `${pathPrefix}.${rule.id}`.
export type FactRef = {
  record: string; // "<collection>/<id>"
  path: string; // e.g. "tuition", "requirements.rules.r-math"
  source_url: string;
  last_verified_at: IsoDate;
  info_kind: InfoKind;
  class: StalenessClass;
  freshness: Freshness;
  basis?: TextKey; // copied from FactMeta.basis
};

export type MatchStatus = "satisfied" | "check" | "not_satisfied"; // UI maps to ✅ ⚠️ ❌
export type RuleOutcome = "pass" | "fail" | "unknown";
export type ReasonCode =
  | "ok"
  | "below_threshold"
  | "track_not_accepted"
  | "missing_student_value"
  | "threshold_unpublished"
  | "no_scale_conversion"
  | "stale_source"
  | "non_official_source"
  | "route_foundation"
  | "route_not_eligible"
  | "route_check"
  | "coverage_partial"
  | "manual_check";
export type ReasonKind = ResolvedRule["kind"] | "route" | "coverage";
export type ReasonValue = string | number | boolean | readonly string[] | GradeValue;
export type Reason = {
  ruleId: string; // rule id; "route"; "route:<conditionId>"; or "coverage"
  kind: ReasonKind;
  outcome: RuleOutcome;
  code: ReasonCode;
  student?: ReasonValue;
  studentConverted?: GradeValue;
  required?: ReasonValue;
  note?: TextKey;
  facts: FactRef[];
};
export type MatchResult = {
  programSlug: Slug;
  status: MatchStatus;
  route: RouteOutcome | "missing";
  reasons: Reason[];
};

export type CostCategory =
  | "tuition"
  | "housing"
  | "food"
  | "transport"
  | "insurance"
  | "application_visa"
  | "setup";
export type CostLine = {
  category: CostCategory;
  status: "ok" | "missing";
  firstYear: { min: number; max: number; currency: Currency } | null; // minor units
  per: "month" | "year" | "semester" | "once" | null;
  scope: "program" | "city" | "country" | null;
  fact: FactRef | null;
  // Set only on a tuition line whose official fee is a range that depends on household income.
  incomeBased?: true;
};
export type BudgetFit = "within" | "straddles" | "above" | "unknown";
export type CostEstimate = {
  programSlug: Slug;
  lines: CostLine[]; // 7, fixed order above
  totals: Array<{ min: number; max: number; currency: Currency }>;
  complete: boolean;
  budgetFit: BudgetFit;
  academicYearMonths: number; // 10: monthly lines are multiplied by this (decision 2026-09-29)
};

export const CHECKLIST_STEP_IDS = [
  "documents",
  "translation",
  "language_exam",
  "application_account",
  "submit",
  "scholarships",
  "financial_documents",
  "accommodation",
  "visa",
  "departure",
] as const;
export type ChecklistStepId = (typeof CHECKLIST_STEP_IDS)[number];
export type ChecklistReasonCode =
  | "applies"
  | "unknown_data"
  | "not_required_by_source"
  | "certificate_held"
  | "no_account_required"
  | "no_scholarships_listed";
export type ChecklistStep = {
  id: ChecklistStepId;
  status: "todo" | "skipped";
  reason: ChecklistReasonCode;
  facts: FactRef[];
  deadline?: IsoDate | null;
  channel?: Slug | null;
  scholarships?: Slug[];
};
export type Checklist = {
  programSlug: Slug;
  steps: ChecklistStep[]; // always 10, CHECKLIST_STEP_IDS order
};

export type IntakeStatus =
  | { kind: "upcoming"; intake: Intake; fact: FactRef }
  | { kind: "recurring"; deadline: MonthDay; fact: FactRef } // UI: "Usually by 15/07 each year: check the date for your intake"
  | { kind: "closed"; fact: FactRef } // UI: "Closed — next dates not yet published"
  | { kind: "unknown"; fact: FactRef | null };
