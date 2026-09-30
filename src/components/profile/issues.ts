import type { useTranslations } from "next-intl";

import type { AppLocale } from "@/i18n/routing";
import type { FormState } from "@/lib/profile/form/types";
import type { StepIssue } from "@/lib/profile/form/validate-step";

import { languageName } from "./display-names";

export type ProfileT = ReturnType<typeof useTranslations<"profile">>;

type Kind = "grade" | "budget" | "years" | "fields" | "choice";

const LIST_ITEM = /^(fields|studyLanguages|destinations)\.[0-9]+$/;

// One form control (or one checkbox group) per key: "fields.2" belongs to the "fields" group.
export function groupKeyForPath(path: string): string {
  const item = LIST_ITEM.exec(path);
  return item?.[1] ?? path;
}

// Ids are made of the structural path only (never a typed value), so links from the error summary
// can focus the control. The first control of a group carries the group's id.
export function fieldIdForPath(path: string): string {
  return `field-${groupKeyForPath(path).replaceAll(".", "-")}`;
}

function kindOf(path: string): Kind {
  if (path === "credential.overall" || /^credential\.subjects\.[0-9]+\.grade$/.test(path)) {
    return "grade";
  }
  if (path === "budget.amount") return "budget";
  if (path === "priorHigherEducationYears") return "years";
  if (groupKeyForPath(path) === "fields") return "fields";
  return "choice";
}

function param(issue: StepIssue, name: string): string {
  return String(issue.params?.[name] ?? "");
}

export function issueMessage(t: ProfileT, issue: StepIssue): string {
  const kind = kindOf(issue.path);
  switch (issue.code) {
    case "required":
      if (kind === "grade") return t("errors.required.grade");
      return kind === "fields" ? t("errors.required.fields") : t("errors.required.choice");
    case "not_a_number":
      return t("errors.not_a_number");
    case "ambiguous_number":
      return t("errors.ambiguous_number");
    case "too_many_decimals":
      return t("errors.too_many_decimals");
    case "out_of_range":
      // Budgets share the code with grades but only ever go over the 7-digit cap, so the message
      // names that cap and not a range.
      return kind === "budget"
        ? t("errors.out_of_range.budget", { max: param(issue, "max") })
        : t("errors.out_of_range.grade", { min: param(issue, "min"), max: param(issue, "max") });
    case "unknown_option":
      return t("errors.unknown_option");
    case "certificate_language_mismatch":
      return t("errors.certificate_language_mismatch");
    case "duplicate_subject":
      return t("errors.duplicate_subject");
    case "duplicate_language":
      return t("errors.duplicate_language");
    case "too_many_rows":
      return t("errors.too_many_rows", { max: param(issue, "max") });
    case "not_a_whole_number":
      // The years control is a list of 0 to 3: only a hand-edited draft can end up here.
      return kind === "years" ? t("errors.unknown_option") : t("errors.not_a_whole_number");
    case "years_out_of_range":
      return t("errors.years_out_of_range", { min: param(issue, "min"), max: param(issue, "max") });
  }
}

// The name of the control an issue is about, so a link in the summary says which answer to fix.
function labelFor(t: ProfileT, path: string, form: FormState, locale: AppLocale): string | null {
  const row = /^(credential\.subjects|languages)\.([0-9]+)\.(\w+)$/.exec(path);
  if (row !== null) {
    const [, list, indexText, field] = row;
    const index = Number(indexText);
    if (list === "languages") {
      const language = form.languages[index]?.language ?? "";
      const label =
        field === "certificate"
          ? t("fields.certificate.label")
          : field === "language"
            ? t("fields.language.label")
            : t("fields.level.label");
      return t("errors.fieldInRow", { field: label, row: languageName(language, locale) });
    }
    return t("errors.fieldInRow", {
      field: field === "grade" ? t("fields.subjects.grade") : t("fields.subjects.subject"),
      row: t("fields.subjects.rowTitle", { number: String(index + 1) }),
    });
  }
  switch (groupKeyForPath(path)) {
    case "nationality":
      return t("fields.nationality.label");
    case "credential.country":
      return t("fields.credentialCountry.label");
    case "credential.type":
      return t("fields.credentialType.label");
    case "credential.track":
      return t("fields.track.label");
    case "credential.status":
      return t("fields.status.legend");
    case "credential.overall":
      return t("fields.overall.label");
    case "credential.subjects":
      return t("fields.subjects.legend");
    case "priorHigherEducationYears":
      return t("fields.years.label");
    case "fields":
      return t("fields.fieldsOfStudy.legend");
    case "studyLanguages":
      return t("fields.studyLanguages.legend");
    case "destinations":
      return t("fields.destinations.legend");
    case "institutionType":
      return t("fields.institution.legend");
    case "budget.amount":
      return t("fields.budget.amount.label");
    case "budget.currency":
      return t("fields.budget.currency.label");
    case "budget.period":
      return t("fields.budget.period.label");
    default:
      return null;
  }
}

export type ShownIssue = { key: string; id: string; message: string; summary: string };

// The first issue per control only: validation may report several for one field (e.g. a blank
// subject row can be both "required" and "duplicate").
export function shownIssues(
  t: ProfileT,
  issues: readonly StepIssue[],
  form: FormState,
  locale: AppLocale,
): ShownIssue[] {
  const seen = new Set<string>();
  const shown: ShownIssue[] = [];
  for (const issue of issues) {
    const key = groupKeyForPath(issue.path);
    if (seen.has(key)) continue;
    seen.add(key);
    const message = issueMessage(t, issue);
    const label = labelFor(t, issue.path, form, locale);
    shown.push({
      key,
      id: fieldIdForPath(issue.path),
      message,
      summary: label === null ? message : t("errors.summaryItem", { field: label, message }),
    });
  }
  return shown;
}
