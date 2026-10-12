import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { toMinor } from "./money";
import { STAGING_DIR } from "./staging";

// A researcher (e.g. Gemini Deep Research) returns one row per fact. This turns the rows into the
// pipeline's ProposalSchema JSON, keyed by our programme slug, so `data:evidence verify` can
// re-fetch every quote and decide. The researcher only proposes; code decides.
// Usage: data:research <rows.json> [--out <dir>]
export type ResearchRow = {
  slug: string;
  fact: string;
  value: string;
  unit: string;
  quote: string;
  sourceUrl: string;
  appliesToNonEu: boolean;
  readDate: string;
  confidence: string;
};

type Fact = { value: unknown; evidence: { url: string; quote: string }[] };
type Proposal = { slug: string; programmePage: string; facts: Record<string, Fact> };

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const evidence = (row: ResearchRow) => [{ url: row.sourceUrl, quote: row.quote }];

function tuition(row: ResearchRow): Fact | null {
  const currency = row.unit.match(/\b([A-Z]{3})\b/)?.[1];
  const period = /semester/i.test(row.unit)
    ? "semester"
    : /year|\ban\b|jahr|annuel/i.test(row.unit)
      ? "year"
      : null;
  const amount = Number(row.value.replace(/[^0-9.]/g, ""));
  if (currency === undefined || period === null || !Number.isFinite(amount) || amount <= 0)
    return null;
  return {
    value: { amountMinor: toMinor(amount, currency), currency, period },
    evidence: evidence(row),
  };
}

function intake(row: ResearchRow): Fact | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(row.value.trim()))
    return {
      value: [{ startDate: null, applicationOpens: null, applicationDeadline: row.value.trim() }],
      evidence: evidence(row),
    };
  const md = row.value.trim().match(/^(\d{1,2})\s+([A-Za-z]+)$/);
  if (md) {
    const word = md[2];
    if (word === undefined) return null;
    const month = MONTHS[word.toLowerCase()];
    const day = Number(md[1]);
    if (month !== undefined && day >= 1 && day <= 31)
      return {
        value: [
          {
            startDate: null,
            applicationOpens: null,
            applicationDeadline: null,
            recurringDeadline: { month, day },
          },
        ],
        evidence: evidence(row),
      };
  }
  return null;
}

function languages(row: ResearchRow): Fact | null {
  const codes = row.value
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z]{2}$/.test(s));
  return codes.length > 0 ? { value: codes, evidence: evidence(row) } : null;
}

export function rowsToProposals(rows: readonly ResearchRow[]): Record<string, Proposal> {
  const bySlug: Record<string, Proposal> = {};
  for (const row of rows) {
    if (row.value.trim() === "" || row.quote.trim() === "" || row.sourceUrl.trim() === "") continue;
    let fact: Fact | null = null;
    if (row.fact === "tuition") fact = tuition(row);
    else if (row.fact === "intakes" || row.fact === "deadline") fact = intake(row);
    else if (row.fact === "applicationChannel")
      fact = { value: row.value.trim(), evidence: evidence(row) };
    else if (row.fact === "teachingLanguages") fact = languages(row);
    else continue;
    if (fact === null) continue;
    const proposal = bySlug[row.slug] ?? {
      slug: row.slug,
      programmePage: row.sourceUrl,
      facts: {},
    };
    bySlug[row.slug] = proposal;
    proposal.facts[row.fact === "deadline" ? "intakes" : row.fact] = fact;
  }
  return bySlug;
}

function main(argv: readonly string[]): void {
  const file = argv.find((a) => !a.startsWith("--"));
  if (file === undefined) throw new Error("usage: data:research <rows.json> [--out <dir>]");
  const outAt = argv.indexOf("--out");
  const outDir =
    outAt === -1 ? path.join(STAGING_DIR, "proposals", "programs") : (argv[outAt + 1] ?? "");
  const rows = JSON.parse(readFileSync(file, "utf8")) as ResearchRow[];
  const proposals = rowsToProposals(rows);
  mkdirSync(outDir, { recursive: true });
  let written = 0;
  for (const [slug, proposal] of Object.entries(proposals)) {
    writeFileSync(path.join(outDir, `${slug}.json`), `${JSON.stringify(proposal, null, 2)}\n`);
    written += 1;
  }
  console.log(`wrote ${written} proposal(s) to ${outDir}`);
}

if (process.argv[1]?.endsWith("research-proposals.ts") === true) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
