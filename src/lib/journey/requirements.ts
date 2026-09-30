import type { FactMeta, ResolvedRequirements, ResolvedRule } from "@/data-schema/resolved";

import {
  certificateName,
  credentialTypeName,
  type DescribeContext,
  formatList,
  formatNumber,
  formatThreshold,
  type Params,
  subjectName,
  type TextNoteView,
  textNoteOf,
  trackName,
} from "./reasons";

// A rule in general terms (the program page, not evaluated against a student). T4 has no
// "general terms" wording per kind yet, so the key is the kind label and the details are params.
export type RuleView = {
  kind: ResolvedRule["kind"];
  key: string;
  params: Params;
  fact: FactMeta;
  note?: TextNoteView;
};

function withValues(entries: Array<[string, string | null]>): Params {
  const params: Params = {};
  for (const [name, value] of entries) if (value !== null) params[name] = value;
  return params;
}

function paramsOf(rule: ResolvedRule, ctx: DescribeContext): Params {
  const { core, locale } = ctx;
  const threshold = (value: number | null, scale: string) =>
    value === null
      ? null
      : formatThreshold(
          value,
          core.gradingScales.find((s) => s.slug === scale),
          locale,
        );
  switch (rule.kind) {
    case "credential_type_in":
      return withValues([
        [
          "types",
          formatList(
            rule.types.map((slug) => credentialTypeName(slug, core)),
            "disjunction",
            locale,
          ),
        ],
      ]);
    case "credential_track_in":
      return withValues([
        [
          "tracks",
          formatList(
            rule.tracks.map((slug) => trackName(slug, core)),
            "disjunction",
            locale,
          ),
        ],
      ]);
    case "overall_grade_min":
      return withValues([["required", threshold(rule.threshold, rule.scale)]]);
    case "subject_grade_min":
      return withValues([
        ["subject", subjectName(rule.subject, ctx)],
        ["required", threshold(rule.threshold, rule.scale)],
      ]);
    case "subject_taken":
      return withValues([
        [
          "subjects",
          formatList(
            rule.subjects.map((slug) => subjectName(slug, ctx)),
            rule.mode === "any" ? "disjunction" : "conjunction",
            locale,
          ),
        ],
      ]);
    case "language_proficiency":
      // `language` is the ISO code: the vocabulary has no localised language names yet.
      return withValues([
        ["language", rule.language],
        ["required", rule.minCefr],
        [
          "certificates",
          formatList(
            rule.acceptedTests.map((slug) => certificateName(slug, core)),
            "disjunction",
            locale,
          ),
        ],
      ]);
    case "prior_study_years_min":
      return withValues([["years", formatNumber(rule.years, locale)]]);
    case "manual_check":
      return {};
    default:
      return unknownKind(rule);
  }
}

// Typed `never` so a new rule kind fails the typecheck; at runtime it is described by its key alone.
function unknownKind(_rule: never): Params {
  return {};
}

export function describeRule(rule: ResolvedRule, ctx: DescribeContext): RuleView {
  const view: RuleView = {
    kind: rule.kind,
    key: `domain.reason.kind.${rule.kind}`,
    params: paramsOf(rule, ctx),
    fact: rule.fact,
  };
  if (rule.kind === "manual_check") {
    const note = textNoteOf(rule.note, ctx.text);
    if (note !== null) view.note = note;
  }
  return view;
}

export function describeCoverage(requirements: ResolvedRequirements): {
  key: "domain.coverage.partial" | "domain.coverage.complete";
} {
  return { key: `domain.coverage.${requirements.coverage}` };
}
