import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { registrable, sameSite } from "./discover";
import { distinctiveTokens, pageText, quoteNames, wholeWord } from "./evidence";

export { quoteNames };

import { DATA_DIR, STAGING_DIR, stageFile } from "./staging";

// Institution proposals for institutions that have programmes but no verified website yet (a
// programme promoted before its institution): the website is the home page of the domain the
// institution's own programme pages are on, and the quote is a verbatim stretch of that home page
// around the institution's distinctive word. The same verifier as for the pilot institutions
// (verifyInstitution) re-fetches the page and checks the quote and that the page names the
// institution. The type (public/private) is not proposed: nothing quotable states it.
// Usage: data:inst-proposals --slugs <file> --pages <pages.json>[,<more.json>] [--dry-run]
const NOT_AN_INSTITUTION = [
  "daad.de",
  "parcoursup.fr",
  "campusfrance.org",
  "uni-assist.de",
  "studielink.nl",
  "duo.nl",
  "study-in-germany.de",
  "studiekeuze123.nl",
];

export function websiteFrom(urls: readonly string[]): string | null {
  const counts = new Map<string, { n: number; first: string }>();
  for (const url of urls) {
    let domain: string;
    try {
      domain = registrable(url);
    } catch {
      continue;
    }
    if (NOT_AN_INSTITUTION.includes(domain)) continue;
    const seen = counts.get(domain);
    if (seen === undefined) counts.set(domain, { n: 1, first: url });
    else seen.n++;
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  return best === undefined ? null : `${new URL(best.first).origin}/`;
}

const TYPE_WORD = /hogeschool|universit|hochschule|college|school|institut|ecole|école/i;
const NEWSY =
  /trauert|\bnews\b|nieuws|aktuell|\bpress\b|persbericht|\bevents?\b|agenda|sponsor|wint |award|prijs|actualit/i;

// The best quote on one page and how good it looks (0-3), or null when the page does not name it.
function scoredQuote(name: string, text: string): { quote: string; score: number } | null {
  const tokens = distinctiveTokens(name);
  const lower = text.toLowerCase();
  for (const token of tokens) {
    // every mention of the brand word; the best-looking one becomes the quote
    const pattern = wholeWord(token, "gu");
    let best: { quote: string; score: number } | null = null;
    for (const match of lower.matchAll(pattern)) {
      const at = match.index ?? 0;
      let start = Math.max(0, at - 20);
      let end = Math.min(text.length, at + token.length + 60);
      if (start > 0) {
        const space = text.indexOf(" ", start);
        if (space !== -1 && space < at) start = space + 1;
      }
      if (end < text.length) {
        const space = text.lastIndexOf(" ", end);
        if (space > at + token.length) end = space;
      }
      const quote = text.slice(start, end).trim();
      if (quote.length < 15) continue;
      // a line that says what the institution is, near the top, and is not a news item
      const score =
        (TYPE_WORD.test(quote) ? 2 : 0) + (at < 400 ? 1 : 0) - (NEWSY.test(quote) ? 3 : 0);
      if (best === null || score > best.score) best = { quote, score };
    }
    if (best !== null) return best;
  }
  return null;
}

export function quoteFor(name: string, text: string): string | null {
  return scoredQuote(name, text)?.quote ?? null;
}

// The best quote across the institution's pages (the home page first), with the url it is on. A good
// quote ends the search; a news headline on the home page does not.
export function pickQuote(
  name: string,
  pages: readonly { url: string; text: string }[],
): { url: string; quote: string } | null {
  let best: { url: string; quote: string; score: number } | null = null;
  for (const page of pages) {
    const found = scoredQuote(name, page.text);
    if (found === null) continue;
    if (best === null || found.score > best.score) best = { url: page.url, ...found };
    if (best.score >= 3) break;
  }
  return best === null ? null : { url: best.url, quote: best.quote };
}

type Yaml = Record<string, unknown>;

async function readYaml(file: string): Promise<Yaml | null> {
  if (!existsSync(file)) return null;
  const parsed: unknown = parse(await readFile(file, "utf8"));
  return typeof parsed === "object" && parsed !== null ? (parsed as Yaml) : null;
}

async function main(argv: readonly string[]): Promise<void> {
  const flag = (name: string) => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 ? undefined : argv[at + 1];
  };
  const slugsFile = flag("slugs");
  const pagesFiles = flag("pages")?.split(",");
  if (slugsFile === undefined || pagesFiles === undefined)
    throw new Error("usage: data:inst-proposals --slugs <file> --pages <pages.json>[,more]");
  const wanted = new Set(
    (await readFile(slugsFile, "utf8"))
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const dryRun = argv.includes("--dry-run");
  const pagesBySlug: Record<string, string[]> = {};
  for (const file of pagesFiles) {
    const config = JSON.parse(await readFile(file, "utf8")) as {
      programmes: Record<string, string[]>;
    };
    Object.assign(pagesBySlug, config.programmes);
  }
  // institution slug -> the pages of its programmes (data/ and staging)
  const urls = new Map<string, string[]>();
  for (const dir of [path.join(DATA_DIR, "programs"), path.join(STAGING_DIR, "programs")]) {
    if (!existsSync(dir)) continue;
    for (const name of await readdir(dir)) {
      const slug = name.replace(/\.yaml$/, "");
      const pages = pagesBySlug[slug];
      if (pages === undefined) continue;
      const record = await readYaml(path.join(dir, name));
      const institution = String(record?.institution ?? "");
      if (wanted.has(institution))
        urls.set(institution, [...(urls.get(institution) ?? []), ...pages]);
    }
  }
  const outDir = path.join(STAGING_DIR, "proposals", "institutions");
  await mkdir(outDir, { recursive: true });
  const skipped: string[] = [];
  let written = 0;
  for (const slug of [...wanted].sort()) {
    const staged = await readYaml(stageFile("institutions", slug));
    const website = websiteFrom(urls.get(slug) ?? []);
    if (staged === null || website === null) {
      skipped.push(
        `${slug}: ${staged === null ? "no staged record" : "no institution page known"}`,
      );
      continue;
    }
    // the home page, then up to four of the institution's own programme pages
    const candidates = [
      website,
      ...[...new Set(urls.get(slug) ?? [])]
        .filter((u) => u !== website && sameSite(u, website))
        .slice(0, 4),
    ];
    const pages: { url: string; text: string }[] = [];
    for (const url of candidates) {
      try {
        pages.push({ url, text: await pageText(url) });
      } catch {
        // an unreachable page just offers no quote
      }
    }
    if (pages.length === 0 || pages[0]?.url !== website) {
      skipped.push(`${slug}: ${website} could not be fetched`);
      continue;
    }
    const picked = pickQuote(String(staged.name ?? ""), pages);
    if (picked === null) {
      skipped.push(`${slug}: ${website} does not name "${String(staged.name)}"`);
      continue;
    }
    if (!dryRun)
      await writeFile(
        path.join(outDir, `${slug}.json`),
        `${JSON.stringify({ slug, website, evidence: [{ url: picked.url, quote: picked.quote }] }, null, 2)}\n`,
      );
    written++;
  }
  console.log(
    `${dryRun ? "would write" : "wrote"} ${written} proposal(s); ${skipped.length} skipped`,
  );
  for (const s of skipped) console.log(`  skipped ${s}`);
}

if (process.argv[1]?.endsWith("inst-proposals.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
