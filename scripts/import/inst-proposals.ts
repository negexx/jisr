import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { registrable } from "./discover";
import { pageText } from "./evidence";
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

// Words that name a kind of institution, not a particular one.
const GENERIC = new Set(
  "hogeschool university universiteit universitat universität hochschule applied sciences science school college of the and for van de der die het en christelijke state management technik wirtschaft technology business studies international".split(
    " ",
  ),
);

export function quoteFor(name: string, text: string): string | null {
  const tokens = [
    ...new Set(
      name
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length >= 3 && !GENERIC.has(t)),
    ),
  ];
  // in the order of the name: the brand ("Fontys") comes before the town ("Tilburg")
  const lower = text.toLowerCase();
  for (const token of tokens) {
    const at = lower.search(new RegExp(`(?<![\\p{L}\\p{N}])${token}(?![\\p{L}\\p{N}])`, "u"));
    if (at === -1) continue;
    let start = Math.max(0, at - 20);
    let end = Math.min(text.length, at + token.length + 40);
    if (start > 0) {
      const space = text.indexOf(" ", start);
      if (space !== -1 && space < at) start = space + 1;
    }
    if (end < text.length) {
      const space = text.lastIndexOf(" ", end);
      if (space > at + token.length) end = space;
    }
    const quote = text.slice(start, end).trim();
    if (quote.length >= 15) return quote;
  }
  return null;
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
    let text: string;
    try {
      text = await pageText(website);
    } catch {
      skipped.push(`${slug}: ${website} could not be fetched`);
      continue;
    }
    const quote = quoteFor(String(staged.name ?? ""), text);
    if (quote === null) {
      skipped.push(`${slug}: ${website} does not name "${String(staged.name)}"`);
      continue;
    }
    if (!dryRun)
      await writeFile(
        path.join(outDir, `${slug}.json`),
        `${JSON.stringify({ slug, website, evidence: [{ url: website, quote }] }, null, 2)}\n`,
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
