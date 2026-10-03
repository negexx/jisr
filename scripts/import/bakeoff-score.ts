import type { AcceptedFact, FactName } from "./proposals";

// Scoring of a model's verified facts against the ground truth (the quote-verified pilot proposals).
// The ground truth sometimes leaves a fact out on purpose (an ambiguous fee), so a fact the model
// states that the truth lacks is "extra" (for a person to look at), not an error. "conflict" is the
// number that matters: a wrong value that the verifier let through.
type Facts = Partial<Record<FactName, AcceptedFact>>;

export type FactScore = {
  agree: string[];
  conflict: string[];
  extra: string[];
  missing: string[];
  rejected: string[];
};

const FACT_NAMES: readonly FactName[] = [
  "durationYears",
  "teachingLanguages",
  "tuition",
  "intakes",
  "applicationChannel",
];

type Intake = {
  startDate: string | null;
  applicationOpens: string | null;
  applicationDeadline: string | null;
  recurringDeadline?: { month: number; day: number } | null;
};

const intakeKeys = (value: unknown): string[] =>
  (value as Intake[])
    .flatMap((i) => [
      ...(["startDate", "applicationOpens", "applicationDeadline"] as const).flatMap((k) =>
        i[k] === null ? [] : [`${k}:${i[k]}`],
      ),
      ...(i.recurringDeadline == null
        ? []
        : [`recurringDeadline:${i.recurringDeadline.month}/${i.recurringDeadline.day}`]),
    ])
    .sort();

export function sameValue(name: FactName, a: unknown, b: unknown): boolean {
  switch (name) {
    case "teachingLanguages":
      return (
        JSON.stringify([...(a as string[])].sort()) === JSON.stringify([...(b as string[])].sort())
      );
    case "tuition": {
      const x = a as { amountMinor: number; currency: string; period: string };
      const y = b as typeof x;
      return x.amountMinor === y.amountMinor && x.currency === y.currency && x.period === y.period;
    }
    case "intakes":
      return JSON.stringify(intakeKeys(a)) === JSON.stringify(intakeKeys(b));
    default:
      return a === b;
  }
}

export function scoreFacts(
  truth: Facts,
  accepted: Facts,
  rejected: readonly { fact: string; reason: string }[],
): FactScore {
  const score: FactScore = { agree: [], conflict: [], extra: [], missing: [], rejected: [] };
  for (const name of FACT_NAMES) {
    const got = accepted[name];
    const want = truth[name];
    if (got !== undefined && want !== undefined) {
      (sameValue(name, got.value, want.value) ? score.agree : score.conflict).push(name);
    } else if (got !== undefined) score.extra.push(name);
    else if (want !== undefined) score.missing.push(name);
  }
  for (const r of rejected) {
    if ((FACT_NAMES as readonly string[]).includes(r.fact)) score.rejected.push(r.fact);
  }
  return score;
}

// "Accept a fact only if both models agree and its quote verifies": the facts both verified with the
// same value, scored against the truth.
export function crossCheck(truth: Facts, a: Facts, b: Facts): { kept: string[]; score: FactScore } {
  const kept: Facts = {};
  for (const name of FACT_NAMES) {
    const x = a[name];
    const y = b[name];
    if (x !== undefined && y !== undefined && sameValue(name, x.value, y.value)) kept[name] = x;
  }
  return { kept: Object.keys(kept), score: scoreFacts(truth, kept, []) };
}
