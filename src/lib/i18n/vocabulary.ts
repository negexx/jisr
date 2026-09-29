import { INFO_KINDS } from "@/data-schema/primitives";
import type { RouteOutcome } from "@/data-schema/resolved";
import type { Coverage } from "@/data-schema/rules";
import type { Freshness } from "@/data-schema/staleness";
import type { PreferenceMismatch } from "@/domain/filter";
import type {
  BudgetFit,
  ChecklistReasonCode,
  ChecklistStepId,
  CostCategory,
  CostLine,
  IntakeStatus,
  MatchStatus,
  ReasonCode,
  ReasonKind,
  RuleOutcome,
} from "@/domain/types";
import { CHECKLIST_STEP_IDS } from "@/domain/types";

export { CHECKLIST_STEP_IDS, INFO_KINDS };

type CostPer = NonNullable<CostLine["per"]>;
type CostScope = NonNullable<CostLine["scope"]>;
type IntakeKind = IntakeStatus["kind"];
export type TextNote = "french_fallback" | "machine_translated";

// Compile-time exhaustiveness: `Assert` only accepts `true`, so a domain value missing from an
// array (or an array value missing from the domain type) breaks `pnpm typecheck`.
type Exhaustive<Domain extends string, Values extends readonly string[]> = [
  Exclude<Domain, Values[number]>,
] extends [never]
  ? [Exclude<Values[number], Domain>] extends [never]
    ? true
    : { extraValues: Exclude<Values[number], Domain> }
  : { missingValues: Exclude<Domain, Values[number]> };
type Assert<Check extends true> = Check;

export const MATCH_STATUSES = [
  "satisfied",
  "check",
  "not_satisfied",
] as const satisfies readonly MatchStatus[];

export const ROUTE_OUTCOMES = [
  "direct",
  "foundation",
  "not_eligible",
  "check",
] as const satisfies readonly RouteOutcome[];

// "missing" is UI-only: MatchResult.route is "missing" when no admission route is published.
export const ROUTE_KEYS = [...ROUTE_OUTCOMES, "missing"] as const;

export const REASON_CODES = [
  "ok",
  "below_threshold",
  "track_not_accepted",
  "missing_student_value",
  "threshold_unpublished",
  "no_scale_conversion",
  "stale_source",
  "non_official_source",
  "route_foundation",
  "route_not_eligible",
  "route_check",
  "coverage_partial",
  "manual_check",
] as const satisfies readonly ReasonCode[];

export const REASON_KINDS = [
  "credential_type_in",
  "credential_track_in",
  "overall_grade_min",
  "subject_grade_min",
  "subject_taken",
  "language_proficiency",
  "prior_study_years_min",
  "manual_check",
  "route",
  "coverage",
] as const satisfies readonly ReasonKind[];

export const RULE_OUTCOMES = ["pass", "fail", "unknown"] as const satisfies readonly RuleOutcome[];

export const CHECKLIST_REASON_CODES = [
  "applies",
  "unknown_data",
  "not_required_by_source",
  "certificate_held",
  "no_account_required",
  "no_scholarships_listed",
] as const satisfies readonly ChecklistReasonCode[];

export const PREFERENCE_MISMATCHES = [
  "destination",
  "field",
  "institution_type",
  "study_language",
] as const satisfies readonly PreferenceMismatch[];

export const COST_CATEGORIES = [
  "tuition",
  "housing",
  "food",
  "transport",
  "insurance",
  "application_visa",
  "setup",
] as const satisfies readonly CostCategory[];

export const COST_PERS = [
  "month",
  "year",
  "semester",
  "once",
] as const satisfies readonly CostPer[];

export const COST_SCOPES = ["program", "city", "country"] as const satisfies readonly CostScope[];

export const BUDGET_FITS = [
  "within",
  "straddles",
  "above",
  "unknown",
] as const satisfies readonly BudgetFit[];

export const INTAKE_KINDS = [
  "upcoming",
  "closed",
  "unknown",
] as const satisfies readonly IntakeKind[];

export const FRESHNESSES = ["fresh", "aging", "stale"] as const satisfies readonly Freshness[];

export const COVERAGES = ["complete", "partial"] as const satisfies readonly Coverage[];

export const TEXT_NOTES = [
  "french_fallback",
  "machine_translated",
] as const satisfies readonly TextNote[];

export type VocabularyIsExhaustive = [
  Assert<Exhaustive<MatchStatus, typeof MATCH_STATUSES>>,
  Assert<Exhaustive<RouteOutcome, typeof ROUTE_OUTCOMES>>,
  Assert<Exhaustive<ReasonCode, typeof REASON_CODES>>,
  Assert<Exhaustive<ReasonKind, typeof REASON_KINDS>>,
  Assert<Exhaustive<RuleOutcome, typeof RULE_OUTCOMES>>,
  Assert<Exhaustive<ChecklistStepId, typeof CHECKLIST_STEP_IDS>>,
  Assert<Exhaustive<ChecklistReasonCode, typeof CHECKLIST_REASON_CODES>>,
  Assert<Exhaustive<PreferenceMismatch, typeof PREFERENCE_MISMATCHES>>,
  Assert<Exhaustive<CostCategory, typeof COST_CATEGORIES>>,
  Assert<Exhaustive<CostPer, typeof COST_PERS>>,
  Assert<Exhaustive<CostScope, typeof COST_SCOPES>>,
  Assert<Exhaustive<BudgetFit, typeof BUDGET_FITS>>,
  Assert<Exhaustive<IntakeKind, typeof INTAKE_KINDS>>,
  Assert<Exhaustive<Freshness, typeof FRESHNESSES>>,
  Assert<Exhaustive<Coverage, typeof COVERAGES>>,
  Assert<Exhaustive<TextNote, typeof TEXT_NOTES>>,
];

export type MessageGroup = {
  path: string;
  values: readonly string[];
  /** When set, each value is a namespace holding these leaves (`<path>.<value>.<leaf>`). */
  leaves?: readonly string[];
};

/**
 * Every message the domain vocabulary needs. Full key = `<path>.<value>` (plus `.<leaf>` when
 * `leaves` is set). Tests expand this table and require each key in fr, en and ar, and no other
 * key under `domain`. Adding a domain value without a message fails the test.
 *
 * Key paths and their ICU arguments (see MESSAGE_ARGS for the exact per-key list):
 *   domain.status.<MatchStatus>              badge label
 *   domain.status.short.<MatchStatus>        card label
 *   domain.status.hint.<MatchStatus>         one-line meaning and next step
 *   domain.route.<RouteOutcome|missing>      explanation paragraph
 *   domain.reason.kind.<ReasonKind>          what the requirement is about
 *   domain.reason.code.<ReasonCode>          why it passed, failed or is to be checked
 *                                            below_threshold, track_not_accepted: {student} {required}
 *   domain.reason.outcome.<RuleOutcome>      short label
 *   domain.checklist.step.<id>.{title,meaning}
 *   domain.checklist.reason.<ChecklistReasonCode>
 *   domain.mismatch.<PreferenceMismatch>     why a program is hidden
 *   domain.cost.category|per|scope.<value>   labels
 *   domain.cost.tenMonthNote                 {months}
 *   domain.cost.missingLine | partialTotal | estimateTag
 *   domain.budgetFit.<BudgetFit>             about the estimate, never the program
 *   domain.intake.<IntakeKind>               upcoming: {date}
 *   domain.infoKind.<InfoKind>.{label,meaning}
 *   domain.freshness.<Freshness>             plus verifiedOn {date}, bannerAging, bannerStale
 *   domain.coverage.<Coverage>
 *   domain.textNote.<TextNote>
 */
export const MESSAGE_GROUPS: readonly MessageGroup[] = [
  { path: "domain.status", values: MATCH_STATUSES },
  { path: "domain.status.short", values: MATCH_STATUSES },
  { path: "domain.status.hint", values: MATCH_STATUSES },
  { path: "domain.route", values: ROUTE_KEYS },
  { path: "domain.reason.kind", values: REASON_KINDS },
  { path: "domain.reason.code", values: REASON_CODES },
  { path: "domain.reason.outcome", values: RULE_OUTCOMES },
  { path: "domain.checklist.step", values: CHECKLIST_STEP_IDS, leaves: ["title", "meaning"] },
  { path: "domain.checklist.reason", values: CHECKLIST_REASON_CODES },
  { path: "domain.mismatch", values: PREFERENCE_MISMATCHES },
  { path: "domain.cost.category", values: COST_CATEGORIES },
  { path: "domain.cost.per", values: COST_PERS },
  { path: "domain.cost.scope", values: COST_SCOPES },
  {
    path: "domain.cost",
    values: ["tenMonthNote", "missingLine", "partialTotal", "estimateTag"],
  },
  { path: "domain.budgetFit", values: BUDGET_FITS },
  { path: "domain.intake", values: INTAKE_KINDS },
  { path: "domain.infoKind", values: INFO_KINDS, leaves: ["label", "meaning"] },
  {
    path: "domain.freshness",
    values: [...FRESHNESSES, "verifiedOn", "bannerAging", "bannerStale"],
  },
  { path: "domain.coverage", values: COVERAGES },
  { path: "domain.textNote", values: TEXT_NOTES },
];

/** ICU argument names per message key; keys not listed take no arguments. */
export const MESSAGE_ARGS: Readonly<Record<string, readonly string[]>> = {
  "domain.reason.code.below_threshold": ["student", "required"],
  "domain.reason.code.track_not_accepted": ["student", "required"],
  "domain.cost.tenMonthNote": ["months"],
  "domain.intake.upcoming": ["date"],
  "domain.freshness.verifiedOn": ["date"],
};
