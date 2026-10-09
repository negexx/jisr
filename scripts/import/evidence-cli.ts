import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";
import { auditCsv, readAudit } from "./audit";
import { pageText, quoteInText } from "./evidence";
import {
  applyRecord,
  applyVerified,
  ChannelProposalSchema,
  enrichedFields,
  enrichRecord,
  type GetText,
  InstitutionProposalSchema,
  ProposalSchema,
  stillPlaceholder,
  verifyChannel,
  verifyInstitution,
  verifyProposal,
} from "./proposals";
import { DATA_DIR, readLedgerRows, STAGING_DIR, stageFile, toYaml } from "./staging";

const proposalsDir = (stagingDir: string) => path.join(stagingDir, "proposals");

// Usage:
//   data:evidence text <url>                 print the visible text of a page (cached)
//   data:evidence check <url> "<quote>"      is the quote on the page, verbatim?
//   data:evidence verify [--dry-run] [--slugs <file>]  verify every data-staging/proposals/*.json and apply it
//                                            (only the slugs in <file>, one per line, when given)
//   data:evidence verify --enrich <dir> [--slugs <file>]  verify the programme proposals in <dir> and add
//                                            only the facts they prove to the restaged records
//   data:evidence restage [--slugs <file>]   bring promoted records that have a proposal back into staging
//                                            as revisions (promote them again with --replace-revisions)
//   data:evidence restage --enrich <dir> [--slugs <file>]  the same for the proposals in <dir> that have
//                                            facts, keeping the records' dates
async function main(argv: readonly string[]): Promise<void> {
  const [command, ...rest] = argv;
  if (command === "text") {
    const url = rest[0];
    if (url === undefined) throw new Error("usage: data:evidence text <url>");
    console.log(await pageText(url));
    return;
  }
  if (command === "check") {
    const [url, ...words] = rest;
    if (url === undefined || words.length === 0)
      throw new Error('usage: data:evidence check <url> "<quote>"');
    const found = quoteInText(words.join(" "), await pageText(url));
    console.log(found ? "FOUND" : "NOT FOUND");
    process.exitCode = found ? 0 : 1;
    return;
  }
  if (command === "verify") {
    await verifyAll(rest.includes("--dry-run"), await readSlugFilter(rest), {
      enrichDir: flagOf(rest, "enrich"),
    });
    return;
  }
  if (command === "restage") {
    const only = await readSlugFilter(rest);
    const enrichDir = flagOf(rest, "enrich");
    requireSlugsForEnrichRestage(enrichDir, only);
    await restage(only, { enrichDir });
    return;
  }
  throw new Error("commands: text | check | verify | restage");
}

type Staged = Record<string, unknown>;

function flagOf(argv: readonly string[], name: string): string | null {
  const at = argv.indexOf(`--${name}`);
  if (at === -1) return null;
  const value = argv[at + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value`);
  return value;
}

// An explicit list of slugs to act on: restage reopens records for audit (and drops their audit
// rows), so it must be possible to name exactly which ones. An empty file is refused rather than
// read as "everything".
export function inSelection(slug: string, only: ReadonlySet<string> | null): boolean {
  return only === null || only.has(slug);
}

// restage reopens records for audit and drops their audit rows: with --enrich it must never default
// to every record that has a proposal.
export function requireSlugsForEnrichRestage(
  enrichDir: string | null,
  only: ReadonlySet<string> | null,
): void {
  if (enrichDir !== null && only === null)
    throw new Error("restage --enrich needs --slugs <file>: it will not restage every proposal");
}

export async function readSlugFilter(argv: readonly string[]): Promise<Set<string> | null> {
  const at = argv.indexOf("--slugs");
  if (at === -1) return null;
  const file = argv[at + 1];
  if (file === undefined) throw new Error("--slugs needs a file");
  const slugs = (await readFile(file, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (slugs.length === 0) throw new Error(`${file} is empty: refusing to treat it as "everything"`);
  return new Set(slugs);
}

// The inverse of stampVerified: a revision goes through the audit again, so its dates are cleared.
function clearVerified(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clearVerified);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, k === "last_verified_at" ? null : clearVerified(v)]),
  );
}

function stagedReview(record: Staged): object {
  const review = record._review;
  return typeof review === "object" && review !== null ? review : {};
}

function carriesEnrichment(record: Staged): boolean {
  const review = stagedReview(record);
  const evidence = Reflect.get(review, "evidence");
  return (
    Reflect.get(review, "preparedBy") !== undefined ||
    (Array.isArray(evidence) && evidence.length > 0)
  );
}

// An enrichment proposal that proves nothing has nothing to add to a record already in data/.
function hasFacts(proposal: unknown): boolean {
  const facts =
    typeof proposal === "object" && proposal !== null ? Reflect.get(proposal, "facts") : null;
  return typeof facts === "object" && facts !== null && Object.keys(facts).length > 0;
}

// Brings records that were already promoted and now have a proposal back into staging as
// revisions (same slug and source id, dates cleared). Their audit rows are dropped, so the next
// `data:audit draw` puts them in a new batch: a promotion approval never covers changed content.
// With `enrichDir` the proposals come from that directory, only those with facts are used, and the
// record keeps its dates: enrichment adds facts, it does not reopen what was already verified.
export async function restage(
  only: ReadonlySet<string> | null = null,
  options: { enrichDir?: string | null; stagingDir?: string; dataDir?: string } = {},
): Promise<string[]> {
  const stagingDir = options.stagingDir ?? STAGING_DIR;
  const dataDir = options.dataDir ?? DATA_DIR;
  const enrichDir = options.enrichDir ?? null;
  const ledger = await readLedgerRows(stagingDir);
  const restaged: string[] = [];
  // Only programmes: their proposals are the ones that gain facts after promotion.
  for (const kind of ["programs"]) {
    const dir = enrichDir ?? path.join(proposalsDir(stagingDir), kind);
    if (!existsSync(dir)) continue;
    for (const name of (await readdir(dir)).sort()) {
      if (!name.endsWith(".json")) continue;
      const slug = name.slice(0, -".json".length);
      if (!inSelection(slug, only)) continue;
      const promoted = path.join(dataDir, kind, `${slug}.yaml`);
      if (!existsSync(promoted)) continue;
      if (existsSync(stageFile(kind, slug, stagingDir))) {
        console.log(`already staged, skipped: ${slug}`);
        continue;
      }
      if (enrichDir !== null) {
        const proposal: unknown = JSON.parse(await readFile(path.join(dir, name), "utf8"));
        if (!hasFacts(proposal)) continue;
      }
      const parsed = parse(await readFile(promoted, "utf8")) as Staged;
      const record = enrichDir === null ? (clearVerified(parsed) as Staged) : parsed;
      const row = ledger.find((r) => r.collection === kind && r.slug === slug);
      await mkdir(path.dirname(stageFile(kind, slug, stagingDir)), { recursive: true });
      await writeFile(
        stageFile(kind, slug, stagingDir),
        toYaml({
          ...record,
          _review: {
            kind,
            slug,
            name: String(record.name ?? slug),
            ...(row === undefined ? {} : { sourceId: row.sourceId }),
            revises: true,
            // verify --enrich only touches records restaged for it
            ...(enrichDir === null ? {} : { enrich: true }),
            todo:
              enrichDir === null
                ? "revision of a record already in data/: promote with --replace-revisions after the audit"
                : "enrichment of a record already in data/: new facts only; promote with --replace-revisions after the audit",
          },
        }),
      );
      restaged.push(`${kind}/${slug}`);
    }
  }
  const audit = await readAudit(stagingDir);
  const drop = new Set(restaged);
  if (restaged.length > 0) {
    await writeFile(
      path.join(stagingDir, "AUDIT.csv"),
      auditCsv(audit.filter((r) => !drop.has(r.key))),
    );
  }
  console.log(`restaged ${restaged.length} record(s); their audit rows were dropped`);
  return restaged;
}

const today = () => new Date().toISOString().slice(0, 10);

async function loadStaged(
  collection: string,
  slug: string,
  stagingDir: string,
): Promise<Staged | null> {
  const file = stageFile(collection, slug, stagingDir);
  if (!existsSync(file)) return null;
  const parsed: unknown = parse(await readFile(file, "utf8"));
  return typeof parsed === "object" && parsed !== null ? (parsed as Staged) : null;
}

// A national page cited by hundreds of proposals is fetched and converted once per run. A failed
// fetch is forgotten, so a later proposal retries it.
function memoText(getText: GetText): GetText {
  const seen = new Map<string, Promise<string>>();
  return (url) => {
    const hit = seen.get(url);
    if (hit !== undefined) return hit;
    const pending = getText(url);
    seen.set(url, pending);
    pending.catch(() => seen.delete(url));
    return pending;
  };
}

// `getText` is injectable so tests never touch the network.
export async function verifyAll(
  dryRun: boolean,
  only: ReadonlySet<string> | null = null,
  options: { enrichDir?: string | null; stagingDir?: string; getText?: GetText } = {},
): Promise<void> {
  const stagingDir = options.stagingDir ?? STAGING_DIR;
  const enrichDir = options.enrichDir ?? null;
  const getText = memoText(options.getText ?? pageText);
  const root = proposalsDir(stagingDir);
  if (enrichDir === null && !existsSync(root)) {
    console.log("no proposals directory");
    return;
  }
  let applied = 0;
  let blocked = 0;
  const noNewFacts: string[] = [];
  const kinds =
    enrichDir === null ? ["programs", "institutions", "application-channels"] : ["programs"];
  for (const kind of kinds) {
    const dir = enrichDir ?? path.join(root, kind);
    if (!existsSync(dir)) continue;
    for (const name of (await readdir(dir)).sort()) {
      if (!name.endsWith(".json")) continue;
      const raw: unknown = JSON.parse(await readFile(path.join(dir, name), "utf8"));
      const slug = name.slice(0, -".json".length);
      if (!inSelection(slug, only)) continue;
      const staged = await loadStaged(kind, slug, stagingDir);
      if (staged === null) {
        console.log(`${kind}/${slug}: no staged record`);
        continue;
      }
      if (enrichDir !== null && Reflect.get(stagedReview(staged), "enrich") !== true) {
        console.log(`skipped (not restaged for enrichment): ${slug}`);
        continue;
      }
      if (enrichDir === null && Reflect.get(stagedReview(staged), "enrich") === true) {
        console.log(`skipped (restaged for enrichment: use --enrich): ${slug}`);
        continue;
      }
      const label = String(staged.name ?? slug);
      let next: Staged = staged;
      let summary: string;
      let conflicts: string[] = [];
      if (kind === "programs") {
        const proposal = ProposalSchema.parse(raw);
        const verified = await verifyProposal(proposal, label, getText);
        const rejected =
          verified.rejected.length > 0
            ? `; rejected: ${verified.rejected.map((r) => `${r.fact} (${r.reason})`).join("; ")}`
            : "";
        if (enrichDir === null) {
          next = applyVerified(staged, verified, today());
          summary = `accepted ${Object.keys(verified.facts).join(", ") || "no facts"}; page ${verified.programmePage === null ? "NOT verified" : "ok"}${rejected}`;
          if (verified.programmePage === null) blocked++;
        } else {
          const enriched = enrichRecord(staged, verified, today());
          next = enriched.record;
          const filled = enrichedFields(staged, next);
          conflicts = enriched.conflicts;
          const kept = [
            ...(conflicts.some((c) => c.includes("kept the existing official value"))
              ? ["kept existing official value"]
              : []),
            ...(conflicts.some((c) => c.includes("kept the register value"))
              ? ["kept the register value"]
              : []),
          ]
            .map((text) => `; ${text}`)
            .join("");
          const ignored =
            (verified.requirements?.length ?? 0) > 0 ? "; requirements ignored in enrich mode" : "";
          summary = `${filled.length === 0 ? "no new facts" : `enriched ${filled.join(", ")}`}; page ${
            verified.programmePage === null ? "NOT verified" : "ok"
          }${kept}${ignored}${rejected}`;
          if (filled.length === 0) noNewFacts.push(slug);
        }
      } else if (kind === "institutions") {
        const proposal = InstitutionProposalSchema.parse(raw);
        const verified = await verifyInstitution(proposal, label, getText);
        if (verified.ok) next = applyRecord(staged, verified, today(), proposal.website);
        summary = verified.ok ? "verified" : `NOT verified: ${verified.reason}`;
        if (!verified.ok) blocked++;
      } else {
        const proposal = ChannelProposalSchema.parse(raw);
        const verified = await verifyChannel(proposal, label, getText);
        if (verified.ok) next = applyRecord(staged, verified, today());
        summary = verified.ok ? "verified" : `NOT verified: ${verified.reason}`;
        if (!verified.ok) blocked++;
      }
      const left = kind === "programs" ? stillPlaceholder(next) : [];
      console.log(
        `${kind}/${slug}: ${summary}${left.length > 0 ? `; still to read: ${left.join(", ")}` : ""}`,
      );
      for (const note of conflicts) console.log(`  conflict: ${note}`);
      if (enrichDir !== null && noNewFacts.includes(slug)) {
        // a staged copy that carries earlier enrichment holds verified facts, and one that holds a
        // conflict note is the only record of the disagreement: never advise discarding either
        if (carriesEnrichment(staged))
          console.log(`no further facts for ${slug} (earlier enrichment kept)`);
        else if (conflicts.length > 0)
          console.log(
            `conflicts recorded: keep the staged revision until they are reported (${slug})`,
          );
        else console.log(`no new facts: discard the staged revision for ${slug}`);
      }
      if (!dryRun && next !== staged) {
        await mkdir(path.dirname(stageFile(kind, slug, stagingDir)), { recursive: true });
        await writeFile(stageFile(kind, slug, stagingDir), toYaml(next));
        applied++;
      }
    }
  }
  console.log(
    `${dryRun ? "would apply" : "applied"} ${applied} proposal(s); ${blocked} stay blocked`,
  );
}

if (process.argv[1]?.endsWith("evidence-cli.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
