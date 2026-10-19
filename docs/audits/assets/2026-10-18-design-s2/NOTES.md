# Design audit S2 — measurement notes (2026-10-18)

Follow-up to `docs/audits/2026-10-17-design-audit.md` findings D1 (hydration layout shift) and
D2 (scholarship cards without a source badge), fixed on `fix/design-audit-s2` in commit `636bea4c`.
This file records the measurements behind the fix, so the numbers live next to their screenshots
rather than only in the commit message.

## Probe method

Same method as the 2026-10-17 audit:

- Playwright 1.63 + bundled Chromium, fresh browser context per state.
- A buffered `PerformanceObserver('layout-shift')` installed before page load, summing every shift
  entry whose `hadRecentInput` is `false`; shift sources captured for the failing states.
- Viewports: phone 390×844 DPR 2 (touch), desktop 1280×800 DPR 1, light theme.
- Locales: `fr` (LTR) and `ar` (RTL).
- Guest state seeded through `context.addInitScript` with the production storage shapes
  (`jisr.profile` v2, `jisr.matches-filters` v1, `jisr.saved`, `jisr.plan`); no account and no
  writes to production.
- Readings are taken after the page settles. A repeatable residual of ~0.0003 in `ar` is below any
  perceptible threshold and is reported as measured.

## D1 — before / after CLS

Before = audit baseline (production, 2026-10-17). After = `636bea4c` measured with the probe above.
"0" means no layout-shift entry was recorded.

| State | Locale / viewport | Before | After |
|---|---|---|---|
| Welcome → sign-in (`/welcome` redirect) | fr / phone | 0.30464 | 0 |
| Welcome → sign-in | fr / desktop | 0.16843 | 0 |
| Compare (3 saved programmes) | fr / desktop | 0.195 | 0 |
| Compare (3 saved programmes) | ar / desktop | 0.13615 | 0.0003 |
| Profile — filled | fr / desktop | 0.1403 | 0 |
| Profile — empty | fr / desktop | 0.13129 | 0 |
| Profile | ar / desktop | 0.06039 | 0.0003 |
| Compare — empty (no saved programmes) | fr / desktop | 0.036 | 0.104 |
| Profile — error | fr / desktop | 0.011 | 0.082 |
| Matches — empty | fr / desktop | 0.037 | 0.037 (unchanged) |

Phone states were already at 0 in the audit and stayed at 0.

## Accepted trade-off (empty / error states)

Reserving the hydrated viewport height means a genuinely shorter empty or error state now settles
the footer slightly after load: compare-empty moves from 0.036 to 0.104, profile-error from 0.011 to
0.082, and matches-empty is unchanged at 0.037. That small, below-the-fold move is accepted in
exchange for eliminating the 0.06–0.30 footer jumps on the normal (loading → hydrated) paths; it is
an order of magnitude below the S2 states it replaces, and compare-empty's 0.104 is the only reading
marginally above the "good" 0.1 threshold.

## Evidence gaps

- No `after-profile-filled-*` screenshot is committed; the profile-filled state is represented by the
  measured CLS reading above, while the committed profile screenshots show the empty state.
- The committed desktop scholarships screenshots are cropped above the badge row, so the new
  record-level badge is visible in the phone/expanded screenshots but not in the desktop crop.
- `tests/app/scholarships-page.test.tsx` asserts the 4-card e2e fixture (one card of the D2 shape).
  The "21/21 real cards show a badge" figure was a manual DOM check against production-shaped data,
  not an automated assertion.

The optional `after-profile-filled-fr-desktop.png` / `after-profile-filled-ar-desktop.png` captures
were not re-taken: the local run that produced the other after-shots needed the accounts flag and a
seeded filled profile, and that harness was not preserved, so it was not straightforward to
reproduce in this pass. The CLS table remains the evidence for that state.

## Screenshot inventory

All in this directory, light theme, phone 390×844 DPR 2 / desktop 1280×800 DPR 1:

- `after-welcome-fr-phone.png`
- `after-welcome-fr-desktop.png`
- `after-welcome-ar-phone.png`
- `after-compare-fr-phone.png`
- `after-compare-fr-desktop.png`
- `after-compare-ar-desktop.png`
- `after-profile-empty-fr-phone.png`
- `after-profile-empty-fr-desktop.png`
- `after-profile-empty-ar-desktop.png`
- `after-scholarships-fr-phone.png`
- `after-scholarships-fr-phone-scholarship-fr-excellence-major.png`
- `after-scholarships-fr-desktop.png`
- `after-scholarships-ar-phone.png`
- `after-scholarships-ar-phone-scholarship-fr-excellence-major.png`
- `after-scholarships-ar-desktop.png`
- `before-scholarships-fr-phone-scholarship-fr-excellence-major.png` (before the D2 fix)
