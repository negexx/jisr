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
  MatchResult,
  MatchStatus,
  ReasonCode,
  ReasonKind,
  RuleOutcome,
} from "@/domain/types";
import { CHECKLIST_STEP_IDS } from "@/domain/types";
import { INFO_KINDS } from "@/lib/constants";

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
export const ROUTE_KEYS = [
  ...ROUTE_OUTCOMES,
  "missing",
] as const satisfies readonly MatchResult["route"][];

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

// The `per` labels ("per month", "par mois", "في الشهر") are stand-alone phrases: render them as a
// separate element or through a dedicated message, never concatenated to an amount (word order
// differs in Arabic).
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
  "recurring",
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
  Assert<Exhaustive<MatchResult["route"], typeof ROUTE_KEYS>>,
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

// Message-only keys (no domain type behind them): the journey view layer picks them.
export const ROUTE_SOURCE_KEYS = ["staleSource", "nonOfficialSource"] as const;
export const REASON_CODE_VARIANTS = ["below_threshold_converted"] as const;
export const REASON_KIND_DETAILS = [
  "subject_grade_min",
  "language_proficiency",
] as const satisfies readonly ReasonKind[];
export const RULE_PLAIN_KINDS = [
  "credential_type_in",
  "credential_track_in",
  "prior_study_years_min",
  "manual_check",
] as const satisfies readonly ReasonKind[];
// Extra lines of a rule, not tied to one kind: scaleLowerBetter reads a threshold on a
// lower-is-better grading scale.
export const RULE_DETAIL_KEYS = ["scaleLowerBetter"] as const;
export const THRESHOLD_VARIANTS = ["published", "unpublished"] as const;
export const SUBJECT_TAKEN_VARIANTS = ["all", "any"] as const;
export const LANGUAGE_RULE_VARIANTS = [
  "published",
  "unpublished",
  "certificateRequired",
  "certificateNotRequired",
  "certificateUnpublished",
  "certificates",
  "anyCertificate",
] as const;

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
 *   domain.route.staleSource|nonOfficialSource  replaces domain.route.<direct|not_eligible> when
 *                                            the route fact is stale or not official (no outcome)
 *   domain.reason.kind.<ReasonKind>          what the requirement is about
 *   domain.reason.kindDetail.<kind>          the same, naming the subject / language
 *   domain.reason.code.<ReasonCode>          why it passed, failed or is to be checked
 *                                            below_threshold, track_not_accepted: {student} {required}
 *   domain.reason.code.below_threshold_converted  {student} {studentConverted} {required}
 *   domain.reason.outcome.<RuleOutcome>      short label
 *   domain.rule.<kind>[.<variant>]           a rule in general terms (program page)
 *   domain.rule.scaleLowerBetter             {required}: the threshold's scale is lower-is-better
 *   domain.checklist.step.<id>.{title,meaning}
 *   domain.checklist.reason.<ChecklistReasonCode>
 *   domain.mismatch.<PreferenceMismatch>     why a program is hidden
 *   domain.cost.category|per|scope.<value>   labels
 *   domain.cost.tenMonthNote                 {months}
 *   domain.cost.missingLine | partialTotal | estimateTag
 *   domain.budgetFit.<BudgetFit>             about the estimate, never the program
 *   domain.intake.<IntakeKind>               upcoming: {date}; recurring: {date} as DD/MM
 *   domain.infoKind.<InfoKind>.{label,meaning}
 *   domain.freshness.<Freshness>             plus verifiedOn {date}
 *   domain.coverage.<Coverage>
 *   domain.textNote.<TextNote>
 *
 * Argument contract (Latin digits in Arabic): every argument that is displayed is a string already
 * formatted with `src/lib/format.ts` (or `formatNumber` in `src/lib/journey/reasons.ts`, same
 * `intlLocale`). A number is passed only as a plural/select selector and never printed: messages
 * use no ICU `#`, `, number` or `, date`. The translator locale is plain "ar", which an older
 * browser CLDR formats with Arabic-Indic digits. Example: domain.cost.tenMonthNote takes
 * `months: formatNumber(ACADEMIC_YEAR_MONTHS, locale)`, a string.
 */
export const MESSAGE_GROUPS: readonly MessageGroup[] = [
  { path: "domain.status", values: MATCH_STATUSES },
  { path: "domain.status.short", values: MATCH_STATUSES },
  { path: "domain.status.hint", values: MATCH_STATUSES },
  { path: "domain.route", values: ROUTE_KEYS },
  { path: "domain.route", values: ROUTE_SOURCE_KEYS },
  { path: "domain.reason.kind", values: REASON_KINDS },
  { path: "domain.reason.kindDetail", values: REASON_KIND_DETAILS },
  { path: "domain.reason.code", values: REASON_CODES },
  { path: "domain.reason.code", values: REASON_CODE_VARIANTS },
  { path: "domain.reason.outcome", values: RULE_OUTCOMES },
  { path: "domain.rule", values: RULE_PLAIN_KINDS },
  { path: "domain.rule", values: RULE_DETAIL_KEYS },
  { path: "domain.rule.overall_grade_min", values: THRESHOLD_VARIANTS },
  { path: "domain.rule.subject_grade_min", values: THRESHOLD_VARIANTS },
  { path: "domain.rule.subject_taken", values: SUBJECT_TAKEN_VARIANTS },
  { path: "domain.rule.language_proficiency", values: LANGUAGE_RULE_VARIANTS },
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
    values: [...FRESHNESSES, "verifiedOn"],
  },
  { path: "domain.coverage", values: COVERAGES },
  { path: "domain.textNote", values: TEXT_NOTES },
];

/** ICU argument names per message key; keys not listed take no arguments. */
export const MESSAGE_ARGS: Readonly<Record<string, readonly string[]>> = {
  "domain.reason.code.below_threshold": ["student", "required"],
  "domain.reason.code.track_not_accepted": ["student", "required"],
  "domain.reason.code.below_threshold_converted": ["student", "studentConverted", "required"],
  "domain.reason.kindDetail.subject_grade_min": ["subject"],
  "domain.reason.kindDetail.language_proficiency": ["language"],
  "domain.rule.credential_type_in": ["types"],
  "domain.rule.credential_track_in": ["tracks"],
  "domain.rule.overall_grade_min.published": ["required"],
  "domain.rule.subject_grade_min.published": ["subject", "required"],
  "domain.rule.subject_grade_min.unpublished": ["subject"],
  "domain.rule.subject_taken.all": ["subjects"],
  "domain.rule.subject_taken.any": ["subjects"],
  "domain.rule.language_proficiency.published": ["language", "required"],
  "domain.rule.language_proficiency.unpublished": ["language"],
  "domain.rule.language_proficiency.certificates": ["certificates"],
  "domain.rule.scaleLowerBetter": ["required"],
  // `years` (a number) only selects the plural branch; `count` is the same number preformatted.
  "domain.rule.prior_study_years_min": ["count", "years"],
  "domain.cost.tenMonthNote": ["months"],
  "domain.intake.upcoming": ["date"],
  "domain.intake.recurring": ["date"],
  "domain.freshness.verifiedOn": ["date"],
};
