import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { isValidIsoDate } from "@/data-schema/dates";
import { COLLECTIONS } from "@/data-schema/records/collections";

import {
  appendLedger,
  DATA_DIR,
  type LedgerRow,
  readLedger,
  STAGING_DIR,
  stageFile,
  toYaml,
} from "./staging";

// The "register listing" tier. A human cannot read thousands of records, so this tier publishes only
// what an official register states about a programme (its name, institution, town, field, level and
// a link to the official page), leaves every other fact as "to be checked" (null) and records the
// tier in the ledger as `register-listing`. Nothing here is read or quoted by anyone: the trust in it
// is the trust in the register and in the deterministic importer, which the checks in
// `data:check`, the schema and the link check (`data:evidence linkcheck`) test at scale.
export const LISTING_LEVEL = "register-listing";

type Rec = Record<string, unknown>;
const asRec = (v: unknown): Rec =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : {};
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const https = (v: unknown): string | null => {
  const s = str(v);
  return s?.startsWith("https://") === true && URL.canParse(s) ? s : null;
};

// --- institutions --------------------------------------------------------------------------------
// Only institutions that come from an official register entry (Parcoursup/ESR for France, the HRK
// list for Germany). A programme-only name (e.g. from the DAAD database) may duplicate an HRK
// institution under another name, so it is never listed on its own.
export function listingInstitution(staged: Rec, date: string): Rec | null {
  const review = asRec(staged._review);
  const sourceId = str(review.sourceId) ?? "";
  const country = str(staged.country);
  const todo = str(review.todo) ?? "";
  const isFrance = country === "FR" && sourceId.startsWith("uai:");
  const isGermany = country === "DE" && sourceId.startsWith("hrk:");
  if (!isFrance && !isGermany) return null;

  const type = staged.type === "public" || staged.type === "private" ? staged.type : null;
  // France: the website is listed only when the ministry's own register confirmed it. Germany: the
  // HRK homepage, unless https redirects to another domain (a possible different institution).
  const website = isFrance
    ? staged.info_kind === "official"
      ? https(staged.website)
      : null
    : /redirects to a different domain/.test(todo)
      ? null
      : https(staged.website);

  const sources = asRec(staged.sources);
  const key = str(staged.source) ?? Object.keys(sources)[0] ?? null;
  const source = key === null ? null : asRec(sources[key]);
  const url = source === null ? null : https(source.url);
  if (key === null || url === null) return null;

  const { _review: _drop, ...rest } = staged;
  return {
    ...rest,
    type,
    website,
    source: key,
    info_kind: "official",
    sources: { [key]: { url, last_verified_at: date } },
  };
}

// --- programmes ----------------------------------------------------------------------------------
const FACTS = ["tuition", "intakes", "applicationChannel", "documents"] as const;

export function listingProgramme(staged: Rec, date: string): Rec | null {
  const review = asRec(staged._review);
  const sourceId = str(review.sourceId) ?? "";
  // The field must be a confident classification, and nobody has touched the record yet.
  if (review.confidence !== "high" || review.preparedBy !== undefined) return null;

  const isFrance = sourceId.startsWith("parcoursup:");
  const isDaad = sourceId.startsWith("daad:");
  if (!isFrance && !isDaad) return null;

  const sources = asRec(staged.sources);
  const key = isFrance ? "fiche" : "daad";
  const page = https(asRec(sources[key]).url);
  if (page === null) return null;
  const known = (value: unknown, kind: "guidance" | "official") => ({
    value,
    source: key,
    info_kind: kind,
  });
  // The DAAD database states these two plainly. DAAD is a listing service, not the institution, so
  // its values are guidance. Its deadline is not used: it may be the one for EU applicants.
  const daadDuration = asRec(staged.durationYears).value;
  const daadLanguages = asRec(staged.teachingLanguages).value;
  const kind = isFrance ? "official" : "guidance";

  const { _review: _drop, ...rest } = staged;
  const record: Rec = {
    ...rest,
    officialUrl: page,
    durationYears: known(
      isDaad && typeof daadDuration === "number" && daadDuration > 0 ? daadDuration : null,
      kind,
    ),
    teachingLanguages: known(
      isDaad && Array.isArray(daadLanguages) && daadLanguages.length > 0 ? daadLanguages : null,
      kind,
    ),
    requirements: { coverage: "partial", source: key, info_kind: kind, rules: [] },
    sources: { [key]: { url: page, last_verified_at: date } },
  };
  for (const fact of FACTS) record[fact] = known(null, kind);
  return record;
}

// --- the promotion -------------------------------------------------------------------------------
export type ListingResult = {
  institutions: number;
  programmes: number;
  skipped: Record<string, number>;
};

async function readDir(dir: string): Promise<{ id: string; file: string; record: Rec }[]> {
  if (!existsSync(dir)) return [];
  const out: { id: string; file: string; record: Rec }[] = [];
  for (const name of (await readdir(dir)).sort()) {
    if (!name.endsWith(".yaml")) continue;
    const file = path.join(dir, name);
    out.push({
      id: name.slice(0, -".yaml".length),
      file,
      record: asRec(parse(await readFile(file, "utf8"))),
    });
  }
  return out;
}

export async function promoteListing(options: {
  date: string;
  dryRun?: boolean;
  stagingDir?: string;
  dataDir?: string;
  limit?: number;
}): Promise<ListingResult> {
  const stagingDir = options.stagingDir ?? STAGING_DIR;
  const dataDir = options.dataDir ?? DATA_DIR;
  const result: ListingResult = { institutions: 0, programmes: 0, skipped: {} };
  const skip = (reason: string) => {
    result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
  };
  const ledger = await readLedger(stagingDir);
  const rows: LedgerRow[] = [];
  const batch = `listing-${options.date}`;

  const institutions = new Map<string, { file: string; record: Rec }>();
  for (const i of await readDir(path.join(stagingDir, "institutions"))) institutions.set(i.id, i);
  const existing = new Set((await readDir(path.join(dataDir, "institutions"))).map((i) => i.id));

  // Programmes first: an institution is listed only if one of its programmes is.
  const listed: { id: string; file: string; record: Rec; sourceId: string | null }[] = [];
  for (const p of await readDir(path.join(stagingDir, "programs"))) {
    if (options.limit !== undefined && listed.length >= options.limit) break;
    const sourceId = str(asRec(p.record._review).sourceId);
    if (sourceId !== null && ledger.has(`programs|${sourceId}`)) {
      skip("already promoted");
      continue;
    }
    if (existsSync(path.join(dataDir, "programs", `${p.id}.yaml`))) {
      skip("already in data/");
      continue;
    }
    const record = listingProgramme(p.record, options.date);
    if (record === null) {
      skip("not eligible (source, field confidence or page link)");
      continue;
    }
    const institutionId = str(record.institution) ?? "";
    const institution = institutions.get(institutionId);
    if (!existing.has(institutionId)) {
      const built =
        institution === undefined ? null : listingInstitution(institution.record, options.date);
      if (built === null) {
        skip("institution not from an official register");
        continue;
      }
      const check = COLLECTIONS.institutions.schema.safeParse(built);
      if (!check.success) {
        skip(`institution invalid: ${check.error.issues[0]?.message ?? "?"}`);
        continue;
      }
    }
    const check = COLLECTIONS.programs.schema.safeParse(record);
    if (!check.success) {
      skip(`programme invalid at ${check.error.issues[0]?.path.join(".") ?? "?"}`);
      continue;
    }
    listed.push({ id: p.id, file: p.file, record, sourceId });
  }

  const writeNew = async (
    collection: "programs" | "institutions",
    id: string,
    record: Rec,
    from: string,
    sourceId: string | null,
  ) => {
    const to = path.join(dataDir, collection, `${id}.yaml`);
    if (!options.dryRun) {
      await mkdir(path.dirname(to), { recursive: true });
      await writeFile(to, toYaml(record), { flag: "wx" });
      await rm(from);
    }
    if (sourceId !== null)
      rows.push({
        collection,
        sourceId,
        slug: id,
        date: options.date,
        level: LISTING_LEVEL,
        batch,
      });
  };

  for (const p of listed) {
    const institutionId = str(p.record.institution) ?? "";
    if (!existing.has(institutionId)) {
      const institution = institutions.get(institutionId);
      const built =
        institution === undefined ? null : listingInstitution(institution.record, options.date);
      if (institution !== undefined && built !== null) {
        await writeNew(
          "institutions",
          institutionId,
          built,
          institution.file,
          str(asRec(institution.record._review).sourceId),
        );
        existing.add(institutionId);
        result.institutions++;
      }
    }
    await writeNew("programs", p.id, p.record, p.file, p.sourceId);
    result.programmes++;
  }
  if (!options.dryRun) await appendLedger(rows, stagingDir);
  return result;
}

async function main(argv: readonly string[]): Promise<void> {
  const at = argv.indexOf("--verified-on");
  const date = at === -1 ? new Date().toISOString().slice(0, 10) : argv[at + 1];
  if (date === undefined || !isValidIsoDate(date))
    throw new Error("--verified-on needs YYYY-MM-DD");
  const limitAt = argv.indexOf("--limit");
  const limit = limitAt === -1 ? undefined : Number(argv[limitAt + 1]);
  const result = await promoteListing({
    date,
    dryRun: argv.includes("--dry-run"),
    ...(limit === undefined ? {} : { limit }),
  });
  console.log(
    `${argv.includes("--dry-run") ? "would list" : "listed"} ${result.programmes} programme(s) and ${result.institutions} new institution(s) as ${LISTING_LEVEL}`,
  );
  for (const [reason, count] of Object.entries(result.skipped).sort((a, b) => b[1] - a[1]))
    console.log(`  skipped ${count}: ${reason}`);
}

if (process.argv[1]?.endsWith("listing.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

export { stageFile };
