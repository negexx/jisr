import type { CountryCode, Slug } from "@/data-schema/primitives";
import type { Institution, Program, Scholarship } from "@/data-schema/resolved";
import { appliesToProgram } from "@/domain/scholarships";

// Pure view model of the Scholarships page. One destination shard at a time is read exactly as the
// static programme page reads it (programmes of the shard's own country, `appliesToProgram`), so the
// two pages list the same scholarships for the same programme.
export type DestinationInput = {
  country: CountryCode;
  scholarships: readonly Scholarship[];
  programs: readonly Program[];
  institutions: readonly Institution[];
};

export type ProgramLink = { slug: Slug; name: string };
// `name` and `city` are null when the institution is not in the institutions shard: a slug is never shown
// as a name. Campuses of one university share a name, so the city is what tells their groups apart.
export type InstitutionGroup = {
  slug: Slug;
  name: string | null;
  city: string | null;
  programs: ProgramLink[];
};
export type ProgramScope =
  | { kind: "country"; count: number }
  | { kind: "institutions"; groups: InstitutionGroup[]; without: string[] };
export type ScholarshipEntry = { scholarship: Scholarship; scope: ProgramScope };
export type CountrySection = { country: CountryCode; entries: ScholarshipEntry[] };

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

type Accumulator = {
  scholarship: Scholarship;
  country: CountryCode;
  programs: Map<Slug, Program>;
};

function scopeOf(
  scholarship: Scholarship,
  programs: readonly Program[],
  institutions: ReadonlyMap<Slug, Institution>,
): ProgramScope {
  const restricted = scholarship.institutions ?? [];
  if (restricted.length === 0) return { kind: "country", count: programs.length };

  const byInstitution = new Map<Slug, ProgramLink[]>();
  for (const p of programs) {
    const links = byInstitution.get(p.institution) ?? [];
    links.push({ slug: p.slug, name: p.name });
    byInstitution.set(p.institution, links);
  }
  const groups: InstitutionGroup[] = [...byInstitution].map(([slug, links]) => ({
    slug,
    name: institutions.get(slug)?.name ?? null,
    city: institutions.get(slug)?.city.name ?? null,
    programs: links.sort((a, b) => compare(a.name, b.name) || compare(a.slug, b.slug)),
  }));
  groups.sort(
    (a, b) =>
      Number(a.name === null) - Number(b.name === null) ||
      compare(a.name ?? "", b.name ?? "") ||
      compare(a.city ?? "", b.city ?? "") ||
      compare(a.slug, b.slug),
  );

  const without = restricted
    .filter((slug) => !byInstitution.has(slug))
    .flatMap((slug) => {
      const institution = institutions.get(slug);
      return institution === undefined ? [] : [institution.name];
    })
    .sort(compare);
  return { kind: "institutions", groups, without };
}

export function buildSections(inputs: readonly DestinationInput[]): CountrySection[] {
  const ordered = [...inputs].sort((a, b) => compare(a.country, b.country));
  const institutions = new Map<Slug, Institution>();
  const bySlug = new Map<Slug, Accumulator>();

  for (const input of ordered) {
    for (const institution of input.institutions) institutions.set(institution.slug, institution);
    for (const scholarship of input.scholarships) {
      let acc = bySlug.get(scholarship.slug);
      if (acc === undefined) {
        acc = { scholarship, country: input.country, programs: new Map() };
        bySlug.set(scholarship.slug, acc);
      }
      for (const program of input.programs) {
        if (appliesToProgram(scholarship, program)) acc.programs.set(program.slug, program);
      }
    }
  }

  const sections = new Map<CountryCode, ScholarshipEntry[]>();
  for (const acc of bySlug.values()) {
    const entries = sections.get(acc.country) ?? [];
    entries.push({
      scholarship: acc.scholarship,
      scope: scopeOf(acc.scholarship, [...acc.programs.values()], institutions),
    });
    sections.set(acc.country, entries);
  }
  return [...sections]
    .sort(([a], [b]) => compare(a, b))
    .map(([country, entries]) => ({
      country,
      entries: entries.sort((a, b) => compare(a.scholarship.slug, b.scholarship.slug)),
    }));
}
