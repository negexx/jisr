import { z } from "zod";

import {
  checkCefr,
  checkChannel,
  checkDeadline,
  checkDuration,
  checkLanguages,
  checkSubjects,
  checkTests,
  checkTuition,
  checkYears,
  type FactCheck,
  programmeNameMatches,
  quoteInText,
  quoteNames,
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
        z.object({
          startDate: Iso.nullable(),
          applicationOpens: Iso.nullable(),
          applicationDeadline: Iso.nullable(),
        }),
      ),
    ).optional(),
    applicationChannel: fact(z.string()).optional(),
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

function checkValue(name: FactName, value: unknown, quote: string): FactCheck {
  switch (name) {
    case "durationYears":
      return checkDuration(value as number, quote);
    case "teachingLanguages":
      return checkLanguages(value as string[], quote);
    case "tuition":
      return checkTuition((value as { amountMinor: number }).amountMinor, quote);
    case "applicationChannel":
      return checkChannel(value as string, quote);
    case "intakes": {
      // every stated date must be supported by one of the quotes
      return { ok: true };
    }
  }
}

export async function verifyProposal(
  proposal: Proposal,
  programmeName: string,
  getText: GetText,
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
      }[];
      for (const item of items) {
        for (const date of [item.startDate, item.applicationOpens, item.applicationDeadline]) {
          if (date === null) continue;
          if (!accepted.some((e) => checkDeadline(date, e.quote).ok)) {
            reason = `the date ${date} is not supported by the quotes`;
          }
        }
      }
    } else if (!accepted.some((e) => checkValue(key, entry.value, e.quote).ok)) {
      const first = checkValue(key, entry.value, accepted[0]?.quote ?? "");
      reason = first.ok ? "value does not agree with the quote" : first.reason;
    }
    if (reason !== null) result.rejected.push({ fact: key, reason });
    else result.facts[key] = { value: entry.value, evidence: accepted };
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
      next[field] = { value: accepted.value, source: keyFor(first.url), info_kind: "official" };
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
