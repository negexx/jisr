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
  InstitutionProposalSchema,
  ProposalSchema,
  stillPlaceholder,
  verifyChannel,
  verifyInstitution,
  verifyProposal,
} from "./proposals";
import { DATA_DIR, readLedgerRows, STAGING_DIR, stageFile, toYaml } from "./staging";

const PROPOSALS_DIR = path.join(STAGING_DIR, "proposals");

// Usage:
//   data:evidence text <url>                 print the visible text of a page (cached)
//   data:evidence check <url> "<quote>"      is the quote on the page, verbatim?
//   data:evidence verify [--dry-run] [--slugs <file>]  verify every data-staging/proposals/*.json and apply it
//                                            (only the slugs in <file>, one per line, when given)
//   data:evidence restage [--slugs <file>]   bring promoted records that have a proposal back into staging
//                                            as revisions (promote them again with --replace-revisions)
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
    await verifyAll(rest.includes("--dry-run"), await readSlugFilter(rest));
    return;
  }
  if (command === "restage") {
    await restage(await readSlugFilter(rest));
    return;
  }
  throw new Error("commands: text | check | verify | restage");
}

type Staged = Record<string, unknown>;

// An explicit list of slugs to act on: restage reopens records for audit (and drops their audit
// rows), so it must be possible to name exactly which ones. An empty file is refused rather than
// read as "everything".
export function inSelection(slug: string, only: ReadonlySet<string> | null): boolean {
  return only === null || only.has(slug);
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

// Brings records that were already promoted and now have a proposal back into staging as
// revisions (same slug and source id, dates cleared). Their audit rows are dropped, so the next
// `data:audit draw` puts them in a new batch: a promotion approval never covers changed content.
export async function restage(only: ReadonlySet<string> | null = null): Promise<void> {
  const ledger = await readLedgerRows();
  const restaged: string[] = [];
  // Only programmes: their proposals are the ones that gain facts after promotion.
  for (const kind of ["programs"]) {
    const dir = path.join(PROPOSALS_DIR, kind);
    if (!existsSync(dir)) continue;
    for (const name of (await readdir(dir)).sort()) {
      if (!name.endsWith(".json")) continue;
      const slug = name.slice(0, -".json".length);
      if (!inSelection(slug, only)) continue;
      const promoted = path.join(DATA_DIR, kind, `${slug}.yaml`);
      if (!existsSync(promoted) || existsSync(stageFile(kind, slug))) continue;
      const record = clearVerified(parse(await readFile(promoted, "utf8"))) as Staged;
      const row = ledger.find((r) => r.collection === kind && r.slug === slug);
      await mkdir(path.dirname(stageFile(kind, slug)), { recursive: true });
      await writeFile(
        stageFile(kind, slug),
        toYaml({
          ...record,
          _review: {
            kind,
            slug,
            name: String(record.name ?? slug),
            ...(row === undefined ? {} : { sourceId: row.sourceId }),
            revises: true,
            todo: "revision of a record already in data/: promote with --replace-revisions after the audit",
          },
        }),
      );
      restaged.push(`${kind}/${slug}`);
    }
  }
  const audit = await readAudit();
  const drop = new Set(restaged);
  if (restaged.length > 0) {
    await writeFile(
      path.join(STAGING_DIR, "AUDIT.csv"),
      auditCsv(audit.filter((r) => !drop.has(r.key))),
    );
  }
  console.log(`restaged ${restaged.length} record(s); their audit rows were dropped`);
}

const today = () => new Date().toISOString().slice(0, 10);

async function loadStaged(collection: string, slug: string): Promise<Staged | null> {
  const file = stageFile(collection, slug);
  if (!existsSync(file)) return null;
  const parsed: unknown = parse(await readFile(file, "utf8"));
  return typeof parsed === "object" && parsed !== null ? (parsed as Staged) : null;
}

async function verifyAll(dryRun: boolean, only: ReadonlySet<string> | null = null): Promise<void> {
  if (!existsSync(PROPOSALS_DIR)) {
    console.log("no proposals directory");
    return;
  }
  let applied = 0;
  let blocked = 0;
  for (const kind of ["programs", "institutions", "application-channels"]) {
    const dir = path.join(PROPOSALS_DIR, kind);
    if (!existsSync(dir)) continue;
    for (const name of (await readdir(dir)).sort()) {
      if (!name.endsWith(".json")) continue;
      const raw: unknown = JSON.parse(await readFile(path.join(dir, name), "utf8"));
      const slug = name.slice(0, -".json".length);
      if (!inSelection(slug, only)) continue;
      const staged = await loadStaged(kind, slug);
      if (staged === null) {
        console.log(`${kind}/${slug}: no staged record`);
        continue;
      }
      const label = String(staged.name ?? slug);
      let next: Staged = staged;
      let summary: string;
      if (kind === "programs") {
        const proposal = ProposalSchema.parse(raw);
        const verified = await verifyProposal(proposal, label, pageText);
        next = applyVerified(staged, verified, today());
        summary = `accepted ${Object.keys(verified.facts).join(", ") || "no facts"}; page ${verified.programmePage === null ? "NOT verified" : "ok"}${
          verified.rejected.length > 0
            ? `; rejected: ${verified.rejected.map((r) => `${r.fact} (${r.reason})`).join("; ")}`
            : ""
        }`;
        if (verified.programmePage === null) blocked++;
      } else if (kind === "institutions") {
        const proposal = InstitutionProposalSchema.parse(raw);
        const verified = await verifyInstitution(proposal, label, pageText);
        if (verified.ok) next = applyRecord(staged, verified, today(), proposal.website);
        summary = verified.ok ? "verified" : `NOT verified: ${verified.reason}`;
        if (!verified.ok) blocked++;
      } else {
        const proposal = ChannelProposalSchema.parse(raw);
        const verified = await verifyChannel(proposal, label, pageText);
        if (verified.ok) next = applyRecord(staged, verified, today());
        summary = verified.ok ? "verified" : `NOT verified: ${verified.reason}`;
        if (!verified.ok) blocked++;
      }
      const left = kind === "programs" ? stillPlaceholder(next) : [];
      console.log(
        `${kind}/${slug}: ${summary}${left.length > 0 ? `; still to read: ${left.join(", ")}` : ""}`,
      );
      if (!dryRun && next !== staged) {
        await mkdir(path.dirname(stageFile(kind, slug)), { recursive: true });
        await writeFile(stageFile(kind, slug), toYaml(next));
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
