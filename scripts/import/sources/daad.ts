import { z } from "zod";
import { fetchJson, probeHttps } from "../http";
import type { ReviewRow, StagedRecord } from "../staging";
import { READ_SOURCE } from "../staging";
import { programmeSummary } from "../summaries";
import { canonicalTown, collapseSpaces, nameKey, sameTown, slugify } from "../text";
import type { BaProgramme } from "./ba";
import { classifyGerman, fetchBaProgrammes, matchHrk, tokens } from "./ba";
import { campusUnit } from "./germany";
import type { HrkInstitution } from "./hrk";
import { fetchHrkInstitutions, websiteCandidates } from "./hrk";
import type { Probed } from "./institutions";
import { hrkSlug, stagedInstitution } from "./institutions";

// DAAD "International Programmes" database: programmes taught in English or another language
// that international students can apply to. The data comes from the JSON search the DAAD site
// itself uses (not a documented API): four paged requests for all Bachelor's programmes, one at a
// time, cached on disk. DAAD's terms could not be read online; permission was obtained by the project owner (2026-10-01), see data/README.md.
const BASE = "https://www2.daad.de";
const SEARCH = `${BASE}/deutschland/studienangebote/international-programmes/api/solr/en/search.json`;
const BACHELOR = "1";
const PAGE = 100;

const CourseSchema = z.object({
  id: z.number(),
  courseName: z.string(),
  academy: z.string(),
  city: z.string().nullable(),
  languages: z.array(z.string()).default([]),
  beginning: z.string().nullable(),
  programmeDuration: z.string().nullable(),
  tuitionFees: z.string().nullable(),
  costString: z.string().nullable(),
  applicationDeadline: z.string().nullable(),
  subject: z.string().nullable(),
  link: z.string(),
});
const ResultSchema = z.object({ courses: z.array(CourseSchema), numResults: z.number() });
export type DaadCourse = z.infer<typeof CourseSchema>;

export const daadPage = (course: Pick<DaadCourse, "link">): string => `${BASE}${course.link}`;

async function fetchPage(offset: number) {
  const params = new URLSearchParams({
    "degree[]": BACHELOR,
    limit: String(PAGE),
    offset: String(offset),
    sort: "4",
  });
  const json = await fetchJson(`${SEARCH}?${params}`, {
    attempts: 6,
    retryDelayMs: 5000,
    validate: (body) => void ResultSchema.parse(JSON.parse(body)),
  });
  return ResultSchema.parse(json);
}

export async function fetchDaadBachelors(
  page: (offset: number) => Promise<{ courses: DaadCourse[]; numResults: number }> = fetchPage,
  pauseMs = 1000,
): Promise<DaadCourse[]> {
  const first = await page(0);
  const courses = [...first.courses];
  for (let offset = PAGE; offset < first.numResults; offset += PAGE) {
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
    courses.push(...(await page(offset)).courses);
  }
  if (first.numResults < 200) {
    throw new Error(
      `DAAD: only ${first.numResults} Bachelor programmes announced (expected 300+): the response looks incomplete`,
    );
  }
  if (new Set(courses.map((c) => c.id)).size !== courses.length) {
    throw new Error("DAAD: pages overlap (duplicate programme ids): run again");
  }
  if (courses.length !== first.numResults) {
    throw new Error(
      `DAAD: collected ${courses.length} of ${first.numResults} Bachelor programmes: run again`,
    );
  }
  return courses;
}

// --- location ---------------------------------------------------------------------------------
// The database also lists programmes an institution teaches abroad ("Singapore", "Ho Chi Minh,
// Vietnam"). Those are not options in Germany.
const ABROAD =
  /^(singapore|cairo|hanoi|ho chi minh|muscat|almaty|astana|ulaanbaatar|bangkok|istanbul|tbilisi|amman|kuala lumpur|shanghai|beijing|dubai|seoul|tokyo|doha|riyadh|nairobi|accra)\b/i;

export function isTaughtAbroad(city: string | null): boolean {
  const c = (city ?? "").trim();
  return ABROAD.test(c) || /,\s*(?!Germany\b|Deutschland\b)[A-Z][a-z]+(\s[A-Z][a-z]+)?$/.test(c);
}

// --- field -------------------------------------------------------------------------------------
// Decided by the programme's name only: the subject tag is a secondary label and put nursing,
// forestry and applied mathematics into the three fields. A clear field word is `high`; a vague
// one ("management" alone, "technology") is a judgement call (`low`).
const CS_STRONG =
  /computer science|computer engineering|computing|informatik|informatics|data science|artificial intelligence|machine learning|\bsoftware|cyber|information systems/i;
const IT_WORD = /\bIT\b|information technology/;
const ENG_STRONG =
  /engineering|ingenieur|mechatronic|automation|electronic|electrical|mechanical|civil|aerospace|automotive|robotic|construction/i;
const ENG_WEAK = /technology|technik|energy|materials|manufacturing|industrial|process|production/i;
const BUS_STRONG =
  /business|economics|finance|accounting|marketing|commerce|entrepreneur|betriebswirtschaft|wirtschaft/i;
const BUS_WEAK = /management|administration|logistics/i;
const NOT_CS = /linguistic/i;
// Health names, evaluated only after the strong CS/engineering/business branches: "Medical
// Engineering" stays engineering and "Health Economics" stays business-economics. The weak
// patterns below do not get a say, so "Pharmaceutical Biotechnology" is pharmacy, not engineering
// via ENG_WEAK's "technology".
const MED_STRONG = /\bmedizin|molecular medicine|human medicine|medical sciences?\b/i;
const PHARM_STRONG = /pharmaz|pharmaceutical|pharmatechnik|pharmacy/i;
const ALLIED_STRONG =
  /\bnursing\b|\bpflege|physiotherap|biomedical|biomedizin|\bhealth sciences?\b|public health|nutrition|ernährung/i;

export function classifyDaad(
  name: string,
  _subject: string | null,
): { field: string; confidence: "high" | "low" } | null {
  const csStrong = CS_STRONG.test(name) && !NOT_CS.test(name);
  const engStrong = ENG_STRONG.test(name);
  // "Electrical Engineering and Information Technology" and "Electronics Engineering for Artificial
  // Intelligence" are engineering; "Applied Computer Science" and "Software Engineering" are not.
  const engineeringWins =
    /electrical|electronic|mechanical|civil|mechatronic|aerospace|automotive/i.test(name);
  const csCore = /computer science|informatik|informatics|software|data science/i.test(name);
  if (csStrong && !(engineeringWins && !csCore)) {
    return { field: "computer-science", confidence: "high" };
  }
  if (engStrong) {
    return {
      field: "engineering",
      confidence: BUS_STRONG.test(name) || BUS_WEAK.test(name) ? "low" : "high",
    };
  }
  if (BUS_STRONG.test(name)) return { field: "business-economics", confidence: "high" };
  if (!csStrong && !engStrong) {
    if (MED_STRONG.test(name)) return { field: "medicine", confidence: "high" };
    if (PHARM_STRONG.test(name)) return { field: "pharmacy", confidence: "high" };
    if (ALLIED_STRONG.test(name)) return { field: "allied-health", confidence: "high" };
  }
  if (IT_WORD.test(name)) return { field: "computer-science", confidence: "high" };
  if (ENG_WEAK.test(name)) return { field: "engineering", confidence: "low" };
  if (BUS_WEAK.test(name)) return { field: "business-economics", confidence: "low" };
  return null;
}

// --- fact parsing (values only when the text is unambiguous) -----------------------------------
const LANGUAGE_CODES: Record<string, string> = {
  english: "en",
  german: "de",
  french: "fr",
  spanish: "es",
  italian: "it",
  portuguese: "pt",
  arabic: "ar",
};

export function languageCodes(languages: readonly string[]): string[] | null {
  const codes = languages
    .map((l) => LANGUAGE_CODES[l.trim().toLowerCase()])
    .filter((c): c is string => c !== undefined);
  return codes.length === languages.length && codes.length > 0 ? codes : null;
}

// "6 semesters" -> 3; ambiguous ("6 semesters, 7 semesters") or open ("9 semesters or more") -> null.
export function yearsFromSemesters(text: string | null): number | null {
  const m = /^(\d+) semesters?$/.exec((text ?? "").trim());
  return m?.[1] === undefined ? null : Number(m[1]) / 2;
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

// "Register by 15 July 2027" -> "2027-07-15"; anything longer or vaguer stays text for a human.
export function cleanDeadline(text: string | null): string | null {
  const m = /^Register by (\d{1,2}) (\w+) (\d{4})$/.exec((text ?? "").trim());
  if (m === null) return null;
  const month = MONTHS.indexOf((m[2] ?? "").toLowerCase());
  if (month === -1) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
}

export function plainText(html: string | null, max = 400): string {
  const text = collapseSpaces(
    (html ?? "")
      .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&ndash;|&mdash;/g, "-")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#?\w+;/g, " "),
  );
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

// --- linking to the HRK institution list -------------------------------------------------------
// English forms of German place names that appear in DAAD institution names.
const EXONYMS: Record<string, string> = {
  munich: "münchen",
  cologne: "köln",
  nuremberg: "nürnberg",
  hanover: "hannover",
  brunswick: "braunschweig",
  dusseldorf: "düsseldorf",
  rhine: "rhein",
  wuerttemberg: "württemberg",
};
const GENERIC = new Set([
  "university",
  "universities",
  "of",
  "the",
  "applied",
  "sciences",
  "science",
  "technical",
  "technology",
  "institute",
  "college",
  "school",
  "for",
  "and",
  "hochschule",
  "fachhochschule",
  "universitat",
  "technische",
  "in",
  "am",
  "an",
  "gmbh",
  "private",
  "state",
  "international",
  "fh",
]);

function germanize(text: string, display = false): string {
  return text.replace(/[A-Za-zÀ-ÿ]+/g, (w) => {
    const german = EXONYMS[w.toLowerCase()];
    if (german === undefined) return w;
    return display ? `${german.charAt(0).toUpperCase()}${german.slice(1)}` : german;
  });
}

export function germanTown(town: string | null): string {
  return canonicalTown(germanize(collapseSpaces(town ?? ""), true));
}

type HrkLite = { slug: string; name: string; city: string; alias?: string };

// English DAAD names against German HRK names. A candidate must be in the same town (or carry its
// town in the DAAD name) and contain every distinctive word of the English name; the kind of
// institution (Technische Universität, Hochschule, Universität) then narrows several candidates,
// and DAAD's habit of calling a Hochschule a "University" is allowed when nothing else fits.
// Anything ambiguous returns null, so a wrong institution is never guessed.
export function matchHrkEnglish(
  academy: string,
  city: string | null,
  institutions: readonly HrkLite[],
): HrkLite | null {
  const town = germanTown(city);
  // "... University of Applied Sciences and Arts" is a common suffix, not the word "arts".
  const name = germanize(academy).replace(/applied sciences and arts/i, "applied sciences");
  const nameWords = tokens(name);
  const lower = name.toLowerCase();
  const applied = /applied sciences|fachhochschule|hochschule/.test(lower);
  const technical = /technical university|technische universit/.test(lower);
  const plainUniversity = /universit/.test(lower) && !applied && !technical;
  const townTokens = new Set(
    nameKey(town)
      .split(" ")
      .filter((t) => t !== ""),
  );
  const brand = [...nameWords].filter((t) => !GENERIC.has(t) && !townTokens.has(t));

  const wordsOf = (i: HrkLite) => new Set([...tokens(i.name), ...(i.alias ? tokens(i.alias) : [])]);
  const inTown = (i: HrkLite) => {
    if (town !== "" && sameTown(i.city, town)) return true;
    const cityTokens = tokens(i.city);
    return cityTokens.size > 0 && [...cityTokens].every((t) => nameWords.has(t));
  };
  // The institution's own distinctive words (from its short name when it has one) must all appear
  // in the DAAD name too: one shared word ("Europe") is not enough to be the same institution.
  const coveredBy = (base: Set<string>, cityWords: Set<string>) =>
    [...base].every((t) => GENERIC.has(t) || cityWords.has(t) || nameWords.has(t));
  const covered = (i: HrkLite) => {
    const cityWords = tokens(i.city);
    // Either the short name ("Hochschule Heilbronn") or the full official name is enough: an
    // acronym alias ("TU München") need not appear in the English name.
    return (
      (i.alias !== undefined &&
        tokens(i.alias).size > 0 &&
        coveredBy(tokens(i.alias), cityWords)) ||
      coveredBy(tokens(i.name), cityWords)
    );
  };
  const pool = institutions.filter(
    (i) => inTown(i) && brand.every((b) => wordsOf(i).has(b)) && covered(i),
  );
  if (pool.length === 1 && brand.length > 0) return pool[0] ?? null;

  // The HRK short name ("FH Münster", "Hochschule Hannover") written out in the DAAD name.
  const byAlias = pool.filter((i) => {
    const alias = i.alias ? tokens(i.alias) : new Set<string>();
    return alias.size >= 2 && [...alias].every((t) => nameWords.has(t));
  });
  if (byAlias.length === 1) return byAlias[0] ?? null;

  const kindOk = (i: HrkLite) => {
    const label = nameKey(`${i.name} ${i.alias ?? ""}`);
    if (applied) {
      return (
        /hochschule|fachhochschule|\bfh\b|university of applied sciences/.test(label) &&
        !/universitat/.test(label)
      );
    }
    if (technical) return /technische universitat/.test(label);
    if (plainUniversity) return /universitat/.test(label) && !/technische universitat/.test(label);
    return true;
  };
  const byKind = pool.filter(kindOk);
  if (byKind.length === 1) return byKind[0] ?? null;
  // "Aalen University" is a Hochschule: relax the kind only when no candidate fits it.
  return byKind.length === 0 && pool.length === 1 ? (pool[0] ?? null) : null;
}

// --- records -----------------------------------------------------------------------------------
export function buildDaadRecords(input: {
  courses: readonly DaadCourse[];
  hrk: readonly HrkInstitution[];
  probed: Probed;
  // programmes of the Studiensuche per (institution slug|field): a hint about possible duplicates
  baCounts?: ReadonlyMap<string, number>;
}): StagedRecord[] {
  const { courses, hrk, probed } = input;
  const lite: HrkLite[] = hrk.map((i) => ({
    slug: hrkSlug(i),
    name: i.name,
    city: i.city,
    alias: i.alias,
  }));
  const bySlug = new Map(hrk.map((i) => [hrkSlug(i), i]));
  const extras = new Map<string, StagedRecord>();
  const records: StagedRecord[] = [];

  for (const c of courses) {
    const match = classifyDaad(c.courseName, c.subject);
    const listedCity = germanTown(c.city);
    if (match === null || listedCity === "" || isTaughtAbroad(c.city)) continue;
    const matched = matchHrkEnglish(c.academy, c.city, lite);
    const inst = matched === null ? undefined : bySlug.get(matched.slug);
    const city = inst !== undefined && sameTown(inst.city, listedCity) ? inst.city : listedCity;
    const instName = inst?.name ?? collapseSpaces(c.academy);

    let instSlug: string;
    if (inst !== undefined && matched !== null) {
      // A campus in another town is its own unit (the validator ties a programme's city to it).
      instSlug = city === inst.city ? matched.slug : `${matched.slug}-${slugify(city)}`;
      if (instSlug !== matched.slug && !extras.has(instSlug)) {
        extras.set(instSlug, campusUnit(inst, city, instSlug, probed));
      }
    } else {
      instSlug = `de-${slugify(c.academy, 40)}-daad-${slugify(city)}`;
      if (!extras.has(instSlug)) {
        extras.set(
          instSlug,
          stagedInstitution({
            slug: instSlug,
            name: instName,
            country: "DE",
            city,
            type: null,
            website: null,
            source: "daad",
            sourceUrl: daadPage(c),
            sourceId: `daad-academy:${slugify(c.academy, 60)}@${slugify(city)}`,
            todo: `institution named "${c.academy}" in the DAAD database (English name), not matched to the HRK list: it may already exist under its German name. Find its official site, check it is a recognised Hochschule, set the type, add its page as the source, then info_kind: official`,
          }),
        );
      }
    }

    const slug = `${instSlug}-${slugify(c.courseName, 24)}-daad${c.id}`;
    const years = yearsFromSemesters(c.programmeDuration);
    const codes = languageCodes(c.languages);
    const deadline = cleanDeadline(c.applicationDeadline);
    const dupCount = input.baCounts?.get(`${matched?.slug ?? instSlug}|${match.field}`) ?? 0;
    const todo = [
      `DAAD page lists: languages ${c.languages.join(", ") || "none"}, duration ${c.programmeDuration ?? "n/a"}, starts ${c.beginning ?? "n/a"}, tuition "${c.tuitionFees ?? "n/a"}"${c.costString ? ` / "${plainText(c.costString, 160)}"` : ""}, deadline "${plainText(c.applicationDeadline, 300) || "n/a"}"`,
      matched === null
        ? "institution not matched to the HRK list (see its record)"
        : `institution matched to HRK "${instName}"`,
      "the DAAD page (see the link) is the source of the prefilled values: confirm them there or on the programme's own site, then set info_kind. officialUrl is left empty: set it to the programme's own page on the institution's site (the DAAD page links to it). Tuition for non-EU students is not prefilled. A plain deadline may be the one for EU/German applicants: check it applies to applicants from outside the EU",
      ...(match.confidence === "low"
        ? ["field is a judgement call: check the programme content"]
        : []),
      ...(dupCount > 0
        ? [
            `${dupCount} programme(s) in this field at this institution also come from the Studiensuche: this may be the same degree listed twice (keep the DAAD record, it has language and dates)`,
          ]
        : []),
      ...(c.languages.includes("German")
        ? ["partly or fully taught in German: check the German level required"]
        : []),
    ];
    const review: ReviewRow = {
      kind: "programs",
      slug,
      name: c.courseName,
      institution: instName,
      city,
      field: match.field,
      confidence: match.confidence,
      officialUrl: daadPage(c),
      todo: todo.join("; "),
    };
    records.push({
      collection: "programs",
      id: slug,
      sourceId: `daad:${c.id}`,
      data: {
        slug,
        institution: instSlug,
        country: "DE",
        city: slugify(city),
        field: match.field,
        level: "bachelor",
        name: c.courseName,
        summary: programmeSummary(c.courseName, instName, city, "daad"),
        // Left empty on purpose, like the other programme importers: the DAAD page is a listing, not
        // the institution's own programme page, so a human must supply that before promotion.
        officialUrl: null,
        durationYears: { value: years, source: "daad", info_kind: READ_SOURCE },
        teachingLanguages: { value: codes, source: "daad", info_kind: READ_SOURCE },
        tuition: { value: null, source: "daad", info_kind: READ_SOURCE },
        intakes: {
          value:
            deadline === null
              ? null
              : [{ startDate: null, applicationOpens: null, applicationDeadline: deadline }],
          source: "daad",
          info_kind: READ_SOURCE,
        },
        applicationChannel: { value: null, source: "daad", info_kind: READ_SOURCE },
        documents: { value: null, source: "daad", info_kind: READ_SOURCE },
        requirements: { coverage: "partial", source: "daad", info_kind: READ_SOURCE, rules: [] },
        scholarships: [],
        sources: { daad: { url: daadPage(c), last_verified_at: null } },
      },
      review,
    });
  }
  return [...extras.values(), ...records];
}

// How many Studiensuche programmes of the same field already exist per HRK institution: a hint
// that a DAAD programme may be the same degree listed under its German name.
export function countBaProgrammes(
  programmes: readonly BaProgramme[],
  hrk: readonly HrkInstitution[],
): Map<string, number> {
  const lite = hrk.map((i) => ({ slug: hrkSlug(i), name: i.name, city: i.city, alias: i.alias }));
  const counts = new Map<string, number>();
  for (const p of programmes) {
    const field = classifyGerman(p.group, p.name, p.subjects)?.field;
    const matched = matchHrk(p.provider, p.city, lite);
    if (field === undefined || matched === null) continue;
    const key = `${matched.slug}|${field}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export async function importDaad(): Promise<StagedRecord[]> {
  const [courses, hrk, programmes] = [
    await fetchDaadBachelors(),
    await fetchHrkInstitutions(),
    await fetchBaProgrammes(),
  ];
  const probed = await probeHttps(
    hrk.flatMap((i) => {
      const w = websiteCandidates(i.homepage);
      return w.needsProbe && w.asListed !== null ? [w.asListed] : [];
    }),
  );
  return buildDaadRecords({ courses, hrk, probed, baCounts: countBaProgrammes(programmes, hrk) });
}
