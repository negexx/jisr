import type { IsoDate } from "@/data-schema/dates";
import type { GradeValue, Profile } from "@/data-schema/profile";
import type {
  CredentialType,
  GradeConversion,
  GradingScale,
  ResolvedRule,
  TextKey,
} from "@/data-schema/resolved";
import { cefrAtLeast } from "./cefr";
import { downgrade, toFactRef } from "./facts";
import { convertGrade } from "./grades";
import type { FactRef, Reason, ReasonCode, ReasonValue, RuleOutcome } from "./types";

export type RuleContext = {
  profile: Profile;
  credentialTypes: readonly CredentialType[];
  gradingScales: readonly GradingScale[];
  gradeConversions: readonly GradeConversion[];
  record: string;
  pathPrefix: string;
  now: IsoDate;
};

type Raw = {
  outcome: RuleOutcome;
  code: ReasonCode;
  relied: FactRef[];
  student?: ReasonValue;
  studentConverted?: GradeValue;
  required?: ReasonValue;
  note?: TextKey;
};

type RuleOf<K extends ResolvedRule["kind"]> = Extract<ResolvedRule, { kind: K }>;
type GradeRule = RuleOf<"overall_grade_min" | "subject_grade_min">;

const UNKNOWN_MISSING: Pick<Raw, "outcome" | "code"> = {
  outcome: "unknown",
  code: "missing_student_value",
};

function passOrFail(passed: boolean, failCode: ReasonCode): Pick<Raw, "outcome" | "code"> {
  return passed ? { outcome: "pass", code: "ok" } : { outcome: "fail", code: failCode };
}

function copyGrade(grade: GradeValue): GradeValue {
  return { scale: grade.scale, value: grade.value };
}

function membership(student: string, allowed: readonly string[], ruleRef: FactRef): Raw {
  return {
    ...passOrFail(allowed.includes(student), "track_not_accepted"),
    relied: [ruleRef],
    student,
    required: [...allowed],
  };
}

function gradeMin(rule: GradeRule, ctx: RuleContext, ruleRef: FactRef): Raw {
  const scale = ctx.gradingScales.find((s) => s.slug === rule.scale);
  const relied = [ruleRef];
  if (scale) relied.push(toFactRef(`grading-scales/${scale.slug}`, "", scale.fact, ctx.now));

  const { credential } = ctx.profile;
  const grade =
    rule.kind === "overall_grade_min"
      ? credential.overall
      : credential.subjects.find((s) => s.subject === rule.subject)?.grade;
  if (!grade) return { ...UNKNOWN_MISSING, relied };

  const shown = {
    student: copyGrade(grade),
    ...(rule.threshold === null ? {} : { required: rule.threshold }),
  };
  if (rule.threshold === null) {
    return { outcome: "unknown", code: "threshold_unpublished", relied, ...shown };
  }

  const conversion = scale ? convertGrade(grade, rule.scale, ctx.gradeConversions) : null;
  if (!scale || !conversion || conversion.kind === "no_conversion") {
    return { outcome: "unknown", code: "no_scale_conversion", relied, ...shown };
  }

  let studentConverted: GradeValue | undefined;
  if (conversion.kind === "converted") {
    relied.push(
      toFactRef(`grade-conversions/${conversion.via.slug}`, "", conversion.via.fact, ctx.now),
    );
    studentConverted = copyGrade(conversion.value);
  }
  const value = conversion.value.value;
  const passed =
    scale.direction === "higher_better" ? value >= rule.threshold : value <= rule.threshold;
  return {
    ...passOrFail(passed, "below_threshold"),
    relied,
    ...shown,
    ...(studentConverted ? { studentConverted } : {}),
  };
}

function subjectTaken(rule: RuleOf<"subject_taken">, ctx: RuleContext, ruleRef: FactRef): Raw {
  const { credential } = ctx.profile;
  const taken = credential.subjects.map((s) => s.subject);
  const satisfies = (list: readonly string[]) =>
    rule.mode === "all"
      ? rule.subjects.every((s) => list.includes(s))
      : rule.subjects.some((s) => list.includes(s));
  const shown = { student: taken, required: [...rule.subjects] };

  if (satisfies(taken)) return { outcome: "pass", code: "ok", relied: [ruleRef], ...shown };

  const credentialType = ctx.credentialTypes.find((c) => c.slug === credential.type);
  const track = credentialType?.tracks.find((t) => t.slug === credential.track);
  if (credentialType && track?.subjects && !satisfies([...taken, ...track.subjects])) {
    return {
      outcome: "fail",
      code: "track_not_accepted",
      relied: [
        ruleRef,
        toFactRef(`credential-types/${credentialType.slug}`, "", credentialType.fact, ctx.now),
      ],
      ...shown,
    };
  }
  return { ...UNKNOWN_MISSING, relied: [ruleRef], ...shown };
}

function languageProficiency(
  rule: RuleOf<"language_proficiency">,
  ctx: RuleContext,
  ruleRef: FactRef,
): Raw {
  const relied = [ruleRef];
  const entry = ctx.profile.languages.find((l) => l.language === rule.language);
  const required = rule.minCefr === null ? {} : { required: rule.minCefr };
  if (!entry) return { ...UNKNOWN_MISSING, relied, ...required };

  const shown = { student: entry.level, ...required };
  if (entry.level === "unknown") return { ...UNKNOWN_MISSING, relied, ...shown };
  if (rule.minCefr === null) {
    return { outcome: "unknown", code: "threshold_unpublished", relied, ...shown };
  }
  if (!cefrAtLeast(entry.level, rule.minCefr)) {
    return { outcome: "fail", code: "below_threshold", relied, ...shown };
  }

  if (rule.certificateRequired === null) {
    return { outcome: "unknown", code: "threshold_unpublished", relied, ...shown };
  }
  if (rule.certificateRequired === false) {
    return { outcome: "pass", code: "ok", relied, ...shown };
  }
  const { certificate } = entry;
  const accepted =
    certificate !== null &&
    (rule.acceptedTests.length === 0 || rule.acceptedTests.includes(certificate));
  return accepted
    ? { outcome: "pass", code: "ok", relied, ...shown }
    : { ...UNKNOWN_MISSING, relied, ...shown };
}

function evaluateKind(rule: ResolvedRule, ctx: RuleContext, ruleRef: FactRef): Raw {
  switch (rule.kind) {
    case "credential_type_in":
      return membership(ctx.profile.credential.type, rule.types, ruleRef);
    case "credential_track_in":
      return membership(ctx.profile.credential.track, rule.tracks, ruleRef);
    case "overall_grade_min":
    case "subject_grade_min":
      return gradeMin(rule, ctx, ruleRef);
    case "subject_taken":
      return subjectTaken(rule, ctx, ruleRef);
    case "language_proficiency":
      return languageProficiency(rule, ctx, ruleRef);
    case "prior_study_years_min": {
      const years = ctx.profile.priorHigherEducationYears;
      return {
        ...passOrFail(years >= rule.years, "below_threshold"),
        relied: [ruleRef],
        student: years,
        required: rule.years,
      };
    }
    case "manual_check":
      return { outcome: "unknown", code: "manual_check", relied: [ruleRef], note: rule.note };
    default: {
      const unreachable: never = rule;
      return unreachable;
    }
  }
}

function evaluateRule(rule: ResolvedRule, ctx: RuleContext): Reason {
  const ruleRef = toFactRef(ctx.record, `${ctx.pathPrefix}.${rule.id}`, rule.fact, ctx.now);
  const raw = evaluateKind(rule, ctx, ruleRef);

  const isGradeRule = rule.kind === "overall_grade_min" || rule.kind === "subject_grade_min";
  const expectedCredential = ctx.profile.credential.status === "expected";
  const settled =
    isGradeRule && expectedCredential && raw.outcome !== "unknown" ? UNKNOWN_MISSING : raw;

  const { outcome, code } = downgrade(settled.outcome, settled.code, raw.relied);
  const reason: Reason = { ruleId: rule.id, kind: rule.kind, outcome, code, facts: raw.relied };
  if (raw.student !== undefined) reason.student = raw.student;
  if (raw.studentConverted !== undefined) reason.studentConverted = raw.studentConverted;
  if (raw.required !== undefined) reason.required = raw.required;
  if (raw.note !== undefined) reason.note = raw.note;
  return reason;
}

export function evaluateRules(rules: readonly ResolvedRule[], ctx: RuleContext): Reason[] {
  return rules.map((rule) => evaluateRule(rule, ctx));
}
