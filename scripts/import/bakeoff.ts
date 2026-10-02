import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { crossCheck, type FactScore, scoreFacts } from "./bakeoff-score";
import { pageText } from "./evidence";
import { appendJsonl, Budget, BudgetExceeded, MODELS } from "./llm";
import type { AcceptedFact, FactName, Proposal } from "./proposals";
import { loadMeta, loadPages, type Page, pool, readProgramme } from "./reader";
import { STAGING_DIR } from "./staging";

// Bake-off of reading models on the pilot programmes. Every model is given exactly the pages the
// ground truth (the quote-verified pilot proposals) cites, so only reading quality is compared;
// finding the pages is a separate problem. Output: data-staging/bakeoff/<stamp>/ (per model proposals,
// calls.jsonl, results.json, report.md). Nothing here touches data/ or the real proposals.
//
// Usage: data:bakeoff [--models a,b,c] [--max-usd-per-model 0.5] [--concurrency 4] [--dry-run]
const DEFAULT_MODELS = [
  "mimo-v2.6-flash",
  "qwen3.8-flash",
  "hy3",
  "deepseek-v4.1-flash",
  "gpt-6-luna",
];

type Facts = Partial<Record<FactName, AcceptedFact>>;
type Row = {
  slug: string;
  error: string | null;
  dropped: string[];
  verified: Facts;
  rules: { kind: string }[];
  score: FactScore;
  usage: { input: number; cached: number; output: number } | null;
  costUsd: number;
  latencyMs: number | null;
  ttftMs: number | null;
};

// French programmes: the application channel comes from the route data, so the model is not asked.
function scoredFacts(slug: string, proposal: Proposal): Facts {
  const { applicationChannel, ...rest } = proposal.facts;
  return slug.startsWith("fr-") ? rest : proposal.facts;
}

const PROPOSALS = path.join(STAGING_DIR, "proposals", "programs");

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? null)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

const urlsOf = (p: Proposal): string[] => [
  ...(p.programmePage === null ? [] : [p.programmePage]),
  ...Object.values(p.facts).flatMap((f) => f.evidence.map((e) => e.url)),
  ...(p.requirements?.rules ?? []).flatMap((r) => r.evidence.map((e) => e.url)),
];

async function main(argv: readonly string[]): Promise<void> {
  const flag = (name: string) => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 ? undefined : argv[at + 1];
  };
  const models = (flag("models")?.split(",") ?? DEFAULT_MODELS).map((id) => {
    const spec = MODELS[id];
    if (spec === undefined) throw new Error(`unknown model ${id}`);
    return spec;
  });
  const maxUsd = Number(flag("max-usd-per-model") ?? 0.5);
  const concurrency = Number(flag("concurrency") ?? 4);
  const dryRun = argv.includes("--dry-run");

  const pilot = (await readFile(path.join(STAGING_DIR, "PILOT.txt"), "utf8"))
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const truth = new Map<string, Proposal>();
  for (const slug of pilot) {
    const file = path.join(PROPOSALS, `${slug}.json`);
    truth.set(slug, JSON.parse(await readFile(file, "utf8")) as Proposal);
  }

  // Pages shared by two or more programmes of a country go first in the prompt (they cache).
  const countryOf = (slug: string) => slug.slice(0, 2).toUpperCase();
  const count = new Map<string, number>();
  for (const [slug, p] of truth)
    for (const url of new Set(urlsOf(p))) {
      const key = `${countryOf(slug)} ${url}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  const sharedUrls = (country: string) =>
    [...count]
      .filter(([key, n]) => key.startsWith(`${country} `) && n >= 2)
      .map(([key]) => key.slice(3));

  const pages = new Map<string, { shared: Page[]; own: Page[]; failed: string[] }>();
  for (const [slug, p] of truth) {
    const shared = await loadPages(sharedUrls(countryOf(slug)));
    const own = await loadPages(urlsOf(p).filter((u) => !shared.pages.some((s) => s.url === u)));
    pages.set(slug, {
      shared: shared.pages,
      own: own.pages,
      failed: [...shared.failed, ...own.failed],
    });
  }
  const failedPages = [...new Set([...pages.values()].flatMap((p) => p.failed))];
  if (failedPages.length > 0)
    console.log(`pages that could not be fetched now: ${failedPages.join(", ")}`);

  if (dryRun) {
    const chars = [...pages.values()].reduce(
      (n, p) =>
        n + [...p.shared, ...p.own].reduce((m, page) => m + Math.min(page.text.length, 30_000), 0),
      0,
    );
    console.log(
      `dry run: ${pilot.length} programmes, ~${Math.round(chars / 4)} page tokens in total per model, ${models.length} models; no call made`,
    );
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const root = path.join(STAGING_DIR, "bakeoff", stamp);
  const results: Record<string, Row[]> = {};
  const session = `jisr-bakeoff-${stamp}`;

  await Promise.all(
    models.map(async (model) => {
      const budget = new Budget({ maxUsd, maxTokens: 3_000_000 });
      const rows: Row[] = [];
      const dir = path.join(root, model.id);
      await mkdir(dir, { recursive: true });
      const run = async (slug: string) => {
        const meta = await loadMeta(slug);
        const set = pages.get(slug);
        const gt = truth.get(slug);
        if (meta === null || set === undefined || gt === undefined) return;
        const out = await readProgramme({
          ...meta,
          model,
          shared: set.shared,
          own: set.own,
          session: `${session}-${model.id}`,
          getText: pageText,
          budget,
        });
        const verified: Facts = out.verified?.facts ?? {};
        const row: Row = {
          slug,
          error: out.error,
          dropped: out.dropped,
          verified,
          rules: (out.verified?.requirements ?? []).map((r) => ({ kind: r.kind })),
          score: scoreFacts(scoredFacts(slug, gt), verified, out.verified?.rejected ?? []),
          usage: out.completion?.usage ?? null,
          costUsd: out.completion?.costUsd ?? 0,
          latencyMs: out.completion?.latencyMs ?? null,
          ttftMs: out.completion?.ttftMs ?? null,
        };
        rows.push(row);
        if (out.proposal !== null)
          await writeFile(
            path.join(dir, `${slug}.json`),
            `${JSON.stringify(out.proposal, null, 2)}\n`,
          );
        await appendJsonl(path.join(dir, "calls.jsonl"), {
          slug,
          usage: row.usage,
          costUsd: row.costUsd,
          latencyMs: row.latencyMs,
          ttftMs: row.ttftMs,
          error: row.error,
          dropped: row.dropped,
          score: row.score,
        });
      };
      try {
        // One programme per country first, one at a time, so the shared prefix is cached for the rest.
        const seen = new Set<string>();
        const warm = pilot.filter((s) => {
          if (seen.has(countryOf(s))) return false;
          seen.add(countryOf(s));
          return true;
        });
        for (const slug of warm) await run(slug);
        await pool(
          pilot.filter((s) => !warm.includes(s)),
          concurrency,
          run,
        );
      } catch (error) {
        if (!(error instanceof BudgetExceeded)) throw error;
        console.log(`${model.id}: STOPPED ${error.message}`);
      }
      results[model.id] = rows;
      console.log(`${model.id}: ${rows.length} done, $${budget.spentUsd.toFixed(4)}`);
    }),
  );

  await writeFile(path.join(root, "results.json"), JSON.stringify(results));
  const report = renderReport(results, truth);
  await writeFile(path.join(root, "report.md"), report);
  console.log(`\n${report}\nfull output: ${root}`);
}

function renderReport(results: Record<string, Row[]>, truth: Map<string, Proposal>): string {
  const n = truth.size;
  const sum = (rows: Row[], pick: (r: Row) => number) => rows.reduce((t, r) => t + pick(r), 0);
  const lines = [
    `Bake-off on ${n} pilot programmes (same pages for every model; truth = quote-verified pilot proposals)`,
    "",
    "| model | ok | dropped | agree | conflict | extra | missing | rejected | reject% | in tok/prog | cached% | out tok/prog | tok/s | TTFT s | lat s | $/prog | $ total |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const [id, rows] of Object.entries(results)) {
    const ok = rows.filter((r) => r.error === null).length;
    const count = (k: keyof FactScore) => sum(rows, (r) => r.score[k].length);
    const proposed = count("agree") + count("conflict") + count("extra") + count("rejected");
    const input = sum(rows, (r) => r.usage?.input ?? 0);
    const cached = sum(rows, (r) => r.usage?.cached ?? 0);
    const output = sum(rows, (r) => r.usage?.output ?? 0);
    const tps = median(
      rows.flatMap((r) =>
        r.usage !== null && r.latencyMs !== null && r.ttftMs !== null && r.latencyMs > r.ttftMs
          ? [r.usage.output / ((r.latencyMs - r.ttftMs) / 1000)]
          : [],
      ),
    );
    const ttft = median(rows.flatMap((r) => (r.ttftMs === null ? [] : [r.ttftMs / 1000])));
    const lat = median(rows.flatMap((r) => (r.latencyMs === null ? [] : [r.latencyMs / 1000])));
    const cost = sum(rows, (r) => r.costUsd);
    const per = Math.max(rows.length, 1);
    lines.push(
      `| ${id} | ${ok}/${rows.length} | ${sum(rows, (r) => r.dropped.length)} | ${count("agree")} | ${count("conflict")} | ${count("extra")} | ${count("missing")} | ${count("rejected")} | ${proposed === 0 ? "-" : Math.round((100 * count("rejected")) / proposed)} | ${Math.round(input / per)} | ${input === 0 ? 0 : Math.round((100 * cached) / input)} | ${Math.round(output / per)} | ${tps === null ? "-" : Math.round(tps)} | ${ttft === null ? "-" : ttft.toFixed(1)} | ${lat === null ? "-" : lat.toFixed(1)} | ${(cost / per).toFixed(5)} | ${cost.toFixed(4)} |`,
    );
  }
  const total = [...truth].reduce(
    (t, [slug, p]) => t + Object.keys(scoredFacts(slug, p)).length,
    0,
  );
  lines.push(
    "",
    `Truth has ${total} facts. agree = verified and equal; conflict = verified but a different value (the dangerous one); extra = verified, not in the truth (look at these); missing = in the truth, not accepted; rejected = the verifier refused it.`,
  );

  // Cross-check: a fact is kept only if both models accepted it with the same value.
  lines.push(
    "",
    "Cross-check (fact kept only if both models verified the same value):",
    "",
    "| pair | kept | agree | conflict | extra |",
    "|---|---|---|---|---|",
  );
  const ids = Object.keys(results);
  const pairs: { pair: string; kept: number; score: FactScore }[] = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      if (a === undefined || b === undefined) continue;
      const total: FactScore = { agree: [], conflict: [], extra: [], missing: [], rejected: [] };
      let kept = 0;
      for (const [slug, gt] of truth) {
        const x = results[a]?.find((r) => r.slug === slug)?.verified ?? {};
        const y = results[b]?.find((r) => r.slug === slug)?.verified ?? {};
        const out = crossCheck(scoredFacts(slug, gt), x, y);
        kept += out.kept.length;
        for (const k of ["agree", "conflict", "extra"] as const) total[k].push(...out.score[k]);
      }
      pairs.push({ pair: `${a} + ${b}`, kept, score: total });
    }
  pairs.sort((p, q) =>
    q.score.conflict.length - p.score.conflict.length === 0
      ? q.score.agree.length - p.score.agree.length
      : p.score.conflict.length - q.score.conflict.length,
  );
  for (const p of pairs.slice(0, 12))
    lines.push(
      `| ${p.pair} | ${p.kept} | ${p.score.agree.length} | ${p.score.conflict.length} | ${p.score.extra.length} |`,
    );
  return lines.join("\n");
}

if (process.argv[1]?.endsWith("bakeoff.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
