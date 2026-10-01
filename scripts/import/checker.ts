import { normalizeForMatch } from "./evidence";
import { type Budget, type CompleteInput, type Completion, complete, type ModelSpec } from "./llm";
import type { AcceptedFact, FactName, GetText, Verified } from "./proposals";
import { extractJson } from "./reader";

// The second model. The reader proposes, the code checks that the quote is on the page and agrees
// with the value, and this checker (a stronger model) judges what the code cannot: does the sentence
// really state THIS fact for THIS programme and for a Moroccan, non-EU applicant? It sees only the
// claim and about 500 characters around the quote, never the whole page, so it is cheap. It can only
// remove facts: anything it does not clearly support is dropped, and an unusable answer drops
// everything (fail closed).
const CONTEXT_CHARS = 500;

export type Claim = { id: number; fact: string; statement: string; excerpt: string };
export type Verdict = "supports" | "contradicts" | "unclear";

const CHANNEL_TEXT: Record<string, string> = {
  "fr-parcoursup": "Applications are made through Parcoursup.",
  "fr-campus-france": "Foreign applicants apply through Etudes en France / Campus France.",
  "nl-studielink": "Applications are made through Studielink.",
  "de-uni-assist-vpd":
    "A foreign applicant's documents must first be reviewed by uni-assist (the VPD preliminary review).",
  "de-uni-assist": "Applications are made through uni-assist.",
  "de-university-direct":
    "Applications are made directly in the university's own application portal.",
};

type Intake = {
  startDate: string | null;
  applicationOpens: string | null;
  applicationDeadline: string | null;
};

export function claimText(name: FactName, value: unknown): string {
  switch (name) {
    case "durationYears":
      return `The programme lasts ${value} years.`;
    case "teachingLanguages":
      return `The programme is taught in: ${(value as string[]).join(", ")}.`;
    case "tuition": {
      const t = value as { amountMinor: number; currency: string; period: string };
      return t.amountMinor === 0
        ? "There is no tuition fee for a student from outside the EU/EEA."
        : `The tuition fee for a student from outside the EU/EEA is ${t.amountMinor / 100} ${t.currency} per ${t.period}.`;
    }
    case "intakes": {
      const parts = (value as Intake[]).flatMap((i) => [
        ...(i.startDate === null ? [] : [`start ${i.startDate}`]),
        ...(i.applicationOpens === null ? [] : [`applications open ${i.applicationOpens}`]),
        ...(i.applicationDeadline === null
          ? []
          : [`application deadline ${i.applicationDeadline}`]),
      ]);
      return `Dates for the next intake: ${parts.join("; ")}.`;
    }
    case "applicationChannel":
      return CHANNEL_TEXT[String(value)] ?? `Application channel: ${String(value)}.`;
  }
}

// The text around the quote (lower-cased and normalised, as the verifier matches it), or null.
export function contextAround(
  quote: string,
  pageText: string,
  chars = CONTEXT_CHARS,
): string | null {
  const text = normalizeForMatch(pageText);
  const q = normalizeForMatch(quote);
  const at = text.indexOf(q);
  if (at === -1) return null;
  return text.slice(Math.max(0, at - chars), at + q.length + chars);
}

export const CHECKER_INSTRUCTION = `You check facts about a university programme against short text excerpts. The facts are for an applicant who is a Moroccan student with a Moroccan Baccalauréat: a non-EU applicant with a foreign diploma, applying from abroad to a Bachelor-level programme.

For each numbered claim you get the claim and an excerpt of the page it was taken from. Answer with:
- "supports": the excerpt itself states the claim, for this programme (not another programme, a Master, a sister programme or the institution in general) and for this kind of applicant (not only for EU or local students).
- "contradicts": the excerpt states something different.
- "unclear": the excerpt does not settle it: it is about something else, about everyone in general, ambiguous, or the claim needs more than the excerpt says.
A language claim is supported only for the language the programme is taught in: an elective, an optional module or a higher-semester option in another language does not make the programme taught in that language.
Be strict: when in doubt, answer "unclear". Never use outside knowledge.

Output only a JSON array, one object per claim: [{"id":1,"verdict":"supports","reason":"<at most 12 words>"}]`;

export function buildCheckPrompt(
  programme: { name: string; institution: string },
  claims: readonly Claim[],
): { system: string; user: string } {
  const lines = claims.map((c) => `[${c.id}] Claim: ${c.statement}\nExcerpt: ${c.excerpt}`);
  return {
    system: CHECKER_INSTRUCTION,
    user: `Programme: "${programme.name}" at ${programme.institution}.\n\n${lines.join("\n\n")}`,
  };
}

export type CheckOutcome = {
  verified: Verified;
  checks: { fact: string; verdict: Verdict; reason: string }[];
  completion: Completion | null;
  error: string | null;
};

export type CheckInput = {
  verified: Verified;
  meta: { name: string; institution: string };
  model: ModelSpec;
  session: string;
  getText: GetText;
  budget?: Budget;
  completeFn?: (model: ModelSpec, input: CompleteInput) => Promise<Completion>;
};

async function excerptOf(fact: AcceptedFact, getText: GetText): Promise<string> {
  const parts: string[] = [];
  for (const e of fact.evidence.slice(0, 2)) {
    try {
      const context = contextAround(e.quote, await getText(e.url));
      if (context !== null) parts.push(context);
    } catch {
      // the verifier already fetched this page; a failure here just leaves the excerpt shorter
    }
  }
  return parts.join(" ... ");
}

const failAll = (verified: Verified, reason: string): Verified => ({
  ...verified,
  facts: {},
  rejected: [
    ...verified.rejected,
    ...Object.keys(verified.facts).map((fact) => ({ fact, reason: `checker: ${reason}` })),
  ],
});

export async function checkVerified(input: CheckInput): Promise<CheckOutcome> {
  const names = Object.keys(input.verified.facts) as FactName[];
  if (names.length === 0) {
    return { verified: input.verified, checks: [], completion: null, error: null };
  }
  const claims: Claim[] = [];
  for (const [index, name] of names.entries()) {
    const fact = input.verified.facts[name];
    if (fact === undefined) continue;
    claims.push({
      id: index + 1,
      fact: name,
      statement: claimText(name, fact.value),
      excerpt: await excerptOf(fact, input.getText),
    });
  }
  const { system, user } = buildCheckPrompt(input.meta, claims);
  let completion: Completion;
  try {
    completion = await (input.completeFn ?? complete)(input.model, {
      system,
      user,
      session: input.session,
      maxOutputTokens: 6000,
      ...(input.budget === undefined ? {} : { budget: input.budget }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      verified: failAll(input.verified, "no answer"),
      checks: [],
      completion: null,
      error: `call failed: ${message}`,
    };
  }
  let answers: unknown;
  try {
    answers = extractJsonArray(completion.text);
  } catch (error) {
    return {
      verified: failAll(input.verified, "unusable answer"),
      checks: [],
      completion,
      error: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const byId = new Map<number, { verdict: Verdict; reason: string }>();
  for (const item of Array.isArray(answers) ? answers : []) {
    const row = item as { id?: unknown; verdict?: unknown; reason?: unknown };
    if (
      typeof row.id === "number" &&
      (row.verdict === "supports" || row.verdict === "contradicts" || row.verdict === "unclear")
    ) {
      byId.set(row.id, {
        verdict: row.verdict,
        reason: typeof row.reason === "string" ? row.reason : "",
      });
    }
  }
  const kept: Verified["facts"] = {};
  const rejected = [...input.verified.rejected];
  const checks: CheckOutcome["checks"] = [];
  for (const claim of claims) {
    const answer = byId.get(claim.id) ?? { verdict: "unclear" as const, reason: "no answer" };
    checks.push({ fact: claim.fact, ...answer });
    const fact = input.verified.facts[claim.fact as FactName];
    if (answer.verdict === "supports" && fact !== undefined) kept[claim.fact as FactName] = fact;
    else
      rejected.push({ fact: claim.fact, reason: `checker: ${answer.verdict} (${answer.reason})` });
  }
  return {
    verified: { ...input.verified, facts: kept, rejected },
    checks,
    completion,
    error: null,
  };
}

// The checker answers with an array; reuse the object extractor's fence stripping.
function extractJsonArray(text: string): unknown {
  const stripped = text.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("[");
    const end = stripped.lastIndexOf("]");
    if (start === -1 || end <= start) {
      // the model may have wrapped the array in an object
      const wrapped = extractJson(stripped) as {
        results?: unknown;
        verdicts?: unknown;
        claims?: unknown;
      };
      return wrapped.results ?? wrapped.verdicts ?? wrapped.claims;
    }
    return JSON.parse(stripped.slice(start, end + 1));
  }
}
