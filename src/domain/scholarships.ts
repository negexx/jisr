import type { Profile } from "@/data-schema/profile";
import type { Program, Scholarship } from "@/data-schema/resolved";

// Does this scholarship apply to this program, whoever the student is? A scholarship the program
// links explicitly always applies; otherwise the destination must match, `fields` must be empty or
// include the program's field, and `institutions` must be empty or include its institution. The
// student's nationality is filtered separately. The static program pages (src/lib/snapshot/server.ts)
// share this predicate, so the page and the personal box list scholarships alike.
export const appliesToProgram = (s: Scholarship, program: Program): boolean =>
  program.scholarships.includes(s.slug) ||
  (s.destinations.includes(program.country) &&
    (s.fields.length === 0 || s.fields.includes(program.field)) &&
    (!s.institutions?.length || s.institutions.includes(program.institution)));

export function scholarshipsForProgram(
  profile: Profile,
  program: Program,
  scholarships: readonly Scholarship[],
): Scholarship[] {
  const selected = scholarships.filter(
    (s) =>
      (s.eligibleNationalities.length === 0 ||
        s.eligibleNationalities.includes(profile.nationality)) &&
      appliesToProgram(s, program),
  );

  const bySlug = new Map<string, Scholarship>();
  for (const s of selected) if (!bySlug.has(s.slug)) bySlug.set(s.slug, s);
  return [...bySlug.values()].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}
