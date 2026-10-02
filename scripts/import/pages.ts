import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { discover, discoverBySearch, discoverFromRegister } from "./discover";
import { PAGES } from "./enrich-fr";
import { loadMeta, pool } from "./reader";
import {
  makeProvider,
  QueryBudget,
  SearchBudgetExceeded,
  type SearchHit,
  withCache,
} from "./search";
import { DATA_DIR, STAGING_DIR, stageFile } from "./staging";

// Builds the pages file that data:read takes: for each programme, which pages to read.
//   Germany: the DAAD register page, the programme's own page it links and the fee/application pages.
//   France:  the Parcoursup fiche of the record, plus the shared Campus France pages.
//   Netherlands: no register page per programme: with --search a web search restricted to the
//                institution's site (a key in SERPER_API_KEY or BRAVE_API_KEY), else a weak homepage crawl.
// Usage: data:pages --slugs <file> [--out <file>] [--concurrency 4] [--search] [--max-queries 300] [--dry-run]
const DAAD_DETAIL =
  "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail";

export function daadRegisterUrl(slug: string): string | null {
  const id = /daad([0-9]+)$/.exec(slug)?.[1];
  return id === undefined ? null : `${DAAD_DETAIL}/${id}/`;
}

export function mergePages(found: {
  register: string | null;
  programme: string | null;
  fees: readonly string[];
  admission: readonly string[];
}): string[] {
  return [
    ...new Set(
      [found.register, found.programme, ...found.fees, ...found.admission].filter(
        (u): u is string => u !== null,
      ),
    ),
  ];
}

type Yaml = Record<string, unknown>;

async function readYaml(file: string): Promise<Yaml | null> {
  if (!existsSync(file)) return null;
  const parsed: unknown = parse(await readFile(file, "utf8"));
  return typeof parsed === "object" && parsed !== null ? (parsed as Yaml) : null;
}

const SHARED_FR = [PAGES.fees, PAGES.certification, PAGES.applyLicence, PAGES.applyBut];

async function recordOf(slug: string): Promise<Yaml | null> {
  return (
    (await readYaml(stageFile("programs", slug))) ??
    (await readYaml(path.join(DATA_DIR, "programs", `${slug}.yaml`)))
  );
}

async function websiteOf(institution: string): Promise<string | null> {
  const record =
    (await readYaml(stageFile("institutions", institution))) ??
    (await readYaml(path.join(DATA_DIR, "institutions", `${institution}.yaml`)));
  const site = record?.website;
  return typeof site === "string" && site.startsWith("https://") ? site : null;
}

async function main(argv: readonly string[]): Promise<void> {
  const flag = (name: string) => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 ? undefined : argv[at + 1];
  };
  const slugsFile = flag("slugs");
  if (slugsFile === undefined) throw new Error("usage: data:pages --slugs <file> [--out <file>]");
  const slugs = (await readFile(slugsFile, "utf8"))
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = flag("out") ?? path.join(STAGING_DIR, "pages.json");
  const useSearch = argv.includes("--search");
  const dryRun = argv.includes("--dry-run");
  const base = makeProvider();
  if (useSearch && !dryRun && base === null)
    throw new Error("--search needs a key: set SERPER_API_KEY or BRAVE_API_KEY in .env.local");
  const search =
    base === null ? null : withCache(base, base.cacheable === true ? ".cache/search" : null);
  const budget = new QueryBudget(Number(flag("max-queries") ?? 300));
  const memo = new Map<string, Promise<SearchHit[]>>();
  let searched = 0;
  const institutions = new Set<string>();
  const programmes: Record<string, string[]> = {};
  const stats: Record<string, { n: number; programme: number; fees: number; admission: number }> =
    {};

  let stopped: string | null = null;
  try {
    await pool(slugs, Number(flag("concurrency") ?? 4), async (slug) => {
      const meta = await loadMeta(slug);
      const record = await recordOf(slug);
      if (meta === null || record === null) return;
      const country = meta.country;
      const stat = stats[country] ?? { n: 0, programme: 0, fees: 0, admission: 0 };
      stats[country] = stat;
      stat.n++;
      const register = daadRegisterUrl(slug);
      if (register !== null) {
        const found = await discoverFromRegister({ registerUrl: register, name: meta.name });
        if (found.programme !== null) stat.programme++;
        if (found.fees.length > 0) stat.fees++;
        if (found.admission.length > 0) stat.admission++;
        programmes[slug] = mergePages({ register, ...found });
        return;
      }
      const sources = (record.sources ?? {}) as Record<string, { url?: string }>;
      const fiche = sources.programme?.url;
      const website = await websiteOf(String(record.institution ?? ""));
      if (useSearch) {
        searched++;
        institutions.add(meta.institution);
        if (dryRun || search === null) return;
        const found = await discoverBySearch({
          name: meta.name,
          institution: meta.institution,
          country,
          website,
          search,
          budget,
          memo,
        });
        if (found.programme !== null) stat.programme++;
        if (found.fees.length > 0) stat.fees++;
        if (found.admission.length > 0) stat.admission++;
        // the Parcoursup fiche stays the first page of a French programme
        programmes[slug] = mergePages({
          register: country === "FR" && typeof fiche === "string" ? fiche : null,
          ...found,
        });
        return;
      }
      if (country === "FR" && typeof fiche === "string") {
        stat.programme++;
        programmes[slug] = [fiche];
        return;
      }
      if (website === null) {
        programmes[slug] = [];
        return;
      }
      const found = await discover({ website, name: meta.name });
      if (found.programme !== null) stat.programme++;
      if (found.fees.length > 0) stat.fees++;
      if (found.admission.length > 0) stat.admission++;
      programmes[slug] = mergePages({ register: null, ...found });
    });
  } catch (error) {
    if (!(error instanceof SearchBudgetExceeded)) throw error;
    stopped = error.message;
  }
  if (dryRun && useSearch) {
    // upper bound: one programme query each, two institution-level queries per institution
    console.log(
      `dry run: ${searched} programmes need a search; at most ${searched + 2 * institutions.size} queries (cap ${flag("max-queries") ?? 300}); no query sent, nothing written`,
    );
    return;
  }
  if (dryRun) {
    console.log("dry run: nothing written");
    return;
  }

  await writeFile(out, `${JSON.stringify({ shared: { FR: SHARED_FR }, programmes }, null, 2)}\n`);
  for (const [country, s] of Object.entries(stats))
    console.log(
      `${country}: ${s.n} programmes; programme page ${s.programme}, fee page ${s.fees}, admission page ${s.admission}`,
    );
  if (useSearch) console.log(`search queries used: ${budget.used} (${base?.name ?? "none"})`);
  if (stopped !== null) console.log(`STOPPED: ${stopped} (partial pages file written)`);
  console.log(`-> ${out}`);
}

if (process.argv[1]?.endsWith("pages.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
