# Official fee range for programme tuition: Implementation Plan (Italy completeness, piece 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a programme's `tuition` be an OFFICIAL RANGE (`amountMinor` to `maxAmountMinor`) with an optional `basis: "income_based"`, stored, validated, built into the snapshot, used by the cost estimate, shown everywhere tuition is shown, and read by the import pipeline from a verbatim quote that code verifies.

**Architecture:** An additive, optional pair of fields on `TuitionSchema` (a flat fee is unchanged, so no existing record moves). One pure helper (`tuitionBounds`) feeds the cost domain and the display; one string formatter (`formatTuition`) and one tiny note component (`TuitionBasisNote`) replace the three hand-written amount renderings. The snapshot format version goes from 1 to 2. The reader/checker/proposal path accepts `{min, max, basis}`; the checker verifies both numbers and the currency against the quote and refuses `income_based` unless the quote mentions income.

**Tech Stack:** TypeScript strict, Zod, Next.js 16 / React 19, next-intl, Tailwind v4 logical utilities, Vitest, Playwright, Biome, pnpm.

Spec: `docs/superpowers/specs/2026-10-08-italy-completeness-design.md` (approved 2026-10-08), section "Piece 1: tuition model extension". Pieces 2 (discovery) and 3 (fill) get their own plans after this one merges. Branch: `feat/italy-completeness`, worktree `C:\Users\dagda\Downloads\nex\UniWay-italy` (from `origin/main` bb8c5339).

## Global Constraints

- Official sources only; a model proposes, code decides; every fact needs a verbatim quote that code re-fetches; unknown stays unknown; an official value is never overwritten. A non-null `tuition` must stay `info_kind: official`.
- A flat fee (no `maxAmountMinor`, no `basis`) is unchanged everywhere: schema, snapshot, cost estimate, display, import. No existing `data/` record may change.
- Money is integer minor units plus an ISO currency code; displayed only through `formatMoney` / `formatMoneyRange` (`src/lib/format.ts`); never format by hand. Displayed ICU arguments are preformatted strings; numbers are only plural/select selectors. `ar` keeps Latin digits.
- All user-facing strings through next-intl in `en`, `fr`, `ar` (`ar` is a machine draft). French messages use a no-break space before `: ? ! ;` (an existing test enforces it). Tailwind logical utilities only (`ms-`, `pe-`, `text-start`; never `ml-`/`pr-`/`left-`).
- The snapshot format changes, so `SNAPSHOT_FORMAT_VERSION` goes from 1 to 2 everywhere it is defined or asserted; `public/snapshots` is rebuilt, never edited.
- Client-reachable code imports no Zod and nothing runtime from `@/data-schema` except `dates`/`staleness` (`tests/lib/client-imports.test.ts`); type-only imports are fine. `src/domain` stays pure (no React, Next, DB, `fs`, network).
- The client JS ratchet in `tests/e2e/support/js-budget.ts` only goes down: no row is raised by this work. If a row would be exceeded, STOP and report the exact numbers to the owner (ADR 0008 allows a raise only with a written reason and the owner's decision).
- Do not edit `data/` or `public/snapshots`. Nothing is promoted by this plan. The import-script changes never run against the network in tests (temp dirs, inline fixtures).
- No `any`, no `@ts-ignore`, no non-null `!`; named exports; explicit `git add` paths; conventional commits, each ending with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; never push to `main`, never force-push, PRs only, never merge unless the owner asks.
- Display wording is decided: `domain.cost.incomeBased` = en "Depends on household income (ISEE)", fr "Dépend du revenu du foyer (ISEE)", ar "يعتمد على دخل الأسرة (ISEE)". ISEE is the Italian measure; `basis: "income_based"` is the generic value, and a second country needing different wording is a later change (YAGNI).

## Environment (this machine)

- Work in the worktree `C:\Users\dagda\Downloads\nex\UniWay-italy`, NOT in `C:\Users\dagda\Downloads\nex\UniWay` (its dev server on port 3000 and its branch `feat/scholarships-page` must not be touched). First time in the worktree: `pnpm install --frozen-lockfile`.
- Before any `pnpm` or `next` command: `export SWC_NATIVE_BINDING_CACHE='C:\Users\dagda\.swc-cache'` (it does not persist between Bash calls).
- The shell strips backslashes: never write regexes or `\n` through heredocs; use the Edit/Write tools. `rm -rf` is denied.
- `pnpm build` and `pnpm test:e2e` overwrite `public/snapshots` and `.next` of THIS worktree only; after a `pnpm build` run `pnpm data:build` again. E2E starts `next start` on port 3100; never touch port 3000.
- Library docs before writing against an API: `MSYS_NO_PATHCONV=1 npx ctx7@latest docs /vercel/next.js/v16.2.9 "<query>"` (or next-intl). The patterns in this plan are already used in the repo.
- All UI work: invoke the `impeccable` skill's guidance (phone-first, fr LTR and ar RTL, 44 px tap targets); the controller runs the browser pass.

## File Structure

| File | Responsibility |
|---|---|
| `src/data-schema/records/program.ts` (modify) | `TuitionSchema` gains `maxAmountMinor?`, `basis?` and two refinements; exports `TUITION_BASES`. |
| `src/domain/tuition.ts` (create) | Pure: `tuitionBounds`, `isTuitionRange`. |
| `src/domain/costs.ts`, `src/domain/types.ts` (modify) | Tuition line uses the bounds; `CostLine.incomeBased?`. |
| `src/lib/format.ts` (modify) | `formatTuition(tuition, locale)`. |
| `src/components/tuition-basis-note.tsx` (create) | Shared server/client-neutral note "depends on household income". |
| `src/components/match-card.tsx`, `src/components/compare/compare-cells.tsx`, `src/components/program/program-sections.tsx`, `src/components/cost-breakdown.tsx` (modify) | Use `formatTuition` and `TuitionBasisNote`. |
| `src/lib/journey/compare-view.ts` (modify) | Row signature includes max and basis. |
| `src/lib/i18n/vocabulary.ts`, `messages/{en,fr,ar}.json` (modify, additive) | Key `domain.cost.incomeBased`. |
| `src/data-schema/snapshot.ts`, `src/lib/constants.ts` (modify) | Format version 2. |
| `scripts/import/proposals.ts`, `scripts/import/evidence.ts`, `scripts/import/checker.ts`, `scripts/import/reader.ts` (modify) | Reader shape, verification, claim text, prompt. |
| `.claude/docs/decisions/0010-official-fee-range.md` (create), `.claude/rules/reference-data.md`, `.claude/rules/matching-domain.md`, `data/README.md`, `.claude/CLAUDE.md` (modify) | Decision and rules. |
| `tests/...` | Mirrors the above. |

Decisions the plan fixes (flagged to the owner in the final report):
1. `maxAmountMinor >= amountMinor` (equal allowed); `basis` is allowed only with `maxAmountMinor`; a range may have no basis (an official range whose reason is not stated).
2. A zero minimum with a maximum is allowed (for example "0 to 2000").
3. The checker accepts `basis: "income_based"` only when the quote contains an income word (ISEE, income, reddito, revenu, Einkommen, inkomen); otherwise the proposal's tuition is rejected, never silently downgraded.
4. The cost estimate and budget fit treat the range as the existing code treats any `{min, max}`; no new budget logic.
5. No end-to-end fixture programme is changed (it would shift counts in unrelated specs); ranged display is proven by component tests, a fixture-variant page test and a variant view-model test.

---

### Task 1: Schema, helper and `data:check` coverage

**Files:**
- Modify: `src/data-schema/records/program.ts:16-20`
- Create: `src/domain/tuition.ts`
- Test: `tests/data-schema/records.test.ts` (add cases), `tests/domain/tuition.test.ts` (create), `tests/scripts/data/validate.test.ts` (add one case)

**Interfaces:**
- Produces (used by Tasks 3 to 6):
  ```ts
  // program.ts
  export const TUITION_BASES = ["income_based"] as const;
  export type Tuition = { amountMinor: number; maxAmountMinor?: number; currency: string; period: "year" | "semester"; basis?: "income_based" };
  // domain/tuition.ts
  export type TuitionBounds = { min: number; max: number };
  export function tuitionBounds(tuition: Tuition): TuitionBounds;
  export function isTuitionRange(tuition: Tuition): boolean;
  ```

- [ ] **Step 1: Write the failing tests**

In `tests/data-schema/records.test.ts`, add to the `INVALID` table (next to `"program tuition period month"`):

```ts
  [
    "program tuition max below min",
    "programs",
    () =>
      program({
        tuition: F({ amountMinor: 2000, maxAmountMinor: 1000, currency: CURRENCY, period: "year" }),
      }),
    E("tuition.value.maxAmountMinor"),
  ],
  [
    "program tuition basis without a maximum",
    "programs",
    () =>
      program({
        tuition: F({ amountMinor: 1000, currency: CURRENCY, period: "year", basis: "income_based" }),
      }),
    E("tuition.value.basis"),
  ],
  [
    "program tuition unknown basis",
    "programs",
    () =>
      program({
        tuition: F({
          amountMinor: 1000,
          maxAmountMinor: 2000,
          currency: CURRENCY,
          period: "year",
          basis: "per_credit",
        }),
      }),
    E("tuition.value.basis"),
  ],
  [
    "program tuition negative maximum",
    "programs",
    () =>
      program({
        tuition: F({ amountMinor: 1000, maxAmountMinor: -1, currency: CURRENCY, period: "year" }),
      }),
    E("tuition.value.maxAmountMinor"),
  ],
```

and, in the `describe("record schemas", ...)` block after the scholarship tests, add:

```ts
  it("accepts an official tuition range, with or without a basis, and a flat fee unchanged", () => {
    const { schema } = COLLECTIONS.programs;
    const flat = { amountMinor: 1000, currency: CURRENCY, period: "year" };
    expect(schema.safeParse(program({ tuition: F(flat) })).success).toBe(true);
    expect(
      schema.safeParse(program({ tuition: F({ ...flat, maxAmountMinor: 3000 }) })).success,
    ).toBe(true);
    expect(
      schema.safeParse(
        program({ tuition: F({ ...flat, maxAmountMinor: 3000, basis: "income_based" }) }),
      ).success,
    ).toBe(true);
    // equal bounds and a zero minimum are legal ranges
    expect(
      schema.safeParse(program({ tuition: F({ ...flat, maxAmountMinor: 1000 }) })).success,
    ).toBe(true);
    expect(
      schema.safeParse(program({ tuition: F({ ...flat, amountMinor: 0, maxAmountMinor: 200000 }) }))
        .success,
    ).toBe(true);
  });
```

Create `tests/domain/tuition.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { Tuition } from "@/data-schema/records/program";
import { isTuitionRange, tuitionBounds } from "@/domain/tuition";

const flat: Tuition = { amountMinor: 120000, currency: "XTS", period: "year" };
const range: Tuition = { ...flat, maxAmountMinor: 300000, basis: "income_based" };

describe("tuitionBounds", () => {
  it("makes a flat fee a range with equal ends", () => {
    expect(tuitionBounds(flat)).toEqual({ min: 120000, max: 120000 });
  });
  it("returns the stated bounds of a range", () => {
    expect(tuitionBounds(range)).toEqual({ min: 120000, max: 300000 });
  });
});

describe("isTuitionRange", () => {
  it("is false for a flat fee and for equal bounds, true for a real range", () => {
    expect(isTuitionRange(flat)).toBe(false);
    expect(isTuitionRange({ ...flat, maxAmountMinor: 120000 })).toBe(false);
    expect(isTuitionRange(range)).toBe(true);
  });
});
```

In `tests/scripts/data/validate.test.ts`, inside `describe("tuition must be official", ...)` (around line 902), add a case that a ranged tuition on a PROGRAM with `info_kind: estimate` still raises `NOT_OFFICIAL` and one that an official range validates. Use the same `tuitionWith`/`mutateFile` helpers as the neighbouring cases:

```ts
    it("still errors on a non-official range and accepts an official one", () => {
      const range = { value: { amountMinor: 100000, maxAmountMinor: 300000, currency: "XTS", period: "year", basis: "income_based" } };
      const bad = validateData(mutateFile(base, PROG, tuitionWith({ ...range, info_kind: "estimate" })), { now: NOW });
      expect(bad.errors).toContainEqual({ file: PROG, path: "tuition.info_kind", message: NOT_OFFICIAL });
      const good = validateData(mutateFile(base, PROG, tuitionWith({ ...range, info_kind: "official" })), { now: NOW });
      expect(good.errors).toEqual([]);
    });
```
(read the surrounding cases first and keep their exact option shape; `info_kind: estimate` may also need a `basis` text in the fixture, as the neighbours show: copy whatever they pass.)

- [ ] **Step 2: Run to verify they fail**

Run: `export SWC_NATIVE_BINDING_CACHE='C:\Users\dagda\.swc-cache' && pnpm vitest run tests/data-schema/records.test.ts tests/domain/tuition.test.ts tests/scripts/data/validate.test.ts`
Expected: FAIL (the range cases are rejected as unknown keys; `@/domain/tuition` missing).

- [ ] **Step 3: Implement**

`src/data-schema/records/program.ts`, replace the `TuitionSchema` block:

```ts
export const TUITION_BASES = ["income_based"] as const;

// One official published fee, or an official RANGE (`maxAmountMinor`) when the university states a
// lowest and a highest fee. `basis: "income_based"` says the fee depends on the household's income
// (in Italy the ISEE indicator); it is only legal with a range.
export const TuitionSchema = z
  .strictObject({
    amountMinor: MinorAmountSchema,
    maxAmountMinor: MinorAmountSchema.optional(),
    currency: CurrencySchema,
    period: z.enum(["year", "semester"]),
    basis: z.enum(TUITION_BASES).optional(),
  })
  .superRefine((tuition, ctx) => {
    if (tuition.maxAmountMinor !== undefined && tuition.maxAmountMinor < tuition.amountMinor) {
      ctx.addIssue({
        code: "custom",
        path: ["maxAmountMinor"],
        message: "maxAmountMinor must be >= amountMinor",
      });
    }
    if (tuition.basis !== undefined && tuition.maxAmountMinor === undefined) {
      ctx.addIssue({ code: "custom", path: ["basis"], message: "basis needs maxAmountMinor" });
    }
  });
```

`src/domain/tuition.ts`:

```ts
import type { Tuition } from "@/data-schema/records/program";

export type TuitionBounds = { min: number; max: number };

// A flat fee is a range whose ends are equal; minor units, same currency and period as the fee.
export function tuitionBounds(tuition: Tuition): TuitionBounds {
  return { min: tuition.amountMinor, max: tuition.maxAmountMinor ?? tuition.amountMinor };
}

export function isTuitionRange(tuition: Tuition): boolean {
  return tuition.maxAmountMinor !== undefined && tuition.maxAmountMinor > tuition.amountMinor;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run tests/data-schema tests/domain/tuition.test.ts tests/scripts/data && pnpm typecheck`
Expected: PASS. If `tests/data-schema/records.test.ts` counts entries (`expect(ENTRIES).toHaveLength(13)`), those counts are of collections, not cases, and stay.

- [ ] **Step 5: Commit**

```bash
git add src/data-schema/records/program.ts src/domain/tuition.ts tests/data-schema/records.test.ts tests/domain/tuition.test.ts tests/scripts/data/validate.test.ts
git commit -m "feat: tuition schema accepts an official range and an income basis

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Snapshot format version 2

**Files:**
- Modify: `src/data-schema/snapshot.ts:22` and `:86`, `src/lib/constants.ts:10`
- Test (update): `tests/data-schema/snapshot.test.ts:35,45`, `tests/lib/snapshot/manifest-guard.test.ts:20,145`, `tests/lib/snapshot/manifest.test.ts:36-37`, `tests/lib/snapshot/client.test.ts:376`, `tests/lib/snapshot/server.test.ts:49`

**Interfaces:**
- Produces: `SNAPSHOT_FORMAT_VERSION === 2` in both `@/data-schema/snapshot` and `@/lib/constants` (a test already asserts they are equal); `ManifestSchema.formatVersion` is `z.literal(2)`.

- [ ] **Step 1: Write the failing tests (flip the version expectations)**

In each listed test, "valid" manifests use `formatVersion: 2` and the "unknown version" cases use `3` instead of `2`: `tests/data-schema/snapshot.test.ts` line 35 `formatVersion: 1` to `2` and the `["formatVersion 2", ...]` row becomes `["formatVersion 3", { ...MANIFEST, formatVersion: 3 }, false]`; `tests/lib/snapshot/manifest-guard.test.ts` line 20 to `2`, the `["formatVersion 2", ...]` edit sets `3`, and the `["formatVersion string", ...]` edit sets `"2"`; `tests/lib/snapshot/manifest.test.ts` line 36-37: `formatVersion: 3`; `tests/lib/snapshot/client.test.ts` line 376: `formatVersion: 3`; `tests/lib/snapshot/server.test.ts` line 49: `formatVersion: 3`. Add one assertion in `manifest-guard.test.ts` next to the oracle comparison (line 209): `expect(SNAPSHOT_FORMAT_VERSION).toBe(2);`.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/data-schema/snapshot.test.ts tests/lib/snapshot`
Expected: FAIL (the code still says 1).

- [ ] **Step 3: Implement**

`src/data-schema/snapshot.ts`: `export const SNAPSHOT_FORMAT_VERSION = 2;` and `formatVersion: z.literal(2),` (keep the inline literal as it is written today; the test pins the equality). `src/lib/constants.ts`: `export const SNAPSHOT_FORMAT_VERSION = 2;` Add one comment line above each: `// 2 since the official fee range (tuition.maxAmountMinor, tuition.basis); see ADR 0010.`

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run tests/data-schema tests/lib/snapshot tests/scripts/data && pnpm typecheck`
Expected: PASS. Also `grep -rn "formatVersion: 1\|FORMAT_VERSION = 1" src scripts tests` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/data-schema/snapshot.ts src/lib/constants.ts tests/data-schema/snapshot.test.ts tests/lib/snapshot/manifest-guard.test.ts tests/lib/snapshot/manifest.test.ts tests/lib/snapshot/client.test.ts tests/lib/snapshot/server.test.ts
git commit -m "feat: snapshot format version 2 for the fee range

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Cost estimate uses the range

**Files:**
- Modify: `src/domain/costs.ts:28-53`, `src/domain/types.ts` (`CostLine`)
- Test: `tests/domain/costs.test.ts`

**Interfaces:**
- Consumes: `tuitionBounds` (Task 1).
- Produces: `CostLine.incomeBased?: true` (present only on a tuition line whose fee has `basis: "income_based"`); tuition `firstYear` is `{ min: bounds.min * k, max: bounds.max * k, currency }` with `k = 2` for `semester`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/domain/costs.test.ts` (it already imports `fact`, `program`, `costLine`, `costProfile`, `NOW`; reuse its `est` helper and `cityP`/`countryP` profiles):

```ts
describe("estimateCost tuition range", () => {
  const ranged = (extra: object = {}) =>
    program({
      tuition: fact(
        { amountMinor: 100000, maxAmountMinor: 300000, currency: "XTS", period: "year", ...extra },
        { class: "volatile" },
      ),
    });

  it("uses the stated lowest and highest fee as the tuition line and widens the total", () => {
    const r = est({ p: ranged() });
    expect(r.lines[0]).toMatchObject({
      category: "tuition",
      status: "ok",
      firstYear: { min: 100000, max: 300000, currency: "XTS" },
      per: "year",
    });
    // flat 100000 gave 765000-1119000; the highest fee adds 200000 to the maximum only
    expect(r.totals).toEqual([{ min: 765000, max: 1319000, currency: "XTS" }]);
    expect(r.lines[0]?.incomeBased).toBeUndefined();
  });

  it("flags an income-based range on the line", () => {
    const r = est({ p: ranged({ basis: "income_based" }) });
    expect(r.lines[0]?.incomeBased).toBe(true);
  });

  it("doubles both ends of a semester range", () => {
    const r = est({ p: ranged({ period: "semester" }) });
    expect(r.lines[0]?.firstYear).toEqual({ min: 200000, max: 600000, currency: "XTS" });
  });

  it("leaves a flat fee exactly as before (equal ends, no flag)", () => {
    const r = est();
    expect(r.lines[0]).toMatchObject({ firstYear: { min: 100000, max: 100000 } });
    expect(r.lines[0]?.incomeBased).toBeUndefined();
  });

  it("compares a budget against the widened total like any other range", () => {
    // monthly budget 120000 * 10 = 1200000: between the total's minimum (765000) and maximum (1319000)
    const r = est({
      p: ranged(),
      budget: { amountMinor: 120000, currency: "XTS", period: "month" },
    });
    expect(r.budgetFit).toBe("straddles");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/domain/costs.test.ts`
Expected: FAIL (the max stays 100000; `incomeBased` unknown).

- [ ] **Step 3: Implement**

`src/domain/types.ts`, in `CostLine`, after `fact`:

```ts
  // Set only on a tuition line whose official fee is a range that depends on household income.
  incomeBased?: true;
```

`src/domain/costs.ts`: add `import { tuitionBounds } from "./tuition";` and replace the `ok` return of `tuitionLine`:

```ts
  const k = tuition.period === "semester" ? 2 : 1;
  const bounds = tuitionBounds(tuition);
  return {
    category: "tuition",
    status: "ok",
    firstYear: { min: bounds.min * k, max: bounds.max * k, currency: tuition.currency },
    per: tuition.period,
    scope: "program",
    fact,
    ...(tuition.basis === "income_based" ? { incomeBased: true as const } : {}),
  };
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run tests/domain tests/lib/journey && pnpm typecheck`
Expected: PASS (the existing flat expectations still hold). If the `budgetFit` expectation differs because the repo's rule for `straddles` is stated differently, read `src/domain/costs.ts` `budgetFit` and set the budget so the budget lies strictly between the total's minimum and maximum; do not change the rule.

- [ ] **Step 5: Commit**

```bash
git add src/domain/costs.ts src/domain/types.ts tests/domain/costs.test.ts
git commit -m "feat: cost estimate takes tuition as an official range

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Messages, formatter and note component

**Files:**
- Modify: `src/lib/i18n/vocabulary.ts` (the `domain.cost` values list and the doc comment at ~228-230), `messages/en.json`, `messages/fr.json`, `messages/ar.json` (additive), `src/lib/format.ts`
- Create: `src/components/tuition-basis-note.tsx`
- Test: `tests/lib/format.test.ts` (add), `tests/components/tuition-basis-note.test.tsx` (create); `tests/i18n/vocabulary.test.ts` already requires every registered key in all catalogues

**Interfaces:**
- Consumes: `tuitionBounds` (Task 1).
- Produces: `formatTuition(tuition: Tuition, locale: AppLocale): string` (a range or a single amount through `formatMoneyRange`); `TuitionBasisNote({ tuition })` rendering `<small data-testid="tuition-basis" className="block text-sm text-muted-foreground">` with `domain.cost.incomeBased` when `tuition.basis === "income_based"`, else nothing; message `domain.cost.incomeBased` (no arguments).

- [ ] **Step 1: Write the failing tests**

Add to `tests/lib/format.test.ts`:

```ts
describe("formatTuition", () => {
  const flat = { amountMinor: 120000, currency: "EUR", period: "year" as const };

  it("prints a flat fee as one amount, like formatMoney", () => {
    expect(formatTuition(flat, "en")).toBe(formatMoney(120000, "EUR", "en"));
  });
  it("prints a range as a range through formatMoneyRange, in every locale", () => {
    for (const locale of ["fr", "en", "ar"] as const) {
      expect(formatTuition({ ...flat, amountMinor: 50000, maxAmountMinor: 300000 }, locale)).toBe(
        formatMoneyRange(50000, 300000, "EUR", locale),
      );
    }
  });
  it("keeps Latin digits in Arabic", () => {
    expect(formatTuition({ ...flat, amountMinor: 50000, maxAmountMinor: 300000 }, "ar")).toMatch(/\d/);
    expect(formatTuition({ ...flat, amountMinor: 50000, maxAmountMinor: 300000 }, "ar")).not.toMatch(
      /[٠-٩۰-۹]/u,
    );
  });
});
```
(import `formatTuition`, `formatMoney`, `formatMoneyRange` from `@/lib/format`.)

Create `tests/components/tuition-basis-note.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TuitionBasisNote } from "@/components/tuition-basis-note";

import { catalogs, LOCALES, renderWithMessages } from "./trust-helpers";

afterEach(cleanup);

const flat = { amountMinor: 120000, currency: "XTS", period: "year" as const };
const range = { ...flat, maxAmountMinor: 300000 };

describe("TuitionBasisNote", () => {
  it.each(LOCALES)("says the fee depends on household income only for an income-based range (%s)", (locale) => {
    const shown = renderWithMessages(<TuitionBasisNote tuition={{ ...range, basis: "income_based" }} />, locale);
    expect(shown.container.querySelector('[data-testid="tuition-basis"]')?.textContent).toBe(
      catalogs[locale].domain.cost.incomeBased,
    );
    cleanup();
    for (const tuition of [flat, range]) {
      const hidden = renderWithMessages(<TuitionBasisNote tuition={tuition} />, locale);
      expect(hidden.container.querySelector('[data-testid="tuition-basis"]')).toBeNull();
      cleanup();
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/lib/format.test.ts tests/components/tuition-basis-note.test.tsx tests/i18n/vocabulary.test.ts`
Expected: FAIL (`formatTuition` and the component are missing).

- [ ] **Step 3: Implement**

`src/lib/format.ts`: add the type import and the function after `formatMoneyRange`:

```ts
import type { Tuition } from "@/data-schema/records/program";
import { tuitionBounds } from "@/domain/tuition";
```
(type-only for `Tuition`: `import type`; `tuitionBounds` is a runtime import from the pure domain, allowed in client code)

```ts
// A flat fee reads as one amount (formatMoneyRange collapses equal ends); a range as "X to Y".
export function formatTuition(tuition: Tuition, locale: AppLocale): string {
  const { min, max } = tuitionBounds(tuition);
  return formatMoneyRange(min, max, tuition.currency, locale);
}
```

`src/components/tuition-basis-note.tsx`:

```tsx
// Shared, no "use client": needs the namespace domain.cost (a client tree passes it through pickMessages).
import { useTranslations } from "next-intl";

import type { Tuition } from "@/data-schema/records/program";

export function TuitionBasisNote({ tuition }: { tuition: Tuition }) {
  const t = useTranslations("domain.cost");
  if (tuition.basis !== "income_based") return null;
  return (
    <small data-testid="tuition-basis" className="block text-sm text-muted-foreground">
      {t("incomeBased")}
    </small>
  );
}
```

`src/lib/i18n/vocabulary.ts`: the `domain.cost` entry becomes `values: ["tenMonthNote", "missingLine", "partialTotal", "estimateTag", "incomeBased"]` and the documentation comment line `domain.cost.missingLine | partialTotal | estimateTag` gets `| incomeBased`.

Messages (additive, LF endings, inside the existing `domain.cost` object): insert the new line immediately BEFORE the existing `"estimateTag"` line in each file, with a trailing comma, so no existing line changes (read each file around `"estimateTag"` first): `en`: `"incomeBased": "Depends on household income (ISEE)",`; `fr`: `"incomeBased": "Dépend du revenu du foyer (ISEE)",`; `ar`: `"incomeBased": "يعتمد على دخل الأسرة (ISEE)",`. Before committing: `git diff --stat -- messages` shows three files with one inserted line each, and `git diff -- messages | grep '^-' | grep -v '^---'` prints nothing.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run tests/lib/format.test.ts tests/components/tuition-basis-note.test.tsx tests/i18n tests/lib/client-imports.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS (2 pre-existing lint infos are fine).

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/i18n/vocabulary.ts src/components/tuition-basis-note.tsx messages/en.json messages/fr.json messages/ar.json tests/lib/format.test.ts tests/components/tuition-basis-note.test.tsx
git commit -m "feat: format an official fee range and say when it depends on income

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Show the range everywhere tuition is shown

**Files:**
- Modify: `src/components/match-card.tsx:150-166`, `src/components/compare/compare-cells.tsx:67-83`, `src/components/program/program-sections.tsx:229-254`, `src/components/cost-breakdown.tsx` (the amount block), `src/lib/journey/compare-view.ts:73-76`
- Test: `tests/components/match-card.test.tsx`, `tests/components/compare/compare-grid.test.tsx`, `tests/components/cost-breakdown.test.tsx`, `tests/lib/journey/compare-view.test.ts`, `tests/app/program-page.test.tsx`

**Interfaces:**
- Consumes: `formatTuition`, `TuitionBasisNote` (Task 4); `CostLine.incomeBased` (Task 3).
- Produces: unchanged markup for a flat fee (same elements, classes and test ids); a range reads through `formatTuition`; an income-based range adds the note under the amount; the compare-row signature is `${amountMinor}|${maxAmountMinor ?? amountMinor}|${currency}|${period}|${basis ?? "-"}`.

- [ ] **Step 1: Write the failing tests**

`tests/components/match-card.test.tsx`, in `describe("MatchCard: facts")` after the single-fee test:

```tsx
  const RANGE = {
    amountMinor: 120000,
    maxAmountMinor: 300000,
    currency: "XTS",
    period: "year" as const,
    basis: "income_based" as const,
  };

  it.each(LOCALES)("shows an official fee range with its income note and one badge (%s)", (locale) => {
    const model = journey.card(locale, E2E_SLUGS.ok);
    const ranged: MatchCardModel = { ...model, tuition: { ...model.tuition, value: RANGE } };
    const { container } = renderCard(ranged, locale);
    const detail = fact(container, catalogs[locale].domain.cost.category.tuition);
    expect(detail.querySelector("bdi")?.textContent).toBe(formatTuition(RANGE, locale));
    expect(detail.textContent).toContain(catalogs[locale].domain.cost.per.year);
    expect(detail.textContent).toContain(catalogs[locale].domain.cost.incomeBased);
    expect(detail.querySelectorAll('[data-slot="source-badge"]')).toHaveLength(1);
  });

  it.each(LOCALES)("shows no income note for a flat fee (%s)", (locale) => {
    const { container } = renderCard(journey.card(locale, E2E_SLUGS.ok), locale);
    const detail = fact(container, catalogs[locale].domain.cost.category.tuition);
    expect(detail.querySelector('[data-testid="tuition-basis"]')).toBeNull();
  });
```
(import `formatTuition` from `@/lib/format`.)

`tests/components/compare/compare-grid.test.tsx`, after the tuition-badge test (inside the same `describe` that defines `locale`):

```tsx
  it("shows an official fee range with its income note in the compare cell", () => {
    const range = { amountMinor: 120000, maxAmountMinor: 300000, currency: "XTS", period: "year" as const, basis: "income_based" as const };
    const view = views[locale];
    const ranged: CompareView = {
      ...view,
      programs: view.programs.map((p) =>
        p.slug === REFS.ok.slug ? { ...p, tuition: { ...p.tuition, value: range } } : p,
      ),
    };
    const { container } = renderGrid(locale, ranged);
    const scope = cell(container, "tuition", REFS.ok.slug);
    expect(scope.querySelector("bdi")?.textContent).toBe(formatTuition(range, locale));
    expect(scope.textContent).toContain(catalogs[locale].domain.cost.incomeBased);
    expect(badges(scope)).toBe(1);
  });
```
(import `formatTuition`.)

`tests/components/cost-breakdown.test.tsx`, after the official-tuition test (~line 285), using its `okLine`, `COMPLETE`, `rows`, `renderWithMessages` helpers:

```tsx
  it.each(LOCALES)("says an income-based tuition range depends on household income (%s)", (locale) => {
    const estimate: CostEstimate = {
      ...COMPLETE,
      lines: COMPLETE.lines.map((line) =>
        line.category === "tuition"
          ? okLine("tuition", {
              firstYear: { min: 120_000, max: 300_000, currency: "EUR" },
              per: "year",
              scope: "program",
              incomeBased: true,
              fact: ref({ info_kind: "official", path: "tuition", record: "programs/xx-test-prog" }),
            })
          : line,
      ),
    };
    const { container } = renderWithMessages(
      <CostBreakdown cost={estimate} budgetProvided={false} monthsLabel="10" textOf={undefined} />,
      locale,
    );
    const tuition = rows(container)[0];
    expect(tuition?.textContent).toContain(catalogs[locale].domain.cost.incomeBased);
    expect(rows(container)[1]?.textContent).not.toContain(catalogs[locale].domain.cost.incomeBased);
  });
```
(match the exact props of the neighbouring `CostBreakdown` renders in that file: copy the prop list they pass.)

`tests/lib/journey/compare-view.test.ts`: add a variant bundle and two cases. In `beforeAll` add

```ts
  rangeBundle = await loadMatchesBundle(
    buildVariant([
      {
        file: "programs/xx-test-prog-private.yaml",
        from: "{ amountMinor: 450000, currency: XTS, period: year }",
        to: "{ amountMinor: 120000, maxAmountMinor: 300000, currency: XTS, period: year, basis: income_based }",
      },
    ]),
    E2E_PROFILE,
    "fr",
  );
```
declare `let rangeBundle: SnapshotBundle;`, and add:

```ts
  it("treats a range as different from a flat fee with the same minimum", () => {
    // ok is flat 120000; private is now the range 120000-300000
    const result = view([E2E_SLUGS.ok, E2E_SLUGS.private], rangeBundle);
    expect(result.differs.tuition).toBe(true);
  });

  it("treats two identical ranges as the same", () => {
    expect(view([E2E_SLUGS.ok, E2E_SLUGS.private], twinRangeBundle).differs.tuition).toBe(false);
  });

  it("treats the same bounds with and without an income basis as different", () => {
    expect(view([E2E_SLUGS.ok, E2E_SLUGS.private], basisOnlyBundle).differs.tuition).toBe(true);
  });
```
with two more variants declared (`let twinRangeBundle: SnapshotBundle; let basisOnlyBundle: SnapshotBundle;`) and built in `beforeAll` next to `rangeBundle`:

```ts
  const RANGE_WITH_BASIS =
    "{ amountMinor: 120000, maxAmountMinor: 300000, currency: XTS, period: year, basis: income_based }";
  const RANGE_NO_BASIS = "{ amountMinor: 120000, maxAmountMinor: 300000, currency: XTS, period: year }";
  const OK_FEE = "{ amountMinor: 120000, currency: XTS, period: year }";
  const PRIVATE_FEE = "{ amountMinor: 450000, currency: XTS, period: year }";
  twinRangeBundle = await loadMatchesBundle(
    buildVariant([
      { file: "programs/xx-test-prog-ok.yaml", from: OK_FEE, to: RANGE_WITH_BASIS },
      { file: "programs/xx-test-prog-private.yaml", from: PRIVATE_FEE, to: RANGE_WITH_BASIS },
    ]),
    E2E_PROFILE,
    "fr",
  );
  basisOnlyBundle = await loadMatchesBundle(
    buildVariant([
      { file: "programs/xx-test-prog-ok.yaml", from: OK_FEE, to: RANGE_NO_BASIS },
      { file: "programs/xx-test-prog-private.yaml", from: PRIVATE_FEE, to: RANGE_WITH_BASIS },
    ]),
    E2E_PROFILE,
    "fr",
  );
```
(The `rangeBundle` variant above uses the same `PRIVATE_FEE`/`RANGE_WITH_BASIS` strings; define the four constants once at the top of `beforeAll` and reuse them there too.)
(prefer building `twinRangeBundle` in `beforeAll` next to `rangeBundle`, as the file does for its other variants, and keep the case synchronous.)

`tests/app/program-page.test.tsx`: it mocks `loadProgramPageData` and already has a hoisted `snapshot` object with a `recurring` flag that rewrites the loaded data. Read the mock (lines ~19-60) and add a sibling flag `tuitionRange: boolean` that, when true, replaces `data.program.tuition.value` with `{ amountMinor: 120000, maxAmountMinor: 300000, currency: "XTS", period: "year", basis: "income_based" }`. Then add, next to "shows the official fee, or says the tuition is to be checked":

```ts
  it("shows an official fee range with its income note, badged once in full", async () => {
    snapshot.tuitionRange = true;
    try {
      const ok = await renderPage(E2E_SLUGS.ok, locale);
      expect(textOf(ok.document.querySelector('[data-testid="tuition-amount"]'))).toContain(
        formatMoneyRange(120000, 300000, "XTS", locale),
      );
      expect(textOf(ok.document.getElementById("tuition"))).toContain(
        message(locale, "domain.cost.incomeBased"),
      );
      const badges = ok.document.querySelectorAll('#tuition [data-slot="source-badge"]');
      expect(badges).toHaveLength(1);
      expect(badges[0]?.getAttribute("data-variant")).toBe("full");
    } finally {
      snapshot.tuitionRange = false;
    }
  });
```
(import `formatMoneyRange`; reset the flag in the file's `afterEach` as it does for `recurring`.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/components/match-card.test.tsx tests/components/compare tests/components/cost-breakdown.test.tsx tests/lib/journey/compare-view.test.ts tests/app/program-page.test.tsx`
Expected: FAIL (the range cases show only the minimum; no note).

- [ ] **Step 3: Implement**

`match-card.tsx`: import `formatTuition` (replace `formatMoney` only if it becomes unused) and `TuitionBasisNote`; inside the fact, replace the amount and add the note after the `<p>`:

```tsx
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-base font-medium tabular-nums">
                  <bdi dir="ltr">{formatTuition(tuition, locale)}</bdi>
                </span>
                <small className="text-sm text-muted-foreground">
                  {tCost(`per.${tuition.period}`)}
                </small>
              </p>
              <TuitionBasisNote tuition={tuition} />
              <SourceBadge meta={model.tuition} variant="compact" />
```

`compare-cells.tsx` `TuitionCell`: same replacement (`formatTuition(tuition, locale)`, then `<TuitionBasisNote tuition={tuition} />` before the badge).

`program-sections.tsx` `TuitionSection`: replace `formatMoney(tuition.amountMinor, tuition.currency, locale)` with `formatTuition(tuition, locale)` and add `<TuitionBasisNote tuition={tuition} />` after the `<p data-testid="tuition-amount">` (keep the test id and classes). Keep the `formatMoney` import only if still used elsewhere in the file (it is not; remove it if unused: Biome will say).

`cost-breakdown.tsx`: after the `cost-amount` paragraph and the `isCountedPer` block, add

```tsx
            {line.incomeBased === true ? (
              <small className="text-sm text-muted-foreground">{tCost("incomeBased")}</small>
            ) : null}
```

`compare-view.ts` signature:

```ts
  tuition: (p) => {
    const { value } = p.tuition;
    return value === null
      ? null
      : `${value.amountMinor}|${value.maxAmountMinor ?? value.amountMinor}|${value.currency}|${value.period}|${value.basis ?? "-"}`;
  },
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run tests/components tests/lib/journey tests/app tests/i18n tests/lib/client-imports.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS; the existing flat-fee tests are untouched and still pass (the markup of a flat fee is identical).

- [ ] **Step 5: Commit**

```bash
git add src/components/match-card.tsx src/components/compare/compare-cells.tsx src/components/program/program-sections.tsx src/components/cost-breakdown.tsx src/lib/journey/compare-view.ts tests/components/match-card.test.tsx tests/components/compare/compare-grid.test.tsx tests/components/cost-breakdown.test.tsx tests/lib/journey/compare-view.test.ts tests/app/program-page.test.tsx
git commit -m "feat: show an official tuition range with its income note

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Import pipeline reads, verifies and carries the range

**Files:**
- Modify: `scripts/import/proposals.ts` (`ProposalSchema` tuition at ~106-112, `checkValue` tuition case at ~201-207), `scripts/import/evidence.ts` (`checkTuition` ~415-440), `scripts/import/checker.ts` (`claimText` tuition ~72-77), `scripts/import/reader.ts` (prompt example ~65 and the `tuition` FACT DETAILS bullet ~78)
- Test: `tests/scripts/import/evidence.test.ts`, `tests/scripts/import/proposals.test.ts`, `tests/scripts/import/checker.test.ts`, `tests/scripts/import/reader.test.ts`, `tests/scripts/import/audit.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // evidence.ts
  export const INCOME_WORDS: RegExp; // /\b(?:isee|reddito|income|revenu|einkommen|inkomen)\b/i
  export function checkTuition(amountMinor: number, quote: string, minStudyYear: number, currency?: string, maxAmountMinor?: number, basis?: "income_based"): FactCheck;
  // proposals.ts: tuition fact value = { amountMinor, maxAmountMinor?, currency, period, basis? }
  ```
  The record value written for a verified tuition is the proposal value as is (absent keys stay absent; `maxAmountMinor`/`basis` are never `null`).

- [ ] **Step 1: Write the failing tests**

`tests/scripts/import/evidence.test.ts`, inside `describe("checkTuition", ...)`:

```ts
  describe("a fee range", () => {
    const quote = "Tuition fees range from EUR 156 to EUR 2,600 a year, depending on the ISEE of the family.";
    it("accepts a range whose two amounts are both in the quote, in the stated currency", () => {
      expect(checkTuition(15600, quote, 2026, "EUR", 260000, "income_based").ok).toBe(true);
    });
    it("rejects a range whose maximum is not in the quote", () => {
      expect(checkTuition(15600, quote, 2026, "EUR", 300000, "income_based").ok).toBe(false);
    });
    it("rejects a range whose minimum is not in the quote", () => {
      expect(checkTuition(20000, quote, 2026, "EUR", 260000, "income_based").ok).toBe(false);
    });
    it("rejects a maximum below the minimum", () => {
      expect(checkTuition(260000, quote, 2026, "EUR", 15600).ok).toBe(false);
    });
    it("accepts a range with no basis when the quote only states the two fees", () => {
      expect(
        checkTuition(15600, "Fees: EUR 156 - EUR 2,600 per year.", 2026, "EUR", 260000).ok,
      ).toBe(true);
    });
    it("refuses income_based unless the quote mentions income", () => {
      const noIncome = "Tuition fees range from EUR 156 to EUR 2,600 a year.";
      expect(checkTuition(15600, noIncome, 2026, "EUR", 260000, "income_based").ok).toBe(false);
      expect(
        checkTuition(15600, "Le tasse vanno da 156 a 2.600 euro in base al reddito (ISEE).", 2026, "EUR", 260000, "income_based").ok,
      ).toBe(true);
    });
    it("still applies the stale-study-year guard to a range", () => {
      const old = "2019/20: tuition fees range from EUR 156 to EUR 2,600 a year (ISEE).";
      expect(checkTuition(15600, old, 2026, "EUR", 260000, "income_based").ok).toBe(false);
    });
    it("leaves the single-fee behaviour unchanged", () => {
      expect(checkTuition(150000, "Tuition: €1,500 per semester", 2026, "EUR").ok).toBe(true);
    });
  });
```

`tests/scripts/import/proposals.test.ts`: read how the existing tuition case at lines ~46 and ~86-113 builds a proposal and calls `verifyProposal`; add two cases in the same style: (a) a proposal whose tuition value is `{ amountMinor: 15600, maxAmountMinor: 260000, currency: "EUR", period: "year", basis: "income_based" }` with a quote "Tuition fees range from EUR 156 to EUR 2,600 a year, depending on the ISEE of the family." is accepted and `v.facts.tuition?.value` equals that object exactly (no `null` keys); (b) the same proposal with a quote lacking an income word is rejected (`v.facts.tuition` undefined and `v.rejected` names tuition). Also assert the schema: `ProposalSchema.safeParse` rejects `{ amountMinor: 1, maxAmountMinor: null, ... }` (null max) and rejects `basis` without `maxAmountMinor`.

`tests/scripts/import/checker.test.ts`, extend the claim-text test:

```ts
    expect(
      claimText("tuition", { amountMinor: 15600, maxAmountMinor: 260000, currency: "EUR", period: "year", basis: "income_based" }),
    ).toBe(
      "The tuition fee for a student from outside the EU/EEA ranges from 156 EUR to 2600 EUR per year, depending on household income.",
    );
    expect(
      claimText("tuition", { amountMinor: 15600, maxAmountMinor: 260000, currency: "EUR", period: "year" }),
    ).toBe("The tuition fee for a student from outside the EU/EEA ranges from 156 EUR to 2600 EUR per year.");
```

`tests/scripts/import/reader.test.ts`: add one assertion that the system prompt contains the range example and rule (read how the file inspects the prompt, for example a `buildPrompt`/`systemPrompt` helper): the prompt includes `"maxAmountMinor"` and the sentence that a range is allowed only when the page states both a lowest and a highest fee.

`tests/scripts/import/audit.test.ts`: add a case that a staged record with a ranged tuition prints its value in the review sheet (the sheet prints each fact value generically): the output contains `maxAmountMinor` and `income_based`. Follow the existing audit test's fixture style.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/scripts/import/evidence.test.ts tests/scripts/import/proposals.test.ts tests/scripts/import/checker.test.ts tests/scripts/import/reader.test.ts tests/scripts/import/audit.test.ts`
Expected: FAIL (a range proposal is rejected by the schema; `checkTuition` ignores the max).

- [ ] **Step 3: Implement**

`scripts/import/evidence.ts`: add above `checkTuition`

```ts
// "income_based" needs the quote to say the fee depends on income (the Italian ISEE indicator, or
// the plain word in the languages the sources use); without it a range is just a range.
export const INCOME_WORDS = /\b(?:isee|reddito|income|revenu|revenus|einkommen|inkomen)\b/i;
```
and replace `checkTuition` with:

```ts
export function checkTuition(
  amountMinor: number,
  quote: string,
  minStudyYear: number,
  currency?: string,
  maxAmountMinor?: number,
  basis?: "income_based",
): FactCheck {
  if (maxAmountMinor !== undefined) {
    if (maxAmountMinor < amountMinor) return fail("the highest fee is below the lowest");
    if (basis === "income_based" && !INCOME_WORDS.test(normalizeForMatch(quote)))
      return fail("income_based needs a quote that mentions income (ISEE, reddito, income...)");
    for (const edge of [amountMinor, maxAmountMinor]) {
      const checked = checkTuition(edge, quote, minStudyYear, currency);
      if (!checked.ok) return checked;
    }
    return ok;
  }
  if (amountMinor === 0)
    return NO_FEE.test(quote)
      ? ok
      : fail("a zero fee needs a quote saying there are no tuition fees");
  // Without a currency the amount is read as euros (hundredths), the only currency tuition came in
  // before the currency was passed.
  const amountMajor = fromMinor(amountMinor, currency ?? "EUR");
  if (!amountInQuote(amountMajor, quote))
    return fail(`the amount ${amountMajor} does not appear in the quote`);
  if (
    currency !== undefined &&
    CURRENCY_TOKENS[currency] !== undefined &&
    !amountHasCurrency(amountMajor, quote, currency)
  )
    return fail(`the quote does not write the amount in the currency ${currency}`);
  const stale = staleStudyYear(amountMajor, quote, minStudyYear);
  return stale === null ? ok : fail(stale);
}
```
Two details to check while implementing and keep the tests green: (1) a MINIMUM of `0` inside a range ("0 to 2000") recurses into the zero-fee branch which demands a "no tuition fee" quote; for a range edge of 0 accept it when the quote contains the word for a free or zero-fee tier (`/\b(?:0|zero|free|no fee|esente|gratuit)\b/i`) else fail, with a test for both; (2) `normalizeForMatch` is the helper already used in this file (`dateSpans` uses it); if it is not exported in scope, use the same normalisation the file uses for matching quotes.

`scripts/import/proposals.ts`: the tuition schema becomes

```ts
    tuition: fact(
      z
        .object({
          amountMinor: z.number().int().nonnegative(),
          maxAmountMinor: z.number().int().nonnegative().optional(),
          currency: z.string().regex(/^[A-Z]{3}$/),
          period: z.enum(["year", "semester"]),
          basis: z.enum(["income_based"]).optional(),
        })
        .refine((t) => t.maxAmountMinor === undefined || t.maxAmountMinor >= t.amountMinor, {
          message: "maxAmountMinor must be >= amountMinor",
        })
        .refine((t) => t.basis === undefined || t.maxAmountMinor !== undefined, {
          message: "basis needs maxAmountMinor",
        }),
    ).optional(),
```
and the `checkValue` tuition case:

```ts
    case "tuition": {
      const t = value as {
        amountMinor: number;
        maxAmountMinor?: number;
        currency?: string;
        basis?: "income_based";
      };
      return checkTuition(t.amountMinor, quote, minStudyYear, t.currency, t.maxAmountMinor, t.basis);
    }
```
If the existing `z.object` is not strict and `maxAmountMinor: null` from a model would be silently dropped by an `optional()` schema: it is not, `optional()` rejects `null`; the test pins that.

`scripts/import/checker.ts` `claimText` tuition case:

```ts
    case "tuition": {
      const t = value as {
        amountMinor: number;
        maxAmountMinor?: number;
        currency: string;
        period: string;
        basis?: string;
      };
      if (t.amountMinor === 0 && t.maxAmountMinor === undefined)
        return "There is no tuition fee for a student from outside the EU/EEA.";
      const audience = "The tuition fee for a student from outside the EU/EEA";
      if (t.maxAmountMinor !== undefined)
        return `${audience} ranges from ${fromMinor(t.amountMinor, t.currency)} ${t.currency} to ${fromMinor(t.maxAmountMinor, t.currency)} ${t.currency} per ${t.period}${t.basis === "income_based" ? ", depending on household income" : ""}.`;
      return `${audience} is ${fromMinor(t.amountMinor, t.currency)} ${t.currency} per ${t.period}.`;
    }
```

`scripts/import/reader.ts`: change the output example line to show a flat fee unchanged and add the range form in the bullet; in the `tuition:` FACT DETAILS bullet append (keep every existing sentence):

```
 A range: if the page states BOTH a lowest and a highest fee for this student (for example fees that depend on the household's income, the ISEE in Italy), write amountMinor as the lowest and "maxAmountMinor" as the highest, same currency and period, and add "basis": "income_based" only if the quote itself says the fee depends on income. Omit "maxAmountMinor" and "basis" entirely for a single fee: never write null for them. A range needs ONE quote that shows both numbers; never combine two quotes into a range, and never invent a bound the page does not give.
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run tests/scripts && pnpm typecheck && pnpm lint`
Expected: PASS, including every existing tuition test (single-fee behaviour unchanged).

- [ ] **Step 5: Commit**

```bash
git add scripts/import/proposals.ts scripts/import/evidence.ts scripts/import/checker.ts scripts/import/reader.ts tests/scripts/import/evidence.test.ts tests/scripts/import/proposals.test.ts tests/scripts/import/checker.test.ts tests/scripts/import/reader.test.ts tests/scripts/import/audit.test.ts
git commit -m "feat: import pipeline reads and verifies an official fee range

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: ADR 0010 and rule documents

**Files:**
- Create: `.claude/docs/decisions/0010-official-fee-range.md`
- Modify: `.claude/rules/reference-data.md` (the Program `tuition` bullet), `.claude/rules/matching-domain.md` (the Costs bullet), `data/README.md` (the `## Tuition` section and the `data:check` sentence), `.claude/CLAUDE.md` (the money bullet and the "Every fact in `data/`" area if it mentions a single fee)

No tests (documentation); the gates run in Task 8.

- [ ] **Step 1: Write the ADR**

Create `.claude/docs/decisions/0010-official-fee-range.md` from `0001-template.md`'s headings:

```markdown
# ADR 0010: Programme tuition may be an official range with an income basis

**Status:** Accepted (supersedes item 9 of ADR 0005 and its "accept estimated tuition as a range" alternative, only as stated here)
**Date:** 2026-10-08

## Context

ADR 0005 item 9 stored tuition as one official fee and rejected "accept estimated tuition as a range" because a range invites invented numbers. Italian universities usually publish the fee for a student as an income-based (ISEE) scale or as a lowest and highest amount, so a single fee is unknown for every Italian programme (45 of 45), and the cost estimate has no tuition line there.

## Decision

`tuition` keeps one official fee and gains an OPTIONAL official range: `maxAmountMinor` (the highest fee; `amountMinor` is the lowest) and an optional `basis: "income_based"`. A range is official: both numbers come from one verbatim quote that code re-fetches and checks (both amounts and the currency present; `income_based` only when the quote mentions income). It is never an estimate, never built from two quotes, never invented. A non-null tuition still requires `info_kind: official`. A flat fee is unchanged. The audience convention is unchanged: the fee for a student from outside the EU/EEA residing abroad; when a university states a different rule for that student, that rule wins or the value stays null.

The cost estimate takes the range as the tuition line's `{min, max}`; the display shows "X to Y per year" with the household-income note and the source badge. The snapshot format version goes from 1 to 2.

## Consequences

- Positive: Italy's tuition and first-year cost can be shown honestly; a flat fee reads exactly as before.
- Negative: wider cost ranges where fees depend on income; "(ISEE)" wording is Italian and is reworded when another country needs the basis.
- Not decided here: an ISEE band table (rejected: the product cannot use it without the student's ISEE).

## Alternatives considered

- **Band table:** more precision, but unusable without the student's ISEE and harder to audit.
- **Note only:** keeps the cost line empty for Italy.
- **Keep one fee, leave Italy null:** honest but the cost question stays unanswered.
```

- [ ] **Step 2: Update the rule documents**

`.claude/rules/reference-data.md`: in the bullet "Program `tuition` is one official published fee...", replace the first sentence with: "Program `tuition` is one official published fee or, when the university states a lowest and a highest fee, an official range (`maxAmountMinor`, optional `basis: income_based`; ADR 0010)". Keep the rest (audience convention, null when unpublished, `info_kind: official`). `.claude/rules/matching-domain.md`, Costs bullet: after "each carrying its `FactRef`", add: "the tuition line is `{min, max}` from the fee's bounds (a flat fee has equal ends) and carries `incomeBased` when the range depends on household income". `data/README.md`, `## Tuition`: replace "A program has a single `tuition` figure" with "A program has a `tuition` figure (one fee or an official range, ADR 0010)"; add the sentence "A range needs one quote that states both the lowest and the highest fee; `basis: income_based` only when the quote says the fee depends on income (for example the ISEE). Never an estimate." and extend the `data:check` sentence: "an invalid tuition range (maximum below the minimum, a basis without a maximum)". `.claude/CLAUDE.md`, the "Money = integer minor units" bullet: append "Programme tuition may be an official `{min, max}` range with a basis (ADR 0010); the ADR list gets `0010 official fee range` (add it to the Decisions line)".

- [ ] **Step 3: Check and commit**

Run: `pnpm lint` (Biome does not check Markdown; confirm no accidental code changes with `git diff --stat`), then:

```bash
git add .claude/docs/decisions/0010-official-fee-range.md .claude/rules/reference-data.md .claude/rules/matching-domain.md data/README.md .claude/CLAUDE.md
git commit -m "docs: ADR 0010 official fee range and rule updates

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Gates, perf, browser, review, PR (controller)

**Files:** none new (verification and the PR).

- [ ] **Step 1: Full gates (show the output)**

In the worktree: `pnpm typecheck`, `pnpm lint` (2 pre-existing infos fine), `pnpm test`, `pnpm data:check` (must print `0 errors` and the same record count as `main`: this work changes no `data/` file; `git diff --stat origin/main -- data` must be empty).

- [ ] **Step 2: Build and perf**

`pnpm build` (real data) then `pnpm perf:js`; compare first-load JS per route with the rows in `tests/e2e/support/js-budget.ts` (matches, compare, plan and programme pages import the new client-reachable code: `formatTuition`, `tuitionBounds`, `TuitionBasisNote`). Run `pnpm data:build` after the build. If any ratchet row would be exceeded (matches until-idle and profile are at 216.0 of 216 on `main`), STOP and report the per-route numbers and the cause to the owner instead of raising a row.

- [ ] **Step 3: End-to-end**

`pnpm test:e2e` in this worktree on its own (nothing else running on the machine; an earlier concurrent run flaked one unrelated spec): expect all green and every perf row inside its ratchet.

- [ ] **Step 4: Tuition display in a real browser (fr and ar)**

No real record has a range yet (piece 3 adds them), and no end-to-end fixture programme is changed, so a ranged fee cannot be shown in the browser without editing data. Check what can be checked: run `pnpm dev:fixture` in the worktree (synthetic data, its own port; never touch port 3000) and, in the browser pane at phone (375 px) and desktop width in `/fr` and `/ar`, confirm the FLAT fee on a programme page (`/fr/programs/xx-test-prog-ok`), a match card and the compare page reads exactly as before, with no horizontal scroll. The ranged markup (range string in `bdi dir="ltr"`, income note, one badge) is covered by the component and page tests in fr and ar. Stop the fixture dev server afterwards and run `pnpm data:build`. State in the PR that the ranged display was verified by tests only, not in a browser.

- [ ] **Step 5: Reviews and PR**

Opus `reviewer` after each of Tasks 1 to 7 as they finish and one whole-branch Opus review at the end against the spec and this plan; fix Critical and Important findings in one wave. Then `git push -u origin feat/italy-completeness` and `gh pr create --draft --base main` with a body ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`; call `mcp__ccd_pr__get_status` (bind with `mcp__ccd_pr__bind_pr` if unbound); read CI once, do not poll. Report: what was built, the JS numbers, test totals, what was not verified in a browser, and the next step (piece 2, Italy discovery).

---

## Self-review (against the spec, section "Piece 1")

- Schema (`maxAmountMinor`, `basis`, refinements, flat unchanged): Task 1. Resolved type: inferred from the schema (`Tuition`); client validators: the app has no hand-written tuition validator (`grep tuition src/lib/snapshot` is empty), the snapshot types come from `resolved.ts`, covered by the typecheck and the build.
- Snapshot version 1 to 2 with the guard tests: Task 2.
- Domain `tuitionLine` with semester doubling, totals, `incomeBased`: Task 3 (`budgetFit` pinned).
- Display: programme page, match card, compare cell, cost breakdown, page facts (no tuition amount shown there, unchanged), messages en/fr/ar: Tasks 4 and 5; the compare-row signature: Task 5.
- Pipeline: reader prompt, `ProposalSchema`, `checkTuition` (verbatim quote, both amounts, currency, income word, stale-year guard), checker claim text, audit sheet carries the value: Task 6. `promote`/`merge` carry the verified value as is (the record value is the proposal value); the audit test pins that the sheet shows it. `data:check` keeps "non-null must be official" and adds the two schema rules (Task 1).
- Docs: ADR 0010 superseding item 9 of ADR 0005 only, rules, README, CLAUDE.md: Task 7.
- Tests, perf ratchet, e2e unchanged, JS-budget rule: Task 8.
- Placeholder scan: two places defer to reading the neighbouring test for exact helper shapes (`validate.test.ts` option shape, `cost-breakdown` props, `program-page.test.tsx` mock flag, audit and reader prompt helpers); each states the assertion to write. No TBD.
- Type consistency: `Tuition` (Task 1) is used unchanged by `tuitionBounds`, `formatTuition`, `TuitionBasisNote`, `tuitionLine`, the compare signature and the proposal schema; `CostLine.incomeBased` (Task 3) is read by `CostBreakdown` (Task 5); `checkTuition`'s new optional parameters (Task 6) match the `checkValue` call.
