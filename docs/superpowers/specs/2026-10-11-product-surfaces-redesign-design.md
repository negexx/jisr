# Product-surfaces redesign — Profile / Matches / Scholarships / Plan — design spec

**Date:** 2026-10-11
**Status:** Approved (design). Implementation to follow via `writing-plans`.
**Owner decisions:** depth = visual + layout polish, information and flows unchanged (B); atmosphere = one subtle band per page, a fading indigo wash (B); shared components = uplift them, Program and Compare inherit (A); design system = extend it with documented new pieces (A); Profile wizard = band + quiet form (A).
**Supersedes/continues:** the 2026-10-10 Stripe-world redesign (`docs/superpowers/specs/2026-10-10-stripe-world-redesign-design.md`) migrated the home, shell and primitives and left the six Operate surfaces on old markup. This spec migrates four of them (Profile, Matches, Scholarships, Plan) and, by uplifting the shared components, also lifts Program and Compare.

## Goal

Bring the four product surfaces up to the shipped "Gradient Bridge" world so they read as confident and crafted as the landing page — without changing product truth, information architecture, flows, or trust semantics. "More catchy and more visually appealing" means *craft* (band, elevation, thin display type, pill buttons, motion), not gloss.

## Non-negotiable — what does NOT change

- **Trust semantics frozen.** Every fact keeps its `SourceBadge` (kind + official link + verified date); official/estimate/guidance stay visually distinct (teal filled = official, dashed cream = estimate, grey = guidance); **match status maps to icon+colour+words in `MatchStatusBadge` only**; missing/stale/unofficial is never rounded to a yes/no. Status summary counts are rendered **through `MatchStatusBadge`**, never a second mapping.
- **Test hooks preserved.** Every `data-slot`, `data-group`, `data-slug`, `data-testid`, `data-state`, `data-freshness` attribute stays; the component and e2e specs select on these, not on classes.
- **Information architecture and flows unchanged** (owner decision B): the same sections, order, grouping and actions on each page.
- **Trilingual fr/en/ar, RTL-native.** Logical utilities only (`ms-/me-/ps-/pe-/text-start/start-/end-/border-s`), mirrored directional icons (`rtl:rotate-180`), Latin names/URLs/numbers in `<bdi>`, Noto Sans Arabic for `ar`. Any new user-facing string exists in all three locales in the same change (real `ar`, no `TODO`).
- **Voice rule.** Plain, calm, honest; no hype, no guarantees, no percentages/testimonials; no em/en dashes; French no-break space before `: ? ! ;`.
- **JS-neutral.** The rework adds no new client JS: new shared pieces are server components; motion is CSS; the demo-style lazy pattern is not needed here. The `tests/e2e/support/js-budget.ts` ratchet only goes down.
- **No new dependencies.** Geist + Noto Sans Arabic only; CSS-only motion cut under `prefers-reduced-motion`.

## Decisions (locked in brainstorming)

1. **Page band — fading wash (B).** Each product page opens with a full-width band: a soft indigo wash that fades into the canvas (one gradient per page), a 1px hairline bottom, an optional eyebrow, the thin display title (`font-light`, `-0.03em`), an optional lead, and a slot for a status summary. On the canvas: the fading wash, never the home mesh.
2. **Cards — soft card (A).** The match/scholarship/step surfaces become a soft card: canvas fill, 1px hairline, ~17px radius, `shadow-sm` at rest → `shadow-md` on hover, indigo title, hairline-divided fact rows, pill actions. This is the design system's documented card, applied consistently.
3. **Composition — band with a status summary (B).** On Matches the band also carries the result counts as status chips (icon + words, via `MatchStatusBadge`). Scholarships and Plan carry an equivalent one-line summary (count / saved-and-progress). Profile's band carries only title + the on-device note.
4. **Wizard — quiet form (A).** Profile keeps the step on the canvas: step label + four indigo progress segments, 48px choice rows with the indigo-wash selected state, sticky footer (outline Back + indigo pill Continue). No carded step.
5. **Extend the design system (documented).** New shared pieces (`PageBand`, `StatusSummary`) and any new tokens are recorded in `DESIGN.md`; the world's rules (one gradient per page, One Voice, Soft-Depth, Fixed Scale, Status-Is-Status) continue to bind.
6. **Uplift shared components.** `MatchCard`, `CostBreakdown`, `ReasonList`, `DeadlineStatus`, `TuitionBasisNote`, `DisclosureChevron`, `EmptyState`, the skeletons and the page-specific containers are restyled; Program and Compare inherit the new look.

## Architecture and files

A class-string migration plus two small server components. No logic, no new client JS, no data change.

- **New** — `src/components/page-band.tsx` (`PageBand`), `src/components/status-summary.tsx` (`StatusSummary`).
- **Restyled shared** — `src/components/match-card.tsx`, `cost-breakdown.tsx`, `reason-list.tsx`, `deadline-status.tsx`, `tuition-basis-note.tsx`, `disclosure-chevron.tsx`, `empty-state.tsx`.
- **Restyled page-specific** — `src/components/profile/chrome.tsx` (+ wizard steps where they carry their own chrome), `matches/matches-client.tsx`, `matches/group-section.tsx`, `matches/profile-summary.tsx`, `matches/hidden-programs.tsx`, `matches/matches-states.tsx`, `matches/matches-skeleton.tsx`, `scholarships/scholarships-page-view.tsx`, `scholarships/scholarship-card.tsx`, `plan/plan-client.tsx`, `plan/program-plan.tsx`, `plan/program-switcher.tsx`, `plan/step-row.tsx`, `plan/plan-states.tsx`.
- **Pages** — `src/app/[locale]/{profile,matches,scholarships,plan}/page.tsx` gain the band and the title step; the server wrappers stay server components.
- **Docs** — `DESIGN.md` gains the band, status summary, summary strip and the refreshed card/states vocabulary.

## Constraints, risks and mitigations

- **JS budget (ADR 0008).** The rework is class-only plus server components; `pnpm perf:js` and the e2e ratchet must not move. If a new piece would add client JS, it becomes a server component instead.
- **Test-hook drift.** Restyling must not rename or drop a `data-*` hook; the component tests and e2e select on them. The tokens and logical-direction guards must stay green.
- **Shared-component blast radius.** Restyling `SourceBadge`/`KindPill`/`MatchStatusBadge`/`ExternalLink`/`LocalizedDataText`/`ui/button` reaches Program, Compare and Home; these are already in the world and get cosmetic polish only, kept output-compatible so their tests pass.
- **RTL / Arabic.** Verify every surface in `ar` (mirroring, `<bdi>`, larger leading), not only `fr`.
- **The band's wash legibility.** Text over the wash stays AA; the wash is one gradient fading to canvas, never a saturated field.

## Out of scope (documented, not forgotten)

- Information-architecture changes, new sections, new copy claims, new data, accounts/phase 2, dark mode, a second typeface, a motion library, imagery.
- The Home, shell, primitives, Program and Compare pages themselves (they inherit the shared uplift only).
- Any change to matching, costs, eligibility, checklist logic, snapshots or `src/domain`.

## Success criteria (verifiable)

1. The four surfaces render in the new world in **fr and ar** (RTL correct) at **phone and desktop**, verified in a browser.
2. Trust semantics intact: every fact carries its source badge; the three fact kinds are distinct; match status is icon + colour + words in one component; the status summary uses `MatchStatusBadge`; nothing rounded up.
3. Accessibility: WCAG AA contrast on all text (including over the band); status never colour-alone; keyboard operable; labelled controls.
4. Every existing component and e2e test stays green; the preserved `data-*` hooks are intact.
5. Motion reduced under `prefers-reduced-motion`; logical utilities only.
6. `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm data:check`, `pnpm build`, `pnpm perf:js` and `pnpm test:e2e` green; the JS ratchet not exceeded.
7. `DESIGN.md` updated and consistent with the shipped components; the trust rules restated.
8. All new strings exist in fr/en/ar; the forbidden-wording and trust-wording i18n tests pass.
