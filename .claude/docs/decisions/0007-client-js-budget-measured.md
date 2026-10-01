# ADR 0007: Client JS budget, measured

**Status:** Proposed (a decision from the product owner is required, see below)
**Date:** 2026-10-01

## Context

ADR 0004 and the M3 plan set a budget of 150 KB gzipped initial JavaScript per page, for a student on a phone and a slow connection. After M3 every page is over it, including Home. Next 16.3.7 no longer prints "First Load JS", so the numbers come from our own tools: `pnpm perf:js` (gzip level 6 of every `<script src>` in the prerendered HTML, noModule polyfill excluded, plus a scan for Zod markers) and the Playwright perf spec (transferred bytes in Chromium against `next start`). All numbers below are gzipped KB on the synthetic fixture build and are identical in fr, en and ar.

| Route | build (`perf:js`) | browser initial | browser until idle | gap to 150 (initial) |
|---|---|---|---|---|
| Home `/fr` | 166.5 | 166.8 | 211.7 to 212.9 | +16.8 |
| `/profile` | 183.1 | 183.5 | 212.9 | +33.5 |
| `/matches` | 188.2 | 188.5 | 212.9 | +38.5 |
| `/programs/<slug>` | 180.2 | 180.5 | 234.8 | +30.5 |

"Until idle" adds the chunks Next prefetches for pages the visible links lead to (about 45 KB after load on Home and 54 KB on the program page, but only about 29 KB on profile and 24 KB on matches, plus 15 to 17 KB of `_rsc` payload; not counted by `perf:js`). The baseline before any M3 UI was 144.7 KB for a bare page (React, Next runtime, next-intl). The shell (header, footer, locale switcher, clear-data, Home leaf) costs about 20.6 KB on top of that today (Home is 166.5 KB; with all four client leaves stubbed it was 145.9 KB when measured in T8, when Home was about 163 KB, i.e. 17.1 KB then). Each page then adds its island: profile about +16.6, matches about +21.7, program about +13.7 over today's Home.

## What was tried (with measured effect)

- **Zod out of client code** (hand-written validators proven by differential tests, a guard test, a post-build marker scan): a static import of the profile store in the shell had pulled in a 120 KB Zod chunk (265.6 KB for Home); the Zod-free equivalent measured 176.9 KB with the same static imports, i.e. about -89 KB, and about -100 KB on the pages that load the schemas. Kept.
- **Shell strings as props, no message catalogue in the root provider:** -2.0 KB (165.0 to 163.0). Kept (the formatter is needed anyway by `Link`/`usePathname`).
- **Build-time compiled `cn` merge tables** (`cn/next`): -2.8 KB (163.1 to 160.3). Reverted: not worth the codegen, repo-wide watcher and the silent mis-merge mode.
- **Lazy loading:** Radix dialog on first click (-12 KB), `buildProfile` as a dynamic import and an inline icon file on the profile page, the matching code of the program page as a separate chunk (183.0 to 180.2), `EmptyState` lazy where only error states use it. Kept.
- **`cn/lite`** (no merge engine, ablation only): -10.2 KB, rejected because it changes how `className` overrides resolve in shared components.
- Ablations that were too small: Radix `Slot` removed -1.1 KB, Radix `Direction` -0.1 KB.
- **Prefetch:** `prefetch={false}` on match cards and on the locale switcher's current-locale link removed the largest avoidable prefetches (matches until-idle 229.8 to 212.9 KB; program `_rsc` 26.2 to 15.7 KB). The primary nav still prefetches.

## Remaining levers (estimates, none implemented)

1. A merge-free class path in the shell's client leaves (nav links, locale switcher, Home link, clear-data trigger: they reach the `cn` merge engine through `<Button>` or `cn` directly): about -7.7 KB (T8c estimate). Since the M3 cleanup `buttonVariants` itself merges (so Links keep their outline border), this needs a separate non-merging variant for fixed class strings.
2. Dropping next-intl's client `Link`/`usePathname` and the client provider from the shell (plain anchors with the locale prefix built on the server, the pathname passed as a prop): about -5 to -10 KB (the 9.9 KB IntlMessageFormat baseline is the target).
3. Radix `Slot` off the client path plus lazy validators for the Home link: about -2.7 KB.
4. Code-splitting the profile steps (only step 1 is needed at load; the page's own chunk is about 15.7 KB): not measured.
5. A dynamic import of the matching code on the matches page, as already done for the program page (that change was worth 2.8 KB there): estimate of the same order, not measured.

Levers 1 and 2 together would take Home to about 149 to 154 KB (166.5 - 7.7 - 5 to 10), so possibly still over 150 KB; adding lever 3 (-2.7 KB) gives about 146 to 151 KB. Pages with an island would still be well above 150 KB (profile, matches and program are 14 to 22 KB over the shell), so reaching 150 KB per page also needs levers 4 and 5 and probably more; this is an extrapolation, not a measurement.

## DECISION REQUIRED (product owner)

Choose one:

- **A. Raise the per-page budget** to what M3 measured plus headroom (for example 190 KB for island pages, 170 KB for Home) and keep the ratchet in `tests/e2e/support/js-budget.ts` going down. Cheapest; students on slow mobile data pay about 15 to 40 KB more per page than the original target.
- **B. Fund the shell refactor** (levers 1, 2 and 3, then 4 and 5) as its own task with the perf spec as the acceptance test. The estimates put Home at about 146 to 151 KB at best, so Home may only just reach the target, and island pages need further work after that.
- **C. Both:** raise the budget now and refactor opportunistically.

Until a decision is recorded the ratchet is the enforced limit and no page may get heavier than its current value plus 3 KB.

## How to revisit

ADRs are immutable once committed. When the product owner decides, write a new ADR (0008 or later) that records the decision and supersedes this one; this file keeps its "Proposed" status as history.
