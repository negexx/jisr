import type { GradeValue, Profile } from "@/data-schema/profile";
import type { CoreShard } from "@/data-schema/snapshot";
import { PROFILE_SCHEMA_VERSION } from "@/lib/constants";
import { parseLocaleDecimal } from "@/lib/format";
import {
  checkProfileAgainstReference,
  type ProfileIssue,
  type ProfileIssueCode,
} from "@/lib/profile/reference-checks";
import { parseProfile } from "@/lib/profile/validate";

import { gradingScaleFor } from "./options";
import type { FormState, StepIssue, StepIssueCode } from "./types";
import { validateStep } from "./validate-step";

export type BuildResult = { ok: true; profile: Profile } | { ok: false; issues: StepIssue[] };

// A `Record` over every ProfileIssueCode: adding a code to reference-checks.ts breaks the build here.
export const PROFILE_ISSUE_TO_STEP_CODE: Record<ProfileIssueCode, StepIssueCode> = {
  unknown_credential_type: "unknown_option",
  track_not_in_type: "unknown_option",
  unknown_scale: "unknown_option",
  grade_out_of_range: "out_of_range",
  unknown_subject: "unknown_option",
  unknown_certificate: "unknown_option",
  certificate_language_mismatch: "certificate_language_mismatch",
  unknown_country: "unknown_option",
};

const INTERNAL_ERROR: StepIssue = { code: "required", path: "" };

// Reference checks name the grade's own fields; the form shows the problem on the input or, for a
// scale nobody can pick, on the credential type that decides it.
function formPath(path: string): string {
  if (path.endsWith(".scale")) return "credential.type";
  if (path.endsWith(".value")) return path.slice(0, -".value".length);
  return path;
}

export function mapReferenceIssues(
  issues: readonly ProfileIssue[],
  form: FormState,
  core: CoreShard,
): StepIssue[] {
  const scale = gradingScaleFor(form, core);
  return issues.map(({ code, path }) => {
    const mapped = PROFILE_ISSUE_TO_STEP_CODE[code];
    const params =
      mapped === "out_of_range" && scale !== undefined
        ? { min: String(scale.min), max: String(scale.max) }
        : undefined;
    return params === undefined
      ? { code: mapped, path: formPath(path) }
      : { code: mapped, path: formPath(path), params };
  });
}

// The candidate is only the right shape when the form passed validation; parseProfile has the last word.
function candidateFrom(form: FormState, core: CoreShard): unknown {
  const scale = gradingScaleFor(form, core)?.slug;
  const gradeOf = (text: string): GradeValue | null => {
    const value = parseLocaleDecimal(text);
    return scale === undefined || value === null ? null : { scale, value };
  };
  const { credential } = form;

  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    nationality: form.nationality,
    credential: {
      country: credential.country,
      type: credential.type,
      track: credential.track,
      status: credential.status,
      overall: credential.overall.trim() === "" ? null : gradeOf(credential.overall),
      subjects: credential.subjects.map((row) => ({
        subject: row.subject,
        grade: gradeOf(row.grade),
      })),
    },
    priorHigherEducationYears: Number(form.priorHigherEducationYears.trim()),
    languages: form.languages.map((row) => ({
      language: row.language,
      level: row.level,
      certificate: row.certificate === "" ? null : row.certificate,
    })),
  };
}

export function buildProfile(form: FormState, core: CoreShard): BuildResult {
  const issues = validateStep("review", form, core);
  if (issues.length > 0) return { ok: false, issues };

  const profile = parseProfile(candidateFrom(form, core));
  if (profile === null) return { ok: false, issues: [INTERNAL_ERROR] };

  const referenceIssues = checkProfileAgainstReference(profile, core);
  if (referenceIssues.length > 0) {
    return { ok: false, issues: mapReferenceIssues(referenceIssues, form, core) };
  }
  return { ok: true, profile };
}
