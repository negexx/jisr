import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { STAGING_DIR } from "./staging";

// A programme is a candidate for the Release 1 shortlist only if a Moroccan applicant could
// realistically use it: a usable teaching language, a field we are confident about, and an
// institution that is publicly funded or recognised. The shortlist then spreads across countries,
// fields and institutions instead of taking the top of one list.
export type Candidate = {
  slug: string;
  country: string;
  field: string;
  institution: string;
  confidence: "high" | "low";
  languages: readonly string[] | null; // ISO codes, when a source states them
  hasEnglishName: boolean; // NL: the register gives an English name (a hint of English teaching)
  institutionType: "public" | "private" | null;
  institutionMatched: boolean; // linked to an official register entry
  hasDates: boolean; // the source already gave a clean deadline
  notPubliclyFunded?: boolean; // NL: the register says NIET_BEKOSTIGD (private, statutory fee rules do not apply)
  source: "parcoursup" | "rio" | "ba" | "daad";
};

export type Scored = Candidate & { score: number };

// Returns null when the programme is not a realistic option, else a score 0-100.
export function scoreCandidate(c: Candidate): number | null {
  if (c.confidence !== "high") return null;
  if (!c.institutionMatched && c.source === "ba") return null;

  let score = 20;
  if (c.country === "FR") {
    score += 20; // taught in French by default
  } else if (c.source === "daad") {
    const langs = c.languages ?? [];
    if (!langs.includes("en")) return null; // German-only teaching: not realistic from abroad
    score += langs.includes("de") ? 15 : 25;
    if (c.hasDates) score += 10;
  } else if (c.country === "NL") {
    if (!c.hasEnglishName) return null; // no sign of English teaching
    if (c.notPubliclyFunded === true) return null; // private programme: tuition and recognition vary
    score += 20;
  } else {
    return null; // German programmes without a stated language are not shortlisted
  }
  if (c.institutionType === "public") score += 15;
  else if (c.institutionType === null && c.country === "NL") score += 10; // funded register entry
  if (c.institutionMatched) score += 10;
  return Math.min(100, score);
}

export type Selection = { perCountryField: number; perInstitution: number };

// Per country and field the quota is filled round-robin across institutions: every institution's
// best programme first, then every institution's second best, and so on up to `perInstitution`.
// This spreads the shortlist over institutions and cities instead of exhausting the first few
// (ties on score are otherwise broken alphabetically). Order is deterministic.
export function selectShortlist(candidates: readonly Candidate[], limits: Selection): Scored[] {
  const scored: Scored[] = candidates.flatMap((c) => {
    const score = scoreCandidate(c);
    return score === null ? [] : [{ ...c, score }];
  });
  const groups = new Map<string, Map<string, Scored[]>>();
  for (const c of scored) {
    const group = groups.get(`${c.country}|${c.field}`) ?? new Map<string, Scored[]>();
    group.set(c.institution, [...(group.get(c.institution) ?? []), c]);
    groups.set(`${c.country}|${c.field}`, group);
  }
  const picked: Scored[] = [];
  for (const key of [...groups.keys()].sort()) {
    const byInstitution = groups.get(key) ?? new Map<string, Scored[]>();
    for (const list of byInstitution.values()) {
      list.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
    }
    const institutions = [...byInstitution.entries()].sort(
      (a, b) => (b[1][0]?.score ?? 0) - (a[1][0]?.score ?? 0) || a[0].localeCompare(b[0]),
    );
    let taken = 0;
    for (let round = 0; round < limits.perInstitution && taken < limits.perCountryField; round++) {
      for (const [, list] of institutions) {
        const next = list[round];
        if (next === undefined || taken >= limits.perCountryField) continue;
        picked.push(next);
        taken++;
      }
    }
  }
  return picked;
}

// --- reading the staged records ----------------------------------------------------------------
type Staged = Record<string, unknown>;

function asRecord(value: unknown): Staged {
  return typeof value === "object" && value !== null ? (value as Staged) : {};
}

export async function loadCandidates(dir = STAGING_DIR): Promise<Candidate[]> {
  const read = async (collection: string): Promise<Staged[]> => {
    const folder = path.join(dir, collection);
    if (!existsSync(folder)) return [];
    const out: Staged[] = [];
    for (const name of await readdir(folder)) {
      if (name.endsWith(".yaml"))
        out.push(asRecord(parse(await readFile(path.join(folder, name), "utf8"))));
    }
    return out;
  };
  const institutions = new Map((await read("institutions")).map((i) => [String(i.slug), i]));
  const out: Candidate[] = [];
  for (const p of await read("programs")) {
    const slug = String(p.slug);
    const review = asRecord(p._review);
    const inst = institutions.get(String(p.institution));
    const todo = String(review.todo ?? "");
    const sourceId = String(review.sourceId ?? "");
    const source = sourceId.startsWith("daad:")
      ? "daad"
      : sourceId.startsWith("rio:")
        ? "rio"
        : sourceId.startsWith("ba:")
          ? "ba"
          : "parcoursup";
    const langValue = asRecord(p.teachingLanguages).value;
    const intake = asRecord(p.intakes).value;
    out.push({
      slug,
      country: String(p.country),
      field: String(p.field),
      institution: String(p.institution),
      confidence: review.confidence === "high" ? "high" : "low",
      languages: Array.isArray(langValue) ? langValue.map(String) : null,
      hasEnglishName: /international name/.test(todo),
      institutionType: inst?.type === "public" || inst?.type === "private" ? inst.type : null,
      institutionMatched:
        source === "daad"
          ? /matched to HRK/.test(todo)
          : source === "ba"
            ? /matched to HRK/.test(todo)
            : true,
      hasDates: Array.isArray(intake) && intake.length > 0,
      notPubliclyFunded: /not publicly funded/.test(todo),
      source,
    });
  }
  return out;
}

export const SHORTLIST_FILE = "SHORTLIST.csv";

export function shortlistCsv(rows: readonly Scored[]): string {
  const header = "slug,country,field,institution,score,source";
  const lines = rows.map((r) =>
    [r.slug, r.country, r.field, r.institution, String(r.score), r.source].join(","),
  );
  return `${[header, ...lines].join("\n")}\n`;
}

async function main(argv: readonly string[]): Promise<void> {
  const flag = (name: string, fallback: number) => {
    const at = argv.indexOf(name);
    const value = at === -1 ? fallback : Number(argv[at + 1]);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  };
  const limits = {
    perCountryField: flag("--per-field", 20),
    perInstitution: flag("--per-institution", 3),
  };
  const picked = selectShortlist(await loadCandidates(), limits);
  await writeFile(path.join(STAGING_DIR, SHORTLIST_FILE), shortlistCsv(picked));
  const count = new Map<string, number>();
  for (const r of picked)
    count.set(`${r.country} ${r.field}`, (count.get(`${r.country} ${r.field}`) ?? 0) + 1);
  console.log(
    `shortlist: ${picked.length} programmes -> ${path.join(STAGING_DIR, SHORTLIST_FILE)}`,
  );
  for (const [k, v] of [...count].sort()) console.log(`  ${k}: ${v}`);
}

if (process.argv[1]?.endsWith("shortlist.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
