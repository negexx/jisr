import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { calendarIntakes, isButProgramme, type National, readNational } from "./enrich-fr";
import { pageText } from "./evidence";
import { type Proposal, ProposalSchema } from "./proposals";
import { DATA_DIR, STAGING_DIR } from "./staging";

// The Campus France Maroc application calendar is national: one sentence per kind of programme
// ("Du 1er octobre 2026 au 15 novembre 2026 à 23h59 (heure marocaine)"). This turns it into an
// intake-only proposal for every French programme of that kind. It writes proposals only: the
// verifier, the checker and the promotion decide what reaches data/. No model is called.
export function buildCalendarProposals(input: {
  slugs: readonly { slug: string; isBut: boolean }[];
  national: National;
}): Proposal[] {
  const proposals: Proposal[] = [];
  for (const { slug, isBut } of input.slugs) {
    const evidence = isBut ? input.national.butCalendar : input.national.licenceCalendar;
    if (evidence === null) continue;
    const intake = calendarIntakes(evidence);
    if (intake === null) continue;
    proposals.push(
      ProposalSchema.parse({
        slug,
        programmePage: null,
        facts: { intakes: { value: [intake], evidence: [evidence] } },
      }),
    );
  }
  return proposals;
}

export async function writeCalendarProposals(
  proposals: readonly Proposal[],
  dir: string,
  dry: boolean,
): Promise<void> {
  if (dry) return;
  await mkdir(dir, { recursive: true });
  for (const proposal of proposals)
    await writeFile(
      path.join(dir, `${proposal.slug}.json`),
      `${JSON.stringify(proposal, null, 2)}\n`,
    );
}

async function main(argv: readonly string[]): Promise<void> {
  const dry = argv.includes("--dry-run");
  const programsDir = path.join(DATA_DIR, "programs");
  const slugs: { slug: string; isBut: boolean }[] = [];
  for (const file of (await readdir(programsDir)).sort()) {
    if (!file.startsWith("fr-") || !file.endsWith(".yaml")) continue;
    const record = parse(await readFile(path.join(programsDir, file), "utf8")) as Record<
      string,
      unknown
    >;
    slugs.push({ slug: String(record.slug), isBut: isButProgramme(record) });
  }

  const national = await readNational(pageText);
  const proposals = buildCalendarProposals({ slugs, national });
  const out = path.join(STAGING_DIR, "proposals-fr-calendar");
  await writeCalendarProposals(proposals, out, dry);

  const butTotal = slugs.filter((s) => s.isBut).length;
  const butMade = proposals.filter((p) => slugs.find((s) => s.slug === p.slug)?.isBut).length;
  console.log(
    `${dry ? "would write" : "wrote"} ${proposals.length} intake proposals to ${out} (BUT ${butMade} of ${butTotal}, Licence ${proposals.length - butMade} of ${slugs.length - butTotal})`,
  );
  for (const [kind, evidence] of [
    ["BUT", national.butCalendar],
    ["Licence", national.licenceCalendar],
  ] as const)
    console.log(
      evidence === null
        ? `  ${kind}: no calendar sentence found (no proposal)`
        : `  ${kind}: ${evidence.quote} (${evidence.url})`,
    );
}

if (process.argv[1]?.endsWith("fr-calendar.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
