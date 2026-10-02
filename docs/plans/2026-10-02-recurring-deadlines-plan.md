# Recurring deadlines and the international-applicant deadline rule: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 1 to 5 are code and are done by subagents; Task 6 is a run with paid APIs and the owner's keys and is done by the controller, never by a subagent. Tasks 3 (UI) MUST invoke `impeccable:impeccable` before writing markup.

**Goal:** (1) Make "a deadline must be stated for international or non-EU applicants" a code rule of the research pipeline. (2) Store, show and extract a deadline that a source states without a year ("15 July") as a *recurring* deadline, without ever presenting it as an upcoming dated deadline.

**Architecture:** One optional field `recurringDeadline: {month, day}` on an intake item (existing records stay valid); a new `IntakeStatus` kind `"recurring"` returned by `nextIntake` only when no dated deadline is upcoming; one new UI line (icon plus text, never green); pipeline: the reader may propose `recurringDeadline` when the quote has day and month but no year, `verifyProposal` checks day and month on the quote and requires an accepted quote that names international/non-EU applicants for any deadline. ADR 0009 records the decision (ADR 0004: "a deadline in the past is never shown as upcoming" is kept).

**Tech Stack:** TypeScript (strict), Zod (server/build only), next-intl, Tailwind logical utilities, Vitest (jsdom for components), Playwright is not extended.

## Global Constraints

- ADR 0004 stays true: a deadline in the past is never shown as upcoming. A recurring deadline is **never** converted to a dated one and never produces the `upcoming` status; the year is never guessed.
- Trust: the recurring line shows its `SourceBadge` (official/estimate/guidance + verified date); wording says "usually" and "check the date for your intake"; never green; never colour alone (icon + text). Stale data never yields a green state.
- Every user-facing string in `fr`, `en`, `ar` through next-intl; fr has U+00A0 before `: ? ! ;`; dates DD/MM/YYYY and the month-day form DD/MM; displayed ICU arguments are preformatted strings; Latin digits in `ar`; `ar` copy is a machine draft; Tailwind logical utilities only (`ms-`, `pe-`, `text-start`).
- Client-reachable code (`src/components`, `src/domain`, `src/lib/{profile,snapshot,journey,i18n}`) imports no Zod and nothing from `@/data-schema` at runtime except `dates` and `staleness` (types only otherwise). `src/domain` imports nothing from React, Next, `src/db`, `src/lib`, `fs` or the network; time is an argument.
- The program page's static HTML makes no clock- or profile-dependent claim: the recurring line on the static page is date-independent text; the status ("recurring") is computed in the client leaf.
- No `any`, no `@ts-ignore`, no non-null `!`; named exports; conventional commits with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; stage explicit paths only (never `git add -A`); never commit `next.config.ts`, `.env*`; no secrets read or printed.
- Pipeline rules unchanged: a model only proposes, code decides; every fact needs a verbatim quote re-fetched by code; unknown stays unknown; an existing official value is never overwritten; requirements are never rewritten by enrichment.
- JS budget: the per-page ratchet in `tests/e2e/support/js-budget.ts` must not be raised silently. The program page has about 0.3 KB of until-idle headroom (237.7 of 238). If `pnpm perf:js` or the e2e perf spec exceeds an existing row, STOP and report the numbers (status DONE_WITH_CONCERNS); the owner decides.
- Environment: `export SWC_NATIVE_BINDING_CACHE='C:\Users\dagda\.swc-cache'` before any pnpm/next command. `pnpm build:e2e`/`pnpm test:e2e` overwrite `.next` and `public/snapshots` and need ports 3000/3100 free (ask the controller); restore real data with `pnpm data:build`. Agent tools may write CRLF: normalise touched files to LF; never commit line-ending-only changes. No browser or dev server in subagents (the controller verifies fr and ar in the browser). Tests never touch the real `data-staging/` or `data/` (temp dirs only).
- The Compare page lives on PR #8 (`feat/m4b-compare`), not on this branch. This change adds a kind to `IntakeStatus`; `compare-view.ts` there will need a `recurring` case when the branches meet (follow-up, listed in the PR body).

## File structure

| File | Responsibility |
|---|---|
| `scripts/import/evidence.ts` | `mentionsInternationalApplicants`, `checkRecurringDeadline` |
| `scripts/import/proposals.ts` | intake item schema (`recurringDeadline`), verification rules, `recordValue` unchanged |
| `scripts/import/reader.ts`, `checker.ts` | instruction text, claim text |
| `src/data-schema/records/program.ts` | `MonthDaySchema`, `IntakeSchema.recurringDeadline` |
| `src/domain/types.ts`, `src/domain/intakes.ts` | `IntakeStatus` kind `recurring`, `nextIntake` |
| `src/lib/format.ts` | `formatMonthDay` |
| `src/lib/i18n/vocabulary.ts` | `INTAKE_KINDS` gains `recurring` |
| `src/components/deadline-status.tsx`, `src/components/program/program-sections.tsx` | the recurring line |
| `messages/{en,fr,ar}.json` | `domain.intake.recurring`, `program.deadline.recurring` |
| `.claude/docs/decisions/0009-recurring-deadlines.md` (new), `.claude/docs/architecture.md`, `.claude/CLAUDE.md`, `data/README.md` | decision and docs |
| `tests/**` | mirrors the above |

---

### Task 1: The international-applicant rule for deadlines (pipeline)

**Files:**
- Modify: `scripts/import/evidence.ts`, `scripts/import/proposals.ts` (`verifyProposal`, intakes branch), `scripts/import/reader.ts` (`INSTRUCTION`, intakes bullet)
- Test: `tests/scripts/import/evidence.test.ts`, `proposals.test.ts`, `reader.test.ts`, `enrich.test.ts` (fixtures that carry intakes)

**Interfaces:**
- Produces: `mentionsInternationalApplicants(quote: string): boolean` exported from `evidence.ts`.

Rule: when a proposal's `intakes` fact contains any item with an `applicationDeadline` (dated), at least one **accepted** quote of that fact must satisfy `mentionsInternationalApplicants`; otherwise the whole fact is rejected with the reason `no accepted quote says the deadline applies to international or non-EU applicants`. Items with only `startDate`/`applicationOpens` are not subject to the rule. (Task 4 extends the same rule to recurring deadlines.)

- [ ] **Step 1: Write the failing tests.** In `tests/scripts/import/evidence.test.ts`:

```ts
describe("mentionsInternationalApplicants", () => {
  it.each([
    "15 May for non-EU and non-EEA applicants",
    "Deadline for international applicants: 15 July",
    "With a qualification from abroad 01 May - 30 Nov",
    "Bewerbungsfrist für Bewerber mit ausländischer Hochschulzugangsberechtigung",
    "Frist für Drittstaatsangehörige: 15. Juli",
    "Für Nicht-EU-Bürger gilt der 1. Juni",
    "Studenten van buiten de EU: niet-EER studenten melden zich aan vóór 1 april",
    "Aanmelden voor internationale studenten uiterlijk 1 april",
    "candidats étrangers : date limite le 15 janvier",
    "Applicants from outside the EU must apply by 1 March",
  ])("is true for: %s", (quote) => {
    expect(mentionsInternationalApplicants(quote)).toBe(true);
  });

  it.each([
    "Application deadline 30 June 2027",
    "Bewerbungsfrist: 15. Juli",
    "Meld je uiterlijk 1 mei aan via Studielink",
    "Applications for the winter semester: 2 May to 15 July 2027",
    "",
  ])("is false for: %s", (quote) => {
    expect(mentionsInternationalApplicants(quote)).toBe(false);
  });
});
```

In `tests/scripts/import/proposals.test.ts` add (reuse the file's `verifyProposal` helpers; a fake `getText` returning the quoted page text):

```ts
describe("intakes: the deadline must be stated for international applicants", () => {
  const page = "https://uni.example/apply";
  const make = (quote: string, text: string) => ({
    verify: () =>
      verifyProposal(
        ProposalSchema.parse({
          slug: "xx-prog",
          programmePage: null,
          facts: {
            intakes: {
              value: [{ startDate: null, applicationOpens: null, applicationDeadline: "2027-05-01" }],
              evidence: [{ url: page, quote }],
            },
          },
        }),
        "Prog",
        async () => text,
      ),
  });

  it("accepts a dated deadline whose quote says it is for non-EU applicants", async () => {
    const q = "Non-EU applicants must apply by 1 May 2027";
    const verified = await make(q, q).verify();
    expect(verified.facts.intakes).toBeDefined();
  });

  it("rejects a dated deadline whose quotes never mention international applicants", async () => {
    const q = "The application deadline is 1 May 2027";
    const verified = await make(q, q).verify();
    expect(verified.facts.intakes).toBeUndefined();
    expect(verified.rejected).toContainEqual({
      fact: "intakes",
      reason: "no accepted quote says the deadline applies to international or non-EU applicants",
    });
  });

  it("accepts when a second accepted quote carries the international wording", async () => {
    const text = "The application deadline is 1 May 2027. Applicants from outside the EU use the same portal.";
    const verified = await verifyProposal(
      ProposalSchema.parse({
        slug: "xx-prog",
        programmePage: null,
        facts: {
          intakes: {
            value: [{ startDate: null, applicationOpens: null, applicationDeadline: "2027-05-01" }],
            evidence: [
              { url: page, quote: "The application deadline is 1 May 2027." },
              { url: page, quote: "Applicants from outside the EU use the same portal." },
            ],
          },
        },
      }),
      "Prog",
      async () => text,
    );
    expect(verified.facts.intakes).toBeDefined();
  });

  it("does not apply the rule to an item with only a start date", async () => {
    const q = "Studies start on 1 September 2027";
    const verified = await verifyProposal(
      ProposalSchema.parse({
        slug: "xx-prog",
        programmePage: null,
        facts: { intakes: { value: [{ startDate: "2027-09-01", applicationOpens: null, applicationDeadline: null }], evidence: [{ url: page, quote: q }] } },
      }),
      "Prog",
      async () => q,
    );
    expect(verified.facts.intakes).toBeDefined();
  });
});
```

In `reader.test.ts` add: `expect(INSTRUCTION).toMatch(/international|non-EU/)` within a test named "tells the reader that a deadline needs a quote for international applicants" and `expect(INSTRUCTION).toMatch(/general deadline/i)`.

- [ ] **Step 2: Run to verify they fail.** `pnpm vitest run tests/scripts/import/evidence.test.ts tests/scripts/import/proposals.test.ts tests/scripts/import/reader.test.ts` — Expected: FAIL (`mentionsInternationalApplicants` missing; the rule absent).

- [ ] **Step 3: Implement.** `scripts/import/evidence.ts`, next to `mentionsTranslation`:

```ts
// A deadline is for a Moroccan (non-EU) applicant only if a quote says who it is for: the general
// deadline of a university page may be the EU or home-student one. Words in English, German, Dutch
// and French; over-matching ("International Office") is caught by the checker model and the audit.
const INTERNATIONAL_WORDS =
  /\bnon[- ]?(?:eu|eea)\b|outside (?:of )?(?:the )?(?:eu|eea|european)|international|foreign|abroad|ausl[aä]nd|drittstaat|nicht[- ]?(?:eu|eea)|niet[- ]?(?:eu|eer)|buitenland|[ée]tranger|hors (?:ue|union)/i;
export const mentionsInternationalApplicants = (quote: string): boolean =>
  INTERNATIONAL_WORDS.test(quote);
```

`scripts/import/proposals.ts`, in `verifyProposal`'s `key === "intakes"` branch, before the date loop add:

```ts
      const hasDeadline = items.some((item) => item.applicationDeadline !== null);
      if (hasDeadline && !accepted.some((e) => mentionsInternationalApplicants(e.quote)))
        reason =
          "no accepted quote says the deadline applies to international or non-EU applicants";
```
(import `mentionsInternationalApplicants` from `./evidence`; keep the existing per-date loop, which may overwrite `reason` with its own message: make the new check run first and `else` the loop only when `reason === null`.)

`scripts/import/reader.ts`: replace the `intakes` bullet in FACT DETAILS with:

```
- intakes: dates as ISO YYYY-MM-DD. Write a date only if the quote states day, month and YEAR; otherwise leave it out (do not infer a year). null for a date the pages do not give. Never output an intake whose dates are all null: leave the fact out. applicationDeadline is the deadline of the NON-EU / international applicant: include a quote that says the date is for international, non-EU or foreign-qualification applicants (for example "for non-EU applicants", "with a qualification from abroad"). If the page only gives a general deadline without saying who it is for, leave the deadline out.
```

- [ ] **Step 4: Update fixtures that carry intakes** in existing tests (`proposals.test.ts`, `reader.test.ts`, `enrich.test.ts`, `evidence-cli.test.ts`, `checker.test.ts` as needed): where a test needs an intakes fact to be accepted, make its quote mention non-EU applicants (for example "Non-EU applicants: application deadline 15 May 2027"); do not weaken the new rule. List the changed tests in the report.

- [ ] **Step 5: Run to verify they pass.** `pnpm vitest run tests/scripts && pnpm typecheck && pnpm lint` — Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add scripts/import/evidence.ts scripts/import/proposals.ts scripts/import/reader.ts tests/scripts/import
git commit -m "feat: a deadline is accepted only with a quote that says it is for international applicants

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Recurring deadline in the data model, domain and ADR 0009

**Files:**
- Modify: `src/data-schema/records/program.ts`, `src/domain/types.ts`, `src/domain/intakes.ts`, `src/lib/format.ts`, `src/lib/i18n/vocabulary.ts` (+ the doc comment listing keys)
- Create: `.claude/docs/decisions/0009-recurring-deadlines.md`
- Test: `tests/data-schema/records.test.ts`, `tests/domain/intakes.test.ts`, `tests/lib/format.test.ts`, `tests/i18n/vocabulary.test.ts` (existing exhaustiveness test), `tests/lib/client-imports.test.ts` (must stay green)

**Interfaces:**
- Produces: `MonthDaySchema`, `type MonthDay = { month: number; day: number }` and `Intake.recurringDeadline?: MonthDay` (`program.ts`); `IntakeStatus` member `{ kind: "recurring"; deadline: MonthDay; fact: FactRef }`; `formatMonthDay(md: MonthDay): string` giving `"15/07"`; `INTAKE_KINDS` includes `"recurring"`.

Semantics: `nextIntake` keeps its current result when a dated deadline is upcoming (`upcoming`) and `unknown` when nothing is published. New: an intake list with no dated deadline but at least one `recurringDeadline` is `recurring` (not `unknown`); a list whose dated deadlines are all past but which has a recurring deadline is `recurring` (not `closed`); with several recurring deadlines the one whose next occurrence is soonest from `now` (comparing month-day only) is returned. An intake carrying both an `applicationDeadline` and a `recurringDeadline` is invalid.

- [ ] **Step 1: Write the failing tests.**

`tests/data-schema/records.test.ts` (follow the file's existing helpers for a valid program record):

```ts
describe("intake recurringDeadline", () => {
  const base = { startDate: null, applicationOpens: null, applicationDeadline: null };
  it("accepts a month and day, and still accepts the three-date form without it", () => {
    expect(IntakeSchema.safeParse({ ...base, recurringDeadline: { month: 7, day: 15 } }).success).toBe(true);
    expect(IntakeSchema.safeParse(base).success).toBe(true);
  });
  it.each([
    [{ month: 2, day: 30 }],
    [{ month: 13, day: 1 }],
    [{ month: 4, day: 31 }],
    [{ month: 0, day: 5 }],
    [{ month: 7, day: 15, year: 2026 }],
  ])("rejects %j", (recurringDeadline) => {
    expect(IntakeSchema.safeParse({ ...base, recurringDeadline }).success).toBe(false);
  });
  it("accepts 29 February (it exists in some years)", () => {
    expect(IntakeSchema.safeParse({ ...base, recurringDeadline: { month: 2, day: 29 } }).success).toBe(true);
  });
  it("rejects an intake that has both a dated and a recurring deadline", () => {
    expect(
      IntakeSchema.safeParse({ ...base, applicationDeadline: "2027-07-15", recurringDeadline: { month: 7, day: 15 } }).success,
    ).toBe(false);
  });
});
```

`tests/domain/intakes.test.ts` (use the file's `I`, `at`, `NOW = "2026-09-29"`; add a builder `R = (month, day): Intake => ({ startDate: null, applicationOpens: null, applicationDeadline: null, recurringDeadline: { month, day } })`):

```ts
describe("nextIntake with a recurring deadline", () => {
  it("is recurring when it is the only deadline information", () => {
    const r = at([R(7, 15)]);
    expect(r.kind).toBe("recurring");
    expect(r.kind === "recurring" ? r.deadline : null).toEqual({ month: 7, day: 15 });
  });
  it("is recurring, not closed, when the dated deadlines are past", () => {
    expect(at([I("2026-01-01"), R(7, 15)]).kind).toBe("recurring");
  });
  it("a future dated deadline wins over a recurring one", () => {
    const r = at([R(7, 15), I("2027-01-15")]);
    expect(r.kind).toBe("upcoming");
  });
  it("picks the recurring deadline whose next occurrence is soonest from now (29 Sept)", () => {
    const r = at([R(7, 15), R(12, 1), R(2, 1)]);
    expect(r.kind === "recurring" ? r.deadline : null).toEqual({ month: 12, day: 1 });
  });
  it("wraps into next year: only earlier months remain", () => {
    const r = at([R(7, 15), R(2, 1)]);
    expect(r.kind === "recurring" ? r.deadline : null).toEqual({ month: 2, day: 1 });
  });
  it("today's month-day counts as still ahead (inclusive)", () => {
    const r = at([R(7, 15), R(9, 29)]);
    expect(r.kind === "recurring" ? r.deadline : null).toEqual({ month: 9, day: 29 });
  });
  it("never produces an upcoming status or a date from a recurring deadline", () => {
    const r = at([R(7, 15)]);
    expect(r.kind).not.toBe("upcoming");
    expect(JSON.stringify(r)).not.toMatch(/20\d\d-\d\d-\d\d/);
  });
  it("keeps the FactRef so staleness stays visible", () => {
    const r = at([R(7, 15)]);
    expect(r.fact).toMatchObject({ path: "intakes", class: "volatile", freshness: "fresh" });
  });
});
```

`tests/lib/format.test.ts`: `expect(formatMonthDay({ month: 7, day: 5 })).toBe("05/07")` and `({ month: 12, day: 31 })` gives `"31/12"`.

The vocabulary exhaustiveness test (`tests/i18n/vocabulary.test.ts`) already fails to compile until `INTAKE_KINDS` has `"recurring"`; messages arrive in Task 3, so add the `domain.intake.recurring` key to the three catalogues **in this task** with the strings of Task 3's table (so `pnpm test` stays green here).

- [ ] **Step 2: Run to verify they fail.** `pnpm vitest run tests/data-schema tests/domain tests/lib/format.test.ts tests/i18n/vocabulary.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.**

`src/data-schema/records/program.ts` (replace `IntakeSchema`):

```ts
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
export const MonthDaySchema = z
  .strictObject({
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
  })
  .refine(({ month, day }) => day <= (DAYS_IN_MONTH[month - 1] ?? 0), {
    message: "that day does not exist in that month",
  });
export type MonthDay = z.infer<typeof MonthDaySchema>;

export const IntakeSchema = z
  .strictObject({
    startDate: IsoDateSchema.nullable(),
    applicationOpens: IsoDateSchema.nullable(),
    applicationDeadline: IsoDateSchema.nullable(),
    // A deadline the source states without a year ("15 July"): it repeats every year. It is never
    // turned into a dated deadline and never shown as upcoming (ADR 0009).
    recurringDeadline: MonthDaySchema.optional(),
  })
  .refine((i) => !(i.applicationDeadline !== null && i.recurringDeadline !== undefined), {
    message: "an intake has a dated deadline or a recurring one, not both",
  });
```
Update every place that spreads or rebuilds an `Intake` if typecheck complains (the type gains one optional field; the build scripts copy intake objects as-is).

`src/domain/types.ts`:

```ts
import type { Intake, MonthDay } from "@/data-schema/records/program";
export type IntakeStatus =
  | { kind: "upcoming"; intake: Intake; fact: FactRef }
  | { kind: "recurring"; deadline: MonthDay; fact: FactRef } // UI: "Usually by 15/07 each year: check the date for your intake"
  | { kind: "closed"; fact: FactRef } // UI: "Closed — next dates not yet published"
  | { kind: "unknown"; fact: FactRef | null };
```

`src/domain/intakes.ts`:

```ts
import type { MonthDay } from "@/data-schema/records/program";

const key = ({ month, day }: MonthDay): number => month * 100 + day;

// The recurring deadline whose next occurrence is soonest from `now`, comparing month and day only.
function soonest(deadlines: readonly MonthDay[], now: IsoDate): MonthDay {
  const today = Number(now.slice(5, 7)) * 100 + Number(now.slice(8, 10));
  const rank = (d: MonthDay): number => (key(d) >= today ? key(d) : key(d) + 1200);
  return deadlines.reduce((best, d) => (rank(d) < rank(best) ? d : best));
}

export function nextIntake(program: Pick<Program, "slug" | "intakes">, now: IsoDate): IntakeStatus {
  const fact = toFactRef(`programs/${program.slug}`, "intakes", program.intakes, now);
  const intakes = program.intakes.value;
  const recurring = (intakes ?? []).flatMap((i) =>
    i.recurringDeadline === undefined ? [] : [i.recurringDeadline],
  );
  if (
    intakes === null ||
    (recurring.length === 0 && intakes.every((i) => i.applicationDeadline === null))
  ) {
    return { kind: "unknown", fact };
  }

  let earliest: Intake | null = null;
  for (const intake of intakes) {
    const deadline = intake.applicationDeadline;
    if (deadline === null || compareIso(deadline, now) < 0) continue;
    if (
      earliest === null ||
      earliest.applicationDeadline === null ||
      compareIso(deadline, earliest.applicationDeadline) < 0
    ) {
      earliest = intake;
    }
  }
  if (earliest !== null) return { kind: "upcoming", intake: earliest, fact };
  if (recurring.length > 0) return { kind: "recurring", deadline: soonest(recurring, now), fact };
  return { kind: "closed", fact };
}
```

`src/lib/format.ts` (type import only):

```ts
import type { MonthDay } from "@/data-schema/records/program";

// DD/MM, like the DD/MM/YYYY rule for full dates; Latin digits in every locale.
export function formatMonthDay({ month, day }: MonthDay): string {
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}
```

`src/lib/i18n/vocabulary.ts`: add `"recurring"` to `INTAKE_KINDS` and the doc comment (`domain.intake.<IntakeKind>  upcoming: {date}; recurring: {date} as DD/MM`).

`.claude/docs/decisions/0009-recurring-deadlines.md`: status Accepted (2026-10-02, owner decision); context (pages publish "15 July" with no year; the data model needed a full date, so 76 such deadlines were rejected; ADR 0004 forbids showing a past deadline as upcoming); decision (optional `recurringDeadline` on an intake; `IntakeStatus` kind `recurring`; shown as guidance "usually", never as upcoming, never green, with its source and date; a dated upcoming deadline always wins; the year is never guessed; the pipeline proposes it only when the quote has day and month and no year; any deadline needs an accepted quote naming international/non-EU applicants); consequences (more deadlines are shown, honestly labelled; Compare and any exhaustive switch over `IntakeStatus` need a case; recurring deadlines age like other volatile facts, 120/270 days); alternatives considered (infer the year: rejected, would show wrong dates; keep rejecting: rejected by the owner).

- [ ] **Step 4: Run to verify they pass.** `pnpm vitest run tests/data-schema tests/domain tests/lib tests/i18n && pnpm typecheck && pnpm lint && pnpm test` — Expected: PASS. Fix any exhaustive `switch` over `IntakeStatus["kind"]` that the compiler now flags (report each).

- [ ] **Step 5: Commit.**

```bash
git add src/data-schema/records/program.ts src/domain/types.ts src/domain/intakes.ts src/lib/format.ts src/lib/i18n/vocabulary.ts messages/en.json messages/fr.json messages/ar.json .claude/docs/decisions/0009-recurring-deadlines.md tests
git commit -m "feat: recurring deadline in the data model and domain (ADR 0009)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The recurring deadline in the UI (deadline status and program page)

> Invoke `impeccable:impeccable` first (phone-first, fr LTR and ar RTL, icon plus text, never green). Read `DESIGN.md`. Follow `src/components/deadline-status.tsx` and `src/components/program/program-sections.tsx` (`DeadlineSection`).

**Files:**
- Modify: `src/components/deadline-status.tsx`, `src/components/program/program-sections.tsx` (`DeadlineSection`), `messages/{en,fr,ar}.json` (`program.deadline.recurring`; `domain.intake.recurring` was added in Task 2)
- Test: `tests/components/deadline-status.test.tsx`, `tests/components/program/*` (program sections), `tests/app/program-page.test.tsx`, `tests/i18n/*` (parity, forbidden wording)

**Messages** (fr uses U+00A0 before `:`; `{date}` is the preformatted `DD/MM`):

| key | en | fr | ar |
|---|---|---|---|
| `domain.intake.recurring` | Usually by {date} each year: check the date for your intake | En général avant le {date} chaque année : vérifiez la date de votre rentrée | عادةً قبل {date} من كل عام: تحقق من تاريخ دفعتك |
| `program.deadline.recurring` | Application deadline: usually {date} each year (year not published, to be checked) | Date limite de candidature : en général le {date} chaque année (année non publiée, à vérifier) | الموعد النهائي للتقديم: عادةً في {date} من كل عام (السنة غير منشورة، يجب التحقق منها) |

(If the forbidden-wording or vocabulary tests reject a phrase, reword minimally and report which.)

- [ ] **Step 1: Write the failing tests.** `deadline-status.test.tsx`: for each locale in `LOCALES`, render `{ kind: "recurring", deadline: { month: 7, day: 15 }, fact: ref() }`; assert the container has `data-intake="recurring"`; the text equals the catalogue message `domain.intake.recurring` with `{date}` = `15/07`; no `<time>` element (there is no ISO date); the `CalendarClock` icon test id `deadline-icon-recurring` is present and `aria-hidden`; a `SourceBadge` renders (compact) for a fresh fact and for a stale fact keeps the stale marker (follow how the existing upcoming tests assert it); no physical direction utilities (`expectNoPhysicalDirection`); the console is silent. `program-sections` test: a program whose intakes are `[{ startDate: null, applicationOpens: null, applicationDeadline: null, recurringDeadline: { month: 7, day: 15 } }]` shows the `program.deadline.recurring` line with `15/07` and does not show `deadlineUnknown`; a program with a dated deadline is unchanged. `tests/app/program-page.test.tsx`: the static HTML for such a program contains the `program.deadline.recurring` text (date-independent) and no `data-intake` status.
- [ ] **Step 2: Run to verify they fail.** `pnpm vitest run tests/components tests/app tests/i18n` — Expected: FAIL.
- [ ] **Step 3: Implement.** In `deadline-status.tsx`: import `CalendarClock` from `lucide-react` and `formatMonthDay` from `@/lib/format`; compute `const recurring = intake.kind === "recurring" ? intake.deadline : null;` and `shown = intake.kind === "upcoming" && deadline === null ? "unknown" : intake.kind`; render a third icon branch `<CalendarClock aria-hidden="true" data-testid="deadline-icon-recurring" className={ICON_CLASS} />` and the text `<span><bdi>{t("recurring", { date: formatMonthDay(recurring) })}</bdi></span>` (a `bdi` keeps `15/07` stable in RTL); keep the opens line only for `upcoming`; the `SourceBadge` shows for `recurring` like for `upcoming`/`closed` (not for `unknown`). In `DeadlineSection`: for an intake with `recurringDeadline`, render `t("recurring", { date: formatMonthDay(intake.recurringDeadline) })` in place of the deadline `PublishedDate` (and include it in the `key`); everything else unchanged.
- [ ] **Step 4: Verify.** `pnpm vitest run tests/components tests/app tests/i18n tests/lib && pnpm typecheck && pnpm lint && pnpm test` — Expected: PASS. Then (needs ports 3000/3100 free: ask the controller) measure the bundle: `pnpm build && pnpm perf:js` and, with `pnpm build:e2e && pnpm test:e2e tests/e2e/perf.spec.ts`, compare every row with `tests/e2e/support/js-budget.ts`; **if any existing row is exceeded, STOP and report the numbers** (do not raise a row); restore real data with `pnpm data:build`.
- [ ] **Step 5: Commit.**

```bash
git add src/components/deadline-status.tsx src/components/program/program-sections.tsx messages/en.json messages/fr.json messages/ar.json tests
git commit -m "feat: show a recurring deadline as usual guidance, never as an upcoming date

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The pipeline proposes, verifies and applies recurring deadlines

**Files:**
- Modify: `scripts/import/evidence.ts` (`checkRecurringDeadline`), `scripts/import/proposals.ts` (intake schema and verification), `scripts/import/reader.ts` (`INSTRUCTION`, `salvageProposal`), `scripts/import/checker.ts` (`claimText`)
- Test: `tests/scripts/import/evidence.test.ts`, `proposals.test.ts`, `reader.test.ts`, `checker.test.ts`, `enrich.test.ts`

**Interfaces:**
- Produces: `checkRecurringDeadline(month: number, day: number, quote: string): FactCheck`; proposal intake item `{ startDate, applicationOpens, applicationDeadline, recurringDeadline?: { month, day } | null }`.

Rules: `recurringDeadline` is for an application deadline the quote states with day and month and **no year**; it is verified by `checkRecurringDeadline` (day and month appear in the quote, in the same forms `checkDeadline` accepts, no year required); an item with a recurring deadline must have `applicationDeadline: null` (schema refinement); the international rule of Task 1 applies to an item with a dated **or** recurring deadline; an item whose three dates and recurring deadline are all null is still dropped by `salvageProposal`; `applyEnrichment` needs no change (the value passes through `recordValue` unchanged; an existing official intakes value is never overwritten).

- [ ] **Step 1: Write the failing tests.** `evidence.test.ts`:

```ts
describe("checkRecurringDeadline", () => {
  it.each([
    [7, 15, "Application deadline: 15 July"],
    [7, 15, "Bewerbungsfrist: 15. Juli"],
    [5, 1, "Meld je uiterlijk 1 mei aan"],
    [11, 30, "applications until 30.11."],
    [1, 15, "Frist 15/01"],
  ])("accepts %i/%i in: %s", (month, day, quote) => {
    expect(checkRecurringDeadline(month, day, quote).ok).toBe(true);
  });
  it.each([
    [7, 16, "Application deadline: 15 July"],
    [8, 15, "Application deadline: 15 July"],
    [7, 15, "Applications open all year"],
  ])("rejects %i/%i in: %s", (month, day, quote) => {
    expect(checkRecurringDeadline(month, day, quote).ok).toBe(false);
  });
});
```

`proposals.test.ts`: schema accepts `{ startDate: null, applicationOpens: null, applicationDeadline: null, recurringDeadline: { month: 7, day: 15 } }`, rejects `{ month: 2, day: 30 }`, rejects an item that has both `applicationDeadline: "2027-07-15"` and a `recurringDeadline`; `verifyProposal` accepts a recurring deadline whose accepted quote says `"Applicants from outside the EU: application deadline 15 July"`; rejects it when the quote lacks day and month (`"Applications open all year, for international applicants"`, reason mentions the deadline); rejects it when no accepted quote names international/non-EU applicants (reason `no accepted quote says the deadline applies to international or non-EU applicants`); accepts a mixed list (one dated item and one recurring item) when the rule is satisfied. `reader.test.ts`: `INSTRUCTION` mentions `recurringDeadline`; `salvageProposal` keeps an item that has only a recurring deadline and still drops an item whose dates and recurring deadline are all null. `checker.test.ts`: `claimText("intakes", [{ startDate: null, applicationOpens: null, applicationDeadline: null, recurringDeadline: { month: 7, day: 15 } }])` contains `15` and `July` or `07` and `every year`/`each year`, and does not contain a four-digit year. `enrich.test.ts`: an enrichment that fills `intakes` with a recurring item stores `{ ..., recurringDeadline: { month: 7, day: 15 } }` as official with the new source, and an existing official dated intake is kept.
- [ ] **Step 2: Run to verify they fail.** `pnpm vitest run tests/scripts/import` — Expected: FAIL.
- [ ] **Step 3: Implement.** `evidence.ts`: factor the month-and-day matching out of `checkDeadline` into a private `dayAndMonthOk(month, day, normalisedQuote): boolean` (the existing `dayOk` and `monthOk` expressions, unchanged), have `checkDeadline` call it (behaviour unchanged, its tests stay green), and add:

```ts
export function checkRecurringDeadline(month: number, day: number, quote: string): FactCheck {
  return dayAndMonthOk(month, day, normalizeForMatch(quote))
    ? ok
    : fail(`the quote does not state the day ${day} and the month ${month}`);
}
```

`proposals.ts`: next to the other schemas add

```ts
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MonthDayProposalSchema = z
  .object({ month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) })
  .refine(({ month, day }) => day <= (DAYS_IN_MONTH[month - 1] ?? 0), {
    message: "that day does not exist in that month",
  });
```

and in the `intakes` item object add `recurringDeadline: MonthDayProposalSchema.nullable().optional()` and wrap the item object with `.refine((i) => !(i.applicationDeadline !== null && (i.recurringDeadline ?? null) !== null), { message: "an intake has a dated deadline or a recurring one, not both" })`. In `verifyProposal`'s intakes branch: `const hasDeadline = items.some((i) => i.applicationDeadline !== null || (i.recurringDeadline ?? null) !== null)` for the international rule; and for each item with a recurring deadline: `if (!accepted.some((e) => checkRecurringDeadline(r.month, r.day, e.quote).ok)) reason = \`the deadline ${r.day}/${r.month} is not supported by the quotes\``.

`reader.ts` `INSTRUCTION`: extend the OUTPUT example's intakes line with `"recurringDeadline": null` and change the intakes bullet to: `... Write a dated deadline only if the quote states day, month and YEAR. If the quote states day and month for the application deadline but NO year (for example "15 July", "1 mei"), write it as "recurringDeadline": {"month": 7, "day": 15} with applicationDeadline null: never invent or infer a year. Both forms need the international/non-EU quote described above.` `salvageProposal`'s undated-intake filter must treat a non-null `recurringDeadline` as a value. `checker.ts` `claimText` intakes: for an item with `recurringDeadline` add `application deadline every year around <day> <month name in English> (the year is not stated)`.
- [ ] **Step 4: Run to verify they pass.** `pnpm vitest run tests/scripts && pnpm typecheck && pnpm lint && pnpm test` — Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add scripts/import/evidence.ts scripts/import/proposals.ts scripts/import/reader.ts scripts/import/checker.ts tests/scripts/import
git commit -m "feat: the research pipeline proposes and verifies recurring deadlines

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Docs

**Files:** `.claude/docs/architecture.md`, `.claude/CLAUDE.md`, `data/README.md`, `.claude/docs/decisions/0009-recurring-deadlines.md` (check it matches what was built)

- [ ] **Step 1:** `.claude/docs/architecture.md`: a short subsection "Recurring deadlines" (model, `nextIntake` order of precedence, the UI wording, never upcoming, Compare needs a case when it lands, JS numbers from Task 3). `.claude/CLAUDE.md`: add `0009 recurring deadlines` to the decisions list and one convention line (`A deadline a source states without a year is stored as recurringDeadline (month, day) and shown as "usually" guidance, never as an upcoming date; any new deadline needs a quote that says it applies to international applicants`); keep the file under ~200 lines. `data/README.md`: document `recurringDeadline` in the data model notes and the international rule under "Reading pages with cheap models".
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm test && pnpm data:check` — Expected: all green. **Step 3: Commit** (`docs: ...`, explicit paths, trailer).

---

### Task 6: Re-read the programmes whose deadlines had no year (controller only; paid APIs; the owner confirms the audit)

No subagent does this task (keys in `.env.local`, money, the audit). Models: reader `deepseek-v4.1-flash`, checker `qwen3.7-plus`. Preferably outside weekday 01:00-04:00 and 06:00-10:00 UTC. Cap USD 2.

- [ ] **Step 0: Preconditions.** Branch `feat/recurring-deadlines` up to date with Tasks 1 to 5; `pnpm typecheck && pnpm lint && pnpm test && pnpm data:check` green; `git status --porcelain data-staging/` shows no stray untracked `data-staging/programs/*.yaml` and an unmodified `AUDIT.csv`; the five held-out programmes (4 `nl-hanzehogeschool-groningen-25be-*`, 1 `de-international-school-of-management-ism-...-daad9020`) are still staged: **move their five files out of `data-staging/programs/` before any `data:promote --audited-batch`** (a passed audit batch would promote them again) and restore them afterwards with `git restore --source=HEAD -- <paths>`.
- [ ] **Step 1: Slug list.** From `data-staging/proposals-read/enrich-full/calls.jsonl`, the slugs with a rejected `intakes` fact (reasons "not supported by the quotes") plus the slugs whose proposals carried intakes in `raw/<slug>.json`; write them to `data-staging/recurring-slugs.txt` and report the count (expect about 50 to 70 programmes).
- [ ] **Step 2: Estimates (nothing spent).** `pnpm data:read --model deepseek-v4.1-flash --pages data-staging/pages-enrich-full.json --slugs data-staging/recurring-slugs.txt --dry-run`. **Owner:** confirm under the cap.
- [ ] **Step 3: Paid read.** `pnpm data:read --model deepseek-v4.1-flash --check qwen3.7-plus --pages data-staging/pages-enrich-full.json --slugs data-staging/recurring-slugs.txt --max-usd 2 --max-tokens 20000000 --out data-staging/proposals-read/recurring`. Print, per programme, the accepted `intakes` (dated or recurring) with quotes and the rejected ones with reasons. **Owner:** read them; the rule that a quote must name international/non-EU applicants is now enforced by code.
- [ ] **Step 4: Stage.** `mkdir -p data-staging/proposals-recurring && cp data-staging/proposals-read/recurring/*.json data-staging/proposals-recurring/`; keep only the `intakes` fact in each copied proposal (a small script: drop every other key of `facts`) so nothing else changes; then `pnpm data:evidence restage --enrich data-staging/proposals-recurring --slugs data-staging/recurring-slugs.txt`, `verify --enrich ... --dry-run`, `verify --enrich ...`; delete the staged file of every slug printed `no new facts: discard`. Report changed records, kept-existing conflicts and registry-value conflicts.
- [ ] **Step 5: Check the unsampled records before promotion** (a 10% sample missed a systematic problem last time): list every new deadline with its quotes (recurring and dated) and read them with the owner, flagging any quote that does not say who the deadline is for.
- [ ] **Step 6: Audit and promote.** `pnpm data:audit draw`, `pnpm data:audit sheet`, **Owner:** confirm the sample; record the outcome; `pnpm data:audit status`; then (held-out files moved aside) `pnpm data:promote --confirm-human-read --verified-on <today> --audited-batch --replace-revisions`; confirm `git status --short data | grep -v '^ M'` shows nothing untracked; `pnpm data:check` (0 errors, 0 warnings), `pnpm data:build`, `pnpm test`, `pnpm typecheck`, `pnpm lint`; `pnpm -s data:coverage > data-staging/coverage-after-recurring.md`.
- [ ] **Step 7: Browser check (fr and ar, 375px and desktop).** Controller: `pnpm dev` (or `dev:fixture` with a recurring fixture), open a promoted program page and My matches/plan with a recurring deadline, check the wording, the digit shape (`15/07`), RTL order, the source badge and the stale marker.
- [ ] **Step 8: Report.** Draft PR from `feat/recurring-deadlines` (base: the research branch while PR #9 is open): what changed, JS numbers, the data table, the pending Compare follow-up. Stop.

---

## Self-review

- **Spec coverage:** international rule as a code rule (Task 1); recurring model (Task 2), UI in fr/en/ar with source and stale marker (Task 3), pipeline extraction and verification (Task 4), ADR 0009 and docs (Tasks 2 and 5), re-read of the programmes with year-less deadlines with the lessons from the first run (Task 6: held-out precaution, unsampled check).
- **Placeholders:** none; Task 4 gives the exact Zod schemas, and every task lists its tests with real assertions.
- **Types:** `MonthDay`, `MonthDaySchema`, `recurringDeadline`, `IntakeStatus` kind `"recurring"`, `formatMonthDay`, `mentionsInternationalApplicants`, `checkRecurringDeadline` are defined once (Tasks 1 and 2) and used with the same names later.
