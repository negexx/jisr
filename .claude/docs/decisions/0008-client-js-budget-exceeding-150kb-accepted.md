# ADR 0008: Exceeding the 150 KB client JS target is accepted

**Status:** Accepted (supersedes ADR 0007 and relaxes the 150 KB line of ADR 0004)
**Date:** 2026-10-02

## Context

ADR 0007 measured every page above the 150 KB gzipped initial JS target set in ADR 0004 and asked the product owner to choose between raising the budget (A), funding a shell refactor (B) or both (C). After M4a (save a program and My Application Plan) the program page has 0.6 KB of headroom against its ratchet and matches 0.4 KB, so the next UI change would trip the perf spec.

## Decision

The product owner (2026-10-02, in chat) accepts that pages exceed 150 KB. In ADR 0007's terms this is option A:

- 150 KB is no longer a gate. It stays in the docs as the original aspiration, and the perf spec keeps printing the gap.
- The per-page ratchet in `tests/e2e/support/js-budget.ts` stays as the regression guard: it never rises silently, and a feature may raise a page's value only with a written reason in the commit message and in the table in `.claude/docs/architecture.md`.
- The levers listed in ADR 0007 (merge-free `buttonVariants` for client leaves, no next-intl client `Link`/provider in the shell, lazy Radix Slot and validators, splitting the profile steps) remain a backlog to pick up opportunistically, not a commitment.

## Consequences

- A student on slow mobile data pays 15 to 40 KB more per page than the original target; keep new client code small and prefer dynamic imports (the save toggle already loads on first click).
- Revisit if testing with real students (MVP phase 4) shows people abandoning on slow connections.

## Alternatives considered

- **B. Fund the shell refactor first** (ADR 0007 levers 1 to 5): not chosen now; the estimates only just reach 150 KB for Home and island pages need more, so it stays an opportunistic backlog.
- **C. Both:** not chosen; only the budget half (A) was decided.

## How to revisit

ADRs are immutable once committed: a later decision (for example a funded refactor after student testing) is a new ADR that supersedes this one.
