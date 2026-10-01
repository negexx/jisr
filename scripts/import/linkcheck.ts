import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { pageText, programmeNameMatches } from "./evidence";
import { appendLedger, DATA_DIR, parseCsv, STAGING_DIR, stageFile, toYaml } from "./staging";

// Automated check for the register-listing tier: every listed programme's official page must load and
// mention the programme's name. It is how thousands of records are tested without anyone reading
// them: the check is cheap, repeatable (run it again to catch pages that moved) and objective.
type Row = {
  slug: string;
  url: string;
  name: string;
  result: "ok" | "name-missing" | "unreachable";
};

async function listed(dataDir: string): Promise<{ slug: string; url: string; name: string }[]> {
  const dir = path.join(dataDir, "programs");
  if (!existsSync(dir)) return [];
  const out: { slug: string; url: string; name: string }[] = [];
  for (const file of (await readdir(dir)).sort()) {
    if (!file.endsWith(".yaml")) continue;
    const record: unknown = parse(await readFile(path.join(dir, file), "utf8"));
    if (typeof record !== "object" || record === null) continue;
    const r = record as { slug?: unknown; name?: unknown; officialUrl?: unknown };
    if (
      typeof r.slug === "string" &&
      typeof r.name === "string" &&
      typeof r.officialUrl === "string"
    )
      out.push({ slug: r.slug, name: r.name, url: r.officialUrl });
  }
  return out;
}

// Programmes whose ledger row says register-listing (the tier this check is for).
async function listingSlugs(stagingDir: string): Promise<Set<string>> {
  const file = path.join(stagingDir, "PROMOTED.csv");
  if (!existsSync(file)) return new Set();
  const slugs = new Set<string>();
  for (const line of (await readFile(file, "utf8")).split("\n").slice(1)) {
    const [collection, , slug, , level] = line.split(",");
    if (collection === "programs" && level === "register-listing" && slug !== undefined)
      slugs.add(slug);
  }
  return slugs;
}

export function pickSample<T>(items: readonly T[], size: number, seed: number): T[] {
  // deterministic shuffle (mulberry32) so a sample can be re-run
  const out = [...items];
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out.slice(0, size);
}

// The inverse of the promotion's date stamp: a demoted record is unverified again.
function clearDates(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clearDates);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, k === "last_verified_at" ? null : clearDates(v)]),
  );
}

// A listed programme whose official page no longer shows its name goes back to staging with the
// reason, and the ledger gets a `demoted` row: it is not listed again until someone looks at it.
export async function demote(slugs: readonly string[], date: string): Promise<number> {
  const ledger = parseCsv(await readFile(path.join(STAGING_DIR, "PROMOTED.csv"), "utf8"));
  let moved = 0;
  for (const slug of slugs) {
    const from = path.join(DATA_DIR, "programs", `${slug}.yaml`);
    const row = ledger.find((r) => r.collection === "programs" && r.slug === slug);
    if (!existsSync(from) || row === undefined) continue;
    const record = clearDates(parse(await readFile(from, "utf8"))) as Record<string, unknown>;
    const to = stageFile("programs", slug, STAGING_DIR);
    await mkdir(path.dirname(to), { recursive: true });
    await writeFile(
      to,
      toYaml({
        ...record,
        _review: {
          kind: "programs",
          slug,
          name: String(record.name ?? slug),
          sourceId: row.sourceId,
          confidence: "high",
          todo: `demoted ${date}: the official page does not show the programme's name (data:linkcheck); look at the page before listing it again`,
        },
      }),
    );
    await rm(from);
    await appendLedger(
      [
        {
          collection: "programs",
          sourceId: row.sourceId ?? "",
          slug,
          date,
          level: "demoted",
          batch: "linkcheck",
        },
      ],
      STAGING_DIR,
    );
    moved++;
  }
  return moved;
}

async function main(argv: readonly string[]): Promise<void> {
  const sampleAt = argv.indexOf("--sample");
  const sample = sampleAt === -1 ? null : Number(argv[sampleAt + 1]);
  const slugs = await listingSlugs(STAGING_DIR);
  const all = (await listed(DATA_DIR)).filter((p) => slugs.has(p.slug));
  const todo = sample === null ? all : pickSample(all, sample, 20261001);
  const rows: Row[] = new Array(todo.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < todo.length) {
        const index = next++;
        const p = todo[index];
        if (p === undefined) continue;
        let result: Row["result"];
        try {
          result = programmeNameMatches(p.name, await pageText(p.url)) ? "ok" : "name-missing";
        } catch {
          result = "unreachable";
        }
        rows[index] = { slug: p.slug, url: p.url, name: p.name, result };
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }),
  );
  const count = (r: Row["result"]) => rows.filter((x) => x.result === r).length;
  console.log(
    `link check of ${rows.length} of ${all.length} listed programmes: ok ${count("ok")}, name missing ${count("name-missing")}, unreachable ${count("unreachable")}`,
  );
  const bad = rows.filter((r) => r.result !== "ok");
  const csv = [
    "slug,result,name,url",
    ...bad.map((r) => [r.slug, r.result, JSON.stringify(r.name), r.url].join(",")),
  ];
  await writeFile(path.join(STAGING_DIR, "LINKCHECK.csv"), `${csv.join("\n")}\n`);
  for (const r of bad.slice(0, 15)) console.log(`  ${r.result}: ${r.slug}`);
  if (argv.includes("--demote")) {
    const moved = await demote(
      bad.filter((r) => r.result === "name-missing").map((r) => r.slug),
      new Date().toISOString().slice(0, 10),
    );
    console.log(`demoted ${moved} programme(s) back to staging`);
  }
}

if (process.argv[1]?.endsWith("linkcheck.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
