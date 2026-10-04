import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { readFiche } from "./enrich-fr";
import { pageText } from "./evidence";
import { staleProposalFiles, writeCalendarProposals } from "./fr-calendar";
import { type Proposal, ProposalSchema } from "./proposals";
import { DATA_DIR, STAGING_DIR } from "./staging";

// Every Parcoursup fiche prints "Niveau de français requis pour s'inscrire à la formation : B2". The
// owner accepted that line as the evidence for a French teaching language (435 records rest on it).
// This reads it by code, with no model, for the programmes that still have no language. The line is
// printed on every fiche, so it cannot stand alone: a formation taught in English still shows it
// ("entièrement dispensée en langue anglaise", "Option Internationale (>50% des cours en anglais)").
// A fiche that shows instruction in another language gets no proposal and stays unknown; the guard is
// deliberately over-cautious (a fiche that says the students "need English skills" is skipped too).
export type FrenchLanguageOutcome =
  | { ok: true; quote: string; level: string }
  | { ok: false; reason: "no-level-line" | "other-language" };

const LANGUAGES =
  "anglais\\w*|english|allemand\\w*|espagnol\\w*|italien\\w*|chinois\\w*|arabe|portugais\\w*|japonais\\w*|russe";
const OTHER_LANGUAGE_SIGNALS: readonly RegExp[] = [
  // an instruction word shortly before "en anglais" / "en langue anglaise" (a skill such as
  // "compétences en langue anglaise" is not instruction). `cours` has no leading \b on purpose: it
  // also matches "parcours" and "concours", which only adds refusals.
  new RegExp(
    `(?:dispens\\w*|enseign\\w*|interven\\w*|cours|dirig\\w*|d[ée]livr\\w*|assur\\w*|taught)\\b[^.;:]{0,60}?\\ben\\s+(?:langues?\\s+)?(?:${LANGUAGES})\\b`,
    "i",
  ),
  // "entièrement en anglais", "50% en langue anglaise"
  new RegExp(
    `(?:enti[èe]rement|int[ée]gralement|partiellement|exclusivement|\\d+\\s*%[^.;:]{0,30})\\s+en\\s+(?:langues?\\s+)?(?:${LANGUAGES})\\b`,
    "i",
  ),
  /\ben\s+langues?\s+[ée]trang[èe]res?\b/i,
  /\bin english\b/i,
  /\btaught in\b/i,
  /anglophone|bilingue|bilingual/i,
  /(?:parcours|option|cursus|fili[eè]re)\s+(?:«\s*)?internationa(?:l|le)\b/i,
  // the fiche names the language of work or of instruction, or asks for another language's level
  /langues?\s+(?:de travail|d['’]enseignement|de la formation)/i,
  /\blanguages?\s*:/i,
  /Niveau d['’](?:anglais|allemand|espagnol|italien|chinois|arabe|portugais|japonais|russe)\w*\s+requis/i,
  // part of the degree is taught with a foreign partner or in a foreign programme
  /double dipl[oô]m|triple dipl[oô]m|partenariat international|franco-(?:allemand|suisse|britannique|espagnol|italien)\w*|bachelor of|licence internationale/i,
];

export function frenchLanguage(text: string): FrenchLanguageOutcome {
  const level = readFiche(text).frenchLevel;
  if (level === null) return { ok: false, reason: "no-level-line" };
  if (OTHER_LANGUAGE_SIGNALS.some((pattern) => pattern.test(text)))
    return { ok: false, reason: "other-language" };
  return { ok: true, quote: level.quote, level: level.level };
}

export type FrenchProgramme = { slug: string; url: string };

export async function buildFrenchLanguageProposals(input: {
  programmes: readonly FrenchProgramme[];
  textOf: (url: string) => Promise<string>;
}): Promise<{ proposals: Proposal[]; skipped: { slug: string; reason: string }[] }> {
  const proposals: Proposal[] = [];
  const skipped: { slug: string; reason: string }[] = [];
  for (const { slug, url } of input.programmes) {
    let text: string;
    try {
      text = await input.textOf(url);
    } catch {
      skipped.push({ slug, reason: "page unreadable" });
      continue;
    }
    const outcome = frenchLanguage(text);
    if (!outcome.ok) {
      skipped.push({ slug, reason: outcome.reason });
      continue;
    }
    proposals.push(
      ProposalSchema.parse({
        slug,
        programmePage: url,
        facts: {
          teachingLanguages: { value: ["fr"], evidence: [{ url, quote: outcome.quote }] },
        },
      }),
    );
  }
  return { proposals, skipped };
}

const FICHE_PAGE = /^https:\/\/dossierappel\.parcoursup\.fr\//;

const hasLanguage = (record: Record<string, unknown>): boolean => {
  const fact = record.teachingLanguages;
  const value = typeof fact === "object" && fact !== null && "value" in fact ? fact.value : null;
  return Array.isArray(value) && value.length > 0;
};

// The French programmes of a data directory whose programme page is a Parcoursup fiche and that hold
// no teaching language. `no-website` keeps those whose institution record has no https website.
export async function readFrenchProgrammes(
  dataDir: string,
  scope: "no-website" | "all",
): Promise<FrenchProgramme[]> {
  const read = async (file: string) =>
    parse(await readFile(file, "utf8")) as Record<string, unknown> | null;
  const hasWebsite = new Map<string, boolean>();
  const institutionsDir = path.join(dataDir, "institutions");
  for (const file of await readdir(institutionsDir)) {
    if (!file.endsWith(".yaml")) continue;
    const record = await read(path.join(institutionsDir, file));
    if (record === null || typeof record.slug !== "string") continue;
    hasWebsite.set(
      record.slug,
      typeof record.website === "string" && record.website.startsWith("https://"),
    );
  }
  const programsDir = path.join(dataDir, "programs");
  const found: FrenchProgramme[] = [];
  for (const file of (await readdir(programsDir)).sort()) {
    if (!file.startsWith("fr-") || !file.endsWith(".yaml")) continue;
    const record = await read(path.join(programsDir, file));
    if (record === null || typeof record.slug !== "string") continue;
    const url = record.officialUrl;
    if (typeof url !== "string" || !FICHE_PAGE.test(url) || hasLanguage(record)) continue;
    if (scope === "no-website" && hasWebsite.get(String(record.institution)) === true) continue;
    found.push({ slug: record.slug, url });
  }
  return found;
}

async function main(argv: readonly string[]): Promise<void> {
  const dry = argv.includes("--dry-run");
  const scope = argv.includes("--all") ? "all" : "no-website";
  const programmes = await readFrenchProgrammes(DATA_DIR, scope);
  const { proposals, skipped } = await buildFrenchLanguageProposals({
    programmes,
    textOf: pageText,
  });
  const out = path.join(STAGING_DIR, "proposals-fr-language-fiche");
  await writeCalendarProposals(proposals, out, dry);
  console.log(
    `${dry ? "would write" : "wrote"} ${proposals.length} language proposals to ${out} (${programmes.length} French programmes without a language, scope ${scope})`,
  );
  const reasons = new Map<string, number>();
  for (const { reason } of skipped) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  for (const [reason, count] of [...reasons].sort()) console.log(`  skipped, ${reason}: ${count}`);
  const stale = await staleProposalFiles(out, proposals);
  if (stale.length > 0)
    console.warn(
      `warning: ${stale.length} proposal file(s) in ${out} were not produced by this run (kept, not deleted): ${stale.slice(0, 5).join(", ")}${stale.length > 5 ? ", ..." : ""}`,
    );
}

if (process.argv[1]?.endsWith("fr-language.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
