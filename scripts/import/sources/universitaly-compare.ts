import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { DATA_DIR } from "../staging";
import { hostKey, nameKey } from "../text";
import {
  type Candidate,
  type Classified,
  courseName,
  type Status,
  toCandidate,
} from "./universitaly";

export type OurProgramme = {
  slug: string;
  institutionSlug: string;
  institutionName: string;
  name: string;
  classCode: string | null;
  officialUrl: string | null;
  durationYears: number | null;
  languages: string[];
};

type Loose = Record<string, unknown>;
const asRecord = (value: unknown): Loose =>
  typeof value === "object" && value !== null ? (value as Loose) : {};
const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

// "…-l31" -> "L-31": the class is the last slug segment (scripts/import/sources/mur.ts classSlug).
function classOfSlug(slug: string): string | null {
  const match = /-l(\d+)$/.exec(slug);
  return match === null ? null : `L-${match[1]}`;
}

async function yamlFiles(dir: string): Promise<Loose[]> {
  const names = (await readdir(dir))
    .filter((n) => n.startsWith("it-") && n.endsWith(".yaml"))
    .sort();
  return Promise.all(
    names.map(async (n) => asRecord(parse(await readFile(path.join(dir, n), "utf8")))),
  );
}

export async function loadItalyData(dataDir: string = DATA_DIR): Promise<OurProgramme[]> {
  const institutions = new Map<string, string>();
  for (const inst of await yamlFiles(path.join(dataDir, "institutions"))) {
    const slug = asString(inst.slug);
    const name = asString(inst.name);
    if (slug !== null && name !== null) institutions.set(slug, name);
  }
  const out: OurProgramme[] = [];
  for (const p of await yamlFiles(path.join(dataDir, "programs"))) {
    const slug = asString(p.slug);
    const institutionSlug = asString(p.institution);
    const name = asString(p.name);
    if (slug === null || institutionSlug === null || name === null) continue;
    const duration = asRecord(p.durationYears).value;
    const languages = asRecord(p.teachingLanguages).value;
    out.push({
      slug,
      institutionSlug,
      institutionName: institutions.get(institutionSlug) ?? institutionSlug,
      name,
      classCode: classOfSlug(slug),
      officialUrl: asString(p.officialUrl),
      durationYears: typeof duration === "number" ? duration : null,
      languages: Array.isArray(languages)
        ? languages.filter((l): l is string => typeof l === "string")
        : [],
    });
  }
  return out;
}

export type Comparison = {
  academicYear: string;
  tally: Record<Status, number>;
  candidates: number;
  matched: { ours: string; portalId: number }[];
  possible: { ours: string; candidate: Candidate; why: string }[];
  newProgrammes: Candidate[];
  newUniversities: { university: string; programmes: Candidate[]; possiblyOurs: string[] }[];
  notListed: {
    ours: OurProgramme;
    portalStatus: Status | "absent" | "university-not-matched";
  }[];
  institutionsNotSeen: string[];
  mismatches: {
    slug: string;
    field: "duration" | "language" | "url-host";
    ours: string;
    portal: string;
  }[];
};

const STATUSES: Status[] = [
  "candidate",
  "not-bachelor",
  "not-english",
  "class-out-of-scope",
  "mixed-language",
  "not-in-person",
];

function mostFrequent(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
}

const GENERIC_WORDS = new Set([
  "universita",
  "universitaria",
  "degli",
  "studi",
  "di",
  "del",
  "della",
  "delle",
  "dei",
  "dell",
  "dello",
  "e",
  "and",
  "la",
  "il",
  "lo",
  "the",
  "of",
]);

// The distinctive words of a university name, to point at near matches (never to decide a match).
export function universityTokens(name: string): string[] {
  return nameKey(name)
    .split(" ")
    .filter((t) => t.length >= 3 && !GENERIC_WORDS.has(t));
}

function overlaps(a: string[], b: string[]): boolean {
  const setB = new Set(b);
  const shared = new Set(a.filter((t) => setB.has(t))).size;
  const smaller = Math.min(new Set(a).size, setB.size);
  return shared >= 1 && smaller > 0 && shared / smaller >= 0.5;
}

export function compare(classified: Classified[], ours: OurProgramme[]): Comparison {
  const tally = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const c of classified) tally[c.status]++;
  const academicYear = mostFrequent(classified.map((c) => c.course.anno.descrizione));
  const candidates = classified.filter((c) => c.status === "candidate").map(toCandidate);

  const used = new Set<string>();
  const matched: Comparison["matched"] = [];
  const possible: Comparison["possible"] = [];
  const newProgrammes: Candidate[] = [];
  const newByUniversity = new Map<string, Candidate[]>();
  const mismatches: Comparison["mismatches"] = [];

  for (const cand of candidates) {
    const sameUniversity = ours.filter(
      (o) => nameKey(o.institutionName) === nameKey(cand.university),
    );
    if (sameUniversity.length === 0) {
      newByUniversity.set(cand.university, [...(newByUniversity.get(cand.university) ?? []), cand]);
      continue;
    }
    const sameClass = sameUniversity.filter(
      (o) => o.classCode !== null && cand.classCodes.includes(o.classCode),
    );
    const exacts = sameClass.filter((o) => nameKey(o.name) === nameKey(cand.name));
    const exact = exacts.find((o) => !used.has(o.slug));
    const firstExact = exacts[0];
    if (exact === undefined && firstExact !== undefined) {
      possible.push({
        ours: firstExact.slug,
        candidate: cand,
        why: `duplicate of ${firstExact.slug} already matched (other campus?)`,
      });
      continue;
    }
    if (exact !== undefined) {
      used.add(exact.slug);
      matched.push({ ours: exact.slug, portalId: cand.portalId });
      if (
        exact.durationYears !== null &&
        cand.durationYears !== null &&
        exact.durationYears !== cand.durationYears
      ) {
        mismatches.push({
          slug: exact.slug,
          field: "duration",
          ours: String(exact.durationYears),
          portal: String(cand.durationYears),
        });
      }
      if (!exact.languages.includes("en")) {
        mismatches.push({
          slug: exact.slug,
          field: "language",
          ours: exact.languages.join(",") || "none",
          portal: "en",
        });
      }
      const ourHost = exact.officialUrl === null ? null : hostKey(exact.officialUrl);
      const portalHost = cand.url === null ? null : hostKey(cand.url);
      if (ourHost !== null && portalHost !== null && ourHost !== portalHost) {
        mismatches.push({ slug: exact.slug, field: "url-host", ours: ourHost, portal: portalHost });
      }
      continue;
    }
    const near = sameClass.find((o) => !used.has(o.slug));
    if (near !== undefined) {
      used.add(near.slug);
      possible.push({
        ours: near.slug,
        candidate: cand,
        why: `same university and class ${near.classCode}, name differs ("${near.name}" / "${cand.name}")`,
      });
      continue;
    }
    newProgrammes.push(cand);
  }

  const portalUniversities = new Set(classified.map((c) => nameKey(c.course.nomeStruttura)));
  const institutionsNotSeen = [...new Set(ours.map((o) => o.institutionName))]
    .filter((name) => !portalUniversities.has(nameKey(name)))
    .sort();

  const notListed: Comparison["notListed"] = ours
    .filter((o) => !used.has(o.slug))
    .map((o) => {
      const seen = classified.find(
        (c) =>
          nameKey(c.course.nomeStruttura) === nameKey(o.institutionName) &&
          nameKey(courseName(c.course)) === nameKey(o.name),
      );
      if (seen !== undefined) return { ours: o, portalStatus: seen.status };
      const universityUnmatched = institutionsNotSeen.includes(o.institutionName);
      return { ours: o, portalStatus: universityUnmatched ? "university-not-matched" : "absent" };
    });

  return {
    academicYear,
    tally,
    candidates: candidates.length,
    matched,
    possible,
    newProgrammes,
    newUniversities: [...newByUniversity.entries()].map(([university, programmes]) => ({
      university,
      programmes,
      possiblyOurs: institutionsNotSeen.filter((name) =>
        overlaps(universityTokens(university), universityTokens(name)),
      ),
    })),
    notListed,
    institutionsNotSeen,
    mismatches,
  };
}

export { type ReportMeta, renderReport } from "./universitaly-report";
