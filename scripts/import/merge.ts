import type { Proposal } from "./proposals";

// Two proposals for the same programme: `base` (facts already accepted, e.g. the national sentences
// of enrich-fr) wins, `extra` (what the reader found and the checker kept) only adds what is
// missing. Applying a proposal rewrites every fact field, so a record that already has facts must
// get them back in the proposal or they would be reset to "to be checked".
export function mergeProposals(base: Proposal, extra: Proposal): Proposal {
  const withoutEvidence = (rule: object): string => {
    const { evidence: _evidence, ...rest } = rule as Record<string, unknown>;
    return JSON.stringify(rest);
  };
  const known = new Set((base.requirements?.rules ?? []).map(withoutEvidence));
  const added = (extra.requirements?.rules ?? []).filter((r) => !known.has(withoutEvidence(r)));
  const rules = [...(base.requirements?.rules ?? []), ...added];
  const notes = [base.notes, extra.notes].filter((n): n is string => n !== undefined && n !== "");
  const { requirements: _requirements, notes: _notes, ...rest } = base;
  return {
    ...rest,
    programmePage: base.programmePage ?? extra.programmePage,
    facts: { ...extra.facts, ...base.facts },
    ...(rules.length > 0 ? { requirements: { rules } } : {}),
    ...(notes.length > 0 ? { notes: notes.join(" | ") } : {}),
  };
}
