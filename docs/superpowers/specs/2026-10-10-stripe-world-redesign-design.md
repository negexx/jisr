# Stripe-world redesign — home + global shell — design spec

**Date:** 2026-10-10
**Status:** Implemented.
**Owner decisions:** world = adopt Stripe (B); scope = home + global shell (B); interactivity = hero mini-demo + journey micro-interactions (A+C); palette = full Stripe, teal reserved for "official" (A); typography = Geist at thin weights (A); approach = Gradient-First (1).

## Goal

Raise Jisr's visual craft from the incumbent "Plain Bridge" (warm paper, flat, teal, deliberately plain) to a **Stripe-grade** system — confident, atmospheric, tactile — across the **landing page and the global shell**, so the product reads as modern and "catchy" without becoming hype. Add two kinds of genuine interactivity: a **hero match mini-demo** that shows the real product, and **journey micro-interactions** that reward every touch.

"More visually appealing and aggressive and catchy, but not too much." The Stripe world is chosen precisely because its punch is *craft* (gradient, thin display type, depth, motion), not marketing gloss.

## Non-negotiable — what does NOT change (product truth)

These are trust semantics, not looks; the redesign must preserve them exactly:

- Every important fact keeps its **`SourceBadge`**: info kind (official / estimate / guidance), official https link, last-verified date.
- The three **fact kinds stay visually distinct** so an estimate can never pass for an official figure ("Never-Official" rule). Teal filled shield = official; dashed cream + calculator = estimate; grey outline + info = guidance.
- **Match status** maps to icon + colour + words in `MatchStatusBadge` only (✅ satisfied / ⚠️ check / ❌ not_satisfied; foundation-year = own wording). Colour is never the sole carrier.
- Honest uncertainty: missing / stale / unofficial is never rounded to a yes or no. Costs are ranges (10-month assumption); tuition is an official fee or "to be checked". Dates DD/MM/YYYY; money via `Intl` (EUR primary).
- **Trilingual fr / en / ar, RTL-native.** Logical utilities only (`ms-/me-/ps-/pe-/text-start/start-/border-s`), mirrored directional icons (`rtl:rotate-180`), Latin names/URLs/numbers isolated in `<bdi>`, Noto Sans Arabic for `ar` with the larger root/leading.
- **Voice rule:** plain, calm, honest; no hype, no guarantees, never "eligible"/"admitted" as a promise, no percentages/testimonials/usage statistics.
- **Privacy:** nothing personal in URLs, logs or analytics.

## Decisions (locked in brainstorming)

1. **World = replace, not refine.** DESIGN.md is rewritten as a new visual world. The incumbent "Plain Bridge" is kept as evidence/anti-reference. Product truth and content are preserved; the *look* is replaced.
2. **Scope = home + global shell.** The landing page and the shell every page inherits (header, nav, locale switcher, footer) plus the shared token/primitives system (buttons, badges, cards, inputs). The six Operate surfaces (Profile, Matches, Program, Scholarships, Compare, Plan) keep their layout and information architecture and **only inherit the new tokens** in this pass.
3. **Palette (full Stripe; teal = official only).**
   - Text: navy ink `#0d253d`, secondary `#273951`, muted `#55637a` (raised from the mockup's first pass for AA).
   - Accent: electric indigo `#533afd` (deep `#4434d4`, press `#2e2b8c`, soft `#665efd`) — the single accent for links, primary buttons, current nav, focus.
   - Surfaces: canvas `#ffffff`, soft `#f6f9fc`, hairline `#e3e8ee`; dark band navy `#1c1e54`.
   - **Teal `#0f766e` is reserved for the "official" fact-kind only** (a trust semantic, not brand). Match green/amber/red keep their meaning.
4. **Typography = Geist, one face.** Thin 300 for the display headline with tight tracking (`-0.03em`), 400/500/600 for UI. Noto Sans Arabic unchanged. No second face, no new font file, no new font dependency.
5. **Structure = Gradient-First (approach 1).** An atmospheric indigo→lilac→magenta mesh fills the top ~55vh and slowly drifts, fading into the page; a thin display H1 and one indigo pill CTA sit over it; the hero mini-demo floats at the gradient's edge as a near-white card; the body uses soft-canvas question cards; **one** full-bleed dark navy band carries the trust story/legend; the footer is light.
6. **Interactivity = A + C.**
   - **A — hero mini-demo:** segmented controls (Filière, Domaine) and a Moyenne slider drive a match card's status and reason live.
   - **C — journey micro-interactions:** animated current-nav underline, button hover lift, card hover lift, a single soft reveal. All CSS-first.
7. **Motion budget:** 150–220 ms, `cubic-bezier(.2,.8,.2,1)`, colour/transform only; one soft page-load reveal, no choreography; **no motion library**; everything cut under `prefers-reduced-motion`.

## Architecture and files

A replacement world touching tokens, the shell, the home, and the shared primitives. Indicative paths (the plan will finalise them):

- **`DESIGN.md`** — replaced: new frontmatter (colours, typography, rounded, spacing, shadows, components) + rewritten sections, keeping the trust rules (source-always, one-mapping, never-official, words-beside-colour).
- **`src/app/globals.css`** — Tailwind v4 `@theme` tokens: new colour set, a **shadow scale** (the incumbent bans shadows; the new world allows soft depth), new radii, a display type scale, spacing. RTL base and base styles preserved.
- **Shell** — `src/components/site-header.tsx`, `nav-links.tsx`, `locale-switcher.tsx`, `site-footer.tsx`: frosted sticky header, pill locale switcher, animated nav underline, restyled footer. Server components; keep the client leaves minimal.
- **Primitives** — `src/components/ui/button.tsx` (pill, indigo, shadow), plus card/badge/input styling used by the home and inherited site-wide.
- **Trust primitives** — `SourceBadge`, `MatchStatusBadge`: re-skinned to the new palette, **same semantics and the one-mapping rule unchanged**.
- **Home** — `src/app/[locale]/page.tsx` plus new `src/components/home/hero-demo.tsx` (client leaf) and section components (questions, trust band).
- **Messages** — `messages/{en,fr,ar}.json`: new keys for hero, demo, trust band; all three locales in the same change.

## Data flow — the hero demo (honest and light)

- The demo is a small **client leaf** using the island message-pick pattern (`pickMessages`, explicit `locale`), so it takes its strings as props and adds no new i18n coupling.
- The demo runs the **real pure `src/domain` matching** on a tiny **curated set of real programmes** (≈4–6) whose facts (name, institution, city, teaching language, tuition, rules, sources, dates) are **copied verbatim from `data/`** and bundled in the leaf. Card facts carry their real `SourceBadge`.
- **A test asserts the bundled demo facts match the shipped `data/` records** (slug by slug), so the demo can never drift into a fabrication. A visible "illustrative snapshot" note is shown.
- No network request and no snapshot fetch on the home: the demo is self-contained and small. The real journey (Profile → Matches → …) is unchanged and still the only path that loads the snapshot.

## Constraints, risks and mitigations

- **JS budget (ADR 0008 + Playwright ratchet — the binding risk).** The home gains a client leaf; `/fr` and the home's until-idle row are near their ratchet. Mitigations: **zero new dependencies**, tiny curated demo data, strings passed from the server, no snapshot fetch. The plan must run `pnpm perf:js` and the e2e perf spec; if the home exceeds its ratchet, that is an **owner decision** (raise with a written reason) and the plan must surface it, not silently exceed.
- **Gradient legibility / "not too much".** One gradient, one dark band, muted drift; check text contrast over the mesh (the mockup's first pass had a contrast miss, fixed). All text over the gradient stays AA.
- **RTL and Arabic.** The mesh, reveals and any directional icon mirror correctly; Arabic leading/root preserved; verified in `ar` visually.
- **Trust drift.** The temptation to restyle estimates/official is the exact failure mode; the Never-Official rule and the `MatchStatusBadge` one-mapping rule are acceptance checks.
- **Slow connections / phone-first.** Shadows and gradients are cheap; no image assets are added (no logo, no photos). Motion is GPU-cheap transform/opacity.
- **The mockup is throwaway** (`stripe/home-mockup.html`); it is not shipped.

## Out of scope (documented, not forgotten)

- The six Operate surfaces' layout/IA (they only inherit tokens in this pass; a later plan reworks them if wanted).
- Accounts / phase 2; any new copy claims; a logo; testimonials or usage figures; dark mode; a second typeface; a motion library.
- Product behaviour, the journey, data, matching logic, and every trust semantic.

## Success criteria (verifiable)

1. The home and the shell render in the new world in **fr and ar** (RTL correct) at **phone and desktop**, verified in a browser.
2. Trust semantics intact: every fact carries its source badge; the three fact kinds are distinct; match status is icon + colour + words in one component; nothing rounded up.
3. Accessibility: WCAG AA contrast on all text (including over the gradient); status never colour-alone; keyboard operable; labelled controls.
4. The hero demo runs on real `data/` facts, is labelled illustrative, and its bundled facts are asserted equal to the shipped records.
5. Motion reduced under `prefers-reduced-motion`.
6. `pnpm typecheck`, `pnpm test`, `pnpm lint` green; `pnpm perf:js` and the e2e perf ratchet **not exceeded** (or an owner decision recorded in the plan).
7. `DESIGN.md` replaced and consistent with the shipped tokens; the trust rules restated in it.
8. All new strings exist in fr/en/ar; the forbidden-wording and trust-wording i18n tests pass.

## Deliverables

- New `DESIGN.md` and the token system in `globals.css`.
- Restyled shell + primitives + trust primitives.
- The redesigned home with the interactive hero demo and the trust band.
- New message keys in three locales.
- The throwaway mockup (not shipped).
