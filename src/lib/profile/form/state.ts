import type { ProfileDraft } from "@/data-schema/draft";
import type { Profile } from "@/data-schema/profile";
import type { CoreShard } from "@/data-schema/snapshot";
import { CEFR_LEVELS, DRAFT_SCHEMA_VERSION } from "@/lib/constants";
import { minorUnitDigits } from "@/lib/format";
import { isOneOf } from "@/lib/guards";

import type { FormState, LanguageLevel, LanguageRow } from "./types";

export type { FormState };

export const STEPS = ["bac", "languages", "preferences", "budget", "review"] as const;
export type StepId = (typeof STEPS)[number];

// The draft schema's cap on every typed string (src/data-schema/draft.ts).
const MAX_TYPED_LENGTH = 200;
const REQUIRED_LANGUAGES = ["fr", "en"] as const;
const LANGUAGE_LEVELS = [...CEFR_LEVELS, "unknown"] as const;

function emptyLanguageRow(language: string): LanguageRow {
  return { language, level: "", certificate: "" };
}

// fr and en come first and are always present; every other row keeps its order.
function withRequiredLanguages(rows: readonly LanguageRow[]): LanguageRow[] {
  const required = REQUIRED_LANGUAGES.map(
    (code) => rows.find((row) => row.language === code) ?? emptyLanguageRow(code),
  );
  const others = rows.filter((row) => !isOneOf(row.language, REQUIRED_LANGUAGES));
  return [...required, ...others].map((row) => ({ ...row }));
}

export function emptyFormState(core: CoreShard): FormState {
  const origins = [...new Set(core.credentialTypes.map((type) => type.country))];
  const [onlyOrigin] = origins;
  const preselected = origins.length === 1 && onlyOrigin !== undefined ? onlyOrigin : "";
  return {
    nationality: preselected,
    credential: {
      country: preselected,
      type: "",
      track: "",
      status: "",
      overall: "",
      subjects: [],
    },
    priorHigherEducationYears: "0",
    languages: REQUIRED_LANGUAGES.map(emptyLanguageRow),
    fields: [],
    studyLanguages: [],
    destinations: [],
    institutionType: "any",
    budget: { amount: "", currency: "EUR", period: "month" },
  };
}

export function formFromProfile(profile: Profile): FormState {
  const { credential, budget } = profile;
  return {
    nationality: profile.nationality,
    credential: {
      country: credential.country,
      type: credential.type,
      track: credential.track,
      status: credential.status,
      overall: credential.overall === null ? "" : String(credential.overall.value),
      subjects: credential.subjects.map((row) => ({
        subject: row.subject,
        grade: String(row.grade.value),
      })),
    },
    priorHigherEducationYears: String(profile.priorHigherEducationYears),
    languages: withRequiredLanguages(
      profile.languages.map((row) => ({
        language: row.language,
        level: row.level,
        certificate: row.certificate ?? "",
      })),
    ),
    fields: [...profile.fields],
    studyLanguages: [...profile.studyLanguages],
    destinations: [...profile.destinations],
    institutionType: profile.institutionType,
    budget:
      budget === null
        ? { amount: "", currency: "EUR", period: "month" }
        : {
            amount: String(Math.round(budget.amountMinor / 10 ** minorUnitDigits(budget.currency))),
            currency: budget.currency,
            period: budget.period,
          },
  };
}

function levelOf(value: string | undefined): LanguageLevel {
  return isOneOf(value, LANGUAGE_LEVELS) ? value : "";
}

// Values are kept as typed and never trusted: validation reports unknown slugs. The only value that
// cannot be kept is a language level outside the closed set of choices, which reads as "not chosen".
export function formFromDraft(
  draft: ProfileDraft,
  core: CoreShard,
): { form: FormState; step: number } {
  const form = emptyFormState(core);
  if (draft.nationality !== undefined) form.nationality = draft.nationality;

  const { credential } = draft;
  if (credential !== undefined) {
    if (credential.country !== undefined) form.credential.country = credential.country;
    if (credential.type !== undefined) form.credential.type = credential.type;
    if (credential.track !== undefined) form.credential.track = credential.track;
    if (credential.status !== undefined) form.credential.status = credential.status;
    if (credential.overall !== undefined) {
      form.credential.overall = credential.overall === null ? "" : credential.overall.value;
    }
    if (credential.subjects !== undefined) {
      form.credential.subjects = credential.subjects.map((row) => ({
        subject: row.subject,
        grade: row.grade.value,
      }));
    }
  }

  if (draft.priorHigherEducationYears !== undefined) {
    form.priorHigherEducationYears = draft.priorHigherEducationYears;
  }
  if (draft.languages !== undefined) {
    form.languages = withRequiredLanguages(
      draft.languages.map((row) => ({
        language: row.language,
        level: levelOf(row.level),
        certificate: row.certificate ?? "",
      })),
    );
  }
  if (draft.fields !== undefined) form.fields = [...draft.fields];
  if (draft.studyLanguages !== undefined) form.studyLanguages = [...draft.studyLanguages];
  if (draft.destinations !== undefined) form.destinations = [...draft.destinations];
  if (draft.institutionType !== undefined) form.institutionType = draft.institutionType;
  if (draft.budget !== undefined && draft.budget !== null) {
    form.budget = {
      amount: draft.budget.amount ?? form.budget.amount,
      currency: draft.budget.currency ?? form.budget.currency,
      period: draft.budget.period ?? form.budget.period,
    };
  }

  return { form, step: Math.min(Math.max(draft.step, 0), STEPS.length - 1) };
}

function capped(value: string): string {
  return value.slice(0, MAX_TYPED_LENGTH);
}

// The grade's scale is derived from the credential type when the profile is built, so a draft
// carries an empty scale next to each typed value.
function typedGrade(value: string): { scale: string; value: string } {
  return { scale: "", value: capped(value) };
}

export function draftFromForm(form: FormState, step: number): ProfileDraft {
  const { credential } = form;
  const safeStep = Number.isFinite(step)
    ? Math.min(Math.max(Math.trunc(step), 0), Number.MAX_SAFE_INTEGER)
    : 0;
  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    step: safeStep,
    nationality: capped(form.nationality),
    credential: {
      country: capped(credential.country),
      type: capped(credential.type),
      track: capped(credential.track),
      ...(credential.status === "" ? {} : { status: credential.status }),
      overall: credential.overall === "" ? null : typedGrade(credential.overall),
      subjects: credential.subjects.map((row) => ({
        subject: capped(row.subject),
        grade: typedGrade(row.grade),
      })),
    },
    priorHigherEducationYears: capped(form.priorHigherEducationYears),
    languages: form.languages.map((row) => ({
      language: capped(row.language),
      ...(row.level === "" ? {} : { level: row.level }),
      certificate: row.certificate === "" ? null : capped(row.certificate),
    })),
    fields: form.fields.map(capped),
    studyLanguages: form.studyLanguages.map(capped),
    destinations: form.destinations.map(capped),
    institutionType: form.institutionType,
    budget: {
      amount: capped(form.budget.amount),
      currency: capped(form.budget.currency),
      period: form.budget.period,
    },
  };
}
