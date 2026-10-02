// Regression ratchet, NOT the ADR 0004 target. Each value is what the page cost when the ratchet was
// set (gzip-transferred script bytes in Chromium against `next start`), rounded up to a whole KB,
// plus 3 KB of headroom. It only ever goes down: lower a value when a page gets lighter; raise one
// only with a written reason. The ADR target is 150 KB and every page is still above it:
// perf.spec.ts prints the gap on every run so the ratchet cannot hide it.
//
// initial   = scripts the page's HTML asks for (Next's "First Load JS", what ADR 0004 budgets).
// untilIdle = every script fetched up to network idle: initial plus the chunks the app prefetches
//             for the pages its links lead to.
// The `_rsc` payloads of those prefetches are not scripts: perf.spec.ts reports them as rscPrefetchKb
// without a ratchet.
export const ADR_TARGET_KB = 150;

export type JsBudget = { initial: number; untilIdle: number };

// Measured 2026-09-30 on the fixture build (initial KB, until-idle KB): /fr 166.8, 212.8; /ar 166.8, 212.8;
// profile 183.5, 212.8; matches 188.5, 229.8; program 180.5, 234.8 (same in fr and ar, phone and desktop).
// Lowered 2026-10-01: matches until idle 229.8 -> 212.9 once MatchCard stopped prefetching the program
// pages its cards link to (prefetch={false}); the other pages were unchanged by that.
// 2026-10-01 (T14): prefetch={false} on the locale switcher's current-locale link cut the program page's
// _rsc prefetch from 26.2/28.0 KB (fr/ar, 9 requests) to 15.7/16.9 KB (7); script bytes did not change (the
// page chunk is shared), so no ratchet value moves.
// 2026-10-02 (M4a): Save and the plan page. Every page now carries the saved-count badge in the nav
// (+0.9 to +1.8 KB initial after splitting the count hook from the toggle) and the pages with a Save
// button carry it too (matches 191.9, program 184.0 initial; the old values are in the rows above).
// The plan page is new: 185.2 initial, 240.7 until idle with one saved program (its view model is a
// lazy chunk); its ratchet is that rounded up plus 3 KB. The nav prefetches /plan only when something
// is saved, so the other pages do not pay for it. Program until idle (238.3) is 0.3 KB over its old row.
export const JS_BUDGET_KB: Record<string, JsBudget> = {
  "/fr": { initial: 170, untilIdle: 216 },
  "/ar": { initial: 170, untilIdle: 216 },
  "/fr/profile": { initial: 187, untilIdle: 216 },
  "/ar/profile": { initial: 187, untilIdle: 216 },
  "/fr/matches": { initial: 192, untilIdle: 216 },
  "/ar/matches": { initial: 192, untilIdle: 216 },
  "/fr/plan": { initial: 189, untilIdle: 244 },
  "/ar/plan": { initial: 189, untilIdle: 244 },
  "/fr/programs/xx-test-prog-ok": { initial: 184, untilIdle: 238 },
  "/ar/programs/xx-test-prog-ok": { initial: 184, untilIdle: 238 },
};
