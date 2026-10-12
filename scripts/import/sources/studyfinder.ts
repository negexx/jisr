import { decodeEntities } from "../evidence";
import { fetchText } from "../http";
import type { ReviewRow, StagedRecord } from "../staging";
import { READ_SOURCE } from "../staging";
import { programmeSummary } from "../summaries";
import { collapseSpaces, slugify } from "../text";
import { classifyDaad } from "./daad";
import { stagedInstitution } from "./institutions";

// Study Finder (Tempus Public Foundation, the Study in Hungary initiative): programmes taught in
// English or another foreign language at Hungarian higher education institutions. The search form
// is a plain GET and every programme has a detail page of HTML table rows; there is no robots.txt
// and no documented API. Read politely (one request at a time, cached on disk). Written permission
// from the Tempus Public Foundation is to be obtained by the project owner (see data/README.md).
const BASE = "https://tempus.tpf.hu/studyfinder";
const SEARCH = `${BASE}/index/search/`;
const SHOW = `${BASE}/index/show`;
const PAUSE_MS = 1000;

// The Study Finder's own branches of science for the Release 1 fields and the health family.
// Its bachelor health offer sits under two branch labels: "Health Science" (health sciences, public
// health, nursing) and "Medical and Health Science" (nursing and physiotherapy at Szeged).
// Medicine and pharmacy are one-tier (never "Bachelor") and stay out.
const BRANCH_FIELD: Record<string, string> = {
  "Computer Science and Information Technology": "computer-science",
  "Engineering Science": "engineering",
  "Economic Science": "business-economics",
  "Health Science": "allied-health",
  "Medical and Health Science": "allied-health",
};
export const BRANCHES = Object.keys(BRANCH_FIELD);
const LANGUAGES = ["English", "English and Hungarian", "Hungarian/English", "Hungarian, English"];

export const fieldOfBranch = (branch: string | null): string | null =>
  branch === null ? null : (BRANCH_FIELD[branch] ?? null);

export const studyFinderPage = (id: number): string => `${SHOW}/${id}`;

const text = (html: string): string =>
  collapseSpaces(decodeEntities(html.replace(/<[^>]*>/g, " ")));

// The site repeats the unit and sometimes misspells it: "7 semesters semesters", "8 semsters
// semesters" -> "7 semesters", "8 semesters".
const SEMESTER_WORD = String.raw`sem[a-z]*sters?`;
const cleanDuration = (raw: string | null): string | null => {
  const t =
    raw === null
      ? ""
      : collapseSpaces(raw).replace(
          new RegExp(String.raw`^(\d+)\s*${SEMESTER_WORD}(?:\s+${SEMESTER_WORD})?$`, "i"),
          "$1 semesters",
        );
  return t === "" ? null : t;
};

// A Bachelor is 4 to 12 semesters: anything else ("1 semster") is not a length we can trust.
export function semestersToYears(duration: string | null): number | null {
  const m = new RegExp(String.raw`^(\d+)\s*${SEMESTER_WORD}\b`, "i").exec(duration ?? "");
  const n = m?.[1] === undefined ? null : Number(m[1]);
  return n !== null && n >= 4 && n <= 12 ? n / 2 : null;
}

const LANGUAGE_CODES: Record<string, string> = { english: "en", hungarian: "hu" };

export function languageCodesOf(language: string | null): string[] | null {
  if (language === null) return null;
  const parts = language
    .split(/\s*(?:,|\/|\band\b)\s*/i)
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p !== "");
  const codes = parts.map((p) => LANGUAGE_CODES[p]);
  return parts.length > 0 && codes.every((c): c is string => c !== undefined) ? codes : null;
}

export type SfListing = {
  id: number;
  name: string;
  institution: string;
  language: string | null;
  location: string | null;
  duration: string | null;
};

export function parseSfList(html: string): SfListing[] {
  const found: SfListing[] = [];
  for (const block of html.split('<div class="list_element">').slice(1)) {
    const title = /<a class="list_title" href="[^"]*\/show\/(\d+)">([\s\S]*?)<\/a>/.exec(block);
    if (title?.[1] === undefined || title[2] === undefined) continue;
    const lines = block
      .slice(block.indexOf("</a>") + 4)
      .split(/<br\s*\/?>/i)
      .map((l) => text(l));
    const [institution = "", , languageLine = "", detailLine = ""] = lines.filter((l) => l !== "");
    const language = /Language:\s*(.*?)\s*,\s*Location:/.exec(languageLine)?.[1] ?? null;
    const location = /Location:\s*(.+)$/.exec(languageLine)?.[1] ?? null;
    const duration = /Duration:\s*(.+)$/.exec(detailLine)?.[1] ?? null;
    found.push({
      id: Number(title[1]),
      name: text(title[2]),
      institution,
      language,
      location,
      duration: cleanDuration(duration),
    });
  }
  return found;
}

export type SfDetail = {
  id: number;
  name: string;
  institution: string;
  faculty: string | null;
  branch: string | null;
  level: string | null;
  qualification: string | null;
  language: string | null;
  duration: string | null;
  location: string | null;
  contactWebsite: string | null;
  // listed with http only: never evidence, but the reviewer is told
  contactWebsiteInsecure: string | null;
  studyInHungaryLink: string | null;
  shAvailable: boolean;
  diasporaAvailable: boolean;
  stateAvailable: boolean;
};

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

// The first table row whose label cell is `label`: the cell's html, or null.
function rowHtml(html: string, label: string): string | null {
  const re = new RegExp(`<td[^>]*>\\s*${escapeRegex(label)}\\s*</td>\\s*<td[^>]*>(.*?)</td>`, "is");
  return re.exec(html)?.[1] ?? null;
}

const rowText = (html: string, label: string): string | null => {
  const cell = rowHtml(html, label);
  const t = cell === null ? "" : text(cell);
  return t === "" ? null : t;
};

const rowLink = (html: string, label: string): string | null => {
  const cell = rowHtml(html, label);
  return cell === null ? null : (/href="([^"]+)"/i.exec(cell)?.[1] ?? null);
};

export function parseSfDetail(html: string, id: number): SfDetail {
  const contact = rowLink(html, "Contact website:");
  return {
    id,
    name: rowText(html, "Course / programme name:") ?? "",
    institution: rowText(html, "Insitution:") ?? "",
    faculty: rowText(html, "Faculty:"),
    branch: rowText(html, "Branch of Science:"),
    level: rowText(html, "Level of studies:"),
    qualification: rowText(html, "Qualification:"),
    language: rowText(html, "Language of instruction:"),
    duration: cleanDuration(rowText(html, "Duration of the course / programme:")),
    location: rowText(html, "Location/city of the course:"),
    contactWebsite: contact?.startsWith("https://") ? contact : null,
    contactWebsiteInsecure: contact?.startsWith("http://") ? contact : null,
    studyInHungaryLink: rowLink(html, "Study in Hungary link:"),
    shAvailable:
      /<label>\s*The programme is available in the Stipendium Hungaricum Scholarship Programme/i.test(
        html,
      ),
    diasporaAvailable:
      /<label>\s*The programme is available in the Diaspora Scholarship Programme/i.test(html),
    stateAvailable: /State Scholarships\s*<\/td>\s*<td[^>]*>\s*Available/i.test(html),
  };
}

// --- records -----------------------------------------------------------------------------------
const firstCity = (location: string | null): string =>
  collapseSpaces((location ?? "").split("/")[0] ?? "");

export function buildHungaryRecords(details: readonly SfDetail[]): StagedRecord[] {
  const institutions = new Map<string, StagedRecord>();
  const unitName = new Map<string, string>();
  const programmes: StagedRecord[] = [];

  for (const d of [...details].sort((a, b) => a.id - b.id)) {
    const field = fieldOfBranch(d.branch);
    const city = firstCity(d.location);
    if (d.level !== "Bachelor" || field === null || d.institution === "" || city === "") continue;

    // Always the city too: an institution is one unit per city, and no slug depends on which
    // programme the Study Finder lists first (a later import must not rename a promoted slug).
    const instSlug = `hu-${slugify(d.institution, 40)}-${slugify(city)}`;
    const named = unitName.get(instSlug);
    if (named !== undefined && named !== d.institution)
      throw new Error(
        `Study Finder: "${named}" and "${d.institution}" would get the same slug ${instSlug}`,
      );
    unitName.set(instSlug, d.institution);
    if (!institutions.has(instSlug)) {
      institutions.set(
        instSlug,
        stagedInstitution({
          slug: instSlug,
          name: d.institution,
          country: "HU",
          city,
          type: null,
          website: null,
          source: "studyfinder",
          sourceUrl: studyFinderPage(d.id),
          sourceId: `studyfinder-institution:${slugify(d.institution, 60)}@${slugify(city)}`,
          todo: `institution named "${d.institution}" in the Study Finder: the register does not say whether it is public or private nor its website. Find its official site${d.studyInHungaryLink === null ? "" : ` (Study in Hungary profile: ${d.studyInHungaryLink})`}, check it is a recognised Hungarian higher education institution, set the type, add its page as the source, then info_kind: official`,
        }),
      );
    }

    const slug = `${instSlug}-${slugify(d.name, 24)}-sf${d.id}`;
    const page = studyFinderPage(d.id);
    const guessed = classifyDaad(d.name, null);
    const confidence = guessed === null || guessed.field === field ? "high" : "low";
    const scholarships = [
      d.shAvailable ? "Stipendium Hungaricum" : null,
      d.diasporaAvailable ? "Diaspora Scholarship" : null,
      d.stateAvailable ? "state scholarship" : null,
    ].filter((s): s is string => s !== null);
    const todo = [
      `Study Finder lists: branch ${d.branch}, language ${d.language ?? "n/a"}, duration ${d.duration ?? "n/a"}, location ${d.location ?? "n/a"}, scholarship programmes: ${scholarships.join(", ") || "none listed"}`,
      d.contactWebsite !== null
        ? `the programme's own page (Study Finder contact website): ${d.contactWebsite}`
        : d.contactWebsiteInsecure !== null
          ? `contact website listed only as http: ${d.contactWebsiteInsecure} (not used as evidence): find the programme's own page over https`
          : "no contact website listed: find the programme's own page on the institution's site",
      "the Study Finder page is the register entry: confirm the values on the programme's own site, then set info_kind. Tuition, deadlines and documents are not in the Study Finder",
      ...(confidence === "low"
        ? [
            `the name points to another field than the Study Finder branch: check the programme content`,
          ]
        : []),
    ].join("; ");
    const review: ReviewRow = {
      kind: "programs",
      slug,
      name: d.name,
      institution: d.institution,
      city,
      field,
      confidence,
      officialUrl: page,
      todo,
    };
    programmes.push({
      collection: "programs",
      id: slug,
      sourceId: `studyfinder:${d.id}`,
      data: {
        slug,
        institution: instSlug,
        country: "HU",
        city: slugify(city),
        field,
        level: "bachelor",
        name: d.name,
        summary: programmeSummary(d.name, d.institution, city, "studyfinder"),
        officialUrl: page,
        durationYears: {
          value: semestersToYears(d.duration),
          source: "studyfinder",
          info_kind: READ_SOURCE,
        },
        teachingLanguages: {
          value: languageCodesOf(d.language),
          source: "studyfinder",
          info_kind: READ_SOURCE,
        },
        tuition: { value: null, source: "studyfinder", info_kind: READ_SOURCE },
        intakes: { value: null, source: "studyfinder", info_kind: READ_SOURCE },
        applicationChannel: { value: null, source: "studyfinder", info_kind: READ_SOURCE },
        documents: { value: null, source: "studyfinder", info_kind: READ_SOURCE },
        requirements: {
          coverage: "partial",
          source: "studyfinder",
          info_kind: READ_SOURCE,
          rules: [],
        },
        scholarships: [],
        sources: { studyfinder: { url: page, last_verified_at: null } },
      },
      review,
    });
  }
  return [...institutions.values(), ...programmes];
}

// --- fetching ----------------------------------------------------------------------------------
const pause = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, PAUSE_MS));

// "52 results:" -> 52, "No results..." -> 0, anything else null
export function parseSfTotal(html: string): number | null {
  const m = /<b>\s*(\d+)\s+results?:/i.exec(html);
  if (m?.[1] !== undefined) return Number(m[1]);
  return /No results/i.test(html) ? 0 : null;
}

const PAGE_SIZE = 10;

export async function fetchStudyFinderIds(): Promise<number[]> {
  const ids = new Set<number>();
  for (const branch of BRANCHES) {
    for (const language of LANGUAGES) {
      let total = Number.POSITIVE_INFINITY;
      for (let page = 1; (page - 1) * PAGE_SIZE < total; page++) {
        const params = new URLSearchParams({
          level: "Bachelor",
          language,
          branch_of_science: branch,
          page: String(page),
        });
        const html = await fetchText(`${SEARCH}?${params}`, {
          accept: "text/html",
          validate: (body) => {
            if (parseSfTotal(body) === null)
              throw new Error("Study Finder: the result list looks incomplete");
          },
        });
        total = parseSfTotal(html) ?? 0;
        const listings = parseSfList(html);
        for (const listing of listings) ids.add(listing.id);
        if (listings.length === 0) break;
        await pause();
      }
      await pause();
    }
  }
  return [...ids].sort((a, b) => a - b);
}

export async function importHungary(): Promise<StagedRecord[]> {
  const ids = await fetchStudyFinderIds();
  if (ids.length < 60) {
    throw new Error(
      `Study Finder: only ${ids.length} Bachelor programmes found in the three branches (expected about 130): the response looks incomplete`,
    );
  }
  const details: SfDetail[] = [];
  for (const id of ids) {
    const html = await fetchText(studyFinderPage(id), {
      accept: "text/html",
      validate: (body) => {
        if (!body.includes("Course / programme name:"))
          throw new Error(`Study Finder: detail page ${id} looks incomplete`);
      },
    });
    details.push(parseSfDetail(html, id));
    await pause();
  }
  return buildHungaryRecords(details);
}
