import type { Profile } from "@/data-schema/profile";
import type { Program, Scholarship } from "@/data-schema/resolved";

export function scholarshipsForProgram(
  profile: Profile,
  program: Program,
  scholarships: readonly Scholarship[],
): Scholarship[] {
  const selected = scholarships.filter((s) => {
    const nationalityEligible =
      s.eligibleNationalities.length === 0 || s.eligibleNationalities.includes(profile.nationality);
    if (!nationalityEligible) return false;
    if (program.scholarships.includes(s.slug)) return true;
    return (
      s.destinations.includes(program.country) &&
      (s.fields.length === 0 || s.fields.includes(program.field))
    );
  });

  const bySlug = new Map<string, Scholarship>();
  for (const s of selected) if (!bySlug.has(s.slug)) bySlug.set(s.slug, s);
  return [...bySlug.values()].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}
