import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

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
import { STAGING_DIR, stageFile, toYaml } from "./staging";

const PROPOSALS_DIR = path.join(STAGING_DIR, "proposals");

// Usage:
//   data:evidence text <url>                 print the visible text of a page (cached)
//   data:evidence check <url> "<quote>"      is the quote on the page, verbatim?
//   data:evidence verify [--dry-run]         verify every data-staging/proposals/*.json and apply it
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
    await verifyAll(rest.includes("--dry-run"));
    return;
  }
  throw new Error("commands: text | check | verify");
}

type Staged = Record<string, unknown>;
const today = () => new Date().toISOString().slice(0, 10);

async function loadStaged(collection: string, slug: string): Promise<Staged | null> {
  const file = stageFile(collection, slug);
  if (!existsSync(file)) return null;
  const parsed: unknown = parse(await readFile(file, "utf8"));
  return typeof parsed === "object" && parsed !== null ? (parsed as Staged) : null;
}

async function verifyAll(dryRun: boolean): Promise<void> {
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
