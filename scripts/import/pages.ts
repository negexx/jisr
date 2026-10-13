import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { discover, discoverBySearch, discoverFromRegister, registrable } from "./discover";
import { PAGES } from "./enrich-fr";
import { fetchText } from "./http";
import { flagValue, loadMeta, pool } from "./reader";
import {
  makeProvider,
  QueryBudget,
  SearchBudgetExceeded,
  type SearchHit,
  withCache,
} from "./search";
import { parseSfDetail, studyFinderPage } from "./sources/studyfinder";
import { DATA_DIR, STAGING_DIR, stageFile } from "./staging";
import { discoverTopicPages, mergeTopicPages, parseTopicList, TOPICS, type Topic } from "./topics";

// Builds the pages file that data:read takes: for each programme, which pages to read.
//   Germany: the DAAD register page, the programme's own page it links and the fee/application pages.
//   France:  the Parcoursup fiche of the record, plus the shared Campus France pages.
//   Netherlands: no register page per programme: with --search a web search restricted to the
//                institution's site (a key in SERPER_API_KEY or BRAVE_API_KEY), else a weak homepage crawl.
//   --topics adds, per institution, the pages found by four topic searches (fees, language, deadline,
//   documents; PDFs allowed) to every programme's pages; it needs the same key as --search.
//   --topic-list <a,b> limits --topics to a subset of fees,language,deadline,documents (default all).
// Usage: data:pages --slugs <file> [--out <file>] [--concurrency 4] [--search] [--topics] [--topic-list <a,b>] [--max-queries 300] [--dry-run]
const DAAD_DETAIL =
  "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail";

// The Study Finder programme page of a Hungarian slug ("...-sf116").
export function studyFinderRegisterUrl(slug: string): string | null {
  const id = /-sf([0-9]+)$/.exec(slug)?.[1];
  return id === undefined ? null : studyFinderPage(Number(id));
}

export function daadRegisterUrl(slug: string): string | null {
  const id = /daad([0-9]+)$/.exec(slug)?.[1];
  return id === undefined ? null : `${DAAD_DETAIL}/${id}/`;
}

// --topic-list only narrows the --topics pass; given alone it would silently do nothing.
export function checkTopicFlags(argv: readonly string[]): void {
  if (argv.includes("--topic-list") && !argv.includes("--topics"))
    throw new Error("--topic-list needs --topics: it only narrows the topic search");
}

export function dryRunSummary(input: {
  useSearch: boolean;
  useTopics: boolean;
  searched: number;
  institutions: number;
  topicInstitutions: number;
  // topics searched per institution, default all four
  topicCount?: number;
  cap: string;
}): string {
  const topicQueries = `at most ${input.topicInstitutions * (input.topicCount ?? TOPICS.length)} topic queries`;
  // upper bound: one programme query each, two institution-level queries per institution
  const body = input.useSearch
    ? `${input.searched} programmes need a search; at most ${input.searched + 2 * input.institutions} queries (cap ${input.cap})${input.useTopics ? `; plus ${topicQueries}` : ""}`
    : `${topicQueries} (cap ${input.cap})`;
  return `dry run: ${body}; no query sent, nothing written`;
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

// A programme's curated officialUrl is its own page: it leads the pages the reader reads, so a
// country with no register page and no institution website (Spain's RUCT lists none) is still read.
// Strictly additive: the found pages follow, once each.
export function seedOfficialUrl(officialUrl: unknown, pages: readonly string[]): string[] {
  if (typeof officialUrl !== "string" || officialUrl.length === 0) return [...pages];
  return [...new Set([officialUrl, ...pages])];
}

// One fetch per url for the whole run: the programmes of one institution share its fee pages. A
// failed fetch is forgotten, so a later programme can try again.
export function memoizeFetch(
  fetch: (url: string) => Promise<string>,
): (url: string) => Promise<string> {
  const known = new Map<string, Promise<string>>();
  return (url) => {
    const cached = known.get(url);
    if (cached !== undefined) return cached;
    const pending = fetch(url);
    known.set(url, pending);
    pending.catch(() => known.delete(url));
    return pending;
  };
}

// One programme's topic pages. A search that fails (a provider hiccup) costs that programme its
// topic pages, not the whole run: its existing pages stay. Only the budget error stops the run.
export async function addTopicPagesFor(
  programmes: Record<string, string[]>,
  slug: string,
  find: () => Promise<Record<Topic, readonly string[]>>,
  log: (line: string) => void,
): Promise<"added" | "failed"> {
  try {
    programmes[slug] = mergeTopicPages(programmes[slug] ?? [], await find());
    return "added";
  } catch (error) {
    if (error instanceof SearchBudgetExceeded) throw error;
    log(`topic search failed for ${slug}: ${error instanceof Error ? error.message : error}`);
    return "failed";
  }
}

// The slugs skipped for lack of an institution website go next to the pages file. A listing left by
// an earlier run is removed when nothing is skipped now, so it never reports stale slugs.
export async function syncSkippedListing(
  listing: string,
  slugs: readonly string[],
): Promise<string | null> {
  if (slugs.length === 0) {
    await rm(listing, { force: true });
    return null;
  }
  await writeFile(listing, `${slugs.join("\n")}\n`);
  return listing;
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
  const flag = (name: string) => flagValue(argv, name);
  const slugsFile = flag("slugs");
  if (slugsFile === undefined) throw new Error("usage: data:pages --slugs <file> [--out <file>]");
  const slugs = (await readFile(slugsFile, "utf8"))
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = flag("out") ?? path.join(STAGING_DIR, "pages.json");
  const useSearch = argv.includes("--search");
  const useTopics = argv.includes("--topics");
  checkTopicFlags(argv);
  const topics = parseTopicList(flag("topic-list"));
  const dryRun = argv.includes("--dry-run");
  const base = makeProvider();
  if ((useSearch || useTopics) && !dryRun && base === null)
    throw new Error(
      "--search and --topics need a key: set SERPER_API_KEY or BRAVE_API_KEY in .env.local",
    );
  const search =
    base === null ? null : withCache(base, base.cacheable === true ? ".cache/search" : null);
  const budget = new QueryBudget(Number(flag("max-queries") ?? 300));
  const memo = new Map<string, Promise<SearchHit[]>>();
  const fetchHtml = memoizeFetch((u) =>
    fetchText(u, { accept: "text/html,application/xhtml+xml" }),
  );
  let searched = 0;
  const institutions = new Set<string>();
  const topicSites = new Set<string>();
  const noWebsite: string[] = [];
  let topicFailures = 0;
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
      const studyFinder = studyFinderRegisterUrl(slug);
      const register = daadRegisterUrl(slug) ?? studyFinder;
      if (register !== null) {
        const found = await discoverFromRegister({
          registerUrl: register,
          name: meta.name,
          ...(studyFinder === null
            ? {}
            : { programmeLink: (html: string) => parseSfDetail(html, 0).contactWebsite }),
        });
        if (found.programme !== null) stat.programme++;
        if (found.fees.length > 0) stat.fees++;
        if (found.admission.length > 0) stat.admission++;
        programmes[slug] = seedOfficialUrl(record.officialUrl, mergePages({ register, ...found }));
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
        programmes[slug] = seedOfficialUrl(
          record.officialUrl,
          mergePages({
            register: country === "FR" && typeof fiche === "string" ? fiche : null,
            ...found,
          }),
        );
        return;
      }
      if (country === "FR" && typeof fiche === "string") {
        stat.programme++;
        programmes[slug] = seedOfficialUrl(record.officialUrl, [fiche]);
        return;
      }
      if (website === null) {
        programmes[slug] = seedOfficialUrl(record.officialUrl, []);
        return;
      }
      const found = await discover({ website, name: meta.name });
      if (found.programme !== null) stat.programme++;
      if (found.fees.length > 0) stat.fees++;
      if (found.admission.length > 0) stat.admission++;
      programmes[slug] = seedOfficialUrl(
        record.officialUrl,
        mergePages({ register: null, ...found }),
      );
    });
    if (useTopics) {
      await pool(slugs, Number(flag("concurrency") ?? 4), async (slug) => {
        const meta = await loadMeta(slug);
        const record = await recordOf(slug);
        if (meta === null || record === null) return;
        const website = await websiteOf(String(record.institution ?? ""));
        if (website === null) {
          noWebsite.push(slug);
          return;
        }
        topicSites.add(registrable(website));
        if (dryRun || search === null) return;
        const outcome = await addTopicPagesFor(
          programmes,
          slug,
          () =>
            discoverTopicPages({
              country: meta.country,
              website,
              search,
              budget,
              memo,
              topics,
              fetchHtml,
            }),
          console.error,
        );
        if (outcome === "failed") topicFailures++;
      });
    }
  } catch (error) {
    if (!(error instanceof SearchBudgetExceeded)) throw error;
    stopped = error.message;
  }
  if (dryRun && (useSearch || useTopics)) {
    console.log(
      dryRunSummary({
        useSearch,
        useTopics,
        searched,
        institutions: institutions.size,
        topicInstitutions: topicSites.size,
        topicCount: topics.length,
        cap: flag("max-queries") ?? "300",
      }),
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
  if (useSearch || useTopics)
    console.log(`search queries used: ${budget.used} (${base?.name ?? "none"})`);
  if (useTopics) {
    console.log(`topic searches failed: ${topicFailures} programmes kept their existing pages`);
    console.log(`no institution website: ${noWebsite.length} programmes skipped`);
    const listed = await syncSkippedListing(`${out}.skipped.txt`, noWebsite);
    if (listed !== null) console.log(`   slugs -> ${listed}`);
  }
  if (stopped !== null) console.log(`STOPPED: ${stopped} (partial pages file written)`);
  console.log(`-> ${out}`);
}

if (process.argv[1]?.endsWith("pages.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
