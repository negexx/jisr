import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";
import { z } from "zod";

import { pageText } from "./evidence";
import { type ProgrammeKind, programmeKind, staleProposalFiles } from "./fr-calendar";
import { type Proposal, ProposalSchema, verifyProposal } from "./proposals";
import { DATA_DIR, STAGING_DIR } from "./staging";

// A national page (Campus France Maroc, uni-assist, Studielink, Universitaly) states the same fact
// for hundreds of programmes. A registry entry holds that fact once, with its verbatim quotes, and
// a selector that says which programmes it applies to. This turns each entry into one proposal per
// selected programme; the existing flow (restage --enrich, verify --enrich, audit, promote) then
// re-fetches and verifies every quote exactly as for any other fact. No model, no search.
const Kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const Https = z.string().refine((u) => u.startsWith("https://") && URL.canParse(u), "https url");
const Evidence = z.object({ url: Https, quote: z.string().min(15) });

export const SelectorSchema = z.object({
  country: z.enum(["FR", "DE", "NL", "IT", "HU"]),
  institutions: z.array(z.string()).min(1).optional(),
  institutionType: z.enum(["public", "private"]).optional(),
  kinds: z
    .array(z.enum(["but", "licence", "other"]))
    .min(1)
    .optional(),
  channels: z.array(z.string()).min(1).optional(),
});

const DocumentItem = z.object({
  slug: z.string().regex(Kebab),
  name: z.object({ fr: z.string().min(1), en: z.string().min(1).optional() }),
  quotedAs: z.string().min(2).max(120),
  // never false: a national list cannot say a document needs no translation (data/README.md)
  translationRequired: z.literal(true).nullable(),
});

const Base = {
  id: z.string().regex(Kebab),
  infoKind: z.enum(["official", "guidance"]),
  selector: SelectorSchema,
  evidence: z.array(Evidence).min(1),
  notes: z.string().optional(),
};

export const EntrySchema = z.discriminatedUnion("fact", [
  z.object({ ...Base, fact: z.literal("documents"), items: z.array(DocumentItem).min(1) }),
  z.object({ ...Base, fact: z.literal("applicationChannel"), channel: z.string().regex(Kebab) }),
]);
export const RegistrySchema = z.object({ entries: z.array(EntrySchema).min(1) });

export type Selector = z.infer<typeof SelectorSchema>;
export type Entry = z.infer<typeof EntrySchema>;

export function parseRegistry(json: unknown): { entries: Entry[] } {
  return RegistrySchema.parse(json);
}

export type NationalProgramme = {
  slug: string;
  name: string;
  country: string;
  institution: string;
  institutionType: "public" | "private" | null;
  kind: ProgrammeKind | null;
  channel: string | null;
  holdsDocuments: boolean;
};

const within = <T>(list: readonly T[] | undefined, value: T | null): boolean =>
  list === undefined || (value !== null && list.includes(value));

// A conjunction of the selector's present fields. A programme whose institution type, kind or
// channel is unknown never matches a selector that filters on it.
export function selects(p: NationalProgramme, s: Selector): boolean {
  return (
    p.country === s.country &&
    within(s.institutions, p.institution) &&
    (s.institutionType === undefined || p.institutionType === s.institutionType) &&
    within(s.kinds, p.kind) &&
    within(s.channels, p.channel)
  );
}

type Rec = Record<string, unknown>;

async function readYaml(file: string): Promise<Rec | null> {
  return parse(await readFile(file, "utf8")) as Rec | null;
}

async function readInstitutionTypes(dataDir: string): Promise<Map<string, "public" | "private">> {
  const dir = path.join(dataDir, "institutions");
  const types = new Map<string, "public" | "private">();
  for (const file of await readdir(dir)) {
    if (!file.endsWith(".yaml")) continue;
    const record = await readYaml(path.join(dir, file));
    if (record === null || typeof record.slug !== "string") continue;
    if (record.type === "public" || record.type === "private") types.set(record.slug, record.type);
  }
  return types;
}

const factValue = (record: Rec, field: string): unknown => {
  const fact = record[field];
  return typeof fact === "object" && fact !== null ? (fact as Rec).value : null;
};

function toNationalProgramme(record: Rec, types: Map<string, "public" | "private">) {
  const country = String(record.country);
  const channel = factValue(record, "applicationChannel");
  const documents = factValue(record, "documents");
  const institution = String(record.institution);
  return {
    slug: String(record.slug),
    name: String(record.name),
    country,
    institution,
    institutionType: types.get(institution) ?? null,
    kind: country === "FR" ? programmeKind(record) : null,
    channel: typeof channel === "string" ? channel : null,
    holdsDocuments: Array.isArray(documents) && documents.length > 0,
  } satisfies NationalProgramme;
}

export async function readNationalProgrammes(
  dataDir: string = DATA_DIR,
): Promise<NationalProgramme[]> {
  const types = await readInstitutionTypes(dataDir);
  const dir = path.join(dataDir, "programs");
  const found: NationalProgramme[] = [];
  for (const file of (await readdir(dir)).sort()) {
    if (!file.endsWith(".yaml")) continue;
    const record = await readYaml(path.join(dir, file));
    if (record !== null) found.push(toNationalProgramme(record, types));
  }
  return found;
}

export type EntryReport = {
  id: string;
  selected: number;
  proposed: number;
  skipped: string[];
  rejected: string[];
};

const holdsFact = (p: NationalProgramme, fact: Entry["fact"]): boolean =>
  fact === "documents" ? p.holdsDocuments : p.channel !== null;

function factsOf(entry: Entry): Proposal["facts"] {
  const common = {
    evidence: entry.evidence,
    ...(entry.infoKind === "guidance" ? { infoKind: "guidance" as const } : {}),
  };
  return entry.fact === "documents"
    ? { documents: { value: entry.items, ...common } }
    : { applicationChannel: { value: entry.channel, ...common } };
}

const joinNotes = (...notes: (string | undefined)[]): string | undefined => {
  const distinct = [...new Set(notes.filter((n): n is string => n !== undefined && n !== ""))];
  return distinct.length === 0 ? undefined : distinct.join("\n");
};

function withEntry(existing: Proposal | undefined, slug: string, entry: Entry): Proposal {
  const notes = joinNotes(existing?.notes, entry.notes);
  return ProposalSchema.parse({
    slug,
    programmePage: null,
    facts: { ...existing?.facts, ...factsOf(entry) },
    ...(notes === undefined ? {} : { notes }),
  });
}

// Which of an entry's selected programmes can take its fact now.
function takers(
  entry: Entry,
  selected: readonly NationalProgramme[],
  claimed: Map<string, Proposal>,
) {
  const skipped: string[] = [];
  const open: NationalProgramme[] = [];
  for (const p of selected) {
    if (holdsFact(p, entry.fact)) skipped.push(`already holds ${entry.fact}`);
    else if (claimed.get(p.slug)?.facts[entry.fact] !== undefined)
      skipped.push(`${entry.fact} already claimed by an earlier entry`);
    else open.push(p);
  }
  return { skipped, open };
}

async function buildEntry(
  entry: Entry,
  programmes: readonly NationalProgramme[],
  claimed: Map<string, Proposal>,
  getText: (url: string) => Promise<string>,
): Promise<EntryReport> {
  const selected = programmes.filter((p) => selects(p, entry.selector));
  const { skipped, open } = takers(entry, selected, claimed);
  const report: EntryReport = {
    id: entry.id,
    selected: selected.length,
    proposed: 0,
    skipped,
    rejected: [],
  };
  const [first] = open;
  if (first === undefined) return report;

  // National evidence is identical for every programme: one verification stands for all of them.
  const verified = await verifyProposal(
    withEntry(undefined, first.slug, entry),
    first.name,
    getText,
  );
  if (verified.facts[entry.fact] === undefined) {
    report.rejected = verified.rejected.map((r) => r.reason);
    return report;
  }
  for (const p of open) claimed.set(p.slug, withEntry(claimed.get(p.slug), p.slug, entry));
  report.proposed = open.length;
  return report;
}

export async function buildNationalProposals(input: {
  entries: readonly Entry[];
  programmes: readonly NationalProgramme[];
  getText: (url: string) => Promise<string>;
}): Promise<{ proposals: Proposal[]; reports: EntryReport[] }> {
  const claimed = new Map<string, Proposal>();
  const reports: EntryReport[] = [];
  for (const entry of input.entries)
    reports.push(await buildEntry(entry, input.programmes, claimed, input.getText));
  return { proposals: [...claimed.values()], reports };
}

export async function writeNationalProposals(
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
  const slugs = proposals.map((p) => p.slug).sort();
  await writeFile(path.join(dir, "slugs.txt"), slugs.map((slug) => `${slug}\n`).join(""));
}

type Args = { registries: string[]; dry: boolean; out: string | null; dataDir: string };

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { registries: [], dry: false, out: null, dataDir: DATA_DIR };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--dry-run") args.dry = true;
    else if (arg === "--out" || arg === "--data-dir") {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      if (arg === "--out") args.out = value;
      else args.dataDir = value;
    } else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else args.registries.push(arg);
  }
  if (args.registries.length === 0) throw new Error("give at least one registry file");
  return args;
}

async function readEntries(files: readonly string[]): Promise<Entry[]> {
  const entries: Entry[] = [];
  for (const file of files) {
    try {
      entries.push(...parseRegistry(JSON.parse(await readFile(file, "utf8"))).entries);
    } catch (error) {
      throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const ids = entries.map((e) => e.id);
  const repeated = ids.find((id, i) => ids.indexOf(id) !== i);
  if (repeated !== undefined) throw new Error(`entry id ${repeated} appears twice`);
  return entries;
}

function groupCounts(reasons: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return [...counts]
    .sort()
    .map(([reason, count]) => `${reason} x${count}`)
    .join("; ");
}

function printReport(r: EntryReport): void {
  console.log(
    `${r.id}: selected ${r.selected}, proposed ${r.proposed}, skipped ${r.skipped.length}${r.skipped.length > 0 ? ` (${groupCounts(r.skipped)})` : ""}, rejected ${r.rejected.length}${r.rejected.length > 0 ? ` (${groupCounts(r.rejected)})` : ""}`,
  );
}

async function main(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const entries = await readEntries(args.registries);
  const programmes = await readNationalProgrammes(args.dataDir);
  const { proposals, reports } = await buildNationalProposals({
    entries,
    programmes,
    getText: pageText,
  });
  const first = args.registries[0] ?? "";
  const out =
    args.out ??
    path.join(STAGING_DIR, "proposals-national", path.basename(first).replace(/\.json$/, ""));
  await writeNationalProposals(proposals, out, args.dry);

  for (const report of reports) printReport(report);
  console.log(`${args.dry ? "would write" : "wrote"} ${proposals.length} proposals to ${out}`);
  const stale = await staleProposalFiles(out, proposals);
  if (stale.length > 0)
    console.warn(
      `warning: ${stale.length} proposal file(s) in ${out} were not produced by this run (kept, not deleted): ${stale.slice(0, 5).join(", ")}${stale.length > 5 ? ", ..." : ""}`,
    );
  console.log("next:");
  console.log(`  pnpm data:evidence restage --enrich ${out} --slugs ${out}/slugs.txt`);
  console.log(`  pnpm data:evidence verify --enrich ${out} --dry-run`);
}

if (process.argv[1]?.endsWith("national.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
