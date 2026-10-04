import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import {
  calendarIntakes,
  type Evidence,
  isButProgramme,
  type National,
  PAGES,
  readNational,
} from "./enrich-fr";
import { pageText } from "./evidence";
import { type Proposal, ProposalSchema } from "./proposals";
import { DATA_DIR, STAGING_DIR } from "./staging";

export type ProgrammeKind = "but" | "licence" | "other";

// A calendar is for a kind of programme. Anything that is neither a BUT nor a Licence (a Master, an
// engineering diploma) has no national calendar here and gets no proposal.
export function programmeKind(record: { slug?: unknown; name?: unknown }): ProgrammeKind {
  if (isButProgramme(record)) return "but";
  return /^(Double )?licence\b(?!\s+professionnelle)/i.test(String(record.name))
    ? "licence"
    : "other";
}

// The Campus France Maroc application calendar is national: one sentence per kind of programme
// ("Du 1er octobre 2026 au 15 novembre 2026 à 23h59 (heure marocaine)"). This turns it into an
// intake-only proposal for every French programme of that kind. It writes proposals only: the
// verifier, the checker and the promotion decide what reaches data/. No model is called.
//
// The page that says whom the application is for (Bac marocain...) is a second quote when it was
// read: the audit trail then shows who the deadline applies to, not only the time-zone word. For a
// Licence the calendar page is the only source: the date sentence plus its first-year Licence line
// (both from that page), and without that line there is no proposal.
export function buildCalendarProposals(input: {
  slugs: readonly { slug: string; kind: ProgrammeKind }[];
  national: National;
}): Proposal[] {
  const { national } = input;
  const proposals: Proposal[] = [];
  for (const { slug, kind } of input.slugs) {
    const calendar: [Evidence | null, Evidence | null] =
      kind === "but"
        ? [national.butCalendar, national.applyBut]
        : kind === "licence"
          ? [national.licenceCalendar, national.licenceCalendarAudience]
          : [null, null];
    const [evidence, audience] = calendar;
    if (evidence === null || (kind === "licence" && audience === null)) continue;
    const intake = calendarIntakes(evidence);
    if (intake === null) continue;
    proposals.push(
      ProposalSchema.parse({
        slug,
        programmePage: null,
        facts: {
          intakes: {
            value: [intake],
            evidence: audience === null ? [evidence] : [evidence, audience],
          },
        },
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

// Proposal files left in the directory by an earlier run that this run did not produce. They are
// reported, never deleted: a human decides.
export async function staleProposalFiles(
  dir: string,
  proposals: readonly Proposal[],
): Promise<string[]> {
  const produced = new Set(proposals.map((p) => `${p.slug}.json`));
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  return names.filter((name) => name.endsWith(".json") && !produced.has(name)).sort();
}

// Only the pages the calendar needs: the BUT application page and the Licence calendar page, which
// carry the calendar sentence and the audience. The other national pages are not fetched.
const NEEDED_PAGES: ReadonlySet<string> = new Set([PAGES.applyBut, PAGES.calendarLicence]);
const neededPageText = async (url: string): Promise<string> => {
  if (!NEEDED_PAGES.has(url)) throw new Error("not needed by the calendar");
  return pageText(url);
};

async function main(argv: readonly string[]): Promise<void> {
  const dry = argv.includes("--dry-run");
  const programsDir = path.join(DATA_DIR, "programs");
  const slugs: { slug: string; kind: ProgrammeKind }[] = [];
  for (const file of (await readdir(programsDir)).sort()) {
    if (!file.startsWith("fr-") || !file.endsWith(".yaml")) continue;
    const record = parse(await readFile(path.join(programsDir, file), "utf8")) as Record<
      string,
      unknown
    >;
    slugs.push({ slug: String(record.slug), kind: programmeKind(record) });
  }

  const national = await readNational(neededPageText);
  const proposals = buildCalendarProposals({ slugs, national });
  const out = path.join(STAGING_DIR, "proposals-fr-calendar");
  await writeCalendarProposals(proposals, out, dry);

  const kindOf = new Map(slugs.map((s) => [s.slug, s.kind]));
  const count = (kind: ProgrammeKind, list: readonly { slug: string }[]) =>
    list.filter((s) => kindOf.get(s.slug) === kind).length;
  console.log(
    `${dry ? "would write" : "wrote"} ${proposals.length} intake proposals to ${out} (BUT ${count("but", proposals)} of ${count("but", slugs)}, Licence ${count("licence", proposals)} of ${count("licence", slugs)}, other ${count("other", slugs)} skipped)`,
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
  for (const note of national.notes ?? []) console.log(`  ${note}`);
  const stale = await staleProposalFiles(out, proposals);
  if (stale.length > 0)
    console.warn(
      `warning: ${stale.length} proposal file(s) in ${out} were not produced by this run (kept, not deleted): ${stale.slice(0, 5).join(", ")}${stale.length > 5 ? ", ..." : ""}`,
    );
}

if (process.argv[1]?.endsWith("fr-calendar.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
