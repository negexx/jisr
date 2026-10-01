import { z } from "zod";
import { classifyDutchProgramme } from "../fields";
import { fetchJson, fetchText, probeHttps } from "../http";
import type { ReviewRow, StagedRecord } from "../staging";
import { parseCsv, READ_SOURCE } from "../staging";
import { CHANNEL_SUMMARIES, programmeSummary } from "../summaries";
import { collapseSpaces, slugify } from "../text";
import { fetchDuoInstitutions, stripProvince, titleCase } from "./duo";
import { websiteCandidates } from "./hrk";
import { buildDuoRecord, resolveSite, stagedInstitution } from "./institutions";

// DUO "Overzicht Erkenningen ho" (RIO register): every higher-education programme recognised by the
// Dutch Ministry of Education, current and historical. Licence: Creative Commons Attribution (cc-by):
// credit "DUO / Ministry of Education, Culture and Science (OCW)".
export const RIO_DATASET_PAGE = "https://onderwijsdata.duo.nl/datasets/overzicht-erkenningen-ho";
const RIO_PACKAGE_API =
  "https://onderwijsdata.duo.nl/api/3/action/package_show?id=overzicht-erkenningen-ho";

const PackageSchema = z.object({
  result: z.object({
    resources: z.array(z.object({ format: z.string(), name: z.string(), url: z.string() })),
  }),
});

async function resolveCsvUrl(): Promise<string> {
  const parsed = PackageSchema.parse(await fetchJson(RIO_PACKAGE_API));
  const csv = parsed.result.resources.find(
    (r) => r.format.toUpperCase() === "CSV" && /erkenningen/i.test(r.name),
  );
  if (csv === undefined) throw new Error("RIO: the recognitions CSV is not listed in the dataset");
  return csv.url;
}

export type RioRow = Record<string, string>;

const REQUIRED = [
  "INSTELLINGSCODE",
  "INSTELLINGSNAAM",
  "VESTIGINGSCODE",
  "VESTIGINGSNAAM",
  "PLAATSNAAM",
  "GEMEENTENAAM",
  "INSTROOM_EINDDATUM",
  "OPLEIDINGSEENHEIDCODE",
  "OPLEIDINGSEENHEID_NAAM",
  "OPLEIDINGSEENHEID_INTERNATIONALE_NAAM",
  "STUDIELAST",
  "NIVEAU",
  "GRAAD",
  "VORM",
  "ONDERDEEL",
  "BEKOSTIGINGSCODE",
  "ACCREDITATIE_VERVALDATUM",
  "STATUS",
];

// Current, full-time Bachelor programmes (HBO and WO). Part-time and dual (work-study) tracks and
// historical or future records are left out.
export function isCurrentFullTimeBachelor(row: RioRow): boolean {
  return (
    row.STATUS === "ACTUEEL" &&
    row.GRAAD === "BACHELOR" &&
    (row.NIVEAU === "HBO-BA" || row.NIVEAU === "WO-BA") &&
    row.VORM === "VOLTIJD"
  );
}

// Programmes whose intake has ended are still "current" in the register while the last cohorts
// finish, but they take no new students.
export function acceptsNewStudents(row: RioRow, today: string): boolean {
  const end = row.INSTROOM_EINDDATUM ?? "";
  return end === "" || end > today;
}

// DUO writes "EDE GLD" (province) or "AMSTERDAM ZUIDOOST" (district): the town is the municipality.
export function townOf(place: string, municipality: string): string {
  const town = stripProvince(titleCase(collapseSpaces(place)));
  const muni = titleCase(collapseSpaces(municipality));
  return muni !== "" && town.toLowerCase().startsWith(`${muni.toLowerCase()} `) ? muni : town;
}

export function parseRio(input: string): RioRow[] {
  const text = input.replace(/^\uFEFF/, "");
  const rows = parseCsv(text, ",");
  const head = rows[0];
  if (head === undefined || REQUIRED.some((c) => !(c in head))) {
    throw new Error("RIO: expected columns are missing (the file format changed?)");
  }
  return rows;
}

export function durationYears(studielast: string): number | null {
  const ects = Number(studielast);
  return Number.isFinite(ects) && ects >= 60 && ects % 60 === 0 ? ects / 60 : null;
}

export async function fetchRioBachelors(today: string): Promise<RioRow[]> {
  const text = await fetchText(await resolveCsvUrl(), {
    validate: (body) => {
      if (
        body.length < 1_000_000 ||
        !body.replace(/^\uFEFF/, "").startsWith('"BEVOEGD_GEZAG_CODE"')
      ) {
        throw new Error("RIO file looks wrong or truncated");
      }
    },
  });
  return parseRio(text).filter((r) => isCurrentFullTimeBachelor(r) && acceptsNewStudents(r, today));
}

const unread = (source: string) => ({ value: null, source, info_kind: READ_SOURCE });

export function buildDutchProgramme(input: {
  row: RioRow;
  instSlug: string;
  instName: string;
  city: string;
  today: string;
}): StagedRecord | null {
  const { row, instSlug, instName, city, today } = input;
  const name = collapseSpaces(row.OPLEIDINGSEENHEID_NAAM ?? "");
  const international = collapseSpaces(row.OPLEIDINGSEENHEID_INTERNATIONALE_NAAM ?? "");
  const match = classifyDutchProgramme(row.ONDERDEEL ?? "", name, international);
  if (match === null || name === "") return null;

  const slug = `${instSlug}-${slugify(name, 24)}-${(row.OPLEIDINGSEENHEIDCODE ?? "").toLowerCase()}`;
  const years = durationYears(row.STUDIELAST ?? "");
  const level =
    row.NIVEAU === "WO-BA" ? "WO (research university)" : "HBO (university of applied sciences)";
  const funding = row.BEKOSTIGINGSCODE ?? "";
  const accreditedUntil = row.ACCREDITATIE_VERVALDATUM ?? "";
  const intakeEnd = row.INSTROOM_EINDDATUM ?? "";
  const todo = [
    `RIO register: ${level}, ${row.STUDIELAST} ECTS, accredited until ${row.ACCREDITATIE_VERVALDATUM || "unknown"}, funding ${funding}, location "${row.VESTIGINGSNAAM}"`,
    ...(international === "" ? [] : [`international name "${international}"`]),
    ...(accreditedUntil !== "" && accreditedUntil <= today
      ? [`accreditation expired on ${accreditedUntil}: check it was renewed`]
      : []),
    ...(intakeEnd === ""
      ? []
      : [`intake ends ${intakeEnd}: check the programme still takes new students`]),
    ...(funding === "AANGEWEZEN"
      ? ["designated (aangewezen) institution: check funding and recognition"]
      : []),
    ...(funding === "NIET_BEKOSTIGD"
      ? ["not publicly funded: a private programme, check tuition and recognition"]
      : []),
    ...(match.confidence === "low"
      ? ["field is a judgement call: check the programme content"]
      : []),
    `read the programme page on the institution's site: set officialUrl (required) and use that page as the source, then teachingLanguages, tuition for non-EU students, intakes, documents, requirements, the application channel (Studielink and the institution's own portal), and set each info_kind (duration: the register says ${row.STUDIELAST} ECTS, i.e. about ${years ?? "an unclear number of"} years at 60 ECTS per year: read it on the programme page)`,
  ];
  const review: ReviewRow = {
    kind: "programs",
    slug,
    name,
    institution: instName,
    city,
    field: match.field,
    confidence: match.confidence,
    officialUrl: "",
    todo: todo.join("; "),
  };
  return {
    collection: "programs",
    id: slug,
    sourceId: `rio:${row.INSTELLINGSCODE}/${row.VESTIGINGSCODE}/${row.OPLEIDINGSEENHEIDCODE}`,
    data: {
      slug,
      institution: instSlug,
      country: "NL",
      city: slugify(city),
      field: match.field,
      level: "bachelor",
      name,
      summary: programmeSummary(
        international === "" ? name : `${name} (${international})`,
        instName,
        city,
        "rio",
      ),
      // Required by the schema and left empty on purpose: the register has no programme page, so a
      // human must supply the institution's own page before the record can be promoted.
      officialUrl: null,
      durationYears: unread("rio"),
      teachingLanguages: unread("rio"),
      tuition: unread("rio"),
      intakes: unread("rio"),
      applicationChannel: unread("rio"),
      documents: unread("rio"),
      requirements: { coverage: "partial", source: "rio", info_kind: READ_SOURCE, rules: [] },
      scholarships: [],
      sources: { rio: { url: RIO_DATASET_PAGE, last_verified_at: null } },
    },
    review,
  };
}

export async function importNetherlands(): Promise<StagedRecord[]> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await fetchRioBachelors(today);
  const duo = await fetchDuoInstitutions();
  const probed = await probeHttps(
    duo.flatMap((i) => {
      const w = websiteCandidates(i.website);
      return w.needsProbe && w.asListed !== null ? [w.asListed] : [];
    }),
  );
  const duoByCode = new Map(duo.map((i) => [i.code, i]));
  const mainSlug = new Map(
    duo.map((i) => [`${i.code}|${slugify(i.city)}`, buildDuoRecord(i, probed).id]),
  );

  // One institution record per (institution, campus city): the validator requires a programme's
  // city to equal its institution's city. The main DUO record covers the main city only.
  const extras = new Map<string, StagedRecord>();
  const records: StagedRecord[] = [];
  for (const row of rows) {
    const code = row.INSTELLINGSCODE ?? "";
    const known = duoByCode.get(code);
    const instName = known?.name ?? collapseSpaces(row.INSTELLINGSNAAM ?? "");
    const city = townOf(row.PLAATSNAAM ?? "", row.GEMEENTENAAM ?? "");
    if (code === "" || city === "") continue;
    const unit = `${code}|${slugify(city)}`;
    let instSlug = mainSlug.get(unit);
    if (instSlug === undefined) {
      instSlug = `nl-${slugify(instName, 40)}-${code.toLowerCase()}-${slugify(city)}`;
      if (!extras.has(unit)) {
        const site =
          known === undefined ? { url: null, note: "" } : resolveSite(known.website, probed);
        extras.set(
          unit,
          stagedInstitution({
            slug: instSlug,
            name: instName,
            country: "NL",
            city,
            type: null,
            website: site.url,
            source: "rio",
            sourceUrl: RIO_DATASET_PAGE,
            sourceId: `rio-unit:${code}@${slugify(city)}`,
            todo: [
              `campus in ${city} of "${instName}" (RIO location "${row.VESTIGINGSNAAM}"): public/private is not in the register`,
              known === undefined
                ? "institution not in the DUO list: find its website"
                : "website is the main institution's: check it, or use the campus page",
              site.note,
              "confirm on the institution's own site, add that page as the source, then set info_kind: official",
            ]
              .filter((t) => t !== "")
              .join("; "),
          }),
        );
      }
    }
    const programme = buildDutchProgramme({ row, instSlug, instName, city, today });
    if (programme !== null) records.push(programme);
  }

  records.push({
    collection: "application-channels",
    id: "nl-studielink",
    data: {
      slug: "nl-studielink",
      name: "Studielink",
      country: "NL",
      kind: "national_portal",
      url: "https://www.studielink.nl/",
      accountRequired: null,
      summary: CHANNEL_SUMMARIES["nl-studielink"],
      source: "main",
      info_kind: READ_SOURCE,
      sources: { main: { url: "https://www.studielink.nl/", last_verified_at: null } },
    },
    review: {
      kind: "application-channels",
      slug: "nl-studielink",
      name: "Studielink",
      institution: "",
      city: "",
      field: "",
      confidence: "",
      officialUrl: "https://www.studielink.nl/",
      todo: "confirm how applicants from outside the EU apply (institution portal first, then Studielink) and whether an account is required",
    },
  });
  return [...extras.values(), ...records];
}
