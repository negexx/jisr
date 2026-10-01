import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { isValidIsoDate } from "@/data-schema/dates";
import { COLLECTIONS, isCollectionName } from "@/data-schema/records/collections";

import {
  appendLedger,
  DATA_DIR,
  type LedgerRow,
  readReviewState,
  STAGING_DIR,
  stageFile,
  toYaml,
} from "./staging";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Replaces every `last_verified_at: null` in a staged record with the review date.
export function stampVerified(value: unknown, date: string): unknown {
  if (Array.isArray(value)) return value.map((v) => stampVerified(v, date));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      k === "last_verified_at" && v === null ? date : stampVerified(v, date),
    ]),
  );
}

export type PromoteResult = { promoted: string[]; skipped: { key: string; reason: string }[] };

// Moves every approved, valid staged record into the data dir with its sources stamped. A record
// that does not validate (an unread fact, a missing website, ...) is skipped and stays staged.
export async function promoteApproved(options: {
  approved: ReadonlySet<string>;
  date: string;
  stagingDir?: string;
  dataDir?: string;
}): Promise<PromoteResult> {
  const stagingDir = options.stagingDir ?? STAGING_DIR;
  const dataDir = options.dataDir ?? DATA_DIR;
  const result: PromoteResult = { promoted: [], skipped: [] };
  const ledger: LedgerRow[] = [];
  const skip = (key: string, reason: string) => result.skipped.push({ key, reason });

  for (const key of [...options.approved].sort()) {
    const parts = key.split("/");
    const [collection, id] = parts;
    if (parts.length !== 2 || collection === undefined || id === undefined) {
      skip(key, "key must be <collection>/<slug>");
      continue;
    }
    if (!isCollectionName(collection) || !SLUG.test(id)) {
      skip(key, "unknown collection or invalid slug");
      continue;
    }
    const from = stageFile(collection, id, stagingDir);
    const to = path.join(dataDir, collection, `${id}.yaml`);
    if (!existsSync(from)) {
      skip(key, "no staged file");
      continue;
    }
    if (existsSync(to)) {
      skip(key, `already in ${dataDir}/ (never overwritten)`);
      continue;
    }
    const staged: unknown = parse(await readFile(from, "utf8"));
    if (typeof staged !== "object" || staged === null || Array.isArray(staged)) {
      skip(key, "not a record");
      continue;
    }
    const review = (staged as { _review?: { sourceId?: unknown } })._review;
    const sourceId = typeof review?.sourceId === "string" ? review.sourceId : null;
    const record = stampVerified(
      Object.fromEntries(Object.entries(staged).filter(([k]) => k !== "_review")),
      options.date,
    );
    const check = COLLECTIONS[collection].schema.safeParse(record);
    if (!check.success) {
      const issue = check.error.issues[0];
      skip(key, `still invalid at ${issue?.path.join(".") ?? "?"}: ${issue?.message ?? "?"}`);
      continue;
    }
    await mkdir(path.dirname(to), { recursive: true });
    try {
      // "wx": fail instead of overwriting, even if another process created the file meanwhile.
      await writeFile(to, toYaml(record as Record<string, unknown>), { flag: "wx" });
    } catch {
      skip(key, `could not create ${to}`);
      continue;
    }
    await rm(from);
    result.promoted.push(key);
    if (sourceId !== null) ledger.push({ collection, sourceId, slug: id, date: options.date });
  }
  await appendLedger(ledger, stagingDir);
  return result;
}

function usage(message: string): never {
  console.error(
    `${message}\nusage: pnpm data:promote --confirm-human-read --verified-on YYYY-MM-DD [--data-dir data]\n` +
      "Promotes rows marked approved=y in data-staging/REVIEW.csv into data/. Pass these flags only " +
      "after you have read each approved record's sources: the date you give becomes last_verified_at.",
  );
  process.exit(2);
}

async function main(argv: readonly string[]): Promise<void> {
  const at = argv.indexOf("--verified-on");
  const date = at === -1 ? undefined : argv[at + 1];
  if (!argv.includes("--confirm-human-read")) usage("--confirm-human-read is required");
  if (date === undefined || !isValidIsoDate(date)) {
    usage("--verified-on needs a real date YYYY-MM-DD");
  }
  if (date > new Date().toISOString().slice(0, 10)) usage("--verified-on cannot be in the future");
  const dirAt = argv.indexOf("--data-dir");
  const dataDir = dirAt === -1 ? DATA_DIR : (argv[dirAt + 1] ?? usage("--data-dir needs a value"));

  const { approved, warning } = await readReviewState();
  if (warning !== null) console.warn(`WARN ${warning}`);
  if (approved.size === 0) console.warn("WARN no row is approved (write y in the approved column)");

  const result = await promoteApproved({ approved, date, dataDir });
  for (const { key, reason } of result.skipped) console.warn(`skip ${key}: ${reason}`);
  console.log(
    `promoted ${result.promoted.length} record(s), skipped ${result.skipped.length}. ` +
      "Next: pnpm data:check (reports dangling references, e.g. a programme's institution).",
  );
}

// Only run as a CLI, so tests can import the functions.
if (process.argv[1]?.endsWith("promote.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
