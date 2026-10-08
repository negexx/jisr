import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { DATA_DIR } from "../staging";
import { collapseSpaces, hostKey, nameKey } from "../text";
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
  newUniversities: { university: string; programmes: Candidate[] }[];
  notListed: { ours: OurProgramme; portalStatus: Status | "absent" }[];
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
    const exact = sameClass.find((o) => nameKey(o.name) === nameKey(cand.name));
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
    const near = sameClass[0];
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

  const notListed: Comparison["notListed"] = ours
    .filter((o) => !used.has(o.slug))
    .map((o) => {
      const seen = classified.find(
        (c) =>
          nameKey(c.course.nomeStruttura) === nameKey(o.institutionName) &&
          nameKey(courseName(c.course)) === nameKey(o.name),
      );
      return { ours: o, portalStatus: seen?.status ?? "absent" };
    });

  const portalUniversities = new Set(classified.map((c) => nameKey(c.course.nomeStruttura)));
  const institutionsNotSeen = [...new Set(ours.map((o) => o.institutionName))]
    .filter((name) => !portalUniversities.has(nameKey(name)))
    .sort();

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
    })),
    notListed,
    institutionsNotSeen,
    mismatches,
  };
}

export type ReportMeta = {
  fetchedAt: string;
  cacheDir: string;
  englishTotal: number;
  mixedTotal: number;
  italianTotal: number;
};

const line = (c: Candidate): string =>
  `- ${c.name} (${c.classCode}, ${c.field}${c.confidence === "low" ? ", low confidence" : ""}, ${c.durationYears ?? "?"} years) ${c.url ?? "no portal link"} [portal id ${c.portalId}]`;

export function renderReport(cmp: Comparison, meta: ReportMeta): string {
  const out: string[] = [];
  out.push("# Universitaly discovery report", "");
  out.push(
    `Academic year reported by the portal: ${cmp.academicYear}. Fetched ${meta.fetchedAt}. Raw responses: \`${meta.cacheDir}\` (sha256 in manifest.json). Nothing here is in data/ or in staging: this is a candidate list for the owner.`,
    "",
  );
  out.push("## Counts", "");
  out.push(
    `- English search (Triennale, includes mixed): ${meta.englishTotal} courses; of these mixed Italian-English in an in-scope class: ${cmp.tally["mixed-language"]}; mixed in all classes (portal total for the mixed filter): ${meta.mixedTotal}`,
  );
  out.push(
    `- Italian search (Triennale, includes mixed): ${meta.italianTotal} courses (counted only)`,
  );
  for (const [status, n] of Object.entries(cmp.tally)) out.push(`- ${status}: ${n}`);
  out.push(
    `- candidates (English, in person, in scope): ${cmp.candidates}; matched to our programmes: ${cmp.matched.length}; possible matches: ${cmp.possible.length}; new at a university we have: ${cmp.newProgrammes.length}; at new universities: ${cmp.newUniversities.reduce((n, u) => n + u.programmes.length, 0)}`,
    "",
  );
  out.push("## New universities", "");
  if (cmp.newUniversities.length === 0) out.push("None.");
  for (const u of cmp.newUniversities) {
    out.push(`### ${u.university}`);
    for (const c of u.programmes) out.push(line(c));
    out.push("");
  }
  out.push("## New programmes at universities we already have", "");
  if (cmp.newProgrammes.length === 0) out.push("None.");
  for (const c of cmp.newProgrammes) out.push(`${line(c)} at ${c.university}`);
  out.push("", "## Possible matches (same university and class, different name)", "");
  if (cmp.possible.length === 0) out.push("None.");
  for (const p of cmp.possible) out.push(`- ${p.ours}: ${p.why} ${p.candidate.url ?? ""}`);
  out.push("", "## Programmes we have that the portal does not list", "");
  if (cmp.notListed.length === 0) out.push("None.");
  for (const n of cmp.notListed)
    out.push(`- ${n.ours.slug} (${n.ours.institutionName}): portal status ${n.portalStatus}`);
  out.push("", "## Mismatches on matched programmes", "");
  if (cmp.mismatches.length === 0) out.push("None.");
  for (const m of cmp.mismatches)
    out.push(`- ${m.slug}: ${m.field}, ours ${m.ours}, portal ${m.portal}`);
  out.push("", "## Our universities no portal course name matches", "");
  if (cmp.institutionsNotSeen.length === 0) out.push("None.");
  for (const name of cmp.institutionsNotSeen) out.push(`- ${collapseSpaces(name)}`);
  out.push("");
  return out.join("\n");
}
