import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { isValidIsoDate } from "@/data-schema/dates";
import { SUPPORT_COVERS } from "@/data-schema/records/scholarship";

import {
  amountInQuote,
  checkDeadline,
  mentionsInternationalApplicants,
  mentionsTranslation,
  normalizeForMatch,
  pageText,
  quoteInText,
  wholeWord,
} from "./evidence";
import { DocumentProposalSchema, type GetText } from "./proposals";
import { DATA_DIR, STAGING_DIR, stageFile, toYaml } from "./staging";

// A scholarship is proposed (by the assistant, from the provider's official pages) as a value for
// each field plus verbatim quotes. The code re-fetches every cited page and keeps a quote only if it
// is really there, then keeps a fact only if a kept quote supports it: the model proposes, the code
// decides, and what no quote supports stays unknown (null). The staged record goes through the same
// audit sample and promotion as the assistant-prepared programmes.
// Usage: data:scholarship verify <proposal.json> [--dry-run]
const Https = z.string().refine((u) => u.startsWith("https://") && URL.canParse(u), "https url");
const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const Ev = z.object({ url: Https, quote: z.string().min(1) });
const Text = z.object({
  fr: z.string().trim().min(1).max(400),
  en: z.string().trim().min(1).max(400).optional(),
});

export const ScholarshipProposalSchema = z.object({
  slug: Slug,
  name: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  destinations: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
  institutions: z.array(Slug).optional(),
  eligibleNationalities: z.array(z.string().regex(/^[A-Z]{2}$/)),
  fields: z.array(Slug),
  summary: Text,
  howToApply: Text,
  officialUrl: Https,
  // Amounts are in major units (EUR 5000 = 5000), whole numbers; code converts to minor units.
  support: z
    .object({
      amount: z
        .object({
          min: z.number().int().nonnegative(),
          max: z.number().int().nonnegative(),
          currency: z.string().regex(/^[A-Z]{3}$/),
          per: z.enum(["month", "year", "once", "total"]),
        })
        .refine((a) => a.min <= a.max, { message: "min must be <= max" })
        .nullable(),
      covers: z.array(z.enum(SUPPORT_COVERS)),
    })
    .nullable(),
  deadline: z
    .string()
    .refine(isValidIsoDate, { message: "Expected a real date YYYY-MM-DD" })
    .nullable(),
  documents: z.array(DocumentProposalSchema).nullable(),
  evidence: z.object({
    eligibility: z.array(Ev),
    level: z.array(Ev),
    support: z.array(Ev).optional(),
    deadline: z.array(Ev).optional(),
    howToApply: z.array(Ev),
  }),
});
export type ScholarshipProposal = z.infer<typeof ScholarshipProposalSchema>;

type Quote = { url: string; quote: string };
export type ScholarshipEvidence = { fact: string; url: string; quote: string };
export type ScholarshipVerified =
  | {
      ok: true;
      record: Record<string, unknown>;
      evidence: ScholarshipEvidence[];
      // Facts the proposal made that no quote supports: set to unknown, with the reason.
      notes: string[];
    }
  | { ok: false; reasons: string[] };

const LEVEL_WORDS = /bachelor|undergraduate|licence|first[- ]degree|erststudium/i;

// The currency, as the page writes it: a symbol, the code or the word.
const CURRENCY_WORDS: Record<string, RegExp> = {
  EUR: /€|\beur\b|euros?/i,
  USD: /\$|\busd\b|dollars?/i,
  GBP: /£|\bgbp\b|pounds?/i,
  CHF: /\bchf\b|swiss francs?|francs? suisses?/i,
  MAD: /\bmad\b|\bdh\b|dirhams?/i,
};
const currencyInQuote = (currency: string, quote: string): boolean =>
  (CURRENCY_WORDS[currency] ?? new RegExp(`\\b${currency}\\b`, "i")).test(quote);

// What the amount is paid per. An amount whose period the quote does not state is not kept: "5,000"
// once and "5,000" a month are different scholarships.
const PER_WORDS: Record<"month" | "year" | "once" | "total", RegExp> = {
  month: /month|monthly|monat|mensuel|\bmois\b|maand|\/\s*mo\b/i,
  year: /year|yearly|annual|per annum|jahr|jährlich|annuel|par an\b|par année|jaar/i,
  once: /one[- ]?(?:time|off)|once|lump[- ]sum|single payment|einmalig|eenmalig|forfait/i,
  total: /total|in all|overall|insgesamt|gesamt|whole|entire|au total|duration/i,
};

// What the support covers, as the page writes it. "other" cannot be recognised, so it is never kept.
const COVER_WORDS: Record<(typeof SUPPORT_COVERS)[number], RegExp | null> = {
  tuition:
    /tuition|study fees|fees|studiengeb|collegegeld|frais de scolarit|droits d['’]inscription/i,
  living:
    /living|subsistence|stipend|maintenance|allowance|lebenshaltung|livelihood|frais de vie|levensonderhoud/i,
  housing: /housing|accommodation|\brent\b|unterkunft|miete|logement|huisvesting/i,
  travel: /travel|flight|airfare|reise|voyage|billet d['’]avion|reiskosten/i,
  insurance: /insurance|versicherung|assurance|verzekering/i,
  other: null,
};

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function verifyScholarship(
  proposal: ScholarshipProposal,
  getText: GetText,
  options: { institutions?: ReadonlySet<string> } = {},
): Promise<ScholarshipVerified> {
  const reasons: string[] = [];
  const notes: string[] = [];

  const pages = new Map<string, string | null>();
  const textOf = async (url: string): Promise<string | null> => {
    if (!pages.has(url)) {
      try {
        pages.set(url, await getText(url));
      } catch {
        pages.set(url, null);
      }
    }
    return pages.get(url) ?? null;
  };
  // Quotes found verbatim on their pages; an unreachable page or an invented quote supports nothing.
  const accept = async (quotes: readonly Quote[] | undefined): Promise<Quote[]> => {
    const kept: Quote[] = [];
    for (const q of quotes ?? []) {
      const text = await textOf(q.url);
      if (text !== null && quoteInText(q.quote, text)) kept.push(q);
    }
    return kept;
  };

  if (!proposal.officialUrl.startsWith("https://")) reasons.push("official URL must be https");
  else if ((await textOf(proposal.officialUrl)) === null)
    reasons.push("official URL could not be fetched");

  const institutions = proposal.institutions ?? [];
  if (institutions.length > 0) {
    if (options.institutions === undefined)
      reasons.push("institutions cannot be checked: the list of known institutions was not given");
    else
      for (const slug of institutions)
        if (!options.institutions.has(slug)) reasons.push(`unknown institution slug ${slug}`);
  }

  const eligibility = await accept(proposal.evidence.eligibility);
  const international = eligibility.filter((q) => mentionsInternationalApplicants(q.quote));
  if (eligibility.length === 0)
    reasons.push("eligibility: no quote was found verbatim on the cited page(s)");
  else if (international.length === 0)
    reasons.push(
      "eligibility: no accepted quote says the scholarship is open to international (non-EU) applicants",
    );

  const levelAll = await accept(proposal.evidence.level);
  const level = levelAll.filter((q) => LEVEL_WORDS.test(q.quote));
  if (levelAll.length === 0)
    reasons.push("level: no quote was found verbatim on the cited page(s)");
  else if (level.length === 0)
    reasons.push("level: no accepted quote states a bachelor (undergraduate) level");

  const howToApply = await accept(proposal.evidence.howToApply);
  if (howToApply.length === 0)
    reasons.push("howToApply: no quote was found verbatim on the cited page(s)");

  const firstInternational = international[0];
  const firstHow = howToApply[0];
  if (reasons.length > 0 || firstInternational === undefined || firstHow === undefined)
    return { ok: false, reasons };

  // sources: the official page is page-1, then each other page in order of first use
  const sources: Record<string, { url: string; last_verified_at: null }> = {};
  const keys = new Map<string, string>();
  const keyFor = (url: string): string => {
    const known = keys.get(url);
    if (known !== undefined) return known;
    const key = `page-${keys.size + 1}`;
    keys.set(url, key);
    sources[key] = { url, last_verified_at: null };
    return key;
  };
  const officialKey = keyFor(proposal.officialUrl);

  const evidence: ScholarshipEvidence[] = [];
  const cite = (fact: string, quotes: readonly Quote[]): void => {
    for (const q of quotes)
      if (!evidence.some((e) => e.fact === fact && e.url === q.url && e.quote === q.quote))
        evidence.push({ fact, url: q.url, quote: q.quote });
  };
  cite("eligibility", eligibility);
  cite("level", level);
  cite("howToApply", howToApply);

  // --- support -----------------------------------------------------------------------------
  let support: unknown = null;
  let supportSource = officialKey;
  if (proposal.support !== null) {
    const claim = proposal.support;
    const quotes = await accept(proposal.evidence.support);
    const amount = claim.amount;
    const coversIn = (list: readonly Quote[]) =>
      claim.covers.filter((cover) => {
        const pattern = COVER_WORDS[cover];
        return pattern !== null && list.some((q) => pattern.test(q.quote));
      });
    if (quotes.length === 0) {
      notes.push("support: no quote was found verbatim on the cited page(s)");
    } else if (amount !== null) {
      const stating = quotes.find(
        (q) =>
          amountInQuote(amount.min, q.quote) &&
          amountInQuote(amount.max, q.quote) &&
          currencyInQuote(amount.currency, q.quote) &&
          PER_WORDS[amount.per].test(q.quote),
      );
      if (stating === undefined) {
        notes.push(
          `support: no accepted quote states ${amount.min}-${amount.max} ${amount.currency} per ${amount.per} (amounts, currency and period)`,
        );
      } else {
        support = {
          amount: {
            min: amount.min * 100,
            max: amount.max * 100,
            currency: amount.currency,
            per: amount.per,
          },
          covers: coversIn(quotes),
        };
        supportSource = keyFor(stating.url);
        cite("support", quotes);
      }
    } else {
      const covers = coversIn(quotes);
      if (covers.length === 0) {
        notes.push("support: no accepted quote names anything the support covers");
      } else {
        support = { amount: null, covers };
        const named = quotes.find((q) => COVER_WORDS[covers[0] ?? "other"]?.test(q.quote));
        supportSource = keyFor((named ?? quotes[0] ?? firstHow).url);
        cite("support", quotes);
      }
    }
  }

  // --- deadline ----------------------------------------------------------------------------
  let deadline: string | null = null;
  let deadlineSource = officialKey;
  if (proposal.deadline !== null) {
    const quotes = await accept(proposal.evidence.deadline);
    if (quotes.length === 0) {
      notes.push("deadline: no quote was found verbatim on the cited page(s)");
    } else {
      const checks = quotes.map((q) => ({
        q,
        check: checkDeadline(proposal.deadline ?? "", q.quote),
      }));
      const passed = checks.find((c) => c.check.ok);
      if (passed === undefined) {
        const first = checks[0]?.check;
        notes.push(
          `deadline: ${first !== undefined && !first.ok ? first.reason : "not supported"}`,
        );
      } else {
        deadline = proposal.deadline;
        deadlineSource = keyFor(passed.q.url);
        cite("deadline", [passed.q]);
      }
    }
  }

  // --- documents ---------------------------------------------------------------------------
  // A document is kept only when an accepted quote names it as the page writes it; a translation
  // claim needs a quote that names the document and mentions translation, otherwise it is unknown.
  let documents: unknown = null;
  let documentsSource = keyFor(firstHow.url);
  if (proposal.documents !== null) {
    const all = [...eligibility, ...level, ...howToApply];
    const normalized = all.map((q) => ({
      q,
      text: normalizeForMatch(q.quote),
      translation: mentionsTranslation(q.quote),
    }));
    const nameRegex = (quotedAs: string) => wholeWord(escapeRegex(normalizeForMatch(quotedAs)));
    const kept = [];
    const naming: Quote[] = [];
    for (const doc of proposal.documents) {
      const regex = nameRegex(doc.quotedAs);
      const hits = normalized.filter((n) => regex.test(n.text));
      if (hits.length === 0) {
        notes.push(`documents: no accepted quote names "${doc.quotedAs}": dropped`);
        continue;
      }
      naming.push(...hits.map((h) => h.q));
      const supported = hits.some((h) => h.translation);
      kept.push({
        slug: doc.slug,
        name: {
          fr: { text: doc.name.fr, status: "draft" },
          ...(doc.name.en === undefined ? {} : { en: { text: doc.name.en, status: "draft" } }),
        },
        translationRequired:
          doc.translationRequired === true && !supported ? null : doc.translationRequired,
      });
    }
    if (kept.length > 0) {
      documents = kept;
      documentsSource = keyFor((naming[0] ?? firstHow).url);
      cite("documents", naming);
    }
  }

  const lt = (text: { fr: string; en?: string | undefined }) => ({
    fr: { text: text.fr, status: "draft" },
    ...(text.en === undefined ? {} : { en: { text: text.en, status: "draft" } }),
  });
  const record: Record<string, unknown> = {
    slug: proposal.slug,
    name: proposal.name,
    provider: proposal.provider,
    destinations: proposal.destinations,
    eligibleNationalities: proposal.eligibleNationalities,
    fields: proposal.fields,
    ...(institutions.length > 0 ? { institutions } : {}),
    level: "bachelor",
    summary: lt(proposal.summary),
    support: { value: support, source: supportSource, info_kind: "official" },
    deadline: { value: deadline, source: deadlineSource, info_kind: "official" },
    requirements: {
      coverage: "partial",
      source: keyFor(firstInternational.url),
      info_kind: "official",
      rules: [],
    },
    documents: { value: documents, source: documentsSource, info_kind: "official" },
    howToApply: lt(proposal.howToApply),
    officialUrl: proposal.officialUrl,
    sources,
  };
  return { ok: true, record, evidence, notes };
}

// --- command line --------------------------------------------------------------------------------
export type VerifyDeps = {
  getText?: GetText;
  stagingDir?: string;
  dataDir?: string;
  today?: string;
};
export type VerifyOutcome = { ok: boolean; lines: string[] };

const PREPARED_TODO =
  "prepared by the assistant from the quoted pages (see evidence): included in the audit sample draw";

async function institutionSlugs(dataDir: string): Promise<Set<string>> {
  const dir = path.join(dataDir, "institutions");
  if (!existsSync(dir)) return new Set();
  return new Set(
    (await readdir(dir)).filter((n) => n.endsWith(".yaml")).map((n) => n.slice(0, -".yaml".length)),
  );
}

// Verifies one proposal file and, unless it is a dry run, stages the record. Never overwrites a
// staged file, nor a slug already promoted into data/.
export async function runVerify(
  options: { file: string; dryRun: boolean },
  deps: VerifyDeps = {},
): Promise<VerifyOutcome> {
  const stagingDir = deps.stagingDir ?? STAGING_DIR;
  const dataDir = deps.dataDir ?? DATA_DIR;
  const today = deps.today ?? new Date().toISOString().slice(0, 10);
  let proposal: ScholarshipProposal;
  try {
    proposal = ScholarshipProposalSchema.parse(JSON.parse(await readFile(options.file, "utf8")));
  } catch (error) {
    const detail =
      error instanceof z.ZodError
        ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : error instanceof Error
          ? error.message
          : String(error);
    return { ok: false, lines: [`invalid proposal ${options.file}: ${detail}`] };
  }
  const target = stageFile("scholarships", proposal.slug, stagingDir);
  if (!options.dryRun) {
    if (existsSync(target))
      return { ok: false, lines: [`${target} already exists: never overwritten`] };
    if (existsSync(path.join(dataDir, "scholarships", `${proposal.slug}.yaml`)))
      return {
        ok: false,
        lines: [`scholarships/${proposal.slug} is already in ${dataDir}/: never overwritten`],
      };
  }
  const verified = await verifyScholarship(proposal, deps.getText ?? pageText, {
    institutions: await institutionSlugs(dataDir),
  });
  if (!verified.ok)
    return { ok: false, lines: verified.reasons.map((reason) => `REJECTED ${reason}`) };

  const lines = [
    ...verified.evidence.map((e) => `accepted ${e.fact}: "${e.quote}" (${e.url})`),
    ...verified.notes.map((note) => `rejected ${note}`),
  ];
  if (options.dryRun) return { ok: true, lines: [...lines, "dry run: nothing written"] };
  const review = {
    kind: "scholarships",
    slug: proposal.slug,
    name: proposal.name,
    preparedBy: "assistant",
    preparedAt: today,
    officialUrl: proposal.officialUrl,
    evidence: verified.evidence,
    ...(verified.notes.length > 0 ? { rejected: verified.notes } : {}),
    todo: PREPARED_TODO,
  };
  await mkdir(path.dirname(target), { recursive: true });
  // "wx": fail instead of overwriting, even if another process created the file meanwhile.
  await writeFile(target, toYaml({ ...verified.record, _review: review }), { flag: "wx" });
  return { ok: true, lines: [...lines, `staged ${target}`] };
}

async function main(argv: readonly string[]): Promise<void> {
  const [command, file] = argv;
  if (command !== "verify" || file === undefined || file.startsWith("--"))
    throw new Error("usage: data:scholarship verify <proposal.json> [--dry-run]");
  const outcome = await runVerify({ file, dryRun: argv.includes("--dry-run") });
  for (const line of outcome.lines) console.log(line);
  if (!outcome.ok) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("scholarships.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
