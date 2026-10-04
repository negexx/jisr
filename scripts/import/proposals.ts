import { z } from "zod";

import {
  checkCefr,
  checkChannel,
  checkDeadline,
  checkDuration,
  checkLanguages,
  checkRecurringDeadline,
  checkSubjects,
  checkTests,
  checkTuition,
  checkYears,
  currentStudyYear,
  type FactCheck,
  mentionsInternationalApplicants,
  mentionsTranslation,
  normalizeForMatch,
  programmeNameMatches,
  quoteInText,
  quoteNames,
  wholeWord,
} from "./evidence";
import { READ_SOURCE } from "./staging";

// What the assistant writes after reading the pages: a value for each fact it could establish,
// each with quotes (url + verbatim sentence). The code then re-fetches every page and accepts a
// fact only if a quote is really on the page and the value agrees with it.
const Https = z.string().refine((u) => u.startsWith("https://") && URL.canParse(u), "https url");
const EvidenceSchema = z.object({ url: Https, quote: z.string().min(1) });
const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const fact = <T extends z.ZodType>(value: T) =>
  z.object({ value, evidence: z.array(EvidenceSchema).min(1) });

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MonthDayProposalSchema = z
  .object({ month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) })
  .refine(({ month, day }) => day <= (DAYS_IN_MONTH[month - 1] ?? 0), {
    message: "that day does not exist in that month",
  });

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const DocumentSlug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const DocumentProposalSchema = z.object({
  slug: DocumentSlug,
  name: z.object({
    fr: z.string().trim().min(1).max(200),
    en: z.string().trim().min(1).max(200).optional(),
  }),
  // The document's name exactly as the quote writes it, in the page's own language: it ties the
  // item to the quotes, so a document the pages never name cannot be kept.
  quotedAs: z.string().trim().min(2).max(120),
  translationRequired: z.boolean().nullable(),
});
export type DocumentProposal = z.infer<typeof DocumentProposalSchema>;

// Admission requirements are encoded only as rules the matcher can evaluate or as a manual check.
// Grade thresholds are deliberately not offered: they depend on a destination grading scale that
// is not in the data, so a grade requirement is written as a manual_check quoting the page.
const RuleProposalSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("language_proficiency"),
    language: z.string().regex(/^[a-z]{2}$/),
    minCefr: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).nullable(),
    certificateRequired: z.boolean().nullable(),
    acceptedTests: z.array(z.string()),
    evidence: z.array(EvidenceSchema).min(1),
  }),
  z.object({
    kind: z.literal("subject_taken"),
    subjects: z.array(z.string()).min(1),
    mode: z.enum(["all", "any"]),
    evidence: z.array(EvidenceSchema).min(1),
  }),
  z.object({
    kind: z.literal("prior_study_years_min"),
    years: z.number().int().min(1),
    evidence: z.array(EvidenceSchema).min(1),
  }),
  z.object({
    kind: z.literal("manual_check"),
    // What the applicant must check, short. French is required; en and ar are drafts. A bare
    // string is French only. The quote is the evidence.
    note: z.union([
      z.string().min(1),
      z.object({
        fr: z.string().min(1),
        en: z.string().min(1).optional(),
        ar: z.string().min(1).optional(),
      }),
    ]),
    evidence: z.array(EvidenceSchema).min(1),
  }),
]);
export type RuleProposal = z.infer<typeof RuleProposalSchema>;
export type AcceptedRule = RuleProposal;

export const ProposalSchema = z.object({
  slug: z.string(),
  // The programme's own page on the institution's site (or an official programme page).
  programmePage: Https.nullable(),
  facts: z.object({
    durationYears: fact(z.number().positive()).optional(),
    teachingLanguages: fact(z.array(z.string().regex(/^[a-z]{2}$/)).min(1)).optional(),
    tuition: fact(
      z.object({
        amountMinor: z.number().int().nonnegative(),
        currency: z.string().regex(/^[A-Z]{3}$/),
        period: z.enum(["year", "semester"]),
      }),
    ).optional(),
    intakes: fact(
      z.array(
        z
          .object({
            startDate: Iso.nullable(),
            applicationOpens: Iso.nullable(),
            applicationDeadline: Iso.nullable(),
            recurringDeadline: MonthDayProposalSchema.nullable().optional(),
          })
          .refine(
            (i) => !(i.applicationDeadline !== null && (i.recurringDeadline ?? null) !== null),
            {
              message: "an intake has a dated deadline or a recurring one, not both",
            },
          ),
      ),
    ).optional(),
    applicationChannel: fact(z.string()).optional(),
    documents: fact(
      z
        .array(DocumentProposalSchema)
        .min(1)
        .refine((docs) => new Set(docs.map((d) => d.slug)).size === docs.length, {
          message: "document slugs must be unique",
        }),
    ).optional(),
  }),
  requirements: z.object({ rules: z.array(RuleProposalSchema) }).optional(),
  notes: z.string().optional(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export type FactName = keyof Proposal["facts"];
export type AcceptedFact = { value: unknown; evidence: { url: string; quote: string }[] };
export type Verified = {
  programmePage: string | null;
  facts: Partial<Record<FactName, AcceptedFact>>;
  rejected: { fact: string; reason: string }[];
  requirements?: AcceptedRule[];
  // The preparer's own caveats (an indirect source, an older tariff): the auditor reads them.
  notes?: string;
};

const SOFT_WORDING =
  /recommend|\bshould\b|advis|suggest|empfohlen|empfehl|\bsollte|recommand|conseill|devrait|aanbevol|bij voorkeur|\bzou\b/i;
const fail = (reason: string): FactCheck => ({ ok: false, reason });
const ok: FactCheck = { ok: true };

const PREPARED_TEXT =
  "prepared by the assistant from the quoted pages (see evidence): included in the audit sample draw";
const PREPARED_NOTE = /prepared by the assistant from the quoted pages/;

// In the matcher an empty acceptedTests list means "no restriction": a rule that says a certificate
// is required but names no test would be satisfied by any certificate, in any language. The page did
// not say which tests, so the honest value is "certificate requirement unknown" (null): the level
// still has to be met, but an unrelated certificate no longer satisfies the rule.
export function emptyTestsUnknown<T extends object>(rule: T): T {
  const r = rule as Record<string, unknown>;
  return r.kind === "language_proficiency" &&
    r.certificateRequired === true &&
    Array.isArray(r.acceptedTests) &&
    r.acceptedTests.length === 0
    ? ({ ...r, certificateRequired: null } as T)
    : rule;
}

// For what a model wrote: also a "no certificate needed" (false), which nothing can verify (the
// verifier checks the language, the level and the tests, never a negative), becomes unknown.
export function certificateUnknown<T extends object>(rule: T): T {
  const r = emptyTestsUnknown(rule) as Record<string, unknown>;
  return r.kind === "language_proficiency" && r.certificateRequired === false
    ? ({ ...r, certificateRequired: null } as T)
    : (r as T);
}

export type GetText = (url: string) => Promise<string>;

function checkValue(
  name: FactName,
  value: unknown,
  quote: string,
  minStudyYear: number,
): FactCheck {
  switch (name) {
    case "durationYears":
      return checkDuration(value as number, quote);
    case "teachingLanguages":
      return checkLanguages(value as string[], quote);
    case "tuition":
      return checkTuition(
        (value as { amountMinor: number }).amountMinor,
        quote,
        minStudyYear,
        (value as { currency?: string }).currency,
      );
    case "applicationChannel":
      return checkChannel(value as string, quote);
    case "intakes": {
      // every stated date must be supported by one of the quotes
      return { ok: true };
    }
    case "documents":
      // the verbatim quote is already required; the checker model judges the list
      return ok;
  }
}

// `minStudyYear`: a tuition quote that ties its amount to an earlier study year is refused. The
// default is the study year running when the verification runs; pass it to reproduce a run.
export async function verifyProposal(
  proposal: Proposal,
  programmeName: string,
  getText: GetText,
  minStudyYear: number = currentStudyYear(),
): Promise<Verified> {
  const result: Verified = {
    programmePage: null,
    facts: {},
    rejected: [],
    ...(proposal.notes === undefined || proposal.notes === "" ? {} : { notes: proposal.notes }),
  };
  const safeText = async (url: string): Promise<string | null> => {
    try {
      return await getText(url);
    } catch {
      return null;
    }
  };

  if (proposal.programmePage !== null) {
    const text = await safeText(proposal.programmePage);
    if (text === null)
      result.rejected.push({ fact: "programmePage", reason: "page could not be fetched" });
    else if (!programmeNameMatches(programmeName, text)) {
      result.rejected.push({
        fact: "programmePage",
        reason: "the page does not mention the programme name",
      });
    } else result.programmePage = proposal.programmePage;
  }

  for (const [key, entry] of Object.entries(proposal.facts) as [FactName, AcceptedFact][]) {
    const accepted: { url: string; quote: string }[] = [];
    for (const evidence of entry.evidence) {
      const text = await safeText(evidence.url);
      if (text === null) continue;
      if (quoteInText(evidence.quote, text)) accepted.push(evidence);
    }
    if (accepted.length === 0) {
      result.rejected.push({
        fact: key,
        reason: "no quote was found verbatim on the cited page(s)",
      });
      continue;
    }
    let reason: string | null = null;
    if (key === "intakes") {
      const items = entry.value as {
        startDate: string | null;
        applicationOpens: string | null;
        applicationDeadline: string | null;
        recurringDeadline?: { month: number; day: number } | null;
      }[];
      const hasDeadline = items.some(
        (item) => item.applicationDeadline !== null || (item.recurringDeadline ?? null) !== null,
      );
      if (hasDeadline && !accepted.some((e) => mentionsInternationalApplicants(e.quote)))
        reason =
          "no accepted quote says the deadline applies to international or non-EU applicants";
      else
        for (const item of items) {
          for (const date of [item.startDate, item.applicationOpens, item.applicationDeadline]) {
            if (date === null) continue;
            if (!accepted.some((e) => checkDeadline(date, e.quote).ok)) {
              reason = `the date ${date} is not supported by the quotes`;
            }
          }
          const recurring = item.recurringDeadline ?? null;
          if (
            recurring !== null &&
            !accepted.some(
              (e) => checkRecurringDeadline(recurring.month, recurring.day, e.quote).ok,
            )
          )
            reason = `the deadline ${recurring.day}/${recurring.month} is not supported by the quotes`;
        }
    } else if (!accepted.some((e) => checkValue(key, entry.value, e.quote, minStudyYear).ok)) {
      const first = checkValue(key, entry.value, accepted[0]?.quote ?? "", minStudyYear);
      reason = first.ok ? "value does not agree with the quote" : first.reason;
    }
    let value: unknown = entry.value;
    if (key === "documents") {
      const quotes = accepted.map((e) => ({
        normalized: normalizeForMatch(e.quote),
        translation: mentionsTranslation(e.quote),
      }));
      // a whole word, so "ID" is not found inside "valid"
      const nameRegex = (d: DocumentProposal) =>
        wholeWord(escapeRegex(normalizeForMatch(d.quotedAs)));
      const named = (entry.value as DocumentProposal[]).filter((d) =>
        quotes.some((q) => nameRegex(d).test(q.normalized)),
      );
      // A translation claim needs a quote that names THIS document and mentions translation. One
      // quote naming several documents and mentioning translation counts for all of them; the
      // checker model then judges whether it really applies to each.
      value = named.map((d) => {
        const supported = quotes.some((q) => q.translation && nameRegex(d).test(q.normalized));
        return d.translationRequired === true && !supported
          ? { ...d, translationRequired: null }
          : d;
      });
      if (named.length === 0) reason = "no document is named in an accepted quote";
    }
    if (reason !== null) result.rejected.push({ fact: key, reason });
    else result.facts[key] = { value, evidence: accepted };
  }

  const accepted: AcceptedRule[] = [];
  for (const rule of proposal.requirements?.rules ?? []) {
    const quotes: { url: string; quote: string }[] = [];
    for (const evidence of rule.evidence) {
      const text = await safeText(evidence.url);
      if (text !== null && quoteInText(evidence.quote, text)) quotes.push(evidence);
    }
    const label = `requirement ${rule.kind}`;
    if (quotes.length === 0) {
      result.rejected.push({
        fact: label,
        reason: "no quote was found verbatim on the cited page(s)",
      });
      continue;
    }
    const agrees = (check: (quote: string) => FactCheck): FactCheck => {
      const results = quotes.map((e) => check(e.quote));
      return results.find((r) => r.ok) ?? results[0] ?? { ok: false, reason: "no quote" };
    };
    let check: FactCheck = { ok: true };
    if (rule.kind === "language_proficiency") {
      // "recommended" or "should" is advice, not a condition of admission: a failing rule would
      // wrongly turn a student away, so the preparer must write it as a manual_check.
      const soft = quotes.find((e) => SOFT_WORDING.test(e.quote));
      // Each claim (the language, the level, every accepted test) needs a quote that states it; they
      // do not all have to be in the same sentence.
      const supported = (claim: (q: string) => FactCheck): FactCheck => {
        const results = quotes.map((e) => claim(e.quote));
        return results.find((r) => r.ok) ?? results[0] ?? fail("no quote");
      };
      const claims: FactCheck[] = [
        soft === undefined ? ok : fail("soft wording (recommended/should): write a manual_check"),
        supported((q) => checkLanguages([rule.language], q)),
        ...(rule.minCefr === null ? [] : [supported((q) => checkCefr(rule.minCefr ?? "", q))]),
        ...rule.acceptedTests.map((test) => supported((q) => checkTests([test], q))),
      ];
      check = claims.find((c) => !c.ok) ?? ok;
    } else if (rule.kind === "subject_taken") {
      check = agrees((q) => checkSubjects(rule.subjects, q));
    } else if (rule.kind === "prior_study_years_min") {
      check = agrees((q) => checkYears(rule.years, q));
    }
    if (check.ok) accepted.push(emptyTestsUnknown({ ...rule, evidence: quotes }));
    else result.rejected.push({ fact: label, reason: check.reason });
  }
  if (accepted.length > 0) result.requirements = accepted;
  return result;
}

// --- applying verified facts to a staged record --------------------------------------------------
type Staged = Record<string, unknown>;

const FACT_FIELDS = [
  "durationYears",
  "teachingLanguages",
  "tuition",
  "intakes",
  "applicationChannel",
  "documents",
] as const;

// The reader's shape for a fact value becomes the record's shape (documents carry localized names;
// an intake's recurringDeadline is absent in a record, never null).
export function recordValue(field: string, value: unknown): unknown {
  if (field === "intakes")
    return (value as { recurringDeadline?: unknown }[]).map(({ recurringDeadline, ...intake }) =>
      recurringDeadline === null || recurringDeadline === undefined
        ? intake
        : { ...intake, recurringDeadline },
    );
  if (field !== "documents") return value;
  return (value as DocumentProposal[]).map((d) => ({
    slug: d.slug,
    name: {
      fr: { text: d.name.fr, status: "draft" },
      ...(d.name.en === undefined ? {} : { en: { text: d.name.en, status: "draft" } }),
    },
    translationRequired: d.translationRequired,
  }));
}

function asRecord(value: unknown): Staged {
  return typeof value === "object" && value !== null ? (value as Staged) : {};
}

// Returns the staged record with the verified facts filled in as official. Facts the assistant did
// not establish are reset to "to be checked" (null), never left as a guess; the record only
// becomes promotable when the programme page itself was verified.
export function applyVerified(staged: Staged, verified: Verified, today: string): Staged {
  const next: Staged = { ...staged };
  const sourceKeys = new Map<string, string>();
  const sources: Record<string, { url: string; last_verified_at: null }> = {};
  const keyFor = (url: string): string => {
    const known = sourceKeys.get(url);
    if (known !== undefined) return known;
    const key = verified.programmePage === url ? "programme" : `page-${sourceKeys.size + 1}`;
    sourceKeys.set(url, key);
    sources[key] = { url, last_verified_at: null };
    return key;
  };

  if (verified.programmePage === null) return next; // nothing to cite: the record stays blocked
  keyFor(verified.programmePage);
  next.officialUrl = verified.programmePage;

  const evidenceLog: { fact: string; url: string; quote: string }[] = [];
  for (const field of FACT_FIELDS) {
    const accepted = verified.facts[field as FactName];
    if (accepted !== undefined) {
      const first = accepted.evidence[0];
      if (first === undefined) continue;
      next[field] = {
        value: recordValue(field, accepted.value),
        source: keyFor(first.url),
        info_kind: "official",
      };
      for (const e of accepted.evidence)
        evidenceLog.push({ fact: field, url: e.url, quote: e.quote });
    } else {
      // not established from a quoted page: to be checked
      next[field] = { value: null, source: "programme", info_kind: "official" };
    }
  }
  // Never "complete": the assistant reads the quoted passages, not the whole admission regulation.
  const rules = (verified.requirements ?? []).map((rule, index) => {
    const { evidence, ...encoded } = rule;
    const first = evidence[0];
    for (const e of evidence)
      evidenceLog.push({ fact: `requirements.req-${index + 1}`, url: e.url, quote: e.quote });
    const base = {
      id: `req-${index + 1}`,
      source: first === undefined ? "programme" : keyFor(first.url),
      info_kind: "official",
    };
    if (encoded.kind === "manual_check") {
      return {
        ...base,
        kind: "manual_check",
        note: Object.fromEntries(
          Object.entries(typeof encoded.note === "string" ? { fr: encoded.note } : encoded.note)
            .filter(([, text]) => text !== undefined)
            .map(([locale, text]) => [locale, { text, status: "draft" }]),
        ),
      };
    }
    return { ...base, ...encoded };
  });
  next.requirements = { coverage: "partial", source: "programme", info_kind: "official", rules };
  next.sources = sources;

  const review = asRecord(next._review);
  next._review = {
    ...review,
    preparedBy: "assistant",
    preparedAt: today,
    evidence: evidenceLog,
    ...(verified.notes === undefined ? {} : { notes: verified.notes }),
    ...(verified.rejected.length === 0
      ? {}
      : { rejected: verified.rejected.map((r) => `${r.fact}: ${r.reason}`) }),
    todo: PREPARED_NOTE.test(String(review.todo ?? ""))
      ? String(review.todo)
      : `${String(review.todo ?? "")}; ${PREPARED_TEXT}`.replace(/^; /, ""),
  };
  return next;
}

type EvidenceEntry = { fact: string; url: string; quote: string };
const PAGE_NOT_VERIFIED_NOTE =
  "programme page not verified: facts come from pages not tied to this programme by name";

// Applies what the reader proved to a record that is already in data/. Unlike applyVerified it never
// resets a fact the reader did not establish, never replaces an existing official value (nor, while
// the programme page is unverified, any existing value), and never touches requirements, the
// official URL, the summary or the scholarships. Returns `staged` itself
// when nothing changed.
export function applyEnrichment(staged: Staged, verified: Verified, today: string): Staged {
  return enrichRecord(staged, verified, today).record;
}

// The same, plus the disagreements found in THIS run (an earlier run's notes are not conflicts now).
export function enrichRecord(
  staged: Staged,
  verified: Verified,
  today: string,
): { record: Staged; conflicts: string[] } {
  const sources: Record<string, unknown> = { ...asRecord(staged.sources) };
  const keyOfUrl = new Map<string, string>();
  for (const [key, value] of Object.entries(sources)) {
    const url = asRecord(value).url;
    if (typeof url === "string") keyOfUrl.set(url, key);
  }
  const keyFor = (url: string): string => {
    // an existing source keeps its older last_verified_at on purpose: the cautious direction
    const known = keyOfUrl.get(url);
    if (known !== undefined) return known;
    let n = 1;
    while (`page-${n}` in sources) n++;
    const key = `page-${n}`;
    sources[key] = { url, last_verified_at: null };
    keyOfUrl.set(url, key);
    return key;
  };

  const next: Staged = { ...staged };
  const evidenceLog: EvidenceEntry[] = [];
  const conflicts: string[] = [];
  let changed = false;
  for (const field of FACT_FIELDS) {
    const accepted = verified.facts[field];
    const first = accepted?.evidence[0];
    if (accepted === undefined || first === undefined) continue;
    const existing = asRecord(staged[field]);
    const value = recordValue(field, accepted.value);
    const hasValue = existing.value !== null && existing.value !== undefined;
    const differs = JSON.stringify(existing.value) !== JSON.stringify(value);
    if (hasValue && existing.info_kind === "official") {
      if (differs)
        conflicts.push(
          `${field}: kept the existing official value; the reader found ${JSON.stringify(value)} at ${first.url}`,
        );
      continue;
    }
    // Without a verified programme page nothing ties these pages to this programme: they may fill a
    // gap but never replace a value the register already holds.
    if (hasValue && verified.programmePage === null) {
      if (differs)
        conflicts.push(
          `${field}: kept the register value; the reader found ${JSON.stringify(value)} at ${first.url} but no programme page was verified`,
        );
      continue;
    }
    next[field] = { value, source: keyFor(first.url), info_kind: "official" };
    for (const e of accepted.evidence)
      evidenceLog.push({ fact: field, url: e.url, quote: e.quote });
    changed = true;
  }
  if (!changed && conflicts.length === 0) return { record: staged, conflicts };

  const review = asRecord(staged._review);
  const earlierNotes = typeof review.notes === "string" && review.notes !== "" ? review.notes : "";
  // a re-run must not repeat a note an earlier run already wrote
  const newNotes = [
    ...conflicts,
    ...(verified.programmePage === null ? [PAGE_NOT_VERIFIED_NOTE] : []),
    ...(verified.notes === undefined ? [] : [verified.notes]),
  ].filter((note) => !earlierNotes.includes(note));
  const notes = [...(earlierNotes === "" ? [] : [earlierNotes]), ...newNotes].join("; ");
  const rejected =
    verified.rejected.length === 0
      ? {}
      : { rejected: verified.rejected.map((r) => `${r.fact}: ${r.reason}`) };
  if (!changed) {
    // only disagreements: record them for the auditor, change nothing else
    next._review = { ...review, ...(notes === "" ? {} : { notes }), ...rejected };
    return { record: next, conflicts };
  }
  next.sources = sources;
  const earlierEvidence = (
    Array.isArray(review.evidence) ? review.evidence : []
  ) as EvidenceEntry[];
  const evidence = [...earlierEvidence];
  for (const entry of evidenceLog)
    if (
      !evidence.some((e) => e.fact === entry.fact && e.url === entry.url && e.quote === entry.quote)
    )
      evidence.push(entry);
  next._review = {
    ...review,
    preparedBy: "assistant",
    preparedAt: today,
    evidence,
    ...(notes === "" ? {} : { notes }),
    ...rejected,
    todo: PREPARED_NOTE.test(String(review.todo ?? ""))
      ? String(review.todo)
      : `${String(review.todo ?? "")}; ${PREPARED_TEXT}`.replace(/^; /, ""),
  };
  return { record: next, conflicts };
}

// The facts applyEnrichment actually filled: the ones whose object it replaced.
export function enrichedFields(before: Staged, after: Staged): string[] {
  return FACT_FIELDS.filter((field) => before[field] !== after[field]);
}

export function stillPlaceholder(record: Staged): string[] {
  const left: string[] = [];
  for (const field of FACT_FIELDS) {
    if (asRecord(record[field]).info_kind === READ_SOURCE) left.push(field);
  }
  return left;
}

// --- institutions and application channels -------------------------------------------------------
export const InstitutionProposalSchema = z.object({
  slug: z.string(),
  // The institution's own website: its page must name the institution and a quote must be on it.
  website: Https,
  evidence: z.array(EvidenceSchema).min(1),
  type: z
    .object({ value: z.enum(["public", "private"]), evidence: z.array(EvidenceSchema).min(1) })
    .optional(),
});
export type InstitutionProposal = z.infer<typeof InstitutionProposalSchema>;

export const ChannelProposalSchema = z.object({
  slug: z.string(),
  evidence: z.array(EvidenceSchema).min(1),
});
export type ChannelProposal = z.infer<typeof ChannelProposalSchema>;

export type RecordVerified =
  | { ok: true; evidence: { url: string; quote: string }[]; type?: "public" | "private" }
  | { ok: false; reason: string };

async function acceptedQuotes(
  evidence: readonly { url: string; quote: string }[],
  getText: GetText,
): Promise<{ url: string; quote: string }[]> {
  const out: { url: string; quote: string }[] = [];
  for (const e of evidence) {
    try {
      if (quoteInText(e.quote, await getText(e.url))) out.push(e);
    } catch {
      // an unreachable page supports nothing
    }
  }
  return out;
}

export async function verifyInstitution(
  proposal: InstitutionProposal,
  institutionName: string,
  getText: GetText,
): Promise<RecordVerified> {
  let text: string;
  try {
    text = await getText(proposal.website);
  } catch {
    return { ok: false, reason: "website could not be fetched" };
  }
  if (!programmeNameMatches(institutionName, text)) {
    return { ok: false, reason: "the website does not mention the institution's name" };
  }
  const evidence = await acceptedQuotes(proposal.evidence, getText);
  if (evidence.length === 0)
    return { ok: false, reason: "no quote was found verbatim on the cited page(s)" };
  // a verbatim quote that says nothing about THIS institution ("is a public university") proves
  // nothing: at least one must contain a distinctive word of its name
  if (!evidence.some((e) => quoteNames(institutionName, e.quote)))
    return {
      ok: false,
      reason: "no quote contains a distinctive word of the institution's name",
    };
  const typeEvidence =
    proposal.type === undefined ? [] : await acceptedQuotes(proposal.type.evidence, getText);
  return {
    ok: true,
    evidence: [...evidence, ...typeEvidence],
    ...(proposal.type !== undefined && typeEvidence.length > 0
      ? { type: proposal.type.value }
      : {}),
  };
}

export async function verifyChannel(
  proposal: ChannelProposal,
  channelName: string,
  getText: GetText,
): Promise<RecordVerified> {
  const evidence = await acceptedQuotes(proposal.evidence, getText);
  if (evidence.length === 0)
    return { ok: false, reason: "no quote was found verbatim on the cited page(s)" };
  for (const e of evidence) {
    // a known channel is checked by its own wording; any other by its display name
    const byWords = checkChannel(proposal.slug, e.quote);
    const known = byWords.ok || !/cannot be verified automatically/.test(byWords.reason);
    if (
      known ? byWords.ok : new RegExp(channelName.replace(/[^a-z0-9]+/gi, ".?"), "i").test(e.quote)
    )
      return { ok: true, evidence };
  }
  return { ok: false, reason: `no quote names the channel "${channelName}"` };
}

// The record's own source becomes the verified page; only fields the evidence supports change.
export function applyRecord(
  staged: Staged,
  verified: Extract<RecordVerified, { ok: true }>,
  today: string,
  website?: string,
): Staged {
  const first = verified.evidence[0];
  if (first === undefined) return staged;
  const url = website ?? first.url;
  const next: Staged = {
    ...staged,
    source: "page",
    info_kind: "official",
    sources: { page: { url, last_verified_at: null } },
  };
  if (website !== undefined) next.website = website;
  if (verified.type !== undefined) next.type = verified.type;
  const review = asRecord(next._review);
  next._review = {
    ...review,
    preparedBy: "assistant",
    preparedAt: today,
    evidence: verified.evidence,
    todo: PREPARED_NOTE.test(String(review.todo ?? ""))
      ? String(review.todo)
      : `${String(review.todo ?? "")}; ${PREPARED_TEXT}`.replace(/^; /, ""),
  };
  return next;
}
