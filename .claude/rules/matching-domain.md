---
paths:
  - "src/domain/**/*.ts"
  - "tests/domain/**/*.test.ts"
---

# Domain core: eligibility, matching, costs, checklist

- `src/domain` is **pure TypeScript** that runs in the browser: no React, Next, DB, `fs`, network or `Date.now()` (pass `now` in). Enforced by a Biome `noRestrictedImports` override — don't disable it; move the impure code out instead. Write tests first (table-driven Vitest).
- Inputs are a student profile and snapshot data (already Zod-validated); outputs are plain serialisable objects.
- Eligibility has two levels: (1) the admission route for `(origin credential country, type) → (destination, level)`; (2) program-level requirement rules. A route outcome of `not_eligible` or `foundation` short-circuits into a clear result with reasons before program rules are evaluated.
- Match result: `{ status: "satisfied" | "check" | "not_satisfied", reasons: Reason[] }`; each `Reason` names the requirement, the student's value and the requirement's source. Mapping to ✅ ⚠️ ❌ happens only in the UI layer.
- Semantics: `satisfied` only if every published requirement was evaluated and passed; `not_satisfied` only for a definite failure of a *published* requirement; missing data, unknown credential equivalence or unpublished thresholds → `check`. Never round an unknown up to satisfied.
- Freshness: thresholds come from `src/data-schema/staleness.ts` and are evaluated against the `now` argument. Any result depending on a stale fact is `check` with the reason "source not re-verified recently" — never `satisfied` or `not_satisfied`. A past deadline is never returned as upcoming ("closed, next dates not published").
- Requirements are data evaluated by one rule engine, not per-university `if` chains.
- Costs return a range: `{ min, max, currency, breakdown }` with lines for tuition, housing, food, transport, insurance, application/visa, setup — each with its own `info_kind`. Never a single "exact" total.
- Checklist: the ten steps from the spec in fixed order (documents → translation → language exam → application account → submit → scholarships → financial documents → accommodation → visa → departure). Inapplicable steps are marked skipped with a reason, not dropped.
- Country-specific application channels (national portals, uni-assist, Studielink, Campus France…) are data on the route/program, not code branches.
