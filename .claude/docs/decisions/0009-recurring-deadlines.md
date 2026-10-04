# ADR 0009: Recurring deadlines (a day and month with no year)

**Status:** Accepted (owner decision, 2026-10-02; supersedes nothing, refines ADR 0004's "closed" rule: past dated deadlines plus a recurring one show the recurring guidance, never "upcoming")
**Date:** 2026-10-02

## Context

Many official pages state an application deadline as "15 July" with no year, because it repeats every year. The data model needed a full ISO date, so 76 such deadlines were rejected by the pipeline and the programmes showed "Deadline not published". ADR 0004 forbids showing a deadline in the past as upcoming, so guessing a year is not an option either.

## Decision

- An intake may carry an optional `recurringDeadline: { month, day }`. It is mutually exclusive with a dated `applicationDeadline` on the same intake; existing records stay valid.
- `IntakeStatus` gains the kind `recurring`, carrying the month and day and the intakes `FactRef`. It never carries a date, and it is never shown as upcoming and never green. The UI says "usually by DD/MM each year, check the date for your intake", with its source and last-verified date.
- A dated upcoming deadline always wins over a recurring one. A list whose dated deadlines are all past but which has a recurring deadline is `recurring`, not `closed`. With several recurring deadlines the one whose next occurrence is soonest from today is shown, comparing month and day only (today counts as still ahead).
- ADR 0004's rule still holds: a deadline in the past is never shown as upcoming. A recurring deadline is guidance about a usual date, not an upcoming one.
- The year is never guessed or inferred.
- The pipeline proposes a recurring deadline only when the quote has a day and a month and no year.
- Any deadline, dated or recurring, needs an accepted quote that names international or non-EU applicants.

## Consequences

- More deadlines are shown, honestly labelled as guidance about a usual date.
- Compare and any exhaustive switch over `IntakeStatus["kind"]` need a `recurring` case.
- A recurring deadline is a volatile fact like any other deadline: aging at 120 days, stale at 270 (ADR 0004).

## Alternatives considered

- **Infer the year** (next occurrence of the date): rejected, it would display dates the source never published.
- **Keep rejecting year-less deadlines:** rejected by the owner, students lose real information.

## How to revisit

ADRs are immutable once committed. If a decision here turns out wrong, write a new ADR that supersedes it; don't edit this one in place.
