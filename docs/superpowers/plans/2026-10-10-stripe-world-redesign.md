# Stripe-world redesign (home + global shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Jisr's "Plain Bridge" look with a Stripe-grade visual world on the landing page and the global shell, and add a hero match mini-demo plus journey micro-interactions, without changing product truth or trust semantics.

**Architecture:** New design tokens (`globals.css` `@theme`/`:root`) drive a restyled shell and primitives; the home gains a server-rendered hero/questions/trust-band and one small client leaf (the demo) that reuses the pure `src/domain` matching on a curated bundle of real programme facts, lazily loaded so the home JS budget holds.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (`@theme`), next-intl (fr/en/ar RTL), Vitest + Testing Library (jsdom per file), Playwright (a11y + perf ratchet), `src/domain` (pure matching), Biome.

**Spec:** `docs/superpowers/specs/2026-10-10-stripe-world-redesign-design.md`

## Global Constraints

- **Trust semantics frozen:** every fact keeps its `SourceBadge` (kind + official link + verified date); official/estimate/guidance stay visually distinct (teal filled = official, dashed cream = estimate, grey = guidance); match status maps to icon+colour+words in `MatchStatusBadge` only; missing/stale/unofficial never rounds to a yes/no.
- **Palette:** navy ink `#0d253d`; secondary `#273951`; muted `#55637a`; accent indigo `#533afd` (deep `#4434d4`, press `#2e2b8c`); dark band `#1c1e54`; canvas `#ffffff`; soft `#f6f9fc`; hairline `#e3e8ee`; **teal `#0f766e` reserved for the "official" fact-kind only**. Match green/amber/red keep their meaning. No `#000`/`#fff`. Tokens authored in `oklch()` in `:root` (the file's existing format).
- **Typography:** Geist only (200/300 display with tracking `-0.03em`, 400/500/600 UI); Noto Sans Arabic for `ar`; no second face, no new font dependency.
- **RTL:** logical utilities only (`ms- me- ps- pe- text-start start- end- border-s`), mirror directional icons with `rtl:rotate-180`, isolate Latin in `<bdi>`; enforced by `tests/design/logical-direction.test.ts`.
- **Client boundary:** client-reachable code imports no `zod` and nothing from `@/data-schema/*` at runtime except `@/data-schema/dates` and `@/data-schema/staleness` (type-only imports are fine) — `tests/lib/client-imports.test.ts`.
- **No new dependencies.** Motion is CSS-only; `prefers-reduced-motion` disables it.
- **i18n:** every new string in fr/en/ar (same keys); `ar` draft may use the fr text with a `TODO-translate` prefix; no eligibility/guarantee wording, no em/en dashes, no ICU number formatting; French no-break space before `: ? ! ;`.
- **JS budget:** `tests/e2e/support/js-budget.ts` ratchet only goes down; home rows are `"/fr"` 170 / `"/ar"` 170 (initial) and 217 (untilIdle). The demo must **lazy-load** so the home stays within budget; if it cannot, a dated owner decision is required (ADR 0008).
- **Commands:** `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm data:check`, `pnpm build`, `pnpm test:e2e`, `pnpm perf:js`.

## Review Focus

1. **An estimate or guidance fact rendered with the official treatment** (teal fill / shield) — the never-official rule; a redesign must not blur them.
2. **A status shown by colour alone**, or the match mapping re-implemented outside `MatchStatusBadge` — accessibility + the one-mapping rule.
3. **A clock- or profile-dependent value in the static home HTML** (status, freshness, "your results") — must be a client leaf with a neutral server placeholder (`tests/app/home-page.test.tsx`, `tests/components/home-matches-link.test.tsx`).
4. **The home JS budget silently exceeded** by the demo — measure `pnpm perf:js` / `pnpm test:e2e`.
5. **Physical-direction classes or Arabic-Indic digits** slipping into the new shell/home in `ar`.

---

### Task 1: Design tokens + DESIGN.md (the world)

**Files:**
- Modify: `src/app/globals.css`
- Modify: `tests/design/tokens.test.ts` (expected pairs / OKLab families)
- Replace: `DESIGN.md`

**Interfaces:**
- Produces: CSS custom properties in `:root` (`--background --foreground --card --primary --primary-foreground --secondary --muted --muted-foreground --border --input --ring --status-{ok,check,fail}{,-fg,-bg,-border} --kind-{official,estimate,guidance}{,-bg}`) and the `@theme inline` `--color-*` mappings; a new `--shadow-*` scale and display text steps in `@theme`.

- [ ] **Step 1: Author the new `:root` palette in `oklch()`** mapping the hex values above; keep `--status-*` semantics, set `--kind-official`/`--kind-official-bg` to the teal `#0f766e`/`#e6f4f2`; add `--color-navy`, `--color-canvas-soft`, `--shadow-sm|md|lg` tokens and a display type step (e.g. `--text-display: 3.5rem`).
- [ ] **Step 2: Update `tests/design/tokens.test.ts`** so the text-pair contrast list matches the new tokens (run `pnpm test tests/design/tokens.test.ts`; every listed pair ≥4.5:1 text, ≥3:1 non-text; no pure black/white; keep the OKLab separation assertions between `kind-estimate` and `status-check`/`kind-official`/`kind-guidance`).
- [ ] **Step 3: Run the token test.** Run: `pnpm test tests/design/tokens.test.ts` — Expected: PASS.
- [ ] **Step 4: Replace `DESIGN.md`** with the new world: same trust rules (Source-Always, One-Mapping, Never-Official, Words-Beside-Colour), new palette/typography/elevation (soft shadows now allowed)/components sections, and a note that The Plain Bridge is superseded.
- [ ] **Step 5: Commit** `feat: adopt the Stripe-world design tokens`.

### Task 2: Primitives — Button, cards, trust primitives

**Files:**
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/source-badge.tsx`
- Modify: `src/components/match-status-badge.tsx`
- Test: `tests/components/match-status-badge.test.tsx`, `tests/components/source-badge.test.tsx` (add if absent), `tests/design/logical-direction.test.ts`

**Interfaces:**
- Keeps: `Button`/`buttonVariants` (same export), `SourceBadge({meta, variant, label, basisText})`, `MatchStatusBadge({group, size})` — **signatures unchanged**.

- [ ] **Step 1: Restyle `Button`** to a pill (`rounded-full`), 48px, indigo primary with a soft shadow and `-translate-y-px` hover; outline stays hairline; keep all size/variant names and the `cn()` merge.
- [ ] **Step 2: Restyle `SourceBadge`** pills to the new tokens (official/estimate/guidance classes only — icons and the three shapes unchanged). Do not touch `factMetaOf`, `FreshnessMark`, or the wording logic.
- [ ] **Step 3: Restyle `MatchStatusBadge`** tones to `status-*` tokens; icons/text/mapping unchanged.
- [ ] **Step 4: Run** `pnpm test tests/components tests/design/logical-direction.test.ts` — Expected: PASS (no physical utilities; status hidden-text assertions still hold).
- [ ] **Step 5: Commit** `refactor: restyle buttons and trust primitives to the new world`.

### Task 3: Global shell — header, nav, locale switcher, footer

**Files:**
- Modify: `src/components/site-header.tsx`, `src/components/nav-links.tsx`, `src/components/locale-switcher.tsx`, `src/components/site-footer.tsx`
- Test: `tests/components/nav-links.test.tsx`, `tests/components/locale-switcher.test.tsx` (add if absent), `tests/app/home-page.test.tsx`

**Interfaces:**
- Keeps: `NavItem`, `NavLinks({label, items})`, `LocaleSwitcher({current, label, names})`, `SiteHeader({locale})`, `SiteFooter({locale})` — **unchanged**. Client leaves still receive strings as props (`messages={null}` root).

- [ ] **Step 1: Header**: sticky, translucent (`bg-white/70 backdrop-blur`), hairline bottom border, 64px bar, `Jisr جسر` wordmark; keep passing `label`/`items` to `NavLinks` (server → client props).
- [ ] **Step 2: NavLinks**: animated indigo current underline (`after:` pseudo, logical `inset-inline`); hover fill `--color-canvas-soft`; keep `aria-current`, the saved-count badge and the `prefetch` logic verbatim.
- [ ] **Step 3: LocaleSwitcher**: pill group (soft track, current = white pill + soft shadow) using logical utilities; keep `aria-current`, `lang`/`hrefLang`, `prefetch` logic.
- [ ] **Step 4: Footer**: light (`--color-canvas-soft`), keep every string/`ClearDataButton` prop unchanged.
- [ ] **Step 5: Run** `pnpm test tests/components tests/app/home-page.test.tsx` — Expected: PASS.
- [ ] **Step 6: Commit** `refactor: restyle the global shell`.

### Task 4: Home message keys (fr/en/ar) + home-messages test

**Files:**
- Modify: `messages/fr.json`, `messages/en.json`, `messages/ar.json`
- Create: `tests/i18n/home-messages.test.ts`

**Interfaces:**
- Produces: new `home.*` keys used by Tasks 5, 6, 8 (hero eyebrow/headline/sub, trust band, demo labels/reasons/status words). Keys added to all three locales in the same change.

- [ ] **Step 1: Write `tests/i18n/home-messages.test.ts`** modelled on `tests/i18n/scholarships-messages.test.ts` (uses `namespaceMessages`, `placeholderNames`, `FORBIDDEN`, `LOCALES`; asserts key parity with fr, no forbidden wording, no em/en dash, no ICU number formatting, no Arabic-Indic digits under `ar-EG`, same placeholders as fr). Include the new demo/reason keys.
- [ ] **Step 2: Run** `pnpm test tests/i18n/home-messages.test.ts` — Expected: FAIL (keys missing).
- [ ] **Step 3: Add the keys to fr, then en, then ar** (ar may carry `TODO-translate` + fr text). The demo reason strings must name the status in words (e.g. `home.demo.reason.met`, `.missingSubject`, `.averageBelow`) and never promise admission.
- [ ] **Step 4: Run** `pnpm test tests/i18n tests/i18n/messages.test.ts` — Expected: PASS (key parity + no empty across all three catalogues).
- [ ] **Step 5: Commit** `feat(home): add the redesigned home message keys`.

### Task 5: Home hero + questions + trust band (server)

**Files:**
- Modify: `src/app/[locale]/page.tsx`
- Create: `src/components/home/hero.tsx`, `src/components/home/questions.tsx`, `src/components/home/trust-band.tsx`
- Test: `tests/app/home-page.test.tsx`

**Interfaces:**
- Consumes: `home.*` keys (Task 4), tokens (Task 1), `SourceBadge`/`MatchStatusBadge` (Task 2).
- Produces: `Hero({demo})` where `demo` is the client leaf from Task 7 (passed as a child/prop); the page stays a Server Component and sets `setRequestLocale(locale)`.

- [ ] **Step 1: Extend `tests/app/home-page.test.tsx`** to assert the hero headline, the trust-band legend (three fact-kind labels + the status legend), and the four question titles render in fr/en/ar; assert the static HTML contains **no** `data-freshness` and no clock/profile claim (mirror the program-page test).
- [ ] **Step 2: Run** `pnpm test tests/app/home-page.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Build `hero.tsx`** (gradient-mesh background via CSS custom props, thin `text-display` h1, lead, one indigo primary CTA + secondary, the "stays on this device" note) — server component, no clock/profile. **Build `questions.tsx`** (four cards) and **`trust-band.tsx`** (dark navy band with the fact-kind `SourceBadge` examples and the `MatchStatusBadge` legend, illustrative rows).
- [ ] **Step 4: Recompose `page.tsx`** to render Hero (with a slot for the demo), Questions, TrustBand.
- [ ] **Step 5: Run** `pnpm test tests/app/home-page.test.tsx tests/design/logical-direction.test.ts` — Expected: PASS.
- [ ] **Step 6: Commit** `feat(home): render the gradient hero, questions and trust band`.

### Task 6: Demo data fixture — extracted from real `data/`

**Files:**
- Create: `scripts/data/demo-fixture.ts` (extractor) or `scripts/import/demo-fixture.ts`
- Create: `src/components/home/demo-data.ts` (generated resolved fixture, committed)
- Create: `tests/components/home/demo-data.test.ts`

**Interfaces:**
- Produces: `DEMO_PROGRAMS: Program[]`, `DEMO_ROUTES: AdmissionRoute[]`, `DEMO_CORE: Pick<CoreShard,"credentialTypes"|"gradingScales"|"gradeConversions">` — **type-only imports** from `@/data-schema/resolved`/`snapshot` (no runtime data-schema, no zod).

- [ ] **Step 1: Write `tests/components/home/demo-data.test.ts`** asserting, per demo programme: `name`, `institution`, `city`, `field`, `teachingLanguages.value`, `tuition.value`, `officialUrl` equal the shipped `data/programs/<slug>.yaml` (read via `node:fs`), and each `requirements.rules[]` equals the record's rule. Assert `DEMO_ROUTES` has exactly one entry per demo programme with `outcome: "direct"` (see the ruling below).
- [ ] **Step 2: Run** `pnpm test tests/components/home/demo-data.test.ts` — Expected: FAIL.
- [ ] **Step 3: Write the extractor** that reads 3–4 chosen real programmes (recommended: `de-technische-hochschule-aschaffenburg-hrk333-software-design-internat-daad9225`, `de-friedrich-alexander-universitat-erlangen-hrk70-artificial-intelligence-daad9594`, a second CS/engineering record) and emits `demo-data.ts` with the resolved shapes. **Ruling to apply:** every real record has `requirements.coverage: partial`, which forces an `unknown` coverage reason and makes ✅ unreachable; the fixture therefore sets the demo programmes' `requirements.coverage` to `"complete"` (a documented, labelled illustrative override — no fact is invented, the card shows an "illustrative snapshot" note), and supplies a curated `direct`, condition-free route so all three statuses are reachable.
- [ ] **Step 4: Run the extractor**, then `pnpm test tests/components/home/demo-data.test.ts` — Expected: PASS; and `pnpm lint` (no physical/forbidden imports).
- [ ] **Step 5: Commit** `feat(home): add the extracted demo fixture for the hero demo`.

### Task 7: Hero demo — interactive client leaf

**Files:**
- Create: `src/components/home/hero-demo.tsx` (client), `src/components/home/hero-demo-card.tsx`
- Create: `src/components/home/demo-namespaces.ts`
- Test: `tests/components/home/hero-demo.test.tsx`

**Interfaces:**
- Consumes: `matchProgram`, `aggregateMatchStatus` (`@/domain/match`), `groupOf`, `topReasons` (`@/lib/journey/matches-view`), `MatchStatusBadge`, `SourceBadge`, `formatNumber` (`@/lib/format`), `DEMO_*` (Task 6), `pickMessages`.
- Produces: `HeroDemo({ copy })` — a client leaf; `copy` carries every string as props (no `useTranslations` for the shell, but a nested `NextIntlClientProvider` with `pickMessages(messages, DEMO_NAMESPACES)` is allowed since the demo uses `MatchStatusBadge`/`SourceBadge` namespaces).

- [ ] **Step 1: Write `tests/components/home/hero-demo.test.tsx`** (jsdom): render with `renderWithMessages`; the three controls exist; changing the track/field/average updates the status text; a below-threshold average yields the "not met" wording; `expectNoPhysicalDirection(container)`; no Arabic-Indic digits in `ar`; the status is never colour-alone (text present). Also a `renderToString` assertion that the **unhydrated** output contains no status claim and reserves height.
- [ ] **Step 2: Run** `pnpm test tests/components/home/hero-demo.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement `hero-demo.tsx`**: build a `Profile` from the controls, call `matchProgram({ profile, program: DEMO_PROGRAMS[i], routes: DEMO_ROUTES, reference: DEMO_CORE, now: todayIso() })`, `groupOf(match)` → render `MatchStatusBadge`, and a one-line reason from `home.demo.reason.*` keyed by the dominant reason code; render the card facts via `SourceBadge`. **Lazy-load** the domain + fixture with `await import(...)` on the first control interaction (keeps the home initial/until-idle budget); a static neutral placeholder (labelled "illustrative") is server-rendered.
- [ ] **Step 4: Run** `pnpm test tests/components/home/hero-demo.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(home): add the interactive hero match demo`.

### Task 8: Compose the home + budget check + DESIGN.md review

**Files:**
- Modify: `src/app/[locale]/page.tsx`
- Modify: `tests/e2e/support/js-budget.ts` (only if an owner decision is recorded)
- Modify: `docs/superpowers/specs/2026-10-10-stripe-world-redesign-design.md` (status → Implemented) if needed

- [ ] **Step 1: Mount `HeroDemo`** in the hero slot with its copy from the server (via `pickMessages` nested provider or props).
- [ ] **Step 2: Run the full static gate.** Run: `pnpm typecheck && pnpm test && pnpm lint` — Expected: green.
- [ ] **Step 3: Run the JS budget.** Run: `pnpm build && pnpm perf:js` and `pnpm test:e2e` — Expected: home `"/fr"`/`"/ar"` ≤ 170 initial / 217 until-idle. If exceeded because the demo is not lazy enough, either make it lazy or record a dated owner decision atop `tests/e2e/support/js-budget.ts` (ADR 0008) and raise only the home rows.
- [ ] **Step 4: Verify fr and ar in a browser** at phone and desktop widths (RTL mirrors; gradient legible; contrast AA; status never colour-alone).
- [ ] **Step 5: Commit** `feat(home): compose the redesigned home and verify the JS budget`.

---

## Self-review notes
- Spec coverage: world/tokens → T1; primitives/trust → T2; shell → T3; i18n → T4; hero/questions/trust-band → T5; demo data → T6; demo interactivity → T7; budget + fr/ar verify → T8. Every success criterion in the spec maps to a task.
- The two exploration traps are handled: `coverage: partial` (T6 ruling) and the `foundation` route short-circuit (T6 curated `direct` route).
- Out of scope (per spec): the six Operate surfaces' layouts, accounts, a logo, dark mode, a second font, a motion library.
