// Regression ratchet, NOT the ADR 0004 target. Each value is what the page cost when the ratchet was
// set (gzip-transferred script bytes in Chromium against `next start`), rounded up to a whole KB,
// plus 3 KB of headroom. It only ever goes down: lower a value when a page gets lighter; raise one
// only with a written reason. The ADR target is 150 KB and every page is still above it:
// perf.spec.ts prints the gap on every run so the ratchet cannot hide it.
//
// initial   = scripts the page's HTML asks for (Next's "First Load JS", what ADR 0004 budgets).
// untilIdle = every script fetched up to network idle: initial plus the chunks the app prefetches
//             for the pages its links lead to.
export const ADR_TARGET_KB = 150;

export type JsBudget = { initial: number; untilIdle: number };

// Measured 2026-09-30 on the fixture build (initial KB, until-idle KB): /fr 166.8, 212.8; /ar 166.8, 212.8;
// profile 183.5, 212.8; matches 188.5, 229.8; program 180.5, 234.8 (same in fr and ar, phone and desktop).
export const JS_BUDGET_KB: Record<string, JsBudget> = {
  "/fr": { initial: 170, untilIdle: 216 },
  "/ar": { initial: 170, untilIdle: 216 },
  "/fr/profile": { initial: 187, untilIdle: 216 },
  "/ar/profile": { initial: 187, untilIdle: 216 },
  "/fr/matches": { initial: 192, untilIdle: 233 },
  "/ar/matches": { initial: 192, untilIdle: 233 },
  "/fr/programs/xx-test-prog-ok": { initial: 184, untilIdle: 238 },
  "/ar/programs/xx-test-prog-ok": { initial: 184, untilIdle: 238 },
};
