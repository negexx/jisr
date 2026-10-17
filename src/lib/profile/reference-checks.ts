import type { GradeValue, Profile } from "@/data-schema/profile";
import type { GradingScale } from "@/data-schema/resolved";
import type { CoreShard } from "@/data-schema/snapshot";

import { certificatesFor, scaleForCredentialType } from "./reference-lookups";

export { certificatesFor, scaleForCredentialType };

export type ProfileIssueCode =
  | "unknown_credential_type"
  | "track_not_in_type"
  | "unknown_scale"
  | "grade_out_of_range"
  | "unknown_subject"
  | "unknown_certificate"
  | "certificate_language_mismatch"
  | "unknown_country";

// A code and a path only: an issue never carries the student's value.
export type ProfileIssue = { code: ProfileIssueCode; path: string };

// Same bounds as the rule engine's range check (src/domain does not export it), deliberately
// stricter for NaN: the engine's `value < min || value > max` lets NaN through, this rejects it.
// Zod already rejects NaN in a profile, so it cannot occur in practice.
function isWithinScale(value: number, scale: GradingScale): boolean {
  return value >= scale.min && value <= scale.max;
}

export function checkProfileAgainstReference(profile: Profile, core: CoreShard): ProfileIssue[] {
  const issues: ProfileIssue[] = [];
  const add = (code: ProfileIssueCode, path: string) => issues.push({ code, path });

  const countries = new Set(core.countries.map((country) => country.code));
  const checkCountry = (code: string, path: string) => {
    if (!countries.has(code)) add("unknown_country", path);
  };
  const checkGrade = (grade: GradeValue, path: string) => {
    const scale = core.gradingScales.find((candidate) => candidate.slug === grade.scale);
    if (!scale) add("unknown_scale", `${path}.scale`);
    else if (!isWithinScale(grade.value, scale)) add("grade_out_of_range", `${path}.value`);
  };

  checkCountry(profile.nationality, "nationality");
  checkCountry(profile.credential.country, "credential.country");

  const type = core.credentialTypes.find(
    (candidate) =>
      candidate.slug === profile.credential.type &&
      candidate.country === profile.credential.country,
  );
  if (!type) add("unknown_credential_type", "credential.type");
  else if (!type.tracks.some((track) => track.slug === profile.credential.track)) {
    add("track_not_in_type", "credential.track");
  }

  if (profile.credential.overall) checkGrade(profile.credential.overall, "credential.overall");

  const subjects = new Set(core.subjects.map((subject) => subject.slug));
  profile.credential.subjects.forEach((entry, index) => {
    const path = `credential.subjects.${index}`;
    if (!subjects.has(entry.subject)) add("unknown_subject", `${path}.subject`);
    checkGrade(entry.grade, `${path}.grade`);
  });

  profile.languages.forEach((entry, index) => {
    if (entry.certificate === null) return;
    const certificate = core.languageCertificates.find(
      (candidate) => candidate.slug === entry.certificate,
    );
    const path = `languages.${index}.certificate`;
    if (!certificate) add("unknown_certificate", path);
    else if (certificate.language !== entry.language) add("certificate_language_mismatch", path);
  });

  return issues;
}
