import { z } from "zod";

import {
  checkChannel,
  checkDeadline,
  checkDuration,
  checkLanguages,
  checkTuition,
  type FactCheck,
  programmeNameMatches,
  quoteInText,
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
  notes: z.string().optional(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export type FactName = keyof Proposal["facts"];
export type AcceptedFact = { value: unknown; evidence: { url: string; quote: string }[] };
export type Verified = {
  programmePage: string | null;
  facts: Partial<Record<FactName, AcceptedFact>>;
  rejected: { fact: string; reason: string }[];
  // The preparer's own caveats (an indirect source, an older tariff): the auditor reads them.
  notes?: string;
};

const PREPARED_TEXT =
  "prepared by the assistant from the quoted pages (see evidence): included in the audit sample draw";
const PREPARED_NOTE = /prepared by the assistant from the quoted pages/;

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
  next.requirements = {
    coverage: "partial",
    source: "programme",
    info_kind: "official",
    rules: [],
  };
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
    if (new RegExp(channelName.replace(/[^a-z0-9]+/gi, ".?"), "i").test(e.quote))
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
