import type { IsoDate } from "@/data-schema/dates";
import type { Slug } from "@/data-schema/primitives";
import type { Profile } from "@/data-schema/profile";
import type { Program } from "@/data-schema/resolved";
import { isDecisive } from "./facts";

export type PreferenceMismatch = "destination" | "field" | "institution_type" | "study_language";

export type ProgramFilterResult = {
  kept: Program[];
  excluded: Array<{ programSlug: Slug; mismatches: PreferenceMismatch[] }>;
};

export function preferenceMismatches(
  profile: Profile,
  program: Program,
  now: IsoDate,
): PreferenceMismatch[] {
  const mismatches: PreferenceMismatch[] = [];
  if (profile.destinations.length > 0 && !profile.destinations.includes(program.country)) {
    mismatches.push("destination");
  }
  if (!profile.fields.includes(program.field)) mismatches.push("field");
  if (profile.institutionType !== "any" && program.institutionType !== profile.institutionType) {
    mismatches.push("institution_type");
  }
  const taught = program.teachingLanguages.value;
  if (
    profile.studyLanguages.length > 0 &&
    taught !== null &&
    isDecisive(program.teachingLanguages, now) &&
    !taught.some((language) => profile.studyLanguages.includes(language))
  ) {
    mismatches.push("study_language");
  }
  return mismatches;
}

export function filterPrograms(
  profile: Profile,
  programs: readonly Program[],
  now: IsoDate,
): ProgramFilterResult {
  const result: ProgramFilterResult = { kept: [], excluded: [] };
  for (const program of programs) {
    const mismatches = preferenceMismatches(profile, program, now);
    if (mismatches.length === 0) result.kept.push(program);
    else result.excluded.push({ programSlug: program.slug, mismatches });
  }
  return result;
}
