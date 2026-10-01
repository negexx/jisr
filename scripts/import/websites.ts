import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { pageText, programmeNameMatches } from "./evidence";
import { importFrance } from "./sources/parcoursup";
import { appendLedger, DATA_DIR, type LedgerRow, parseCsv, STAGING_DIR, toYaml } from "./staging";

// A listed institution without a website leaves a student no way to reach the university. The
// importer found candidates (ONISEP, a parent university in the ministry's register, Wikidata, ESR
// through a former code) that the register did not confirm for this exact unit. A candidate is listed
// only if its page loads and passes the rule below, and the institution is then marked `guidance`
// ("found, not confirmed by the register") instead of `official`. Re-running the command re-checks
// the websites it added earlier and removes the ones that no longer pass.
type Rec = Record<string, unknown>;
type Candidate = { site: string; fromParent: boolean };

// A parent university from the ministry's register only has to load (the unit has no site of its
// own). Any other candidate must show the institution's name in the page title: that is what
// separates an institution's own site from a third-party page that merely mentions it.
export function passes(candidate: Candidate, institutionName: string, text: string): boolean {
  return candidate.fromParent || programmeNameMatches(institutionName, text.slice(0, 120));
}

export function withWebsite(record: Rec, website: string, date: string): Rec {
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

export function withoutWebsite(record: Rec): Rec {
  return { ...record, website: null, info_kind: "official" };
}

async function main(argv: readonly string[]): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const dry = argv.includes("--dry-run");
  const candidates = new Map<string, Candidate>();
  for (const r of await importFrance()) {
    if (r.collection !== "institutions") continue;
    const site = (r.data as Rec).website;
    if (typeof site !== "string" || !site.startsWith("https://")) continue;
    candidates.set(r.id, {
      site,
      fromParent: /parent university/.test(String(r.review.todo ?? "")),
    });
  }
  const ledger = parseCsv(await readFile(path.join(STAGING_DIR, "PROMOTED.csv"), "utf8"));
  const dir = path.join(DATA_DIR, "institutions");

  // Institutions without a website, and the ones this command filled in earlier (to re-check them).
  const todo: { file: string; record: Rec; candidate: Candidate; had: boolean }[] = [];
  for (const name of (await readdir(dir)).sort()) {
    if (!name.endsWith(".yaml")) continue;
    const file = path.join(dir, name);
    const record = parse(await readFile(file, "utf8")) as Rec;
    const candidate = candidates.get(String(record.slug));
    if (candidate === undefined) continue;
    if (record.website === null) todo.push({ file, record, candidate, had: false });
    else if (record.info_kind === "guidance" && record.website === candidate.site)
      todo.push({ file, record, candidate, had: true });
  }

  const results: ("ok" | "name-missing" | "unreachable")[] = new Array(todo.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < todo.length) {
        const index = next++;
        const item = todo[index];
        if (item === undefined) continue;
        try {
          const text = await pageText(item.candidate.site);
          results[index] = passes(item.candidate, String(item.record.name), text)
            ? "ok"
            : "name-missing";
        } catch {
          results[index] = "unreachable";
        }
        await new Promise((r) => setTimeout(r, 150));
      }
    }),
  );

  const rows = ["slug,candidate,result"];
  const ledgerRows: LedgerRow[] = [];
  let listed = 0;
  let removed = 0;
  for (const [i, item] of todo.entries()) {
    const result = results[i] ?? "unreachable";
    rows.push(`${item.record.slug},${item.candidate.site},${result}`);
    const slug = String(item.record.slug);
    const row = ledger.find((r) => r.collection === "institutions" && r.slug === slug);
    const entry = (level: LedgerRow["level"]): LedgerRow | null =>
      row?.sourceId === undefined
        ? null
        : {
            collection: "institutions",
            sourceId: row.sourceId,
            slug,
            date,
            level,
            batch: `websites-${date}`,
          };
    if (result === "ok" && !item.had) {
      listed++;
      if (!dry) {
        await writeFile(item.file, toYaml(withWebsite(item.record, item.candidate.site, date)));
        const e = entry("register-listing");
        if (e !== null) ledgerRows.push(e);
      }
    } else if (result !== "ok" && item.had) {
      removed++;
      if (!dry) {
        await writeFile(item.file, toYaml(withoutWebsite(item.record)));
        const e = entry("demoted");
        if (e !== null) ledgerRows.push(e);
      }
    }
  }
  if (!dry) {
    await appendLedger(ledgerRows, STAGING_DIR);
    await writeFile(path.join(STAGING_DIR, "WEBSITES.csv"), `${rows.join("\n")}\n`);
  }
  console.log(
    `${dry ? "would list" : "listed"} ${listed} candidate website(s) and ${dry ? "would remove" : "removed"} ${removed} earlier one(s) that no longer pass (${todo.length} checked)`,
  );
}

if (process.argv[1]?.endsWith("websites.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
