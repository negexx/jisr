import type { IsoDate } from "@/data-schema/dates";
import type { MatchFilters } from "@/data-schema/match-filters";
import type { Slug } from "@/data-schema/primitives";
import type { Program } from "@/data-schema/resolved";
import { isDecisive } from "./facts";

export type PreferenceMismatch = "destination" | "field" | "institution_type" | "study_language";

export type ProgramFilterResult = {
  kept: Program[];
  excluded: Array<{ programSlug: Slug; mismatches: PreferenceMismatch[] }>;
};

export function preferenceMismatches(
  filters: MatchFilters,
  program: Program,
  now: IsoDate,
): PreferenceMismatch[] {
  const mismatches: PreferenceMismatch[] = [];
  if (filters.destinations.length > 0 && !filters.destinations.includes(program.country)) {
    mismatches.push("destination");
  }
  if (filters.fields.length > 0 && !filters.fields.includes(program.field)) {
    mismatches.push("field");
  }
  // an unknown type never counts against the preference: it is shown as "to be checked" instead
  if (
    filters.institutionType !== "any" &&
    program.institutionType !== null &&
    program.institutionType !== filters.institutionType
  ) {
    mismatches.push("institution_type");
  }
  const taught = program.teachingLanguages.value;
  if (
    filters.studyLanguages.length > 0 &&
    taught !== null &&
    taught.length > 0 &&
    isDecisive(program.teachingLanguages, now) &&
    !taught.some((language) => filters.studyLanguages.includes(language))
  ) {
    mismatches.push("study_language");
  }
  return mismatches;
}

export function filterPrograms(
  filters: MatchFilters,
  programs: readonly Program[],
  now: IsoDate,
): ProgramFilterResult {
  const result: ProgramFilterResult = { kept: [], excluded: [] };
  for (const program of programs) {
    const mismatches = preferenceMismatches(filters, program, now);
    if (mismatches.length === 0) result.kept.push(program);
    else result.excluded.push({ programSlug: program.slug, mismatches });
  }
  return result;
}
