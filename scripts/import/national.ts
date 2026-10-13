import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";
import { z } from "zod";

import { pageText } from "./evidence";
import { type ProgrammeKind, programmeKind, staleProposalFiles } from "./fr-calendar";
import { HttpStatusError } from "./http";
import { type ForPerson, parseSheet, uniAssistEntries } from "./national-uniassist";
import { DocumentProposalSchema, type Proposal, ProposalSchema, verifyProposal } from "./proposals";
import { DATA_DIR, STAGING_DIR } from "./staging";

// A national page (Campus France Maroc, uni-assist, Studielink, Universitaly) states the same fact
// for hundreds of programmes. A registry entry holds that fact once, with its verbatim quotes, and
// a selector that says which programmes it applies to. This turns each entry into one proposal per
// selected programme; the existing flow (restage --enrich, verify --enrich, audit, promote) then
// re-fetches and verifies every quote exactly as for any other fact. No model, no search.
const Kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const Https = z.string().refine((u) => u.startsWith("https://") && URL.canParse(u), "https url");
const Evidence = z.strictObject({ url: Https, quote: z.string().min(15) });

export const SelectorSchema = z.strictObject({
  country: z.enum(["FR", "DE", "NL", "IT", "HU", "ES"]),
  institutions: z.array(z.string()).min(1).optional(),
  programmes: z.array(z.string()).min(1).optional(),
  institutionType: z.enum(["public", "private"]).optional(),
  kinds: z
    .array(z.enum(["but", "licence", "other"]))
    .min(1)
    .optional(),
  channels: z.array(z.string()).min(1).optional(),
});

const DocumentItem = z.strictObject({
  slug: z.string().regex(Kebab),
  name: z.strictObject({ fr: z.string().min(1), en: z.string().min(1).optional() }),
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
  z.strictObject({ ...Base, fact: z.literal("documents"), items: z.array(DocumentItem).min(1) }),
  z.strictObject({
    ...Base,
    fact: z.literal("applicationChannel"),
    channel: z.string().regex(Kebab),
  }),
]);
export const RegistrySchema = z.strictObject({ entries: z.array(EntrySchema).min(1) });

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
    within(s.programmes, p.slug) &&
    (s.institutionType === undefined || p.institutionType === s.institutionType) &&
    within(s.kinds, p.kind) &&
    within(s.channels, p.channel)
  );
}

type Rec = Record<string, unknown>;

async function readYaml(file: string): Promise<Rec | null> {
  return parse(await readFile(file, "utf8")) as Rec | null;
}

export async function readInstitutionTypes(
  dataDir: string,
): Promise<Map<string, "public" | "private">> {
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
    // enrichRecord counts any non-null value as held, an empty list included
    holdsDocuments: documents !== null && documents !== undefined,
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
  warnings: string[];
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

// Same separator as enrichRecord uses for the notes of a record.
const joinNotes = (...notes: (string | undefined)[]): string | undefined => {
  const distinct = [...new Set(notes.filter((n): n is string => n !== undefined && n !== ""))];
  return distinct.length === 0 ? undefined : distinct.join("; ");
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

type GetText = (url: string) => Promise<string>;

type RunState = {
  claimed: Map<string, Proposal>;
  // entry id that holds each (programme, fact) claim: the first entry wins
  winners: Map<string, string>;
  institutions: ReadonlySet<string>;
  programmeSlugs: ReadonlySet<string>;
  warned: Set<string>;
  fetchOnce: GetText;
};

const claimKey = (slug: string, fact: Entry["fact"]): string => `${slug}|${fact}`;

// Every page is fetched once per run, a failure included: a page that failed is not asked again.
function memoText(getText: GetText): GetText {
  const seen = new Map<string, Promise<string>>();
  return (url) => {
    const hit = seen.get(url);
    if (hit !== undefined) return hit;
    const pending = getText(url);
    seen.set(url, pending);
    return pending;
  };
}

const BLOCKING_STATUSES: ReadonlySet<number> = new Set([403, 429]);

// 403 and 429 stop the whole run: every further request would only make it worse.
async function unreachablePages(entry: Entry, fetchOnce: GetText): Promise<string[]> {
  const failed: string[] = [];
  for (const url of new Set(entry.evidence.map((e) => e.url))) {
    try {
      await fetchOnce(url);
    } catch (error) {
      if (error instanceof HttpStatusError && BLOCKING_STATUSES.has(error.status))
        throw new Error(
          `stopped: HTTP ${error.status} from ${url}; the host is blocking or rate-limiting this run, do not retry until the owner decides`,
        );
      failed.push(`page could not be fetched: ${url}`);
    }
  }
  return failed;
}

// Items the verifier drops (named in no accepted quote) and translation claims it downgrades.
function documentWarnings(entry: Entry, verifiedValue: unknown): string[] {
  if (entry.fact !== "documents") return [];
  const kept = new Map(
    z
      .array(DocumentProposalSchema)
      .parse(verifiedValue)
      .map((d) => [d.slug, d]),
  );
  const warnings: string[] = [];
  for (const item of entry.items) {
    const after = kept.get(item.slug);
    if (after === undefined)
      warnings.push(
        `document item "${item.slug}" is named in no accepted quote; the verifier will drop it`,
      );
    else if (item.translationRequired === true && after.translationRequired !== true)
      warnings.push(
        `document item "${item.slug}": translationRequired true becomes null (no quote ties a translation to it)`,
      );
  }
  return warnings;
}

// A selector naming an institution or programme slug that no programme has is a typo or stale data;
// each slug is reported once per run.
function unknownSelectorSlugs(entry: Entry, state: RunState): string[] {
  const named = [
    ...[...new Set(entry.selector.institutions ?? [])].map((slug) => ({
      kind: "institution",
      slug,
      known: state.institutions.has(slug),
    })),
    ...[...new Set(entry.selector.programmes ?? [])].map((slug) => ({
      kind: "programme",
      slug,
      known: state.programmeSlugs.has(slug),
    })),
  ];
  const fresh = named.filter((n) => !n.known && !state.warned.has(`${n.kind}|${n.slug}`));
  for (const n of fresh) state.warned.add(`${n.kind}|${n.slug}`);
  return fresh.map((n) => `selector ${n.kind} ${n.slug} matches no programme`);
}

// Which of an entry's selected programmes can take its fact now.
function takers(entry: Entry, selected: readonly NationalProgramme[], state: RunState) {
  const skipped: string[] = [];
  const open: NationalProgramme[] = [];
  for (const p of selected) {
    const winner = state.winners.get(claimKey(p.slug, entry.fact));
    if (holdsFact(p, entry.fact)) skipped.push(`already holds ${entry.fact}`);
    else if (winner !== undefined) skipped.push(`${entry.fact} already claimed by entry ${winner}`);
    else open.push(p);
  }
  return { skipped, open };
}

async function buildEntry(
  entry: Entry,
  programmes: readonly NationalProgramme[],
  state: RunState,
): Promise<EntryReport> {
  const selected = programmes.filter((p) => selects(p, entry.selector));
  const { skipped, open } = takers(entry, selected, state);
  const report: EntryReport = {
    id: entry.id,
    selected: selected.length,
    proposed: 0,
    skipped,
    rejected: [],
    warnings: unknownSelectorSlugs(entry, state),
  };
  const [first] = open;
  if (first === undefined) return report;

  report.rejected = await unreachablePages(entry, state.fetchOnce);
  if (report.rejected.length > 0) return report;

  // National evidence is identical for every programme: one verification stands for all of them.
  const verified = await verifyProposal(
    withEntry(undefined, first.slug, entry),
    first.name,
    state.fetchOnce,
  );
  const accepted = verified.facts[entry.fact];
  // A fact accepted on one quote would carry its unfound quotes into every proposal: refuse it.
  const dropped = (verified.droppedQuotes ?? []).map(
    (d) => `quote not found on its page: "${d.quote}" (${d.url})`,
  );
  if (accepted === undefined || dropped.length > 0) {
    report.rejected = accepted === undefined ? verified.rejected.map((r) => r.reason) : dropped;
    return report;
  }
  report.warnings.push(...documentWarnings(entry, accepted.value));
  for (const p of open) {
    state.claimed.set(p.slug, withEntry(state.claimed.get(p.slug), p.slug, entry));
    state.winners.set(claimKey(p.slug, entry.fact), entry.id);
  }
  report.proposed = open.length;
  return report;
}

export async function buildNationalProposals(input: {
  entries: readonly Entry[];
  programmes: readonly NationalProgramme[];
  getText: GetText;
}): Promise<{ proposals: Proposal[]; reports: EntryReport[] }> {
  const state: RunState = {
    claimed: new Map(),
    winners: new Map(),
    institutions: new Set(input.programmes.map((p) => p.institution)),
    programmeSlugs: new Set(input.programmes.map((p) => p.slug)),
    warned: new Set(),
    fetchOnce: memoText(input.getText),
  };
  const reports: EntryReport[] = [];
  for (const entry of input.entries) reports.push(await buildEntry(entry, input.programmes, state));
  return { proposals: [...state.claimed.values()], reports };
}

export async function writeNationalProposals(
  proposals: readonly Proposal[],
  dir: string,
  dry: boolean,
): Promise<void> {
  if (dry || proposals.length === 0) return;
  await mkdir(dir, { recursive: true });
  for (const proposal of proposals)
    await writeFile(
      path.join(dir, `${proposal.slug}.json`),
      `${JSON.stringify(proposal, null, 2)}\n`,
    );
  const slugs = proposals.map((p) => p.slug).sort();
  await writeFile(path.join(dir, "slugs.txt"), slugs.map((slug) => `${slug}\n`).join(""));
}

export type Args = {
  registries: string[];
  dry: boolean;
  out: string | null;
  dataDir: string;
  uniAssistSheet: string | null;
};

const OPTIONS_WITH_VALUE: ReadonlySet<string> = new Set([
  "--out",
  "--data-dir",
  "--uniassist-sheet",
]);

export function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    registries: [],
    dry: false,
    out: null,
    dataDir: DATA_DIR,
    uniAssistSheet: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--dry-run") args.dry = true;
    else if (OPTIONS_WITH_VALUE.has(arg)) {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      if (arg === "--out") args.out = value;
      else if (arg === "--data-dir") args.dataDir = value;
      else args.uniAssistSheet = value;
    } else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else args.registries.push(arg);
  }
  if (args.registries.length === 0) throw new Error("give at least one registry file");
  return args;
}

// Registry entries first, so a curated entry wins over a sheet entry for the same programme.
export function mergeEntries(registry: readonly Entry[], sheet: readonly Entry[]): Entry[] {
  const entries = [...registry, ...sheet];
  const ids = entries.map((e) => e.id);
  const repeated = ids.find((id, i) => ids.indexOf(id) !== i);
  if (repeated !== undefined) throw new Error(`entry id ${repeated} appears twice`);
  return entries;
}

async function readRegistryEntries(files: readonly string[]): Promise<Entry[]> {
  const entries: Entry[] = [];
  for (const file of files) {
    try {
      entries.push(...parseRegistry(JSON.parse(await readFile(file, "utf8"))).entries);
    } catch (error) {
      throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
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

const detail = (reasons: readonly string[]): string =>
  reasons.length === 0 ? "" : ` (${groupCounts(reasons)})`;

function printReport(r: EntryReport): void {
  console.log(
    `${r.id}: selected ${r.selected}, proposed ${r.proposed}, skipped ${r.skipped.length}${detail(r.skipped)}, rejected ${r.rejected.length}${detail(r.rejected)}`,
  );
  for (const warning of r.warnings) console.log(`  warning: ${warning}`);
}

const sum = (reports: readonly EntryReport[], count: (r: EntryReport) => number): number =>
  reports.reduce((total, r) => total + count(r), 0);

function printTotals(reports: readonly EntryReport[]): void {
  console.log(
    `total: selected ${sum(reports, (r) => r.selected)}, proposed ${sum(reports, (r) => r.proposed)}, skipped ${sum(reports, (r) => r.skipped.length)}, rejected ${sum(reports, (r) => r.rejected.length)}, warnings ${sum(reports, (r) => r.warnings.length)}`,
  );
}

function printNextCommands(out: string): void {
  const slugs = path.join(out, "slugs.txt");
  console.log("next:");
  console.log(`  pnpm data:evidence restage --enrich ${out} --slugs ${slugs}`);
  console.log(`  pnpm data:evidence verify --enrich ${out} --slugs ${slugs} --dry-run`);
  console.log(`  pnpm data:evidence verify --enrich ${out} --slugs ${slugs}`);
}

// Rows of the uni-assist sheet that were not turned into an entry, grouped by reason; a short group
// names its universities, a long one (every "processes" row) only counts them.
function printForPerson(forPerson: readonly ForPerson[]): void {
  const groups = new Map<string, string[]>();
  for (const { name, reason } of forPerson)
    groups.set(reason, [...(groups.get(reason) ?? []), name]);
  console.log(`uni-assist sheet rows left for a person: ${forPerson.length}`);
  for (const [reason, names] of groups)
    console.log(`  ${reason} x${names.length}${names.length <= 12 ? `: ${names.join("; ")}` : ""}`);
}

// Sheet entries go through the same schema as a registry file, so a sheet row can never produce
// something a hand-written entry could not.
export function entriesFromSheet(csv: string): { entries: Entry[]; forPerson: ForPerson[] } {
  const { entries, forPerson } = uniAssistEntries(parseSheet(csv));
  return { entries: entries.length === 0 ? [] : parseRegistry({ entries }).entries, forPerson };
}

const NO_PROGRAMME_WARNING = /^selector (institution|programme) .+ matches no programme$/;

// The sheet names about sixty universities of which we list few: one count instead of one warning
// per entry. Curated entries keep every warning.
export function quietSheetWarnings(
  reports: readonly EntryReport[],
  sheetIds: ReadonlySet<string>,
): { reports: EntryReport[]; hidden: number } {
  let hidden = 0;
  const quiet = reports.map((report) => {
    if (!sheetIds.has(report.id)) return report;
    const warnings = report.warnings.filter((w) => !NO_PROGRAMME_WARNING.test(w));
    hidden += report.warnings.length - warnings.length;
    return { ...report, warnings };
  });
  return { reports: quiet, hidden };
}

async function sheetEntries(file: string | null): Promise<Entry[]> {
  if (file === null) return [];
  const { entries, forPerson } = entriesFromSheet(await readFile(file, "utf8"));
  printForPerson(forPerson);
  return entries;
}

async function main(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const fromSheet = await sheetEntries(args.uniAssistSheet);
  const entries = mergeEntries(await readRegistryEntries(args.registries), fromSheet);
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

  const quiet = quietSheetWarnings(reports, new Set(fromSheet.map((e) => e.id)));
  for (const report of quiet.reports) printReport(report);
  if (quiet.hidden > 0)
    console.log(
      `${quiet.hidden} sheet entries name an institution that none of our programmes use (warnings not repeated)`,
    );
  printTotals(reports);
  console.log(`${args.dry ? "would write" : "wrote"} ${proposals.length} proposals to ${out}`);
  const stale = await staleProposalFiles(out, proposals);
  if (stale.length > 0)
    console.warn(
      `warning: ${stale.length} proposal file(s) in ${out} were not produced by this run (kept, not deleted): ${stale.slice(0, 5).join(", ")}${stale.length > 5 ? ", ..." : ""}`,
    );
  if (proposals.length > 0) printNextCommands(out);
}

if (process.argv[1]?.endsWith("national.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
