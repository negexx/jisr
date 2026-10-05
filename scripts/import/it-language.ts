import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { fetchText } from "./http";
import type { Proposal } from "./proposals";
import {
  ATENEI_URL,
  type Ateneo,
  type MurCourse,
  OFFER_URL,
  parseAtenei,
  parseMurOffer,
} from "./sources/mur";
import { DATA_DIR, STAGING_DIR } from "./staging";
import { slugify } from "./text";

// The MUR offer file (open data of the Italian ministry that accredits every degree course) states
// the language of each course in its LINGUA column. The Italian programmes we list are the ones it
// marks "Inglese", yet some have no verified teaching language because their own page never says
// it. This reads the ministry's row by code, with no model and no search credits, for the Italian
// programmes in data/ that hold no language, and proposes English with the row as the quote: the
// verifier re-fetches the file and checks the row is on it. Enrichment only fills a missing value,
// never replaces one. The offer file is for the latest academic year it names: the page says so.
// Usage: data:it-language [--dry-run]; then `data:evidence restage --enrich data-staging/proposals-it-language
// --slugs <file>`, `verify --enrich`, `data:audit`, `data:promote --replace-revisions`.
export function murLanguageQuote(course: MurCourse): string | null {
  if (course.language !== "Inglese") return null;
  // the contiguous stretch of the CSV row, from the course name to the language column
  const quote = [
    course.name,
    course.province,
    course.city,
    course.access,
    course.mode,
    course.language,
  ].join(";");
  // the file is windows-1252: the page reader decodes accented letters differently, so a quote
  // with one could never be found again
  return /^[\x20-\x7e]+$/.test(quote) ? quote : null;
}

export type LanguageProgramme = {
  slug: string;
  institution: string;
  name: string;
  officialUrl: string | null;
  hasLanguage: boolean;
};

export type LanguageSkip = { slug: string; reason: string };

export function buildLanguageProposals(input: {
  programmes: readonly LanguageProgramme[];
  courses: readonly MurCourse[];
  atenei: readonly Ateneo[];
  offerUrl: string;
}): { proposals: Proposal[]; skipped: LanguageSkip[] } {
  const latest = input.courses.reduce((max, c) => Math.max(max, c.year), 0);
  const byShort = new Map(input.atenei.map((a) => [a.shortName, a]));
  // institution unit + course name (lower case) -> the MUR rows of the latest year
  const rows = new Map<string, MurCourse[]>();
  for (const c of input.courses) {
    if (c.year !== latest || c.type !== "Laurea") continue;
    const ateneo = byShort.get(c.ateneo);
    if (ateneo === undefined) continue;
    const key = `it-${slugify(ateneo.shortName, 40)}-${slugify(c.city)}|${c.name.toLowerCase()}`;
    rows.set(key, [...(rows.get(key) ?? []), c]);
  }

  const proposals: Proposal[] = [];
  const skipped: LanguageSkip[] = [];
  for (const p of input.programmes) {
    if (p.hasLanguage) continue;
    const found = rows.get(`${p.institution}|${p.name.toLowerCase()}`) ?? [];
    const english = found.find((c) => c.language === "Inglese");
    if (english === undefined) {
      skipped.push({
        slug: p.slug,
        reason:
          found.length === 0 ? "no MUR row for this course" : "not listed as English by the MUR",
      });
      continue;
    }
    if (p.officialUrl === null) {
      skipped.push({
        slug: p.slug,
        reason: "the programme has no verified page to tie the row to",
      });
      continue;
    }
    const quote = murLanguageQuote(english);
    if (quote === null) {
      skipped.push({ slug: p.slug, reason: "the MUR row is not plain ASCII: it cannot be quoted" });
      continue;
    }
    proposals.push({
      slug: p.slug,
      programmePage: p.officialUrl,
      facts: {
        teachingLanguages: { value: ["en"], evidence: [{ url: input.offerUrl, quote }] },
      },
      notes: `Teaching language from the MUR offer file (Italian ministry, open data, ${latest}/${String(latest + 1).slice(2)} academic year): the course is listed as "Inglese".`,
    });
  }
  return { proposals, skipped };
}

type Yaml = Record<string, unknown>;
const OUT_DIR = path.join(STAGING_DIR, "proposals-it-language");

async function promotedProgrammes(): Promise<LanguageProgramme[]> {
  const dir = path.join(DATA_DIR, "programs");
  const out: LanguageProgramme[] = [];
  for (const file of (await readdir(dir)).sort()) {
    if (!file.startsWith("it-") || !file.endsWith(".yaml")) continue;
    const data = parse(await readFile(path.join(dir, file), "utf8")) as Yaml;
    const language = (data.teachingLanguages ?? {}) as Yaml;
    out.push({
      slug: String(data.slug),
      institution: String(data.institution),
      name: String(data.name),
      officialUrl: typeof data.officialUrl === "string" ? data.officialUrl : null,
      hasLanguage: Array.isArray(language.value) && language.value.length > 0,
    });
  }
  return out;
}

async function main(argv: readonly string[]): Promise<void> {
  const dryRun = argv.includes("--dry-run");
  const offer = await fetchText(OFFER_URL, { accept: "text/csv", encoding: "windows-1252" });
  const atenei = await fetchText(ATENEI_URL, { accept: "text/csv" });
  const programmes = await promotedProgrammes();
  const { proposals, skipped } = buildLanguageProposals({
    programmes,
    courses: parseMurOffer(offer),
    atenei: parseAtenei(atenei),
    offerUrl: OFFER_URL,
  });
  console.log(
    `${programmes.filter((p) => !p.hasLanguage).length} Italian programmes have no teaching language: ${proposals.length} proposal(s), ${skipped.length} skipped`,
  );
  for (const s of skipped) console.log(`  skipped ${s.slug}: ${s.reason}`);
  if (dryRun) {
    console.log("dry run: nothing written");
    return;
  }
  await mkdir(OUT_DIR, { recursive: true });
  for (const p of proposals) {
    await writeFile(path.join(OUT_DIR, `${p.slug}.json`), `${JSON.stringify(p, null, 2)}\n`);
  }
  console.log(`-> ${OUT_DIR}`);
}

if (process.argv[1]?.endsWith("it-language.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
