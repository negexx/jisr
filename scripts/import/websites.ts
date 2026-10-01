import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { pageText, programmeNameMatches } from "./evidence";
import { importFrance } from "./sources/parcoursup";
import { appendLedger, DATA_DIR, parseCsv, STAGING_DIR, toYaml } from "./staging";

// A listed institution without a website leaves a student no way to reach the university. The
// importer found candidates (ONISEP, ESR through a former code, a parent university, Wikidata) that
// were not confirmed by the ministry's own register. This command lists such a candidate only if the
// page itself loads and mentions the institution's name, and then marks the institution `guidance`
// ("found, not confirmed by the register") instead of `official`.
type Rec = Record<string, unknown>;

export function setCandidateWebsite(record: Rec, website: string, date: string): Rec {
  const sources = (record.sources ?? {}) as Record<
    string,
    { url?: string; last_verified_at?: string | null }
  >;
  return {
    ...record,
    website,
    info_kind: "guidance",
    sources: Object.fromEntries(
      Object.entries(sources).map(([k, v]) => [
        k,
        { ...v, last_verified_at: v.last_verified_at ?? date },
      ]),
    ),
  };
}

async function main(argv: readonly string[]): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const dry = argv.includes("--dry-run");
  const candidates = new Map<string, string>();
  for (const r of await importFrance()) {
    if (r.collection !== "institutions") continue;
    const site = (r.data as Rec).website;
    if (typeof site === "string" && site.startsWith("https://")) candidates.set(r.id, site);
  }
  const ledger = parseCsv(await readFile(path.join(STAGING_DIR, "PROMOTED.csv"), "utf8"));
  const dir = path.join(DATA_DIR, "institutions");
  const rows: string[] = ["slug,candidate,result"];
  const ledgerRows = [];
  let added = 0;
  let tried = 0;
  const todo: { file: string; record: Rec; site: string }[] = [];
  for (const name of (await readdir(dir)).sort()) {
    if (!name.endsWith(".yaml")) continue;
    const file = path.join(dir, name);
    const record = parse(await readFile(file, "utf8")) as Rec;
    const site = candidates.get(String(record.slug));
    if (record.website === null && site !== undefined) todo.push({ file, record, site });
  }
  let next = 0;
  const results: string[] = new Array(todo.length);
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < todo.length) {
        const index = next++;
        const item = todo[index];
        if (item === undefined) continue;
        tried++;
        let result = "unreachable";
        try {
          const text = await pageText(item.site);
          result = programmeNameMatches(String(item.record.name), text) ? "ok" : "name-missing";
        } catch {
          // stays unreachable
        }
        results[index] = result;
        await new Promise((r) => setTimeout(r, 150));
      }
    }),
  );
  for (const [i, item] of todo.entries()) {
    const result = results[i] ?? "unreachable";
    rows.push(`${item.record.slug},${item.site},${result}`);
    if (result !== "ok") continue;
    added++;
    if (dry) continue;
    await writeFile(item.file, toYaml(setCandidateWebsite(item.record, item.site, date)));
    const row = ledger.find((r) => r.collection === "institutions" && r.slug === item.record.slug);
    if (row?.sourceId !== undefined)
      ledgerRows.push({
        collection: "institutions",
        sourceId: row.sourceId,
        slug: String(item.record.slug),
        date,
        level: "register-listing" as const,
        batch: `websites-${date}`,
      });
  }
  if (!dry) {
    await appendLedger(ledgerRows, STAGING_DIR);
    await writeFile(path.join(STAGING_DIR, "WEBSITES.csv"), `${rows.join("\n")}\n`);
  }
  console.log(
    `${dry ? "would add" : "added"} ${added} of ${tried} candidate website(s) (page loads and names the institution); the rest stay without a website`,
  );
}

if (process.argv[1]?.endsWith("websites.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
