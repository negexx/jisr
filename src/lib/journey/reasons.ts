import type { GradeValue } from "@/data-schema/profile";
import type {
  AdmissionRoute,
  GradingScale,
  Program,
  ResolvedRule,
  TextKey,
} from "@/data-schema/resolved";
import type { CoreShard } from "@/data-schema/snapshot";
import type { FactRef, Reason, ReasonCode, ReasonKind, RuleOutcome } from "@/domain/types";
import type { AppLocale } from "@/i18n/routing";
import { formatGrade, intlLocale } from "@/lib/format";
import type { TextLookup, TextLookupNote } from "@/lib/snapshot/text";

export type Params = Record<string, string | number>;
export type TextNoteView = { text: string; textNote: TextLookupNote };

export type DescribeContext = { locale: AppLocale; core: CoreShard; text: TextLookup };
// `rules` finds the rule a reason came from (thresholds' scale, subject, list mode): program rules
// by id, route conditions as `route:<id>`, as the domain names them. Build it with `ruleIndex`.
export type ReasonContext = DescribeContext & { rules: ReadonlyMap<string, ResolvedRule> };

export type ReasonView = {
  key: string;
  params: Params;
  outcome: RuleOutcome;
  kind: ReasonKind;
  code: ReasonCode;
  note: TextNoteView | null;
  facts: FactRef[];
};

// Stands in for a value a message needs but the reason does not carry (or carries in a shape we
// cannot show), so formatting never throws and never prints a raw object.
export const NEUTRAL_PARAM = "?";

type CodeParam = "student" | "required";

// ICU arguments each `domain.reason.code.*` message uses (T4's MESSAGE_ARGS); a Record, so a new
// ReasonCode fails the typecheck until it is listed here.
export const REASON_CODE_PARAMS: Record<ReasonCode, readonly CodeParam[]> = {
  ok: [],
  below_threshold: ["student", "required"],
  track_not_accepted: ["student", "required"],
  missing_student_value: [],
  threshold_unpublished: [],
  no_scale_conversion: [],
  stale_source: [],
  non_official_source: [],
  route_foundation: [],
  route_not_eligible: [],
  route_check: [],
  coverage_partial: [],
  manual_check: [],
};

export function ruleIndex(
  program: Program,
  route: AdmissionRoute | null,
): ReadonlyMap<string, ResolvedRule> {
  const index = new Map<string, ResolvedRule>();
  for (const rule of program.requirements.rules) index.set(rule.id, rule);
  for (const condition of route?.conditions ?? []) index.set(`route:${condition.id}`, condition);
  return index;
}

type ListMode = "conjunction" | "disjunction";
type Namer = (slug: string) => string | null;

export function formatNumber(value: number, locale: AppLocale): string | null {
  if (!Number.isFinite(value)) return null;
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 }).format(value);
}

export function formatList(
  names: readonly string[],
  mode: ListMode,
  locale: AppLocale,
): string | null {
  if (names.length === 0) return null;
  return new Intl.ListFormat(intlLocale(locale), { type: mode }).format(names);
}

function isGradeValue(value: unknown): value is GradeValue {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "scale") === "string" &&
    typeof Reflect.get(value, "value") === "number"
  );
}

function scaleOf(slug: string, core: CoreShard): GradingScale | undefined {
  return core.gradingScales.find((s) => s.slug === slug);
}

export function formatThreshold(
  value: number,
  scale: GradingScale | undefined,
  locale: AppLocale,
): string | null {
  if (!Number.isFinite(value)) return null;
  return scale === undefined ? formatNumber(value, locale) : formatGrade(value, scale, locale);
}

function formatGradeValue(grade: unknown, ctx: DescribeContext): string | null {
  if (!isGradeValue(grade)) return null;
  return formatThreshold(grade.value, scaleOf(grade.scale, ctx.core), ctx.locale);
}

// Official names (credential types, tracks, certificates) are shown untranslated; subject names are
// localised data text.
export function credentialTypeName(slug: string, core: CoreShard): string {
  return core.credentialTypes.find((c) => c.slug === slug)?.name ?? slug;
}

export function trackName(slug: string, core: CoreShard): string {
  for (const type of core.credentialTypes) {
    const track = type.tracks.find((t) => t.slug === slug);
    if (track !== undefined) return track.name;
  }
  return slug;
}

export function subjectName(slug: string, ctx: DescribeContext): string {
  const subject = ctx.core.subjects.find((s) => s.slug === slug);
  return (subject === undefined ? undefined : ctx.text(subject.name)?.text) ?? slug;
}

export function certificateName(slug: string, core: CoreShard): string {
  return core.languageCertificates.find((c) => c.slug === slug)?.name ?? slug;
}

export function textNoteOf(key: TextKey, text: TextLookup): TextNoteView | null {
  const found = text(key);
  return found === undefined ? null : { text: found.text, textNote: found.note };
}

type ValueSpec = { name: Namer; list: ListMode; scale: GradingScale | undefined };

const asIs: Namer = (slug) => slug;

// Handles every ReasonValue shape; anything else (booleans included: no message shows one) is null.
function formatValue(value: unknown, spec: ValueSpec, ctx: DescribeContext): string | null {
  if (typeof value === "string") return spec.name(value);
  if (typeof value === "number") return formatThreshold(value, spec.scale, ctx.locale);
  if (Array.isArray(value)) {
    const names: string[] = [];
    for (const item of value) {
      const name = typeof item === "string" ? spec.name(item) : null;
      if (name === null) return null;
      names.push(name);
    }
    return formatList(names, spec.list, ctx.locale);
  }
  return formatGradeValue(value, ctx);
}

type Specs = { student: ValueSpec; required: ValueSpec; subject: string | null };

function specsFor(reason: Reason, ctx: ReasonContext): Specs {
  const rule = ctx.rules.get(reason.ruleId);
  const plain: ValueSpec = { name: asIs, list: "conjunction", scale: undefined };
  const kind = reason.kind;
  switch (kind) {
    case "credential_type_in": {
      const name: Namer = (slug) => credentialTypeName(slug, ctx.core);
      return {
        student: { ...plain, name },
        required: { ...plain, name, list: "disjunction" },
        subject: null,
      };
    }
    case "credential_track_in": {
      const name: Namer = (slug) => trackName(slug, ctx.core);
      return {
        student: { ...plain, name },
        required: { ...plain, name, list: "disjunction" },
        subject: null,
      };
    }
    case "overall_grade_min":
    case "subject_grade_min": {
      const gradeRule =
        rule?.kind === "overall_grade_min" || rule?.kind === "subject_grade_min" ? rule : null;
      // The threshold is on the rule's scale, which is also the converted grade's scale.
      const scaleSlug = gradeRule?.scale ?? convertedScale(reason);
      const scale = scaleSlug === null ? undefined : scaleOf(scaleSlug, ctx.core);
      const subject =
        gradeRule?.kind === "subject_grade_min" ? subjectName(gradeRule.subject, ctx) : null;
      return { student: plain, required: { ...plain, scale }, subject };
    }
    case "subject_taken": {
      const name: Namer = (slug) => subjectName(slug, ctx);
      const list: ListMode =
        rule?.kind === "subject_taken" && rule.mode === "any" ? "disjunction" : "conjunction";
      return { student: { ...plain, name }, required: { ...plain, name, list }, subject: null };
    }
    case "language_proficiency": {
      // "unknown" is the profile's "I don't know", not a level to show.
      const name: Namer = (level) => (level === "unknown" ? null : level);
      return { student: { ...plain, name }, required: { ...plain, name }, subject: null };
    }
    case "prior_study_years_min":
    case "manual_check":
    case "route":
    case "coverage":
      return { student: plain, required: plain, subject: null };
    default:
      return unknownKind(kind, plain);
  }
}

// Typed `never` so a new ReasonKind fails the typecheck; at runtime (a kind this code does not know
// yet) values are shown plainly rather than throwing.
function unknownKind(_kind: never, plain: ValueSpec): Specs {
  return { student: plain, required: plain, subject: null };
}

function convertedScale(reason: Reason): string | null {
  return isGradeValue(reason.studentConverted) ? reason.studentConverted.scale : null;
}

function neededParams(code: ReasonCode): readonly CodeParam[] {
  return Object.hasOwn(REASON_CODE_PARAMS, code) ? REASON_CODE_PARAMS[code] : [];
}

export function describeReason(reason: Reason, ctx: ReasonContext): ReasonView {
  const specs = specsFor(reason, ctx);
  const params: Params = {};
  const set = (name: string, value: string | null) => {
    if (value !== null) params[name] = value;
  };
  set("student", formatValue(reason.student, specs.student, ctx));
  set("studentConverted", formatGradeValue(reason.studentConverted, ctx));
  set("required", formatValue(reason.required, specs.required, ctx));
  set("subject", specs.subject);
  for (const name of neededParams(reason.code)) {
    if (!Object.hasOwn(params, name)) params[name] = NEUTRAL_PARAM;
  }

  return {
    key: `domain.reason.code.${reason.code}`,
    params,
    outcome: reason.outcome,
    kind: reason.kind,
    code: reason.code,
    note: reason.note === undefined ? null : textNoteOf(reason.note, ctx.text),
    facts: reason.facts,
  };
}
