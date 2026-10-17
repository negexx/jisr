import type { GradingScale } from "@/data-schema/resolved";
import type { CoreShard } from "@/data-schema/snapshot";
import { CEFR_LEVELS } from "@/lib/constants";
import { parseLocaleDecimal } from "@/lib/format";

import {
  certificateOptionsFor,
  credentialTypeOptions,
  gradingScaleFor,
  languageRowOptions,
  MAX_SUBJECT_ROWS,
  trackOptions,
} from "./options";
import { STEPS, type StepId } from "./state";
import type { FormState, StepIssue, StepIssueCode } from "./types";

export type { StepIssue, StepIssueCode };

// A copy of the rule inside parseLocaleDecimal (src/lib/format.ts), which does not export it; the
// drift test in tests/lib/profile/form/validate-step.test.ts fails if the two disagree.
export const AMBIGUOUS_THOUSANDS = /^[0-9]{1,3}[.,][0-9]{3}$/;

const MAX_DECIMALS = 2;
const WHOLE_NUMBER = /^[0-9]+$/;
const CREDENTIAL_STATUSES = ["obtained", "expected"];
const LANGUAGE_LEVELS: readonly string[] = [...CEFR_LEVELS, "unknown"];
const MIN_YEARS = 0;
const MAX_YEARS = 3;

type Collector = {
  issues: StepIssue[];
  add: (code: StepIssueCode, path: string, params?: StepIssue["params"]) => void;
};

function collector(): Collector {
  const issues: StepIssue[] = [];
  return {
    issues,
    add(code, path, params) {
      if (issues.some((issue) => issue.code === code && issue.path === path)) return;
      issues.push(params === undefined ? { code, path } : { code, path, params });
    },
  };
}

function isKnown(value: string, options: readonly string[]): boolean {
  return options.includes(value);
}

// An unreadable grade text is "ambiguous" only when both a decimal and a thousands reading are
// plausible ("1,000" is 1 or 1000); "14,555" cannot be a grade in thousands, so it has too many decimals.
function numberProblem(text: string): StepIssueCode {
  const trimmed = text.trim();
  if (!AMBIGUOUS_THOUSANDS.test(trimmed)) return "not_a_number";
  return /^[0-9]{1,3}[.,]0{3}$/.test(trimmed) ? "ambiguous_number" : "too_many_decimals";
}

function decimalCount(text: string): number {
  const separator = Math.max(text.lastIndexOf("."), text.lastIndexOf(","));
  return separator === -1 ? 0 : text.length - separator - 1;
}

function checkGradeText(
  text: string,
  scale: GradingScale | undefined,
  path: string,
  found: Collector,
): void {
  const value = parseLocaleDecimal(text);
  if (value === null) {
    found.add(numberProblem(text), path);
    return;
  }
  if (decimalCount(text.trim()) > MAX_DECIMALS) {
    found.add("too_many_decimals", path);
    return;
  }
  if (scale === undefined) return;
  if (value < scale.min || value > scale.max) {
    found.add("out_of_range", path, { min: String(scale.min), max: String(scale.max) });
  }
}

function checkRequiredKnown(
  value: string,
  known: (value: string) => boolean,
  path: string,
  found: Collector,
): void {
  if (value.trim() === "") found.add("required", path);
  else if (!known(value)) found.add("unknown_option", path);
}

function validateBac(form: FormState, core: CoreShard, found: Collector): void {
  const { credential } = form;
  const countries = core.countries.map((country) => country.code);
  checkRequiredKnown(form.nationality, (v) => isKnown(v, countries), "nationality", found);
  checkRequiredKnown(credential.country, (v) => isKnown(v, countries), "credential.country", found);
  checkRequiredKnown(
    credential.type,
    (v) => credentialTypeOptions(form, core).some((type) => type.slug === v),
    "credential.type",
    found,
  );
  checkRequiredKnown(
    credential.track,
    (v) => trackOptions(form, core).some((track) => track.slug === v),
    "credential.track",
    found,
  );
  checkRequiredKnown(
    credential.status,
    (v) => isKnown(v, CREDENTIAL_STATUSES),
    "credential.status",
    found,
  );

  const scale = gradingScaleFor(form, core);
  const typeIsValid = credentialTypeOptions(form, core).some(
    (type) => type.slug === credential.type,
  );
  const gradeChecked = (text: string, path: string) => {
    if (scale === undefined && typeIsValid) found.add("unknown_option", "credential.type");
    checkGradeText(text, scale, path, found);
  };

  if (credential.overall.trim() === "") {
    if (credential.status === "obtained") found.add("required", "credential.overall");
  } else {
    gradeChecked(credential.overall, "credential.overall");
  }

  if (credential.subjects.length > MAX_SUBJECT_ROWS) {
    found.add("too_many_rows", "credential.subjects", { max: String(MAX_SUBJECT_ROWS) });
  }
  const seen = new Set<string>();
  credential.subjects.forEach((row, index) => {
    const base = `credential.subjects.${index}`;
    checkRequiredKnown(
      row.subject,
      (v) => core.subjects.some((subject) => subject.slug === v),
      `${base}.subject`,
      found,
    );
    if (row.subject !== "" && seen.has(row.subject))
      found.add("duplicate_subject", `${base}.subject`);
    seen.add(row.subject);
    if (row.grade.trim() === "") found.add("required", `${base}.grade`);
    else gradeChecked(row.grade, `${base}.grade`);
  });

  const years = form.priorHigherEducationYears.trim();
  if (years === "") found.add("required", "priorHigherEducationYears");
  else if (!WHOLE_NUMBER.test(years)) found.add("not_a_whole_number", "priorHigherEducationYears");
  else if (Number(years) < MIN_YEARS || Number(years) > MAX_YEARS) {
    found.add("years_out_of_range", "priorHigherEducationYears", {
      min: String(MIN_YEARS),
      max: String(MAX_YEARS),
    });
  }
}

function validateLanguages(form: FormState, core: CoreShard, found: Collector): void {
  const offered = languageRowOptions(core);
  for (const required of ["fr", "en"]) {
    if (!form.languages.some((row) => row.language === required))
      found.add("required", "languages");
  }
  const seen = new Set<string>();
  form.languages.forEach((row, index) => {
    const base = `languages.${index}`;
    checkRequiredKnown(row.language, (v) => isKnown(v, offered), `${base}.language`, found);
    if (row.language !== "" && seen.has(row.language))
      found.add("duplicate_language", `${base}.language`);
    seen.add(row.language);
    checkRequiredKnown(row.level, (v) => isKnown(v, LANGUAGE_LEVELS), `${base}.level`, found);
    if (row.certificate === "") return;
    const certificate = core.languageCertificates.find(
      (candidate) => candidate.slug === row.certificate,
    );
    if (certificate === undefined) found.add("unknown_option", `${base}.certificate`);
    else if (!certificateOptionsFor(row.language, core).includes(certificate)) {
      found.add("certificate_language_mismatch", `${base}.certificate`);
    }
  });
}

export function validateStep(step: StepId, form: FormState, core: CoreShard): StepIssue[] {
  if (step === "review") {
    return STEPS.filter((id): id is Exclude<StepId, "review"> => id !== "review").flatMap((id) =>
      validateStep(id, form, core),
    );
  }
  const found = collector();
  if (step === "bac") validateBac(form, core, found);
  else validateLanguages(form, core, found);
  return found.issues;
}

function startsPath(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}.`);
}

export function pathStep(path: string): StepId {
  if (
    startsPath(path, "nationality") ||
    startsPath(path, "credential") ||
    startsPath(path, "priorHigherEducationYears")
  ) {
    return "bac";
  }
  if (startsPath(path, "languages")) return "languages";
  return "review";
}

export function stepOfFirstIssue(issues: readonly StepIssue[]): StepId {
  const [first] = issues;
  return first === undefined ? "review" : pathStep(first.path);
}
