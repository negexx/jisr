# ADR 0010: Programme tuition may be an official range with an income basis

**Status:** Accepted (supersedes item 9 of ADR 0005 and its "accept estimated tuition as a range" alternative, only as stated here)
**Date:** 2026-10-08

## Context

ADR 0005 item 9 stored tuition as one official fee and rejected "accept estimated tuition as a range" because a range invites invented numbers. Italian universities usually publish the fee for a student as an income-based (ISEE) scale or as a lowest and highest amount, so a single fee is unknown for every Italian programme (45 of 45), and the cost estimate has no tuition line there.

## Decision

`tuition` keeps one official fee and gains an OPTIONAL official range: `maxAmountMinor` (the highest fee; `amountMinor` is the lowest) and an optional `basis: "income_based"`. A range is official: both numbers come from one verbatim quote that code re-fetches and checks (both amounts and the currency present; `income_based` only when the quote mentions income). It is never an estimate, never built from two quotes, never invented. A non-null tuition still requires `info_kind: official`. A flat fee is unchanged. The audience convention is unchanged: the fee for a student from outside the EU/EEA residing abroad; when a university states a different rule for that student, that rule wins or the value stays null.

The cost estimate takes the range as the tuition line's `{min, max}`; the display shows "X to Y per year" with the household-income note and the source badge. The snapshot format version goes from 1 to 2.

## Alternatives considered

- **Band table:** more precision, but unusable without the student's ISEE and harder to audit.
- **Note only:** keeps the cost line empty for Italy.
- **Keep one fee, leave Italy null:** honest but the cost question stays unanswered.

## Consequences

- Positive: Italy's tuition and first-year cost can be shown honestly; a flat fee reads exactly as before.
- Negative: wider cost ranges where fees depend on income; "(ISEE)" wording is Italian and is reworded when another country needs the basis.
- Neutral: an ISEE band table is not decided here (rejected: the product cannot use it without the student's ISEE).

## How to revisit

ADRs are immutable once committed. If a decision here turns out wrong, write a new ADR that supersedes it; don't edit this one in place.
