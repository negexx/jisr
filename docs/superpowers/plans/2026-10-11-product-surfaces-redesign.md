# Product-surfaces redesign (Profile / Matches / Scholarships / Plan) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the four product surfaces (Profile, Matches, Scholarships, Plan) to the shipped "Gradient Bridge" world — a fading-wash page band, soft cards, thin display type, and one status summary per page — without changing information, flows, or trust semantics; Program and Compare inherit the shared uplift.

**Architecture:** A class-string migration plus two small server components. `PageBand` (server) renders the fading-wash header; `StatusSummary` (presentational) renders result counts **through `MatchStatusBadge`**. The shared product components (MatchCard, CostBreakdown, ReasonList, DeadlineStatus, TuitionBasisNote, DisclosureChevron, EmptyState, skeletons) are restyled once and every surface inherits. No logic, no data, no new client dependency.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (`@theme` tokens), next-intl (fr/en/ar RTL), Vitest + Testing Library (jsdom per file), Playwright (a11y + perf ratchet), Biome.

**Spec:** `docs/superpowers/specs/2026-10-11-product-surfaces-redesign-design.md`

## Global Constraints

- **Trust semantics frozen:** every fact keeps its `SourceBadge` (kind + official link + verified date); official/estimate/guidance stay visually distinct (teal filled = official, dashed cream = estimate, grey = guidance); **match status maps to icon+colour+words in `MatchStatusBadge` only** — the status summary renders `MatchStatusBadge`, never a second mapping; missing/stale/unofficial is never rounded to a yes/no.
- **Test hooks preserved:** keep every `data-slot`, `data-group`, `data-slug`, `data-testid`, `data-state`, `data-freshness` attribute; component and e2e specs select on these, not on classes.
- **Information architecture and flows unchanged.**
- **RTL:** logical utilities only (`ms- me- ps- pe- text-start start- end- border-s`), mirror directional icons (`rtl:rotate-180`), isolate Latin in `<bdi>`; enforced by `tests/design/logical-direction.test.ts`.
- **Client boundary:** no `zod` and no runtime `@/data-schema/*` in client-reachable code (`tests/lib/client-imports.test.ts`).
- **i18n:** every new string in fr/en/ar (real `ar`, no `TODO`); no em/en dashes; French no-break space before `: ? ! ;`.
- **JS-neutral:** new shared pieces are server components; the Matches summary leaf reuses the existing view hook (it replaces the current counts nav, so net JS must not rise). No new dependency. Motion CSS-only, 150–220 ms, cut under `prefers-reduced-motion`.
- **Commands:** `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm data:check`, `pnpm build`, `pnpm test:e2e`, `pnpm perf:js`.

### Shared class vocabulary (pin these; tasks reference it)

- **Card:** `rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md` (radius 16.8px = `rounded-xl`).
- **Display title:** `text-display font-light text-balance` (56px, weight 300, tracking `-0.03em`).
- **Section heading:** `text-2xl font-light tracking-tight` (28px Headline).
- **Link / action:** `text-primary font-medium`.
- **Muted text:** `text-muted-foreground`.
- **Soft surface:** `bg-secondary` (canvas-soft `#f6f9fc`).
- **Selected row:** `border-primary bg-accent` (indigo-wash `#f4f3ff`).
- **Pill button:** the existing `Button`/`buttonVariants` (already pill).
- **Hover lift:** `transition ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-px`.
- **No** `ml-/mr-/pl-/pr-/left-/right-/text-left`, no `#000`/`#fff`, no new accent hue, no second typeface, no size outside 14/16/19/23/28/56.

## Review Focus

1. **An estimate or guidance fact rendered with the official treatment** (teal fill / shield) inside a restyled card — the Never-Official rule; a restyle must not blur them.
2. **A status shown by colour alone, or the counts summary re-implementing the match mapping outside `MatchStatusBadge`.**
3. **A clock- or profile-dependent value in the static page HTML** (status, result count, freshness) — must be a client leaf with a neutral server placeholder.
4. **The JS budget silently exceeded** by the restyle — measure `pnpm perf:js` / `pnpm test:e2e`.
5. **Physical-direction classes or Arabic-Indic digits** slipping into the new markup in `ar`.

---

### Task 1: Design-system pieces — `PageBand` + `StatusSummary` (+ DESIGN.md)

**Files:**
- Create: `src/components/page-band.tsx`, `src/components/status-summary.tsx`
- Test: `tests/components/page-band.test.tsx`, `tests/components/status-summary.test.tsx`
- Modify: `DESIGN.md`

**Interfaces:**
- Produces: `PageBand({ eyebrow?, title, lead?, children? }: { eyebrow?: string; title: string; lead?: string; children?: ReactNode })` — a server component; full-bleed fading-wash band (reuse the `hero.tsx` breakout: `w-screen max-w-none mx-[calc(50%-50vw)]`, with the inner `mx-auto w-full max-w-5xl px-4 md:px-6`), a `radial-gradient` wash from `oklch(0.9684 0.016 289.93)` through `oklch(0.9807 0.0051 247.88)` to `oklch(0.995 0.002 250)`, a `border-b border-border`, `text-display font-light` title.
- Produces: `StatusSummary({ counts }: { counts: { ok: number; check: number; failed: number } })` — a presentational server component; renders one chip per non-zero count, each chip = `<MatchStatusBadge group={g} size="sm" />` + a `<bdi className="tabular-nums">{count}</bdi>`.

- [ ] **Step 1: Write the failing tests.** `tests/components/page-band.test.tsx`: `PageBand` renders the eyebrow, the `h1` title and the lead; `renderToString` of the band under `messages={null}` contains **no** `data-freshness` and no clock/profile claim. `tests/components/status-summary.test.tsx`: with `{ok:2, check:3, failed:0}` it renders two chips; each chip contains a `MatchStatusBadge` (`[data-group="ok"]`/`[data-group="check"]`); the count text is present (never colour alone); a zero count renders no chip.
- [ ] **Step 2: Run** `pnpm test tests/components/page-band.test.tsx tests/components/status-summary.test.tsx` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** `page-band.tsx` (per the interface) and `status-summary.tsx` (via `MatchStatusBadge`).
- [ ] **Step 4: Run** the two tests — Expected: PASS.
- [ ] **Step 5: Update `DESIGN.md`** — add `page-band`, `status-summary` and the refreshed `match-card`/`empty-state`/`skeleton` vocabulary; restate the trust rules.
- [ ] **Step 6: Commit** `feat(design): add the page band and status summary`.

### Task 2: Shared card components — soft-card restyle

**Files:**
- Modify: `src/components/match-card.tsx`, `cost-breakdown.tsx`, `reason-list.tsx`, `deadline-status.tsx`, `tuition-basis-note.tsx`, `disclosure-chevron.tsx`
- Test: `tests/components/match-card.test.tsx`, `cost-breakdown.test.tsx`, `reason-list.test.tsx`, `deadline-status.test.tsx`, `tuition-basis-note.test.tsx`

**Interfaces:**
- Keeps: all existing exports/signatures unchanged; only class strings change.

- [ ] **Step 1: Restyle `match-card.tsx`** to the soft-card vocabulary (card + indigo title + hairline-divided fact rows + pill actions). Keep every `data-slot`/`data-group`/`data-testid`.
- [ ] **Step 2: Restyle `cost-breakdown.tsx`, `reason-list.tsx`, `deadline-status.tsx`, `tuition-basis-note.tsx`, `disclosure-chevron.tsx`** to the new tokens (indigo links, canvas-soft fills, soft depth). `disclosure-chevron.tsx` has no test — add `tests/components/disclosure-chevron.test.tsx` asserting the summary class contains no physical utility and the chevron mirrors under `rtl:`.
- [ ] **Step 3: Run** `pnpm test tests/components` and `pnpm test tests/design` — Expected: PASS.
- [ ] **Step 4: Commit** `refactor(ui): restyle the shared product cards to the new world`.

### Task 3: Shared states — EmptyState + skeletons + notices

**Files:**
- Modify: `src/components/empty-state.tsx`, `src/components/matches/matches-skeleton.tsx`, `src/components/matches/matches-states.tsx`, `src/components/plan/plan-states.tsx`, `src/components/profile/profile-form.tsx`
- Test: `tests/components/empty-state.test.tsx`, `tests/components/matches/states.test.tsx`, `tests/components/plan/plan-client.test.tsx`

**Interfaces:**
- Keeps: `EmptyState` and all state component exports unchanged.

- [ ] **Step 1: Restyle `empty-state.tsx`** (canvas-soft panel, thin title, one primary action).
- [ ] **Step 2: Replace the four ad-hoc `rounded-lg bg-muted animate-pulse` skeletons and `bg-muted` notices** with the shared vocabulary (`rounded-xl border border-border bg-card` / `bg-secondary`).
- [ ] **Step 3: Run** `pnpm test tests/components` — Expected: PASS.
- [ ] **Step 4: Commit** `refactor(ui): restyle the shared empty states and skeletons`.

### Task 4: Profile surface — band + quiet form

**Files:**
- Modify: `src/components/profile/chrome.tsx` (drop `PageTitle`; keep `StepHeader`/`ErrorSummary`/`Notice`/`PAGE_GRID`), `src/components/profile/profile-form.tsx` (render `PageBand`), `profile-wizard.tsx`, `field.tsx`, `step-*.tsx`
- Test: `tests/components/profile/flow.test.tsx`, `states.test.tsx`, `submit.test.tsx`, `review-fixes.test.tsx`

**Interfaces:**
- Consumes: `PageBand` (Task 1).

- [ ] **Step 1: Render `PageBand`** with `title={t("title")}` and `lead={t("ctaNote")}` (the "stays on this device" line) in `profile-form.tsx`; remove the old `PageTitle` heading.
- [ ] **Step 2: Restyle `StepHeader`** (label + four indigo progress segments), `field.tsx` (48px, `rounded-lg border-input bg-background`, selected row `border-primary bg-accent`), and the step chrome to the vocabulary.
- [ ] **Step 3: Run** `pnpm test tests/components/profile tests/design` — Expected: PASS.
- [ ] **Step 4: Commit** `refactor(profile): open with the page band and quiet form`.

### Task 5: Matches surface — band + status summary + soft cards

**Files:**
- Modify: `src/app/[locale]/matches/page.tsx` (render `PageBand`), `src/components/matches/matches-client.tsx` (extract the counts nav into the summary leaf; render the list), `group-section.tsx`, `profile-summary.tsx`, `hidden-programs.tsx`, `matches-states.tsx`, `paged-list.tsx`
- Create: `src/components/matches/matches-summary.tsx` (client leaf)
- Test: `tests/components/matches/results.test.tsx`, `states.test.tsx`, `compare-link.test.tsx`

**Interfaces:**
- Consumes: `PageBand`, `StatusSummary` (Task 1); `MatchCard` (Task 2).
- Produces: `MatchesSummary()` — a client leaf that reads the existing matches view hook and renders `<StatusSummary counts={...} />`; renders a neutral placeholder server-side (no count, no status).

- [ ] **Step 1: Write the failing test.** In `tests/components/matches/results.test.tsx`, assert the page renders a `PageBand` `h1`, and that the static (unhydrated) output contains no result count and no `data-group` claim.
- [ ] **Step 2: Run** it — Expected: FAIL.
- [ ] **Step 3: Implement** `matches-summary.tsx`; wire the band in `page.tsx` (`<PageBand title lead><MatchesSummary /></PageBand>`); restyle `group-section`, `profile-summary`, `hidden-programs`, `matches-states`, `paged-list`.
- [ ] **Step 4: Run** `pnpm test tests/components/matches tests/design` — Expected: PASS.
- [ ] **Step 5: Commit** `refactor(matches): band, status summary and soft cards`.

### Task 6: Scholarships surface — band + soft cards

**Files:**
- Modify: `src/app/[locale]/scholarships/page.tsx` (render `PageBand` with a static count), `src/components/scholarships/scholarships-page-view.tsx`, `scholarship-card.tsx`, `scholarship-programmes.tsx`
- Test: `tests/components/scholarships/scholarships-page-view.test.tsx`, `nationality-check.test.tsx`

**Interfaces:**
- Consumes: `PageBand` (Task 1).

- [ ] **Step 1: Render `PageBand`** (eyebrow + `title` + a static lead/count from the snapshot); remove the old `text-2xl font-bold` heading.
- [ ] **Step 2: Restyle** `scholarships-page-view` (country section headings in `text-2xl font-light`), `scholarship-card` (soft card), `scholarship-programmes`.
- [ ] **Step 3: Run** `pnpm test tests/components/scholarships tests/design` — Expected: PASS.
- [ ] **Step 4: Commit** `refactor(scholarships): band and soft scholarship cards`.

### Task 7: Plan surface — band + switcher + step rows

**Files:**
- Modify: `src/app/[locale]/plan/page.tsx` (render `PageBand`), `src/components/plan/plan-client.tsx`, `program-plan.tsx`, `program-switcher.tsx`, `step-row.tsx`, `plan-states.tsx`, `skipped-steps.tsx`, `missing-program.tsx`
- Test: `tests/components/plan/plan-client.test.tsx`, `step-row.test.tsx`, `program-switcher.test.tsx`

**Interfaces:**
- Consumes: `PageBand` (Task 1); `MatchStatusBadge`, `SourceBadge` (unchanged).

- [ ] **Step 1: Render `PageBand`** (eyebrow + `title` + a static lead); remove the old heading.
- [ ] **Step 2: Restyle** the program switcher (selected row `border-primary bg-accent`), the step rows (soft card, indigo checkbox, canvas-soft "next step" box), `plan-states`, `skipped-steps`, `missing-program`.
- [ ] **Step 3: Run** `pnpm test tests/components/plan tests/design` — Expected: PASS.
- [ ] **Step 4: Commit** `refactor(plan): band, switcher and checklist rows`.

### Task 8: Compose + verify (gate, budget, browser)

**Files:**
- Modify: none expected (fix any task's file if the gate finds one).

- [ ] **Step 1: Full static gate.** Run `pnpm typecheck && pnpm test && pnpm lint && pnpm data:check` — Expected: green.
- [ ] **Step 2: JS budget.** Run `pnpm build && pnpm perf:js` and `pnpm test:e2e` — Expected: every ratchet row within budget. If a row is exceeded because the Matches summary added client JS, make the summary reuse the existing view hook (it replaces the counts nav) or report BLOCKED with the numbers; **do not raise the ratchet** (owner decision, ADR 0008).
- [ ] **Step 3: Browser verify** the four pages in `fr` and `ar` at phone and desktop (RTL mirrors; band legible; AA contrast; status never colour-alone). Save screenshots to the workspace.
- [ ] **Step 4: Commit** `feat(ui): compose the redesigned product surfaces`.

---

## Self-review notes

- **Spec coverage:** band + summary → T1; cards → T2; states → T3; Profile → T4; Matches → T5; Scholarships → T6; Plan → T7; gate/budget/browser → T8. Program/Compare inherit via T2/T3. Every success criterion in the spec maps to a task.
- **Preserved hooks:** every task says keep `data-*`; T2/T3 run the shared component tests that select on them.
- **Out of scope (per spec):** IA changes, new data/copy, Home/shell/primitives/Program/Compare themselves, dark mode, a second typeface, a motion library, imagery.
