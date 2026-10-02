import type { Proposal } from "./proposals";

// A rule without its evidence, written with its keys in a fixed order: two rules that say the same
// thing compare equal whatever order their keys were written in.
export function ruleKey(rule: object): string {
  const { evidence: _evidence, ...rest } = rule as Record<string, unknown>;
  const sorted = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sorted);
    if (typeof value !== "object" || value === null) return value;
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sorted(v)]),
    );
  };
  return JSON.stringify(sorted(rest));
}

// Two proposals for the same programme: `base` (facts already accepted, e.g. the national sentences
// of enrich-fr) wins, `extra` (what the reader found and the checker kept) only adds what is
// missing. Applying a proposal rewrites every fact field, so a record that already has facts must
// get them back in the proposal or they would be reset to "to be checked".
export function mergeProposals(base: Proposal, extra: Proposal): Proposal {
  const known = new Set((base.requirements?.rules ?? []).map(ruleKey));
  const added = (extra.requirements?.rules ?? []).filter((r) => !known.has(ruleKey(r)));
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

// The French flow: with no base (the record's fiche or the national pages could not be read) there is
// nothing to merge into, and saving the reader's proposal alone would make a later verify reset the
// facts the record already has. So there is no proposal at all.
export function applyBase(base: Proposal | null, extra: Proposal): Proposal | null {
  return base === null ? null : mergeProposals(base, extra);
}
