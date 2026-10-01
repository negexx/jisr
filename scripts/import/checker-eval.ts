import { readFile } from "node:fs/promises";
import path from "node:path";

import { sameValue } from "./bakeoff-score";
import { checkVerified } from "./checker";
import { pageText } from "./evidence";
import { appendJsonl, Budget, MODELS } from "./llm";
import type { AcceptedFact, FactName, Proposal } from "./proposals";
import { loadMeta, pool } from "./reader";
import { STAGING_DIR } from "./staging";

// Replays what the cheap readers got verified (right and wrong) through a candidate checker model
// and reports how many wrong facts it removes and how many correct ones it keeps.
// Usage: data:checkeval --from <bakeoff dir> --checker <model id> [--max-usd 0.5] [--concurrency 4]
type Facts = Partial<Record<FactName, AcceptedFact>>;
export type Label = "correct" | "wrong" | "unknown";

export function label(name: FactName, fact: AcceptedFact, truth: Facts): Label {
  const want = truth[name];
  if (want === undefined) return "unknown";
  return sameValue(name, fact.value, want.value) ? "correct" : "wrong";
}

// Several models give a value for the same fact: one group per distinct value, so no group holds two
// values of one fact and each can be checked as a single set of facts.
export function groupVariants(sets: readonly Facts[]): Facts[] {
  const groups: Facts[] = [];
  const values = new Map<FactName, AcceptedFact[]>();
  for (const facts of sets) {
    for (const [key, fact] of Object.entries(facts) as [FactName, AcceptedFact[][number]][]) {
      const known = values.get(key) ?? [];
      // the same value written in another order (["en","de"] and ["de","en"]) is the same value
      if (known.some((other) => sameValue(key, other.value, fact.value))) continue;
      const slot = known.length;
      values.set(key, [...known, fact]);
      const group = groups[slot] ?? {};
      group[key] = fact;
      groups[slot] = group;
    }
  }
  return groups;
}

type Row = { slug: string; verified: Facts };

async function main(argv: readonly string[]): Promise<void> {
  const flag = (name: string) => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 ? undefined : argv[at + 1];
  };
  const from = flag("from");
  const checkerId = flag("checker");
  if (from === undefined || checkerId === undefined)
    throw new Error("usage: data:checkeval --from <bakeoff dir> --checker <model id>");
  const model = MODELS[checkerId];
  if (model === undefined) throw new Error(`unknown model ${checkerId}`);
  const results = JSON.parse(await readFile(path.join(from, "results.json"), "utf8")) as Record<
    string,
    Row[]
  >;
  const slugs = [...new Set(Object.values(results).flatMap((rows) => rows.map((r) => r.slug)))];
  const budget = new Budget({ maxUsd: Number(flag("max-usd") ?? 0.5), maxTokens: 3_000_000 });
  const tally = {
    correct: { kept: 0, removed: 0 },
    wrong: { kept: 0, removed: 0 },
    unknown: { kept: 0, removed: 0 },
  };
  const wrongKept: string[] = [];
  const correctRemoved: string[] = [];
  let cost = 0;
  let calls = 0;
  let failures = 0;
  const latencies: number[] = [];
  await pool(slugs, Number(flag("concurrency") ?? 4), async (slug) => {
    const truth = (
      JSON.parse(
        await readFile(path.join(STAGING_DIR, "proposals", "programs", `${slug}.json`), "utf8"),
      ) as Proposal
    ).facts;
    const meta = await loadMeta(slug);
    if (meta === null) return;
    const sets = Object.values(results).flatMap((rows) =>
      rows.filter((r) => r.slug === slug).map((r) => r.verified),
    );
    for (const group of groupVariants(sets)) {
      const out = await checkVerified({
        verified: { programmePage: null, facts: group, rejected: [] },
        meta: { name: meta.name, institution: meta.institution },
        model,
        session: `jisr-checkeval-${checkerId}`,
        getText: pageText,
        budget,
      });
      calls++;
      cost += out.completion?.costUsd ?? 0;
      if (out.completion !== null) latencies.push(out.completion.latencyMs);
      if (out.error !== null) failures++;
      for (const [key, fact] of Object.entries(group) as [FactName, AcceptedFact][]) {
        const l = label(key, fact, truth);
        const kept = out.verified.facts[key] !== undefined;
        tally[l][kept ? "kept" : "removed"]++;
        const text = `${slug.slice(0, 30)} ${key}=${JSON.stringify(fact.value).slice(0, 60)}`;
        if (l === "wrong" && kept) wrongKept.push(text);
        if (l === "correct" && !kept)
          correctRemoved.push(
            `${text}: ${out.verified.rejected.find((r) => r.fact === key)?.reason ?? "?"}`,
          );
      }
      await appendJsonl(path.join(from, `checkeval-${checkerId}.jsonl`), {
        slug,
        checks: out.checks,
        error: out.error,
      });
    }
  });
  const med = latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)] ?? 0;
  console.log(
    `${checkerId}: ${calls} calls (${failures} unusable), $${cost.toFixed(4)}, median ${(med / 1000).toFixed(1)}s\n` +
      `  wrong facts   : ${tally.wrong.removed} removed, ${tally.wrong.kept} kept (should be 0 kept)\n` +
      `  correct facts : ${tally.correct.kept} kept, ${tally.correct.removed} removed (should be 0 removed)\n` +
      `  not in truth  : ${tally.unknown.kept} kept, ${tally.unknown.removed} removed`,
  );
  for (const t of wrongKept) console.log(`  WRONG KEPT   ${t}`);
  for (const t of correctRemoved) console.log(`  CORRECT LOST ${t}`);
}

if (process.argv[1]?.endsWith("checker-eval.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
