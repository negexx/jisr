# M4b: Compare saved programs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every UI task (T3, T4) MUST invoke `impeccable:impeccable` before writing markup, and MUST fetch Next 16 / next-intl docs with `ctx7` before using an API the repo does not already use.

**Goal:** A student compares 2 to 4 of their saved programs side by side (stacked by topic on a phone): their own result, tuition, estimated first-year cost, teaching language, deadline, scholarships and how to apply, each with its source, plus a "show only what differs" switch.

**Architecture:** `/[locale]/compare` is a static shell with one client island, shaped like My plan. It reads the saved list (`useSaved`), loads the shards of every saved program (`shardsForPlan`, so it shares the snapshot cache with the plan page) and dynamically imports a pure view model (`buildCompareView`) that reuses `cardFor`'s inputs plus scholarships, documents and the channel. The selection (2 to 4 of the saved programs) is React state only. Nothing new is stored.

**Tech Stack:** Next.js 16 App Router, React 19, next-intl, Tailwind v4 logical utilities, Vitest (jsdom per file), Playwright + axe, Biome. No new dependencies.

## Decisions from the owner (brainstorm, 2026-10-02)

1. **Selection:** pick 2 to 4 from the saved list. The page opens with the first up-to-4 saved programs selected; a checkbox list of all saved programs swaps them (min 2, max 4, the other boxes disabled at the limit with an explanation). Selection is React state only: not URL, not storage. A saved slug missing from the data is shown greyed out and cannot be selected. Phone: the picker is a collapsed `<details>` "Comparing 3 of 5 · Change".
2. **Entry points:** no new nav item (the header fits only three links at 343px in French). A "Compare saved programs" button on the My plan page header, and a link on the matches page when 2 or more programs are saved. With fewer than 2 saved, the plan page shows the hint "Save at least 2 programs to compare them".
3. **Layout:** stacked by topic on phone (one section per topic, one labelled block per program); from `md` the same sections lay out as a grid with a sticky row of program names and one column per program. One DOM structure.
4. **Differences:** a "Show only what differs" switch hides rows where every program has the same value; differing rows carry a plain "Differs" marker (icon + text, never colour alone). No "best" highlighting, no cheapest badge, no ranking (costs are ranges, deadlines can be stale; ranking reads as advice). A row where any program's value is unknown never counts as "the same" and is never hidden.
5. **Rows (spec order):** Your result (match badge + reasons), Tuition, Estimated first-year cost (range per currency + collapsed seven cost lines), Teaching language, Application deadline, Scholarships open to the student's nationality, How to apply (channel, account, official link, documents with translation lines).
6. Out of scope: analytics events, a persisted selection, shareable links, the scholarships finder.

## Global Constraints

- No Zod, and no runtime import from `@/data-schema` other than `@/data-schema/dates` and `@/data-schema/staleness`, in client-reachable code (`src/lib/journey`, `src/components`); `tests/lib/client-imports.test.ts` enforces it.
- The guest stores nothing server-side; no cookies; the only storage keys stay `jisr.profile`, `jisr.profile-draft`, `jisr.saved`, `jisr.plan`. Compare adds no key and no request kind: its shard requests are the plan page's. No slug in any request path, query or header.
- All user-facing strings through next-intl in `fr`, `en`, `ar`; Tailwind logical utilities only (`ms-`, `pe-`, `text-start`, `rtl:rotate-180` on directional icons); displayed ICU arguments are preformatted strings (`displayNumber`, `formatDate`, `formatMoneyRange`), Latin digits in `ar`; dates DD/MM/YYYY; fr has a no-break space before `: ? ! ;`; `ar` uses العلامة for a grade and الإجازة for the Bachelor's; `ar` copy is machine-drafted (the owner waived the native review).
- Stale data never yields a green state: the match group appears only through `MatchStatusBadge`; every sourced cell shows `SourceBadge` (official / estimate / guidance + verified date); an estimate or guidance wording never says "official"; costs are ranges, never one promised number.
- The static HTML of `/compare` makes no profile- or clock-dependent claim (neutral skeleton only).
- Tap targets >= 44px on phone; never colour alone; a changing label is not combined with `aria-pressed`; the selection checkboxes are native inputs named by the program name.
- `src/domain` is not edited. No `any`, no `@ts-ignore`, no non-null `!`. Named exports. Conventional commits with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage explicit paths only (never `git add -A`). Never commit the owner's `allowedDevOrigins` line in `next.config.ts`.
- JS: the owner accepted exceeding 150 KB (ADR 0008) but the per-page ratchet in `tests/e2e/support/js-budget.ts` is the regression guard: do not raise a value silently; new client code stays small and the view model is dynamically imported. Report the numbers (`pnpm perf:js`).
- Environment: `export SWC_NATIVE_BINDING_CACHE='C:\Users\dagda\.swc-cache'` before any `next`/build/e2e command. `pnpm build:e2e`/`pnpm test:e2e` overwrite `.next` and `public/snapshots`: never run them while another server listens on port 3000 or 3100 (the owner's `pnpm dev` may be running; ask the controller), restore with `pnpm data:build`, leave no process behind. Agent tools may write CRLF into working copies: normalise touched files to LF and never commit line-ending-only changes. No browser or dev server in subagents (the controller verifies fr/ar in the browser).

## File structure

| File | Responsibility |
|---|---|
| `src/lib/constants.ts` | `MIN_COMPARE = 2`, `MAX_COMPARE = 4` |
| `src/lib/journey/compare-selection.ts` (new) | pure selection rules: `effectiveSelection`, `toggleSelection`, `selectionBlock` |
| `src/lib/journey/matches-view.ts` | export `cardFor`, `CardInput`; share a `reasonContext` helper |
| `src/lib/journey/compare-view.ts` (new) | pure `buildCompareView`: per-program values, per-row signatures, per-row `differs` |
| `src/app/[locale]/compare/page.tsx` (new) | static shell + nested provider |
| `src/components/compare/*` (new) | `namespaces.ts`, `compare-client.tsx`, `compare-picker.tsx`, `compare-grid.tsx`, `compare-cells.tsx`, `compare-states.tsx` |
| `src/components/plan/program-plan.tsx` or `plan-client.tsx` | "Compare saved programs" button / hint |
| `src/components/matches/matches-client.tsx` | compare link when 2+ saved |
| `messages/{en,fr,ar}.json` | `compare` namespace, `plan.compare.*`, `matches.compare.*` |
| `tests/**` | mirrors the above; `tests/e2e/compare.spec.ts` (new); extended a11y/privacy/perf specs |

---

### Task 1: Selection rules (pure) and constants

**Files:**
- Modify: `src/lib/constants.ts` (append)
- Create: `src/lib/journey/compare-selection.ts`
- Test: `tests/lib/journey/compare-selection.test.ts`

**Interfaces:**
- Produces: `MIN_COMPARE`, `MAX_COMPARE`; `effectiveSelection(available: readonly string[], picked: readonly string[] | null): string[]`; `selectionBlock(selected: readonly string[], slug: string): "max" | "min" | null`; `toggleSelection(selected: readonly string[], slug: string, available: readonly string[]): string[]`.

Rules: `available` is the ordered list of selectable (found, non-missing) saved slugs. `picked === null` means "default": the first `MAX_COMPARE` of `available`. Otherwise the effective selection is `picked` filtered to `available`, in `available` order, capped at `MAX_COMPARE`; if that leaves fewer than `MIN_COMPARE` and `available` has at least `MIN_COMPARE`, it is topped up with the first unselected `available` slugs. `selectionBlock` says why a toggle of `slug` is refused: adding at `MAX_COMPARE` is `"max"`, removing at `MIN_COMPARE` is `"min"`, otherwise `null`. `toggleSelection` returns the new selection (unchanged when blocked), always in `available` order.

- [ ] **Step 1: Append constants** to `src/lib/constants.ts`:

```ts
export const MIN_COMPARE = 2;
export const MAX_COMPARE = 4;
```

- [ ] **Step 2: Write the failing test** `tests/lib/journey/compare-selection.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  effectiveSelection,
  selectionBlock,
  toggleSelection,
} from "@/lib/journey/compare-selection";

const six = ["a", "b", "c", "d", "e", "f"];

describe("effectiveSelection", () => {
  it("defaults to the first four available", () => {
    expect(effectiveSelection(six, null)).toEqual(["a", "b", "c", "d"]);
    expect(effectiveSelection(["a", "b", "c"], null)).toEqual(["a", "b", "c"]);
    expect(effectiveSelection([], null)).toEqual([]);
  });

  it("keeps a valid pick, in available order, capped at four", () => {
    expect(effectiveSelection(six, ["d", "b"])).toEqual(["b", "d"]);
    expect(effectiveSelection(six, ["f", "e", "d", "c", "b"])).toEqual(["b", "c", "d", "e"]);
  });

  it("drops picks that are no longer available and tops up to two", () => {
    expect(effectiveSelection(["a", "b", "c"], ["a", "gone"])).toEqual(["a", "b"]);
    expect(effectiveSelection(["a", "b", "c"], ["gone", "alsogone"])).toEqual(["a", "b"]);
  });

  it("cannot reach two when fewer than two are available", () => {
    expect(effectiveSelection(["a"], ["a"])).toEqual(["a"]);
    expect(effectiveSelection(["a"], null)).toEqual(["a"]);
  });
});

describe("selectionBlock and toggleSelection", () => {
  it("blocks adding at four and removing at two", () => {
    expect(selectionBlock(["a", "b", "c", "d"], "e")).toBe("max");
    expect(selectionBlock(["a", "b", "c", "d"], "a")).toBeNull();
    expect(selectionBlock(["a", "b"], "a")).toBe("min");
    expect(selectionBlock(["a", "b"], "c")).toBeNull();
  });

  it("toggles in available order and leaves a blocked toggle unchanged", () => {
    expect(toggleSelection(["a", "c"], "b", six)).toEqual(["a", "b", "c"]);
    expect(toggleSelection(["a", "b", "c"], "b", six)).toEqual(["a", "c"]);
    expect(toggleSelection(["a", "b"], "a", six)).toEqual(["a", "b"]);
    expect(toggleSelection(["a", "b", "c", "d"], "e", six)).toEqual(["a", "b", "c", "d"]);
  });
});
```

- [ ] **Step 3: Run to verify failure.** `pnpm vitest run tests/lib/journey/compare-selection.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 4: Implement** `src/lib/journey/compare-selection.ts`:

```ts
import { MAX_COMPARE, MIN_COMPARE } from "@/lib/constants";

function inOrder(slugs: ReadonlySet<string>, available: readonly string[]): string[] {
  return available.filter((slug) => slugs.has(slug));
}

// `available` is the ordered list of saved slugs that can be compared (found in the data).
// `picked === null` is the default selection: the first MAX_COMPARE of them.
export function effectiveSelection(
  available: readonly string[],
  picked: readonly string[] | null,
): string[] {
  if (picked === null) return available.slice(0, MAX_COMPARE);
  const chosen = inOrder(new Set(picked), available).slice(0, MAX_COMPARE);
  if (chosen.length >= MIN_COMPARE || available.length < MIN_COMPARE) return chosen;
  const topUp = available.filter((slug) => !chosen.includes(slug));
  return inOrder(new Set([...chosen, ...topUp.slice(0, MIN_COMPARE - chosen.length)]), available);
}

// Why a toggle of `slug` is refused, so the picker can say so instead of failing silently.
export function selectionBlock(
  selected: readonly string[],
  slug: string,
): "max" | "min" | null {
  if (selected.includes(slug)) return selected.length <= MIN_COMPARE ? "min" : null;
  return selected.length >= MAX_COMPARE ? "max" : null;
}

export function toggleSelection(
  selected: readonly string[],
  slug: string,
  available: readonly string[],
): string[] {
  if (selectionBlock(selected, slug) !== null) return [...selected];
  const next = new Set(selected);
  if (next.has(slug)) next.delete(slug);
  else next.add(slug);
  return inOrder(next, available);
}
```

- [ ] **Step 5: Run to verify pass.** `pnpm vitest run tests/lib/journey/compare-selection.test.ts tests/lib/client-imports.test.ts && pnpm typecheck && pnpm lint` — Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/constants.ts src/lib/journey/compare-selection.ts tests/lib/journey/compare-selection.test.ts
git commit -m "feat: pure selection rules for comparing two to four saved programs"
```

---

### Task 2: Compare view model (pure)

**Files:**
- Modify: `src/lib/journey/matches-view.ts` (export `cardFor` and `CardInput`; factor a `reasonContext` helper that `cardFor` and the new module share; behaviour unchanged)
- Create: `src/lib/journey/compare-view.ts`
- Test: `tests/lib/journey/compare-view.test.ts` (reuse the setup of `tests/lib/journey/plan-view.test.ts`: `buildSnapshot(E2E_DATA_DIR)`, `loadMatchesBundle`, `E2E_PROFILE`, `E2E_NOW`, `E2E_SLUGS`, `forbidConsole`, `removeTempDirs`, and its `buildVariant` style helper for deriving bundle variants in-test)

**Interfaces:**
- Consumes: `cardFor`, `groupOf`, `routeKeyOf`, `uniqueFacts`, `describeReason`, `ruleIndex`, `resolveRoute`, `matchProgram`, `estimateCost`, `nextIntake`, `scholarshipsForProgram`, `SnapshotBundle`, `DataText`.
- Produces:

```ts
export const COMPARE_ROWS = ["result", "tuition", "cost", "language", "deadline", "scholarships", "application"] as const;
export type CompareRowId = (typeof COMPARE_ROWS)[number];
export type CompareChannel = { slug: string; name: string; kind: "national_portal" | "intermediary" | "direct"; url: string; accountRequired: boolean | null };
export type CompareDocument = { slug: string; name: DataText | null; translationRequired: boolean | null };
export type CompareProgram = {
  slug: string; name: string; institutionName: string; cityName: string;
  group: MatchGroup; routeKey: RouteKey; reasons: ReasonView[];     // every reason, not the top three
  tuition: MatchCardModel["tuition"]; cost: CostEstimate; monthsLabel?: never;
  teachingLanguages: MatchCardModel["teachingLanguages"]; intake: IntakeStatus;
  scholarships: Array<{ slug: string; name: string }>;
  channel: CompareChannel | null; channelFact: FactRef | null;
  documents: CompareDocument[] | null; documentsMeta: Program["documents"];
};
export type CompareView = {
  programs: CompareProgram[];                        // in the order of `slugs`, only those found
  missing: string[];                                 // slugs not found in the bundle
  differs: Record<CompareRowId, boolean>;            // false when fewer than 2 programs
};
export function buildCompareView(input: { profile: Profile; bundle: SnapshotBundle; slugs: readonly string[]; now: IsoDate; locale: AppLocale }): CompareView
```

Row signatures (private, used for `differs`): `result` = `group`; `tuition` = `amountMinor|currency|period` or unknown; `cost` = per-currency `currency:min-max` joined, plus `complete`; unknown when no totals; `language` = sorted codes joined; unknown when null; `deadline` = `upcoming:<date>` / `closed` / unknown for `unknown`; `scholarships` = sorted slugs joined (an empty list is a real value `""`); `application` = channel slug + `accountRequired` + sorted `slug:translationRequired` of documents; unknown when the channel is null or the documents are null. A value is **unknown** when its signature is the sentinel `unknown:<slug>` (distinct per program), so a row with any unknown value always `differs: true` and is never hidden by the switch (never round an unknown up to "the same"). `differs[row]` is true when the signatures of the programs are not all equal.

- [ ] **Step 1: Failing tests.** Write real assertions (read the fixture programs `xx-test-prog-ok`, `-check`, `-fail`, `-stale`, `-fronly`, `-private`, `-foundation` and their channels, documents, tuition, languages and deadlines first, then pick expectations from them; never leave a case as a comment):
  1. Order and missing: `slugs: [ok, "xx-gone", check]` gives `programs` `[ok, check]` and `missing: ["xx-gone"]`.
  2. Every reason is present: for the `ok` program `reasons.length === match.reasons.length` (compare with `matchProgram` run in the test) rather than the card's top three.
  3. Values equal the card's: `tuition`, `cost`, `teachingLanguages`, `intake`, `group`, `routeKey` for a program equal what `buildMatchesView` gives for the same program and bundle (same inputs, so the compare page can never disagree with the matches page).
  4. Scholarships honour the nationality filter (an eligible profile lists them by name; a profile whose nationality is not eligible lists none), as in `plan-view.test.ts`.
  5. Channel and documents: channel `{slug, name, kind, url, accountRequired}` resolved from `core.applicationChannels`; documents with localized names and `translationRequired`; `channelFact` is the channel's fact (`application-channels/<slug>`).
  6. `differs`: two programs with different tuition give `differs.tuition === true`; build a variant bundle (as `buildVariant` does in plan-view tests) where two programs share the same tuition, languages and scholarships to prove `differs` is false for those rows; with one program every `differs` value is false.
  7. Unknown never counts as the same: two programs whose tuition is `null` (variant) still give `differs.tuition === true`; same for a null channel in `application`.
  8. Stale data: the stale program keeps `group === "check"` and its facts carry the stale freshness through to the cells (assert the `intake.fact.freshness` or tuition meta is not `fresh`); the view never produces `ok` for it.
  9. Throws, without echoing profile values, when the bundle has no core shard.

- [ ] **Step 2: Run to verify failure.** `pnpm vitest run tests/lib/journey/compare-view.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Refactor `matches-view.ts` minimally.** Export `cardFor` and `type CardInput`. Extract the reason-context construction used inside `cardFor` into `export function reasonContext(input: { profile; bundle; locale; core; program }): ReasonContext` and call it from `cardFor` (no behaviour change; the existing `matches-view` tests must stay green).

- [ ] **Step 4: Implement `compare-view.ts`.** Per found program: `const card = cardFor({ profile, bundle, now, locale, core, program })` for `tuition`, `cost`, `teachingLanguages`, `intake`, `group`, `routeKey`, `name`, `institutionName`, `cityName`; `reasons = card.match.reasons.map((r) => describeReason(r, reasonContext(...)))` (all of them); `scholarships = scholarshipsForProgram(profile, program, allScholarships).map(({slug, name}) => ({slug, name}))`; channel and documents as in `plan-view.ts` (`core.applicationChannels.find(...)`, `bundle.text(doc.name) ?? null`); `channelFact = card.factRefs.find((f) => f.record.startsWith("application-channels/")) ?? null`. Then compute signatures and `differs` with the rules above. Throw `new Error("buildCompareView: the bundle has no core shard")` when `bundle.core === undefined`. Nothing logs. Keep the module free of Zod and of runtime `@/data-schema` imports (type imports only).

- [ ] **Step 5: Run to verify pass.** `pnpm vitest run tests/lib/journey tests/lib/client-imports.test.ts && pnpm typecheck && pnpm lint` — Expected: PASS (all existing journey tests included).

- [ ] **Step 6: Commit.**

```bash
git add src/lib/journey/matches-view.ts src/lib/journey/compare-view.ts tests/lib/journey/compare-view.test.ts
git commit -m "feat: compare view model: result, tuition, cost, language, deadline, scholarships and application per program"
```

---

### Task 3: Compare page, island and components (UI)

> Invoke `impeccable:impeccable` first (phone-first, fr and ar RTL, one DOM structure that is stacked by topic on phone and a grid from `md`, never colour alone). Read `DESIGN.md`. Follow the patterns of `src/components/plan/plan-client.tsx` (profile states, snapshot request key, dynamic `import()` with Retry, `useMemo` for the derived view, one polite `<output>` region, storage notice) and `src/app/[locale]/plan/page.tsx` (static shell + nested provider).

**Files:**
- Create: `src/app/[locale]/compare/page.tsx`, `src/components/compare/namespaces.ts`, `compare-client.tsx`, `compare-picker.tsx`, `compare-grid.tsx`, `compare-cells.tsx`, `compare-states.tsx`
- Modify: `messages/{en,fr,ar}.json` (`compare` namespace, table below; add any further key a component needs in all three locales in the same style)
- Test: `tests/components/compare/compare-client.test.tsx`, `compare-picker.test.tsx`, `compare-grid.test.tsx`, `tests/app/compare-page.test.tsx`, `tests/i18n/compare-messages.test.ts` (follow `tests/i18n/plan-messages` if present, else the other page-namespace message tests)

**Interfaces:**
- Consumes: `useProfile`, `useSaved` (`items`, `hydrated`, `storageAvailable`), `useSnapshotBundle`, `shardsForPlan`, `buildCompareView` (dynamic `import("@/lib/journey/compare-view")`), `effectiveSelection`, `toggleSelection`, `selectionBlock`, `MIN_COMPARE`, `MAX_COMPARE`, `SourceBadge`, `DeadlineStatus`, `MatchStatusBadge`, `ReasonList`, `CostBreakdown`, `ExternalLink`, `LocalizedDataText`, `EmptyState`, `displayNumber`, `formatMoneyRange`, `todayIso`.
- Produces: `COMPARE_MESSAGE_NAMESPACES = ["compare", "deadline", "sourceBadge", "externalLink", "matchStatusBadge", "reasonList", "costBreakdown", "domain", "program"] as const` (trim to what the components really read; `program` only if `program.documents.translation.*` is reused); `CompareClient({ locale, client? })`.

Behaviour contract (write the failing tests first, RED then GREEN):
- States, in order: unhydrated or saved not hydrated → skeleton (`aria-busy`) and one polite `<output>`; fewer than `MIN_COMPARE` saved programs in total → `EmptyState` (`compare.empty`, link to `/matches`; zero and one saved are the same state); no profile → `compare.noProfile` (saved list untouched), `reset` notice like the plan page; snapshot error or failed module import → error with Retry; compute error → error without Retry; storage notice when `saved.hydrated && !saved.storageAvailable`; otherwise the comparison. If after loading fewer than `MIN_COMPARE` saved programs exist in the data (the rest are missing) show `compare.notEnough` with the picker still listing the missing ones greyed.
- Request key: `compare:${country}:${sorted unique "country.field" of ALL saved items}` and plan `shardsForPlan(items, country, manifest)` (identical to the plan page, so the shared snapshot client reuses what is cached; selecting or unselecting never reloads shards).
- Selection: `const [picked, setPicked] = useState<string[] | null>(null)`; `available` = saved slugs found in the loaded bundle, in saved order; `selected = effectiveSelection(available, picked)`; toggling calls `setPicked(toggleSelection(selected, slug, available))`. The view is `buildCompareView({ profile, bundle, slugs: selected, now, locale })` in a `useMemo` over (profile, bundle, now, module, selected key). A blocked toggle shows `compare.picker.limit` (max) or `compare.picker.minimum` (min) in a polite status line and changes nothing.
- Picker (`compare-picker.tsx`): `<details>` open by default from `md` (use the same `useLayoutEffect` open-before-paint approach as `program-switcher.tsx`, with the `matchMedia("(min-width: 48rem)")` constant matching the Tailwind `md` breakpoint), closed on phone; summary text `compare.picker.summary` ("Comparing {selected} of {total} saved programs", preformatted strings) + "Change programs". Each saved program is a native `<input type="checkbox">` in a `<label>` (min 44px, name = program name in `<bdi>`, institution/city muted); a checkbox that cannot be toggled is `disabled` and described by the limit/minimum text via `aria-describedby`; a missing slug is a disabled, unchecked row labelled `compare.picker.missing` with `dir="ltr"` on the slug.
- Differences switch: a native checkbox "Show only what differs" (label text constant, no `aria-pressed`), default off. When on, only rows with `differs[row]` are rendered; if none differ show `compare.differences.allSame`. A differing row shows the "Differs" marker (icon + text) next to its heading whether or not the switch is on.
- Grid (`compare-grid.tsx`): a header row of program names (from `md`: sticky, one column per program via `grid-template-columns: repeat(n, minmax(0, 1fr))` set with an inline CSS variable; the program name is a link to `/programs/<slug>` with `prefetch={false}`, text "name" and the institution/city line), then one `<section aria-labelledby>` per visible row with an `<h2>`/`<h3>` topic heading and a `<ul>` of cells. On phone each cell is labelled by its program name (visible `<bdi>` label); from `md` that label is `sr-only` (the column header shows it) but stays in the DOM so every cell is announced with its program. Same DOM in every direction; use only logical utilities.
- Cells (`compare-cells.tsx`), all sourced values with `SourceBadge variant="compact"`:
  - **result:** `MatchStatusBadge group` + one-line hint (`domain.status.hint.<status>` is not available on the view; use the group's badge only) + `ReasonList` with all `reasons`, collapsed behind its summary (compact, sources grouped). Use `routeKey` through the same helper the card uses for the route sentence when the group is `foundation`.
  - **tuition:** formatted `formatMoney` + per-period (`domain.cost.per.*`) + its `SourceBadge`, or the `domain.cost.missingLine` "to check" line when null (no badge).
  - **cost:** `totals` as `formatMoneyRange` per currency with the existing estimate tag (`domain.cost.estimateTag`) and the ten-month note via `displayNumber(cost.academicYearMonths)`, an "incomplete total" line when `!cost.complete`, and `CostBreakdown variant="compact"` (collapsed) for the seven lines with their sources; reuse the strings `MatchCard` and the program aside already use.
  - **language:** the `formatList`/`languageName` text the card uses, or the unknown line, with `SourceBadge`.
  - **deadline:** `DeadlineStatus intake`.
  - **scholarships:** names as links to `/programs/<slug>#scholarship-<scholarshipSlug>` (`prefetch={false}`); `compare.scholarships.none` when empty; one `compare.scholarships.caveat` line under the row ("Based on the published nationality rules only. Check the other conditions on each scholarship page.").
  - **application:** channel name + kind + account line (`compare.application.account.*`) + `ExternalLink` to the official channel URL + `SourceBadge` for `channelFact`; documents list (name via `LocalizedDataText`, translation line `compare.application.translation.*`) with `SourceBadge meta={documentsMeta}`; "to check" lines when the channel or the documents are null.
- The page title (`<h1>`) and lead sit in the static shell; the island shows the lead only when the comparison is shown.
- Accessibility: one `<h1>`; headings strictly nested; the picker and switch reachable in order picker → switch → grid; focus is never stolen on toggle; the polite `<output>` announces the number compared after a change ("Comparing {n} programs") using the single persistent region.

Messages (all three locales; `ar` machine draft; fr uses U+00A0 before `: ? ! ;`). Numbers are preformatted strings (`{selected}`, `{total}`, `{min}`, `{max}`, `{n}` as already-formatted strings):

| key | en | fr | ar |
|---|---|---|---|
| `compare.meta.title` | Compare programs | Comparer des programmes | مقارنة البرامج |
| `compare.meta.description` | Compare 2 to 4 of your saved programs side by side: costs, deadlines, requirements and how to apply. | Comparez 2 à 4 de vos programmes enregistrés côte à côte : coûts, échéances, conditions et démarches. | قارن بين 2 إلى 4 من برامجك المحفوظة جنبًا إلى جنب: التكاليف والمواعيد والشروط وطريقة التقديم. |
| `compare.title` | Compare programs | Comparer des programmes | مقارنة البرامج |
| `compare.lead` | Compare 2 to 4 of your saved programs side by side. Every value shows its source; costs are estimates, not promises. | Comparez 2 à 4 de vos programmes enregistrés côte à côte. Chaque valeur indique sa source ; les coûts sont des estimations, pas des promesses. | قارن بين 2 إلى 4 من برامجك المحفوظة جنبًا إلى جنب. تعرض كل قيمة مصدرها، والتكاليف تقديرات وليست وعودًا. |
| `compare.loading` | Loading the comparison | Chargement de la comparaison | جارٍ تحميل المقارنة |
| `compare.empty.title` | Save at least 2 programs to compare them | Enregistrez au moins 2 programmes pour les comparer | احفظ برنامجين على الأقل لتتمكن من مقارنتهما |
| `compare.empty.description` | Compare works on the programs you have saved. Save programs from My matches or from a program page. | La comparaison porte sur les programmes que vous avez enregistrés. Enregistrez des programmes depuis Mes résultats ou depuis une page de programme. | تعمل المقارنة على البرامج التي حفظتها. احفظ برامج من نتائجي أو من صفحة البرنامج. |
| `compare.empty.action` | See my matches | Voir mes résultats | عرض نتائجي |
| `compare.notEnough.title` | Fewer than 2 of your saved programs are in our current data | Moins de 2 de vos programmes enregistrés figurent dans nos données actuelles | أقل من برنامجين من برامجك المحفوظة موجودان في بياناتنا الحالية |
| `compare.notEnough.description` | Save more programs, or remove the ones that are no longer listed, to compare. | Enregistrez d'autres programmes, ou retirez ceux qui ne sont plus listés, pour comparer. | احفظ برامج أخرى، أو أزل التي لم تعد مدرجة، لتتمكن من المقارنة. |
| `compare.noProfile.title` | Create your profile to compare | Créez votre profil pour comparer | أنشئ ملفك الشخصي لتقارن |
| `compare.noProfile.description` | Your saved programs are kept on this device. We need your profile to show how each program fits you. | Vos programmes enregistrés restent sur cet appareil. Nous avons besoin de votre profil pour montrer comment chaque programme vous convient. | تبقى برامجك المحفوظة على هذا الجهاز. نحتاج إلى ملفك الشخصي لنعرض مدى ملاءمة كل برنامج لك. |
| `compare.noProfile.action` | Create my profile | Créer mon profil | إنشاء ملفي الشخصي |
| `compare.error.title` | We could not load the comparison | Impossible de charger la comparaison | تعذّر تحميل المقارنة |
| `compare.error.description` | Check your connection and try again. | Vérifiez votre connexion et réessayez. | تحقق من اتصالك وحاول مرة أخرى. |
| `compare.error.retry` | Try again | Réessayer | حاول مرة أخرى |
| `compare.storage.notice` | This device cannot keep your saved programs reliably, so they may be lost when you close this page. | Cet appareil ne peut pas conserver vos programmes enregistrés de façon fiable ; ils peuvent être perdus à la fermeture de cette page. | لا يستطيع هذا الجهاز حفظ برامجك المحفوظة بشكل موثوق، وقد تُفقد عند إغلاق هذه الصفحة. |
| `compare.reset.notice` | Your saved profile could not be read, so it was cleared. | Votre profil enregistré n'a pas pu être lu ; il a été effacé. | تعذّرت قراءة ملفك المحفوظ فتم مسحه. |
| `compare.reset.dismiss` | Dismiss | Fermer | إغلاق |
| `compare.picker.summary` | Comparing {selected} of {total} saved programs | Comparaison de {selected} programmes sur {total} enregistrés | مقارنة {selected} من أصل {total} برامج محفوظة |
| `compare.picker.change` | Change programs | Changer de programmes | تغيير البرامج |
| `compare.picker.hint` | Choose between {min} and {max} programs. | Choisissez entre {min} et {max} programmes. | اختر بين {min} و{max} برامج. |
| `compare.picker.limit` | You can compare up to {max} programs. Untick one to choose another. | Vous pouvez comparer jusqu'à {max} programmes. Décochez-en un pour en choisir un autre. | يمكنك مقارنة ما يصل إلى {max} برامج. ألغِ تحديد أحدها لاختيار آخر. |
| `compare.picker.minimum` | Keep at least {min} programs selected. | Gardez au moins {min} programmes sélectionnés. | أبقِ {min} برنامجين على الأقل محددين. |
| `compare.picker.missing` | No longer in our data | N'est plus dans nos données | لم يعد في بياناتنا |
| `compare.picker.announce` | Comparing {n} programs | Comparaison de {n} programmes | مقارنة {n} برامج |
| `compare.differences.label` | Show only what differs | Afficher uniquement les différences | عرض الفروقات فقط |
| `compare.differences.marker` | Differs | Diffère | يختلف |
| `compare.differences.allSame` | These programs have the same values for every topic. | Ces programmes ont les mêmes valeurs pour tous les sujets. | لهذه البرامج القيم نفسها في جميع المواضيع. |
| `compare.rows.result` | Your result | Votre résultat | نتيجتك |
| `compare.rows.tuition` | Tuition | Frais de scolarité | الرسوم الدراسية |
| `compare.rows.cost` | Estimated first-year cost | Coût estimé de la première année | التكلفة التقديرية للسنة الأولى |
| `compare.rows.language` | Teaching language | Langue d'enseignement | لغة التدريس |
| `compare.rows.deadline` | Application deadline | Date limite de candidature | الموعد النهائي للتقديم |
| `compare.rows.scholarships` | Scholarships open to you | Bourses ouvertes à vous | منح مفتوحة لك |
| `compare.rows.application` | How to apply | Comment candidater | طريقة التقديم |
| `compare.cells.programLabel` | Program | Programme | البرنامج |
| `compare.cells.viewProgram` | View the program page | Voir la page du programme | عرض صفحة البرنامج |
| `compare.cells.languageUnknown` | Teaching language not published: check the official page | Langue d'enseignement non publiée : vérifiez la page officielle | لغة التدريس غير منشورة: تحقق من الصفحة الرسمية |
| `compare.cells.costDetails` | Cost details | Détail des coûts | تفاصيل التكاليف |
| `compare.scholarships.none` | None open to your nationality on the published rules | Aucune ouverte à votre nationalité d'après les règles publiées | لا توجد منحة مفتوحة لجنسيتك وفق القواعد المنشورة |
| `compare.scholarships.caveat` | Based on the published nationality rules only. Check the other conditions on each scholarship page. | D'après les règles de nationalité publiées uniquement. Vérifiez les autres conditions sur la page de chaque bourse. | استنادًا إلى قواعد الجنسية المنشورة فقط. تحقق من الشروط الأخرى في صفحة كل منحة. |
| `compare.application.applyOn` | Apply on {name} | Candidater sur {name} | قدّم على {name} |
| `compare.application.account.required` | An account is required | Un compte est nécessaire | الحساب مطلوب |
| `compare.application.account.notRequired` | No account is required | Aucun compte n'est nécessaire | لا حاجة إلى حساب |
| `compare.application.account.unknown` | Account requirement not stated | Compte : non précisé | شرط الحساب غير مذكور |
| `compare.application.channelUnknown` | Application channel not published: check the official page | Démarche de candidature non publiée : vérifiez la page officielle | طريقة التقديم غير منشورة: تحقق من الصفحة الرسمية |
| `compare.application.documents` | Documents | Documents | الوثائق |
| `compare.application.documentsUnknown` | Documents not published: check the official page | Documents non publiés : vérifiez la page officielle | الوثائق غير منشورة: تحقق من الصفحة الرسمية |
| `compare.application.translation.yes` | Translation required | Traduction requise | الترجمة مطلوبة |
| `compare.application.translation.no` | No translation required | Traduction non requise | الترجمة غير مطلوبة |
| `compare.application.translation.unknown` | Translation not stated: check the official page | Traduction non précisée : vérifiez la page officielle | الترجمة غير مذكورة: تحقق من الصفحة الرسمية |

(Adapt the fr strings that contain `:`, `;`, `?` or `!` to carry U+00A0 before them. If the existing forbidden-wording or vocabulary tests reject an `ar` phrase, reword it minimally and report which, as was done for the plan page. Reuse existing strings such as `domain.cost.*`, `matchCard.*`, `costBreakdown.*` instead of copying them.)

- [ ] **Step 1: Messages and namespace list** (all three locales), then `pnpm vitest run tests/i18n` — Expected: PASS (key parity, ICU, forbidden wording, fr no-break spaces).
- [ ] **Step 2: Write the failing tests** (RED shown first) covering: every state of the island; request key and shards (a saved program whose shard exists is never shown as missing; the same key for any selection); default selection and swapping; limit and minimum messages and disabled boxes; missing slug greyed out and not selectable; the switch hides equal rows, keeps rows with an unknown value, shows `allSame`; the "Differs" marker; one `SourceBadge` per sourced cell and none on unknown values; the stale program never renders as `ok`; DD/MM/YYYY and Latin digits in `ar`; no physical direction utilities (`tests/design` scan covers the new files); the static page HTML (`tests/app/compare-page.test.tsx`, fr/en/ar) holds the title and a neutral skeleton but no program name, status or deadline.
- [ ] **Step 3: Implement** per the contract above (page, island, picker, grid, cells, states). Keep client imports Zod-free (`tests/lib/client-imports.test.ts`).
- [ ] **Step 4: Run to verify pass.** `pnpm vitest run tests/components tests/app tests/lib tests/design tests/i18n && pnpm typecheck && pnpm lint` — Expected: PASS. Then the full `pnpm test`.
- [ ] **Step 5: Commit** (messages first, then components and page), conventional messages with the trailer.

---

### Task 4: Entry points (UI)

> Invoke `impeccable:impeccable` first. Small task; keep it small.

**Files:**
- Modify: `src/components/plan/plan-client.tsx` (and `plan-states.tsx` if a shared piece helps) for the plan-page button and hint; `src/components/matches/matches-client.tsx` for the matches link; `src/components/matches/namespaces.ts` if the matches namespace needs nothing new (the key lives in `matches`); `messages/{en,fr,ar}.json` (`plan.compare.*`, `matches.compare.*`)
- Test: `tests/components/plan/plan-client.test.tsx`, `tests/components/matches/results.test.tsx`

**Interfaces:** consumes `useSaved().items.length`, `Link` from `@/i18n/navigation` with `prefetch={false}`, `buttonVariants`, `displayNumber`.

| key | en | fr | ar |
|---|---|---|---|
| `plan.compare.action` | Compare saved programs | Comparer les programmes enregistrés | مقارنة البرامج المحفوظة |
| `plan.compare.hint` | Save at least 2 programs to compare them. | Enregistrez au moins 2 programmes pour les comparer. | احفظ برنامجين على الأقل لمقارنتهما. |
| `matches.compare.link` | Compare your saved programs ({count}) | Comparer vos programmes enregistrés ({count}) | قارن برامجك المحفوظة ({count}) |

- Plan page: in the plan island (above the switcher, below the lead) a `buttonVariants({ variant: "outline" })` link to `/compare` labelled `plan.compare.action` when 2 or more programs are saved (counting every saved item, including missing ones is acceptable: Compare itself explains); with exactly one saved program the muted `plan.compare.hint` paragraph instead. Add `compare` is NOT needed to the plan namespaces list beyond the existing `plan` namespace (the keys live in `plan`).
- Matches page: when 2 or more programs are saved, a text link `matches.compare.link` with `{count}` preformatted via `displayNumber` placed after the lead paragraph in `Results` (`src/components/matches/matches-client.tsx`), `min-h-11` tap target, `rtl:rotate-180` chevron if an arrow is used. The matches island must read `useSaved()` (already in the shell bundle through the nav, so no new store code); render nothing until `hydrated`.
- Tests (RED first): the button/hint/link appear exactly when the saved count says so, point to `/compare` (locale-aware href), are absent while unhydrated, and render with `ar` counts as Latin digits.

- [ ] **Step 1: Messages** in all three locales; `pnpm vitest run tests/i18n`.
- [ ] **Step 2: Failing tests, then implement, then green:** `pnpm vitest run tests/components tests/i18n && pnpm typecheck && pnpm lint`; full `pnpm test`.
- [ ] **Step 3: Commit.**

---

### Task 5: End-to-end, axe, privacy, performance, docs

**Files:**
- Create: `tests/e2e/compare.spec.ts`
- Modify: `tests/e2e/a11y.spec.ts`, `tests/e2e/privacy.spec.ts`, `tests/e2e/perf.spec.ts` + `tests/e2e/support/js-budget.ts` (add `/fr/compare`, `/ar/compare` rows: current value rounded up plus 3 KB; never raise an existing row silently), `.claude/docs/architecture.md`, `.claude/CLAUDE.md`, `docs/plans/2026-09-30-m3-guest-journey-plan.md` (M4 list: Compare done)

- [ ] **Step 1: `compare.spec.ts`** (phone and desktop, fr and ar, reuse `tests/e2e/support/*` helpers, roles and names from the real catalogues via `support/messages.ts`; seed a profile and saved programs like `plan.spec.ts`): (a) with 2+ saved programs the plan page shows the Compare button and it opens `/compare`; (b) the page opens with up to 4 selected and shows all seven topics with sources; (c) swapping a program via the picker updates the grid and the "Comparing n" status; the 5th selection is refused with the limit message and unticking down to 1 is refused with the minimum message; (d) "Show only what differs" hides equal rows and keeps rows with an unknown value, `allSame` when nothing differs; (e) fewer than 2 saved: empty state with a link to matches; (f) no profile: CTA, saved list kept; (g) a saved slug missing from the data is greyed out and unselectable; (h) Clear my data empties the saved list and the page returns to the empty state; (i) from the matches page the compare link appears with 2+ saved and works; (j) reload keeps the saved list but resets the selection to the default.
- [ ] **Step 2: axe** in `tests/e2e/a11y.spec.ts`: compare page (empty, no profile, comparison with the picker open and the differences switch on and off, `allSame`), fr and ar, both projects, zero serious/critical violations; fix real violations in the UI with a unit test each and report them.
- [ ] **Step 3: Privacy** in `tests/e2e/privacy.spec.ts`: on `/compare` after selecting and swapping, no request path, query, header or body carries a program slug (only the same `programs.<country>.<field>`/institution/cost/scholarship shard requests the plan page makes), `document.cookie` is empty, localStorage holds exactly the same keys as before, `sessionStorage`, IndexedDB and caches are empty.
- [ ] **Step 4: Run the whole gate** (no server on :3000/:3100; ask the controller if one is): `pnpm typecheck && pnpm lint && pnpm test && pnpm data:check && pnpm build:e2e && pnpm test:e2e`; all green; run any failing spec alone and find the cause. Then restore real data: `pnpm data:build && pnpm data:check`.
- [ ] **Step 5: JS numbers.** `pnpm build` then `pnpm perf:js`; refresh the table in `.claude/docs/architecture.md` ("Client JS size") with the new `/[locale]/compare` row and any changed rows; report every route that grew by more than 3 KB gzip and why. If an existing ratchet row is exceeded, STOP and report the numbers (status DONE_WITH_CONCERNS) instead of raising it.
- [ ] **Step 6: Docs.** `.claude/docs/architecture.md` (modules table: `compare-selection`, `compare-view`, `src/components/compare/`, the `/compare` page, the entry points; data-flow note that the selection is React state only; privacy note: Compare requests the same shards as the plan page; perf row); `.claude/CLAUDE.md` architecture block and "pages built" wording (Compare is built; Scholarships remains M4) and keep it under ~200 lines; the M3 plan's M4 list: one line marking Compare done.
- [ ] **Step 7: Commits** (e2e specs; any UI fix; docs), conventional, with the trailer; stage explicit paths.

(The Opus review of the whole branch and the draft PR are done by the controller after this task.)

---

## Self-review

- **Spec coverage:** selection 2 to 4 from saved with picker and limits (T1, T3); entry points on plan and matches with the under-2 hint (T4); stacked/grid layout, sticky header, same DOM (T3); the seven rows with sources and the nationality-filtered scholarships (T2, T3); differences switch with unknown-never-same and the marker, no highlighting (T2, T3); privacy, a11y, perf, docs, review and PR (T5 and the controller).
- **Placeholders:** none; the fixture-dependent expectations in T2 say to read the named fixture files and write real assertions.
- **Types:** `CompareProgram`, `CompareView`, `CompareRowId`, `effectiveSelection`, `toggleSelection`, `selectionBlock`, `MIN_COMPARE`/`MAX_COMPARE` are defined once (T1, T2) and used with the same names in T3.
