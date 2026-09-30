import type { GradingScale } from "@/data-schema/resolved";
import type { CoreShard } from "@/data-schema/snapshot";
import { CEFR_LEVELS } from "@/lib/constants";
import { parseLocaleDecimal } from "@/lib/format";

import {
  certificateOptionsFor,
  credentialTypeOptions,
  fieldOptions,
  gradingScaleFor,
  languageRowOptions,
  MAX_SUBJECT_ROWS,
  studyLanguageOptions,
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
const BUDGET_AMOUNT = /^[0-9]{1,7}$/;
const MAX_BUDGET_AMOUNT = "9999999";
const BUDGET_CURRENCIES = ["EUR", "MAD"];
const BUDGET_PERIODS = ["month", "year"];
const INSTITUTION_TYPES = ["public", "private", "any"];
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

function validatePreferences(form: FormState, core: CoreShard, found: Collector): void {
  if (form.fields.length === 0) found.add("required", "fields");
  const fieldSlugs = fieldOptions(core).map((field) => field.slug);
  form.fields.forEach((slug, index) => {
    if (!isKnown(slug, fieldSlugs)) found.add("unknown_option", `fields.${index}`);
  });
  const languages = studyLanguageOptions(core);
  form.studyLanguages.forEach((code, index) => {
    if (!isKnown(code, languages)) found.add("unknown_option", `studyLanguages.${index}`);
  });
  const countries = core.countries.map((country) => country.code);
  form.destinations.forEach((code, index) => {
    if (!isKnown(code, countries)) found.add("unknown_option", `destinations.${index}`);
  });
  if (!isKnown(form.institutionType, INSTITUTION_TYPES))
    found.add("unknown_option", "institutionType");
}

// Money is whole-number digits only: parseLocaleDecimal would read "10.000" as ten (see src/lib/format.ts).
function validateBudget(form: FormState, found: Collector): void {
  const amount = form.budget.amount.trim();
  if (amount === "") return;
  if (!BUDGET_AMOUNT.test(amount)) {
    if (WHOLE_NUMBER.test(amount)) {
      found.add("out_of_range", "budget.amount", { min: "0", max: MAX_BUDGET_AMOUNT });
    } else {
      found.add("not_a_whole_number", "budget.amount");
    }
  }
  if (!isKnown(form.budget.currency, BUDGET_CURRENCIES))
    found.add("unknown_option", "budget.currency");
  if (!isKnown(form.budget.period, BUDGET_PERIODS)) found.add("unknown_option", "budget.period");
}

export function validateStep(step: StepId, form: FormState, core: CoreShard): StepIssue[] {
  if (step === "review") {
    return STEPS.filter((id): id is Exclude<StepId, "review"> => id !== "review").flatMap((id) =>
      validateStep(id, form, core),
    );
  }
  const found = collector();
  if (step === "bac") validateBac(form, core, found);
  else if (step === "languages") validateLanguages(form, core, found);
  else if (step === "preferences") validatePreferences(form, core, found);
  else validateBudget(form, found);
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
  if (
    startsPath(path, "fields") ||
    startsPath(path, "studyLanguages") ||
    startsPath(path, "destinations") ||
    startsPath(path, "institutionType")
  ) {
    return "preferences";
  }
  if (startsPath(path, "budget")) return "budget";
  return "review";
}

export function stepOfFirstIssue(issues: readonly StepIssue[]): StepId {
  const [first] = issues;
  return first === undefined ? "review" : pathStep(first.path);
}
