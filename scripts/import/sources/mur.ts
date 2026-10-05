import { fetchText, probeHttps } from "../http";
import type { ReviewRow, StagedRecord } from "../staging";
import { parseCsv, READ_SOURCE } from "../staging";
import { programmeSummary } from "../summaries";
import { collapseSpaces, slugify } from "../text";
import { classifyDaad } from "./daad";
import { stagedInstitution } from "./institutions";
import { CONTACTS_URL, matchContact, parseContacts, siteOrigin } from "./mur-contacts";

// MUR open data (Ministero dell'Universita e della Ricerca, dati-ustat.mur.gov.it, Italian Open
// Data License 2.0: attribution required): the offer of every degree course by university, town,
// degree class and teaching language, and the list of universities with state or free status,
// town and region. The offer file has no programme page and no university website, and its latest
// academic year can be the one that is running, not the next one: everything else is read from
// the programme and institution pages afterwards.
const DATASET = "https://dati-ustat.mur.gov.it/dataset/bed0c71e-9f86-4a0f-a266-963b6f7bbbd2";
const FILES = `${DATASET}/resource`;
export const OFFER_URL = `${FILES}/c0e63906-7190-4568-892b-0cf399f56071/download/03_offertaformativa-corsidilaurea_2010-2025.csv`;
export const ATENEI_URL = `${FILES}/820aefe6-0662-4656-84ec-d8859a2a3b7e/download/01_atenei.csv`;

const OFFER_COLUMNS = [
  "ANNO",
  "Ateneo",
  "Area",
  "GruppoDisciplinare",
  "TipoCorso",
  "Classe",
  "NomeClasse",
  "Corso",
  "SedeCorso_Provincia",
  "SedeCorso_Comune",
  "ACCESSO",
  "DIDATTICA",
  "LINGUA",
] as const;
const ATENEI_COLUMNS = [
  "COD_Ateneo",
  "NomeEsteso",
  "NomeOperativo",
  "StataleLibera",
  "CITTA",
  "REGIONE",
] as const;

export type MurCourse = {
  year: number;
  ateneo: string;
  area: string;
  group: string;
  type: string;
  classCode: string;
  className: string;
  name: string;
  province: string;
  city: string;
  access: string;
  mode: string;
  language: string;
};

export type Ateneo = {
  code: string;
  fullName: string;
  shortName: string;
  statale: boolean;
  city: string;
  region: string;
};

function requireColumns(rows: Record<string, string>[], columns: readonly string[], file: string) {
  const first = rows[0];
  if (first === undefined) throw new Error(`MUR ${file}: the file is empty`);
  const missing = columns.filter((c) => !(c in first));
  if (missing.length > 0) {
    throw new Error(`MUR ${file}: missing column(s) ${missing.join(", ")}: the file changed shape`);
  }
}

export function parseMurOffer(csv: string): MurCourse[] {
  const rows = parseCsv(csv, ";");
  requireColumns(rows, OFFER_COLUMNS, "offer file");
  return rows.map((r) => ({
    year: Number(r.ANNO),
    ateneo: collapseSpaces(r.Ateneo ?? ""),
    area: collapseSpaces(r.Area ?? ""),
    group: collapseSpaces(r.GruppoDisciplinare ?? ""),
    type: collapseSpaces(r.TipoCorso ?? ""),
    classCode: collapseSpaces(r.Classe ?? ""),
    className: collapseSpaces(r.NomeClasse ?? ""),
    name: collapseSpaces(r.Corso ?? ""),
    province: collapseSpaces(r.SedeCorso_Provincia ?? ""),
    city: collapseSpaces(r.SedeCorso_Comune ?? ""),
    access: collapseSpaces(r.ACCESSO ?? ""),
    mode: collapseSpaces(r.DIDATTICA ?? ""),
    language: collapseSpaces(r.LINGUA ?? ""),
  }));
}

export function parseAtenei(csv: string): Ateneo[] {
  const rows = parseCsv(csv, ";");
  requireColumns(rows, ATENEI_COLUMNS, "university list");
  return rows.map((r) => ({
    code: collapseSpaces(r.COD_Ateneo ?? ""),
    fullName: collapseSpaces(r.NomeEsteso ?? ""),
    shortName: collapseSpaces(r.NomeOperativo ?? ""),
    statale: (r.StataleLibera ?? "").trim() === "S",
    city: collapseSpaces(r.CITTA ?? ""),
    region: collapseSpaces(r.REGIONE ?? ""),
  }));
}

// --- field -------------------------------------------------------------------------------------
type FieldMatch = { field: string; confidence: "high" | "low" };

// The degree class decides the field (code, not a model). L-41 (statistics) is not any of the
// three fields for sure, so it is always a judgement call for the review sheet.
const CLASS_FIELD: Record<string, string> = {
  "L-31": "computer-science",
  "L-8": "engineering",
  "L-9": "engineering",
  "L-7": "engineering",
  "L-23": "engineering",
  "L-18": "business-economics",
  "L-33": "business-economics",
  "L-41": "business-economics",
};

export function fieldOfClass(classCode: string, name: string): FieldMatch | null {
  const field = CLASS_FIELD[classCode];
  if (field === undefined) return null;
  const guessed = classifyDaad(name, null);
  const agrees = guessed === null || guessed.field === field;
  return { field, confidence: classCode === "L-41" || !agrees ? "low" : "high" };
}

// --- records -----------------------------------------------------------------------------------
const SMALL_WORDS = new Set(["and", "of", "for", "with", "in", "the", "e", "di", "per", "ed"]);

const titleCase = (input: string): string =>
  input
    .toLowerCase()
    .replace(/(^|[\s\-'’(])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());

// "DIGITAL ECONOMICS AND BUSINESS" -> "Digital Economics and Business"; mixed case is kept as is.
function tidyName(name: string): string {
  if (name !== name.toUpperCase() || name === name.toLowerCase()) return name;
  return titleCase(name)
    .split(" ")
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w))
    .join(" ");
}

// "https://apply.unipv.eu/" is an admissions portal, not the home page: a host that is neither the
// bare domain nor www.
const isSubSite = (url: string): boolean => {
  const labels = new URL(url).hostname.split(".");
  return labels.length > 2 && labels[0] !== "www";
};

const DISTANCE_MODES = new Set(["Teledidattica", "Prevalentemente a distanza"]);

export type ItalyReport = {
  latestYear: number;
  notLaurea: number;
  notEnglish: number;
  notInScope: number;
  distance: number;
  mixed: string[];
  noAteneo: string[];
};

const academicYear = (year: number): string => `${year}/${String(year + 1).slice(2)}`;
const classSlug = (classCode: string): string => slugify(classCode.replace("-", ""), 8);

export function buildItalyRecords(
  courses: readonly MurCourse[],
  atenei: readonly Ateneo[],
  // university code -> a website candidate (https origin); absent = no candidate
  websites: ReadonlyMap<string, string> = new Map(),
): { records: StagedRecord[]; report: ItalyReport } {
  const latestYear = courses.reduce((max, c) => Math.max(max, c.year), 0);
  const report: ItalyReport = {
    latestYear,
    notLaurea: 0,
    notEnglish: 0,
    notInScope: 0,
    distance: 0,
    mixed: [],
    noAteneo: [],
  };
  const byShortName = new Map(atenei.map((a) => [a.shortName, a]));

  // One record per course, however many degree classes the MUR lists it under. The group is made
  // before the field is decided, so a class outside the three fields still shows in the notes.
  const groups = new Map<string, MurCourse[]>();
  for (const c of courses) {
    if (c.year !== latestYear) continue;
    if (c.type !== "Laurea") {
      report.notLaurea++;
      continue;
    }
    const english = c.language === "Inglese";
    const mixed = !english && c.language.includes("Inglese");
    if (!english && !mixed) {
      report.notEnglish++;
      continue;
    }
    if (mixed) {
      if (fieldOfClass(c.classCode, c.name) !== null) {
        report.mixed.push(`${c.ateneo}: ${c.name} (${c.classCode})`);
      }
      continue;
    }
    const key = `${c.ateneo}|${slugify(c.city)}|${c.name.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }

  const institutions = new Map<string, StagedRecord>();
  const unitOwner = new Map<string, string>();
  const programmes = new Map<string, StagedRecord>();

  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.classCode.localeCompare(b.classCode));
    const main = sorted.find((c) => fieldOfClass(c.classCode, c.name) !== null);
    if (main === undefined) {
      report.notInScope++;
      continue;
    }
    const match = fieldOfClass(main.classCode, main.name);
    if (match === null) continue;
    if (DISTANCE_MODES.has(main.mode)) {
      report.distance++;
      continue;
    }
    const ateneo = byShortName.get(main.ateneo);
    if (ateneo === undefined) {
      if (!report.noAteneo.includes(main.ateneo)) report.noAteneo.push(main.ateneo);
      continue;
    }
    const city = titleCase(main.city);

    const instSlug = `it-${slugify(ateneo.shortName, 40)}-${slugify(city)}`;
    const owner = unitOwner.get(instSlug);
    if (owner !== undefined && owner !== ateneo.code) {
      throw new Error(
        `MUR: universities ${owner} and ${ateneo.code} would get the same slug ${instSlug}`,
      );
    }
    unitOwner.set(instSlug, ateneo.code);
    const candidate = websites.get(ateneo.code) ?? null;
    if (!institutions.has(instSlug)) {
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
          todo: `university ${ateneo.code} in the MUR list (${ateneo.statale ? "state" : "non-state"}, region ${ateneo.region}): the list gives no website. ${candidate === null ? "No candidate was found" : `Candidate from the international students portal contacts table: ${candidate} (not confirmed${isSubSite(candidate) ? "; it is a sub-site such as admissions or international: use the university's main home page as the website" : ""})`}. Check the university's home page names it (an English page that does), that it is a recognised Italian university, add its page as the source, then info_kind: official`,
        }),
      );
    }

    const slug = `${instSlug}-${slugify(main.name, 40)}-${classSlug(main.classCode)}`;
    if (programmes.has(slug)) throw new Error(`MUR: two courses would get the same slug ${slug}`);
    const name = tidyName(main.name);
    const otherClasses = sorted.filter((c) => c !== main).map((c) => c.classCode);
    const fieldsAgree = sorted.every(
      (c) => fieldOfClass(c.classCode, c.name)?.field === match.field,
    );
    const confidence = fieldsAgree ? match.confidence : "low";
    const limited = main.access !== "accesso libero";
    const todo = [
      `MUR lists: degree class ${main.classCode} ${main.className}${otherClasses.length > 0 ? ` (also listed under ${otherClasses.join(", ")})` : ""}, language ${main.language}, mode ${main.mode}, access ${main.access}, town ${city}; offer of academic year ${academicYear(latestYear)} (the next year's offer is not published: check it on the programme page)`,
      "the MUR file has no programme page: find the programme's own page on the university's site (officialUrl is required), then duration, language, tuition for a non-EU student living abroad, intakes, documents, requirements and the application channel (Universitaly pre-enrolment, plus the university's own portal where it says so)",
      ...(limited
        ? [
            `${main.access} access: limited places, an admission test or ranking applies: read how it works for non-EU applicants`,
          ]
        : []),
      ...(confidence === "low"
        ? [
            "the degree class(es) and the course name point to different fields or to a field outside the three: check the content",
          ]
        : []),
    ].join("; ");
    const review: ReviewRow = {
      kind: "programs",
      slug,
      name,
      institution: ateneo.fullName,
      city,
      field: match.field,
      confidence,
      officialUrl: "",
      todo,
    };
    programmes.set(slug, {
      collection: "programs",
      id: slug,
      sourceId: `mur:${ateneo.code}:${classSlug(main.classCode)}:${slugify(main.name, 60)}@${slugify(city)}`,
      data: {
        slug,
        institution: instSlug,
        country: "IT",
        city: slugify(city),
        field: match.field,
        level: "bachelor",
        name,
        summary: programmeSummary(name, ateneo.fullName, city, "mur"),
        officialUrl: null,
        durationYears: { value: null, source: "mur", info_kind: READ_SOURCE },
        teachingLanguages: { value: ["en"], source: "mur", info_kind: READ_SOURCE },
        tuition: { value: null, source: "mur", info_kind: READ_SOURCE },
        intakes: { value: null, source: "mur", info_kind: READ_SOURCE },
        applicationChannel: { value: null, source: "mur", info_kind: READ_SOURCE },
        documents: { value: null, source: "mur", info_kind: READ_SOURCE },
        requirements: { coverage: "partial", source: "mur", info_kind: READ_SOURCE, rules: [] },
        scholarships: [],
        sources: { mur: { url: DATASET, last_verified_at: null } },
      },
      review,
    });
  }

  const sortedProgrammes = [...programmes.values()].sort((a, b) => a.id.localeCompare(b.id));
  return { records: [...institutions.values(), ...sortedProgrammes], report };
}

// --- fetching ----------------------------------------------------------------------------------
// A website candidate per university from the international students portal's contacts table; an
// http one is kept only if its https form answers. A university with no usable match has none.
async function websiteCandidates(atenei: readonly Ateneo[]): Promise<Map<string, string>> {
  const contacts = parseContacts(
    await fetchText(CONTACTS_URL, {
      accept: "text/html",
      validate: (body) => {
        if (!body.includes("Contatti istituzioni")) throw new Error("MUR contacts: wrong page");
      },
    }),
  );
  const origins = new Map<string, string>();
  for (const a of atenei) {
    const origin = siteOrigin(matchContact(a, contacts)?.site ?? null);
    if (origin !== null) origins.set(a.code, origin);
  }
  const probed = await probeHttps([...new Set(origins.values())]);
  const websites = new Map<string, string>();
  for (const [code, origin] of origins) {
    const https = probed.get(origin) ?? null;
    if (https !== null) websites.set(code, `${new URL(https).origin}/`);
  }
  return websites;
}

export async function importItaly(): Promise<StagedRecord[]> {
  // the offer file is windows-1252; the university list is UTF-8
  const offerCsv = await fetchText(OFFER_URL, {
    accept: "text/csv",
    encoding: "windows-1252",
    validate: (body) => {
      if (!body.startsWith("ANNO;Ateneo")) throw new Error("MUR: the offer file looks wrong");
    },
  });
  const ateneiCsv = await fetchText(ATENEI_URL, {
    accept: "text/csv",
    validate: (body) => {
      if (!body.includes("COD_Ateneo")) throw new Error("MUR: the university list looks wrong");
    },
  });
  const atenei = parseAtenei(ateneiCsv);
  const websites = await websiteCandidates(atenei);
  const { records, report } = buildItalyRecords(parseMurOffer(offerCsv), atenei, websites);
  const programmes = records.filter((r) => r.collection === "programs").length;
  console.log(
    `MUR ${report.latestYear}: ${programmes} English-taught Bachelor programmes staged; left out: ${report.notLaurea} not Laurea, ${report.notEnglish} not English, ${report.notInScope} outside the three fields, ${report.distance} distance learning, ${report.noAteneo.length} unknown universities`,
  );
  console.log(
    `MUR: ${report.mixed.length} Italian-English programmes in the three fields are not staged (owner decision pending)`,
  );
  if (report.noAteneo.length > 0)
    console.warn(`MUR: unknown universities: ${report.noAteneo.join(", ")}`);
  if (programmes < 30) {
    throw new Error(
      `MUR: only ${programmes} programmes found (expected about 50): the file shape changed`,
    );
  }
  return records;
}
