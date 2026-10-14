// 2026-10-14 (accounts phase 2, PR 1, ADR 0008): mounting the Better Auth route (/api/auth) grew Turbopack's
// shared client runtime chunk by about 0.45 KB gzip (bisected to commit 6c2c545d), and the slug-alias
// resolution adds about 0.1 KB on plan and compare. Measured (KB, fixture build, phone and desktop, fr and
// ar): home and profile until idle 219.5; matches initial 194.2; plan until idle 246.7;
// compare until idle 254.6. No safe trim exists. Owner decision 2026-10-14: raise only the affected rows
// by 1 KB: home and profile until idle 219 -> 220, matches initial 194 -> 195, plan until idle 246 -> 247,
// compare until idle 254 -> 255. No other row moves.
// 2026-10-11 (Stripe-world redesign, ADR 0008): the redesign's shared client chunks grew about 0.6 KB,
// pushing the matches initial and the profile/plan/matches until-idle rows just past their ratchets. Owner
// decision (ruling R10): raise only the affected rows by 1 KB. matches initial 193 -> 194, until idle
// 217 -> 218; profile until idle 217 -> 218 (initial 187 unchanged); plan until idle 244 -> 245 (initial
// 189 unchanged). The home rows stay 170 initial / 217 until idle. No other row moves.
// 2026-10-11 (Stripe-world redesign, ADR 0008): the owner also approved raising the home until-idle rows /fr and
// /ar 217 -> 218, because the mounted hero demo left only ~0.6 KB headroom and the home row flaked under CI=true
// (failOnFlakyTests). Home initial stays 170.
//
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
// button carry it too (matches 191.6, program 184.0 initial; the old values are in the rows above).
// The plan page is new: 185.4 initial, 240.6 until idle with one saved program (its view model is a
// lazy chunk); its ratchet is that rounded up plus 3 KB. The nav prefetches /plan only when something
// is saved, so the other pages do not pay for it. The toggle code and the tick store load on the first click, so the program page ends at 183.4 initial and 237.4 until idle, inside its old row (238).
// 2026-10-02 (M4b): Compare. The page is new: 186.9 initial, 249.9 until idle with two saved programs
// (its view model is a lazy chunk, like the plan's); its ratchet is that rounded up plus 3 KB. The
// other pages grew by at most 0.3 KB until idle (My matches and the plan page carry the Compare entry points).
// 2026-10-04 (recurring deadlines + Compare together): the owner raised two rows by 1 KB with this reason.
// Each change fit its row alone (Compare: matches 191.8 initial, program 237.7 until idle; recurring
// deadlines added about 0.1 KB after reusing an icon and collapsing the icon elements), but merged they
// measure matches 192.1 initial and program 238.1 until idle on Linux CI and locally. New rows:
// matches initial 193 (was 192), program until idle 239 (was 238). Nothing else moved.
// 2026-10-05 (route funding guidance, PR #14): the program page grew 0.5 KB (183.6 -> 184.1 initial,
// 238.6 -> 239.0 until idle on the fixture build, same on Linux CI) because sourceHostname now decodes
// punycode (src/lib/punycode.ts, about 0.5 KB gzip) so the BAföG source badge reads www.bafög.de instead of
// www.xn--bafg-7qa.de (the ASCII alias does not resolve); SourceBadge is shared, so the decoder is in the
// client chunk. The guidance block itself is server-rendered and adds nothing. Raised by 1 KB with that
// reason: program initial 184 -> 185, until idle 239 -> 240. Nothing else moved.
// 2026-10-08 (official fee range, ADR 0010): the profile and matches pages measure 216.27 KB until idle
// (216.0 before) on the fixture build, because the tuition range code is client-reachable there:
// tuitionBounds and the incomeBased flag in the cost domain, formatTuition in format.ts, TuitionBasisNote
// in MatchCard and the longer compare-row signature (about 0.3 KB gzip together). Owner decision: raise by
// 1 KB with that reason: profile, matches and the home page (it prefetches their chunks, so it reads
// 215.1 to 216.27 depending on timing) until idle 216 -> 217. Nothing else moved.
// 2026-10-07 (scholarships page): new page, 170.2 KB initial, 221.4 KB until idle (fixture build); ratchet is measured rounded up plus 3 KB. The header's fourth item added 0.0 to 0.1 KB to the other rows, all inside their existing values.
// 2026-10-11 (product-surfaces redesign, ADR 0008): the four product surfaces gained their page
// band and the matches band status summary (client), and profile.ctaNote is a client-reachable string.
// The band's other two new strings, scholarshipsPage.eyebrow and plan.eyebrow, render in the
// server-rendered band and add no client JS. The prefetched page chunks grew about 0.5 KB, so the
// until-idle rows moved just past their ratchets (fixture build: /fr 218.6, profile 218.6, matches
// 218.6, plan 245.7, compare 253.4); the initial rows did not move. Owner decision (this session):
// raise the affected until-idle rows by 1 KB, the /ar rows by symmetry with /fr (same pages). Nothing
// else moved.
// 2026-10-12 (home hero demo): the hero's interactive "try it" demo became a server-rendered,
// self-running reveal, so the home no longer ships its lazy client island and the shared chunks
// re-partitioned. On the fixture build the home initial measured 170.2 (ratchet 170) and the program
// page until-idle 242.5 (ratchet 240), deterministically and within the 5% browser-vs-build
// cross-check. Owner decision: raise only the affected rows -- home initial 170 -> 172 and program
// until-idle 240 -> 244, in /fr and /ar by symmetry. Nothing else moved.
export const JS_BUDGET_KB: Record<string, JsBudget> = {
  "/fr": { initial: 172, untilIdle: 220 },
  "/ar": { initial: 172, untilIdle: 220 },
  "/fr/profile": { initial: 187, untilIdle: 220 },
  "/ar/profile": { initial: 187, untilIdle: 220 },
  "/fr/matches": { initial: 195, untilIdle: 219 },
  "/ar/matches": { initial: 195, untilIdle: 219 },
  "/fr/plan": { initial: 189, untilIdle: 247 },
  "/ar/plan": { initial: 189, untilIdle: 247 },
  "/fr/compare": { initial: 190, untilIdle: 255 },
  "/ar/compare": { initial: 190, untilIdle: 255 },
  "/fr/scholarships": { initial: 174, untilIdle: 225 },
  "/ar/scholarships": { initial: 174, untilIdle: 225 },
  "/fr/programs/xx-test-prog-ok": { initial: 185, untilIdle: 244 },
  "/ar/programs/xx-test-prog-ok": { initial: 185, untilIdle: 244 },
};
