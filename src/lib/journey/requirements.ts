import type { FactMeta, ResolvedRequirements, ResolvedRule } from "@/data-schema/resolved";

import {
  certificateName,
  credentialTypeName,
  type DescribeContext,
  formatList,
  formatNumber,
  formatThreshold,
  languageName,
  type Params,
  subjectName,
  type TextNoteView,
  textNoteOf,
  trackName,
} from "./reasons";

export type RuleLine = { key: string; params: Params };

// A rule in general terms (the program page, not evaluated against a student). `key` + `params`
// is the main line (`domain.rule.*`); `details` are further lines of the same rule (a language
// rule's certificate requirement); `kindKey` is the heading and also takes `params`.
export type RuleView = {
  kind: ResolvedRule["kind"];
  kindKey: string;
  key: string;
  params: Params;
  details: RuleLine[];
  fact: FactMeta;
  note?: TextNoteView;
};

type Described = { key: string; params: Params; details: RuleLine[]; kindDetail: boolean };

function withValues(entries: Array<[string, string | number | null]>): Params {
  const params: Params = {};
  for (const [name, value] of entries) if (value !== null) params[name] = value;
  return params;
}

function line(key: string, params: Params = {}): RuleLine {
  return { key: `domain.rule.${key}`, params };
}

function main(key: string, params: Params, kindDetail = false): Described {
  return { key: `domain.rule.${key}`, params, details: [], kindDetail };
}

// Empty acceptedTests means any certificate counts (ADR 0005 item 6), which is never read as
// "no certificate needed"; certificateRequired null is "not published", never "not required".
function certificateLines(
  rule: Extract<ResolvedRule, { kind: "language_proficiency" }>,
  ctx: DescribeContext,
): RuleLine[] {
  const listed = formatList(
    rule.acceptedTests.map((slug) => certificateName(slug, ctx.core)),
    "disjunction",
    ctx.locale,
  );
  const list =
    listed === null ? null : line("language_proficiency.certificates", { certificates: listed });
  switch (rule.certificateRequired) {
    case true:
      return [
        line("language_proficiency.certificateRequired"),
        list ?? line("language_proficiency.anyCertificate"),
      ];
    case false:
      return [line("language_proficiency.certificateNotRequired")];
    case null:
      return list === null
        ? [line("language_proficiency.certificateUnpublished")]
        : [line("language_proficiency.certificateUnpublished"), list];
  }
}

function describeKind(rule: ResolvedRule, ctx: DescribeContext): Described {
  const { core, locale } = ctx;
  const threshold = (value: number, scale: string) =>
    formatThreshold(
      value,
      core.gradingScales.find((s) => s.slug === scale),
      locale,
    );
  const names = (slugs: readonly string[], name: (slug: string) => string, any: boolean) =>
    formatList(slugs.map(name), any ? "disjunction" : "conjunction", locale);

  switch (rule.kind) {
    case "credential_type_in":
      return main(
        "credential_type_in",
        withValues([["types", names(rule.types, (s) => credentialTypeName(s, core), true)]]),
      );
    case "credential_track_in":
      return main(
        "credential_track_in",
        withValues([["tracks", names(rule.tracks, (s) => trackName(s, core), true)]]),
      );
    case "overall_grade_min":
      return rule.threshold === null
        ? main("overall_grade_min.unpublished", {})
        : main(
            "overall_grade_min.published",
            withValues([["required", threshold(rule.threshold, rule.scale)]]),
          );
    case "subject_grade_min": {
      const subject = subjectName(rule.subject, ctx);
      return rule.threshold === null
        ? main("subject_grade_min.unpublished", { subject }, true)
        : main(
            "subject_grade_min.published",
            withValues([
              ["subject", subject],
              ["required", threshold(rule.threshold, rule.scale)],
            ]),
            true,
          );
    }
    case "subject_taken":
      return main(
        rule.mode === "any" ? "subject_taken.any" : "subject_taken.all",
        withValues([
          ["subjects", names(rule.subjects, (s) => subjectName(s, ctx), rule.mode === "any")],
        ]),
      );
    case "language_proficiency": {
      const language = languageName(rule.language, locale);
      const described =
        rule.minCefr === null
          ? main("language_proficiency.unpublished", { language }, true)
          : main("language_proficiency.published", { language, required: rule.minCefr }, true);
      return { ...described, details: certificateLines(rule, ctx) };
    }
    case "prior_study_years_min":
      // `years` selects the ICU plural form; `count` is the number formatted (Latin digits in ar).
      return main(
        "prior_study_years_min",
        withValues([
          ["count", formatNumber(rule.years, locale)],
          ["years", rule.years],
        ]),
      );
    case "manual_check":
      return main("manual_check", {});
    default:
      return unknownKind(rule);
  }
}

// Typed `never` so a new rule kind fails the typecheck; at runtime it is described as a manual
// check (read the official page), never as a requirement we understood.
function unknownKind(_rule: never): Described {
  return main("manual_check", {});
}

export function describeRule(rule: ResolvedRule, ctx: DescribeContext): RuleView {
  const described = describeKind(rule, ctx);
  const view: RuleView = {
    kind: rule.kind,
    kindKey: described.kindDetail
      ? `domain.reason.kindDetail.${rule.kind}`
      : `domain.reason.kind.${rule.kind}`,
    key: described.key,
    params: described.params,
    details: described.details,
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
