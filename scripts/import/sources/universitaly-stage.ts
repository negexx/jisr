import { READ_SOURCE, type ReviewRow, type StagedRecord } from "../staging";
import { programmeSummary } from "../summaries";
import { collapseSpaces, nameKey, slugify } from "../text";
import { stagedInstitution } from "./institutions";
import { type Ateneo, classSlug, DATASET, isSubSite, tidyName, titleCase } from "./mur";
import type { Candidate } from "./universitaly";
import { universityTokens } from "./universitaly-compare";

export const UNIVERSITALY_SEARCH_PAGE = "https://www.universitaly.it/en/cerca-corsi";

export type OurInstitution = { slug: string; name: string };

export type StageReport = {
  staged: string[];
  reusedInstitutions: string[];
  refused: { portalId: number; reason: string }[];
};

// A portal spelling ("Università degli Studi di GENOVA", 'LUM "Giuseppe Degennaro"') to the one MUR
// university it names: exact name key of the full or the operating name first; else the one
// university whose distinctive words contain all of the portal name's (and no other does).
export function resolveAteneo(
  portalName: string,
  atenei: readonly Ateneo[],
): Ateneo | "ambiguous" | null {
  const key = nameKey(portalName);
  const exact = atenei.filter((a) => nameKey(a.fullName) === key || nameKey(a.shortName) === key);
  if (exact.length === 1) return exact[0] ?? null;
  if (exact.length > 1) return "ambiguous";
  const tokens = universityTokens(portalName);
  if (tokens.length === 0) return null;
  const contained = atenei.filter((a) => {
    const have = new Set(universityTokens(`${a.fullName} ${a.shortName}`));
    return tokens.every((t) => have.has(t));
  });
  if (contained.length === 1) return contained[0] ?? null;
  return contained.length > 1 ? "ambiguous" : null;
}

const fmt = (c: Candidate, fetchedAt: string): string =>
  [
    `Universitaly (${c.academicYear}, fetched ${fetchedAt}) lists: class ${c.classCode}${c.classCodes.length > 1 ? ` (also ${c.classCodes.filter((x) => x !== c.classCode).join(", ")})` : ""}, ${c.durationYears === null ? "duration not stated" : `${c.durationYears} years`}, ${c.delivery === "blended" ? "blended (mixed) delivery" : "conventional delivery"}, English-taught`,
    c.url === null
      ? "no portal link: find the programme's own page (officialUrl is required)"
      : `portal link ${c.url}: read the programme page it leads to`,
  ].join("; ");

export function buildUniversitalyRecords(input: {
  candidates: readonly Candidate[];
  atenei: readonly Ateneo[];
  ourInstitutions: readonly OurInstitution[];
  websites?: ReadonlyMap<string, string>;
  fetchedAt: string;
}): { records: StagedRecord[]; report: StageReport } {
  const report: StageReport = { staged: [], reusedInstitutions: [], refused: [] };
  const institutions = new Map<string, StagedRecord>();
  const programmes = new Map<string, StagedRecord>();
  const websites = input.websites ?? new Map<string, string>();

  for (const c of input.candidates) {
    const ateneo = resolveAteneo(c.university, input.atenei);
    if (ateneo === null) {
      report.refused.push({
        portalId: c.portalId,
        reason: `no MUR university matches "${c.university}"`,
      });
      continue;
    }
    if (ateneo === "ambiguous") {
      report.refused.push({
        portalId: c.portalId,
        reason: `"${c.university}" matches more than one MUR university`,
      });
      continue;
    }
    const city = titleCase(ateneo.city);
    const mine = input.ourInstitutions.filter((i) => nameKey(i.name) === nameKey(ateneo.fullName));
    if (mine.length > 1) {
      report.refused.push({
        portalId: c.portalId,
        reason: `${ateneo.fullName} has several institutions of ours (${mine.map((i) => i.slug).join(", ")}): campus unknown`,
      });
      continue;
    }
    let instSlug: string;
    const own = mine[0];
    if (own !== undefined) {
      instSlug = own.slug;
      if (!report.reusedInstitutions.includes(instSlug)) report.reusedInstitutions.push(instSlug);
    } else {
      instSlug = `it-${slugify(ateneo.shortName, 40)}-${slugify(city)}`;
      if (!institutions.has(instSlug)) {
        const candidate = websites.get(ateneo.code) ?? null;
        institutions.set(
          instSlug,
          stagedInstitution({
            slug: instSlug,
            name: ateneo.fullName,
            country: "IT",
            city,
            type: ateneo.statale ? "public" : "private",
            website: candidate,
            source: "mur",
            sourceUrl: DATASET,
            sourceId: `mur-institution:${ateneo.code}@${slugify(city)}`,
            todo: `university ${ateneo.code} in the MUR list (${ateneo.statale ? "state" : "non-state"}, region ${ateneo.region}); found through the Universitaly discovery run. ${candidate === null ? "No website candidate was found" : `Candidate from the international students portal contacts table: ${candidate} (not confirmed${isSubSite(candidate) ? "; it is a sub-site: use the university's main home page" : ""})`}. Check the university's home page names it, that it is a recognised Italian university, add its page as the source, then info_kind: official`,
          }),
        );
      }
    }

    const slug = `${instSlug}-${slugify(c.name, 40)}-${classSlug(c.classCode)}`;
    if (programmes.has(slug)) {
      throw new Error(`Universitaly: two candidates would get the same slug ${slug}`);
    }
    const name = tidyName(collapseSpaces(c.name));
    const review: ReviewRow = {
      kind: "programs",
      slug,
      name,
      institution: ateneo.fullName,
      city,
      field: c.field,
      confidence: c.confidence,
      officialUrl: c.url ?? "",
      todo: [
        fmt(c, input.fetchedAt),
        `the portal gives no campus town: the town is the university's MUR town (${city}); check the programme page for the real campus`,
        "duration, teaching language, tuition for a non-EU student living abroad, intakes, documents, requirements and the application channel are read from the programme page",
        ...(c.delivery === "blended"
          ? [
              "blended delivery: read the programme page for how much is online; a course that is mostly online is not offered in person and stays out",
            ]
          : []),
        ...(c.confidence === "low"
          ? ["the degree class and the course name point to different fields: check the content"]
          : []),
      ].join("; "),
    };
    programmes.set(slug, {
      collection: "programs",
      id: slug,
      sourceId: `universitaly:${c.portalId}`,
      data: {
        slug,
        institution: instSlug,
        country: "IT",
        city: slugify(city),
        field: c.field,
        level: "bachelor",
        name,
        summary: programmeSummary(name, ateneo.fullName, city, "universitaly"),
        officialUrl: c.url,
        durationYears: { value: null, source: "universitaly", info_kind: READ_SOURCE },
        teachingLanguages: { value: ["en"], source: "universitaly", info_kind: READ_SOURCE },
        tuition: { value: null, source: "universitaly", info_kind: READ_SOURCE },
        intakes: { value: null, source: "universitaly", info_kind: READ_SOURCE },
        applicationChannel: { value: null, source: "universitaly", info_kind: READ_SOURCE },
        documents: { value: null, source: "universitaly", info_kind: READ_SOURCE },
        requirements: {
          coverage: "partial",
          source: "universitaly",
          info_kind: READ_SOURCE,
          rules: [],
        },
        scholarships: [],
        sources: { universitaly: { url: UNIVERSITALY_SEARCH_PAGE, last_verified_at: null } },
      },
      review,
    });
    report.staged.push(slug);
  }
  return {
    records: [
      ...institutions.values(),
      ...[...programmes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    ],
    report,
  };
}
