# Design / UI audit — 2026-10-17

- **Audited commit (baseline):** `f0cc00efed2f74e7e8a816ea59585d7462f4eebe` (branch `audit/scratch-shared`)
- **Target:** production `https://jisrr.org` (read-only). Deployed build: manifest `generatedAt` 2026-10-17T14:30:34Z, `snapshotVersion` `9b97c260f692`.
- **Method:**
  - Playwright 1.63 + Chromium (bundled) driven from Windows via `pnpm exec playwright test -c playwright.audit-ui.config.ts`; specs in `tests/audit-ui/` (T3-only, never CI).
  - Fresh browser contexts per state; guest state seeded with `context.addInitScript` writing real production key shapes (`jisr.profile` v2 MA bac profile, `jisr.matches-filters` v1, `jisr.saved` with the production `snapshotVersion`, `jisr.plan`); no account, no sign-in, no form submission, no writes to production.
  - Blocked-storage state simulated with an init script that makes `window.localStorage` throw `SecurityError` on access (same method as `tests/e2e/support/seed.ts` `blockLocalStorage`).
  - Axe: `@axe-core/playwright` 4.13, tags `wcag2a|wcag2aa|wcag21a|wcag21aa|wcag22aa`, one run per state (71 runs; the transient loading-skeleton state run without axe).
  - CLS: buffered `PerformanceObserver('layout-shift')` installed before load, sum of non-recent-input shifts; shift sources captured for the failing pages.
  - Touch targets: `getBoundingClientRect` over `a[href], button, input, select, textarea, summary, label, [role=…]`, flagged `<48px` (sr-only and label-wrapped checkbox inputs excluded); measured at 390×844 (DPR 2).
  - Keyboard: Tab walks (19–45 stops/page) recording tag, accessible name, `:focus-visible`, computed outline/shadow; plus a focused-vs-blurred differential on the first control.
  - Screenshots: 48 PNGs at `docs/audits/assets/design/` (`<screen>-<locale>-<viewport>-<theme>.png`), phone 390×844 DPR2 / desktop 1280×800 DPR1, light unless the name says `dark`/`-focus`.
- **Axe totals (all runs): 0 critical / 0 serious / 0 moderate / 0 minor.** 43 `incomplete` entries across the runs, almost all the single `color-contrast` rule (gradient/overlap): 19 candidate nodes on the home hero, ≤3 on matches/profile/scholarships, ~1–2 elsewhere; verified manually (see "verified sound").
- **Verdict rule for the table:** FAIL = the screen has an S1/S2 finding; PASS = no finding, or S3/S4 only (noted).

## Matrix actually captured

| Axis | Values |
|---|---|
| Locales | `fr`, `ar` (full matrix); `en` for the core journey (home, profile, matches, program, guide) at phone width |
| Viewports | phone 390×844 (DPR 2, touch), desktop 1280×800 |
| Themes | light (all); dark captured for home + matches (fr/phone) |
| States | home; profile empty + seeded/filled; matches: no-profile empty, results (seeded), filters open (3 active filters + hidden-programs summary verified), loading (snapshots delayed), error (snapshots aborted), blocked storage; program ×3 (FR/DE/NL; FR in fr+ar+en); scholarships; compare (3 seeded saved programs); plan (seeded saved + ticks); guides index + guide (fr/ar/en); privacy; terms; 404 global (`/FR`) + locale; sign-in; sign-in confirm; welcome (redirect state); account (signed-out gate) |
| Counts | 72 captured state entries / 71 axe runs / 48 screenshots / 25 capture tests + 7 keyboard tests + 16 probe tests |

## Per-screen results

axe = critical/serious/moderate (minor was 0 everywhere).

| Screen (state) | locale/viewport/theme | axe | Verdict | Notes |
|---|---|---|---|---|
| Home | fr,ar × phone,desktop light; fr phone dark; en phone | 0/0/0 | PASS | CLS 0; 19 axe `incomplete` contrast nodes on the hero mesh — manually verified OK (below) |
| Create profile — empty | fr,ar × phone,desktop light | 0/0/0 | PASS | D4 copy; blocked-storage variant shows a graceful notice; 2 uncaught `SecurityError` console errors (D6) |
| Create profile — filled (seeded profile) | fr,ar × phone,desktop | 0/0/0 | PASS (desktop CLS) | CLS 0.15 fr / 0.06 ar desktop (D1); phone CLS 0 |
| My matches — no profile (empty) | fr,ar × phone,desktop | 0/0/0 | PASS | Empty state with profile CTA; 0.03 CLS desktop |
| My matches — results (seeded) | fr,ar × phone,desktop; fr phone dark; en phone | 0/0/0 | PASS | Status chip folds `foundation` into ⚠️ (1080 = 930 check + 150 foundation) — intended one-mapping rule |
| My matches — filters open + hidden programmes | fr,ar × phone,desktop | 0/0/0 | PASS | "Filtrer vos résultats (3)" chips + open panel; hidden summary "1 235 programmes masqués par vos filtres" verified in DOM |
| My matches — loading | fr phone | — | PASS | Skeleton placeholder, no spinner (axe skipped: transient) |
| My matches — error (shards aborted) | fr phone | 0/0/0 | PASS | Alert + "Réessayer" |
| My matches — blocked storage | fr phone | 0/0/0 | PASS | Falls back to the no-profile empty state; console noise only (D6) |
| Program — FR | fr,ar × phone,desktop; en phone | 0/0/0 | PASS | 23 SourceBadges, DD/MM/YYYY, EUR, estimate vs official wording correct; D9 density |
| Program — DE / NL | fr,ar phone | 0/0/0 | PASS | |
| Scholarships | fr,ar × phone,desktop | 0/0/0 | **FAIL** | D2: 9/21 cards carry claims with no source badge/verified date |
| Compare — selection of 3 | fr,ar × phone,desktop | 0/0/0 | **FAIL** (desktop) | D1: CLS 0.195 fr / 0.136 ar desktop; phone 0 |
| My plan — seeded, 3 ticks | fr,ar × phone,desktop | 0/0/0 | PASS | Progress "3 sur 10 faites"; ticks render; desktop rail OK |
| Guides index | fr,ar phone | 0/0/0 | PASS | |
| Guide "studying-in-europe" | fr,ar,en phone | 0/0/0 | PASS | Guidance badge + verified date + "Advice…not a requirement" wording |
| Privacy | fr,ar phone | 0/0/0 | PASS | ar: D5 bidi isolation gaps on identifiers |
| Terms | fr,ar phone | 0/0/0 | PASS | |
| 404 global (`/FR`) | fr phone | 0/0/0 | PASS | Trilingual global-not-found, brand mark |
| 404 locale (`/fr|ar/t3-audit-notfound`) | fr,ar phone | 0/0/0 | PASS | |
| Sign-in | fr,ar phone | 0/0/0 | PASS | Named buttons ("Continuer avec Google"), labelled email field |
| Sign-in confirm | fr,ar phone | 0/0/0 | PASS | No-token state clear and actionable |
| Welcome (signed out) | fr,ar phone | 0/0/0 | **FAIL** | Redirects to `/sign-in?error=NO_SESSION`; CLS 0.30 (D1) and link-expired copy on a direct visit (D8) |
| Account (signed-out gate) | fr,ar phone | 0/0/0 | PASS | Gate copy + sign-in CTA; session-cookie wording handled by the signed-in variant |

## Findings (ranked)

### D1 — Hydration layout shift (footer jump) on welcome, profile desktop and compare desktop — Severity S2 — category: visual
- **Evidence:** `welcome-fr-phone-light.png` (final URL `/fr/sign-in?return=…&error=NO_SESSION`), `compare-fr-phone-light.png` (phone fine; desktop measured), `profile-empty-fr-phone-light.png` / `profile-filled-fr-phone-light.png`. Measured CLS: welcome/sign-in error **0.3046** (poor), compare fr desktop **0.195**, compare ar desktop 0.136, profile filled fr desktop **0.1538**, profile empty fr desktop **0.1313**, program fr ar desktop 0.0617. All other states ≤0.04.
- **Cause (measured):** `probe-layout-dom.json` / `probe2-compare-cls.json` — the single shift source is the `FOOTER` (`mt-auto border-t border-border bg-canvas`) moving from y≈644 to off-screen as the client island replaces a shorter server placeholder with taller hydrated content. Relevant code: `src/app/[locale]/layout.tsx:62-69` (footer after `<main>`), `src/components/compare/compare-client.tsx:183-203` (`CompareSkeleton` → grid), `src/components/profile/profile-wizard.tsx` (mounts only after store hydration), `src/components/auth/post-auth-landing.tsx` (checking → form).
- **Impact:** visible jump on first load; on desktop the whole page (incl. footer) reflows under the pointer; worst on the post-email landing.
- **Reproduction:** fresh context → `/fr/welcome` (phone); `/fr/profile` (desktop, any storage state); `/fr/compare` with 2+ saved programmes (desktop). Read `window.__cls` after settle (probe spec).
- **Suggested fix (not implemented):** reserve the final layout height in the server HTML: give the island regions a `min-height` matched to the hydrated content (the matches page already ships `matches-skeleton`; extend the pattern to compare/profile/welcome), or render the hydrated shell skeleton at the exact final height so the footer never moves.
- **Effort:** M.

### D2 — 9 of 21 scholarship cards show claims with no source badge or verified date — Severity S2 — category: copy
- **Evidence:** `scholarships-fr-phone-light.png`, `probe2-scholarships.json`, `probe4-scholarship-expanded.json`. Cards: France Excellence-Major, Stipendium Hungaricum, 6 Italian regional/DSU bursaries, HAN NL Scholarship. Even expanded, each shows **0** `data-slot="source-badge"`, no "Vérifié le …", while displaying "Aucune restriction de nationalité dans les règles publiées : vérifiez la page de la bourse" / "Montant : non publié dans les sources que nous avons lues" / "Date limite : non publiée…" and only an unlabelled "Site de la bourse" link. The other 12 cards show kind pill + date + source.
- **Impact:** breaks the product's core promise ("Chaque information indique sa source et la date de sa vérification" — the very lead of that page) and makes 43% of scholarship cards look unverified; feeds the general trust rule "no fact without its source and date".
- **Reproduction:** open `/fr/scholarships`, inspect the cards' DOM for `[data-slot="source-badge"]`.
- **Suggested fix (not implemented):** when a card renders no fact-level badge, render the scholarship record's own `SourceBadge` (record `source_url` + `last_verified_at` + `info_kind`) next to the official link, or attach the record-level fact to the "non publié"/nationality statements in `src/components/scholarships/scholarship-card.tsx:113-155`.
- **Effort:** S.

### D3 — Phone touch targets below the 48px audit bar; footer links are 18px high — Severity S3 — category: a11y
- **Evidence:** touch measurements on 52 phone captures (1 411 elements flagged below 48px in either dimension, capped per page). Systemic 44px-high targets: "Source" links 65×44 (155 occurrences in fr captures; ar 65×47), "Signaler une info périmée" buttons 163×44 (104), programme in-page TOC links 324×44 (40), locale-switcher links 86/78/66×44 (29+29+29), "Se connecter" 117×44 (25), "Voir la note" 74×44 (18). Genuinely small: footer links 45×18, 96×18, 149×18 (fr) and 23×31, 66×31, 101×31 (ar) — `src/components/site-footer.tsx:49-77` renders bare inline `Link`s with no min-height ("Guides · Confidentialité · Conditions d'utilisation").
- **Impact:** 44px meets Apple's 44pt minimum but misses the 48px goal used for this audit; the 18px footer links are hard to hit on a phone. Checkbox/radio filters and step rows are fine (48px label rows, measured).
- **Reproduction:** any phone capture; `readTouchTargets` in `tests/audit-ui/support.ts`.
- **Suggested fix (not implemented):** give footer links `min-h-11 py-2 inline-flex items-center` (and consider stacking them), and raise the recurring 44px controls (`src/components/source-badge.tsx:65,99`) to 48px on phone (`min-h-12 md:min-h-8`).
- **Effort:** S.

### D4 — "Quatre étapes courtes" intro contradicts the 2-step wizard — Severity S3 — category: copy
- **Evidence:** `profile-empty-fr-phone-light.png` / `profile-blocked-fr-phone-light.png`: intro "Quatre étapes courtes, puis une dernière vérification." directly above "Étape 1 sur 2 : Votre Bac". `STEPS = ["bac","languages","review"]` (`src/lib/profile/form/state.ts:11`) — two steps plus review. Stale copy in all three locales: `messages/fr.json:429`, `messages/en.json:429` ("Four short steps"), `messages/ar.json:429` ("أربع خطوات قصيرة").
- **Impact:** the first screen of the journey contradicts itself; erodes the "plain and short" copy rule.
- **Reproduction:** open `/fr/profile`, read the intro and the step counter.
- **Suggested fix (not implemented):** reword to the real count ("Deux étapes courtes, puis une dernière vérification.") in all three catalogues.
- **Effort:** XS.

### D5 — Arabic privacy page: identifiers not bidi-isolated — Severity S3 — category: RTL
- **Evidence:** `privacy-ar-phone-light.png`, `probe2-ar-privacy-bidi.json` — 36 ASCII/Latin snippets without a `<bdi>` ancestor, notably inline `<code>` identifiers in the storage/data list (`jisr.profile`, `jisr.profile-draft`, `jisr.saved`, `jisr.plan`, `user`, `account`, `session`, `verification`, `pending_signups`). Owner name and email *are* isolated (`Hamza Dagdagui`, `dagdagui…@gmail.com`), and the program page isolates money/dates correctly (95 `<bdi>`, 59 with `dir="ltr"`).
- **Impact:** Latin identifiers inside RTL paragraphs can display with flipped surrounding punctuation (e.g. `:` placement) — a small but visible bidi break on the page that explains data storage, exactly where precise identifiers matter.
- **Reproduction:** `/ar/privacy`, inspect `<code>` elements for a `bdi`/`unicode-bidi` isolation.
- **Suggested fix (not implemented):** render inline code with isolation (e.g. `code { unicode-bidi: isolate; }` in the MDX/prose styles or wrap in `<bdi dir="ltr">` in `content/ar/privacy.mdx`).
- **Effort:** XS.

### D6 — Blocked storage throws uncaught `SecurityError`s (console noise) — Severity S4 — category: visual
- **Evidence:** `probe2-blocked-storage.json` / `probe3-blocked-profile.json`: 2–4 `pageerror: The operation is insecure.` per session on `/fr`, `/fr/profile`, `/fr/matches` while site data is blocked. The UI itself degrades gracefully: profile shows "Nous ne pouvons pas enregistrer sur cet appareil…" (`profile-blocked-fr-phone-light.png`), matches falls back to the empty state (`matches-blocked-fr-phone-light.png`).
- **Impact:** no user-visible break; uncaught errors pollute monitoring and could break future code paths. Affects Safari private browsing / blocked third-party storage users.
- **Reproduction:** init script that makes `window.localStorage` throw → load the three pages, listen for `pageerror`.
- **Suggested fix (not implemented):** find the remaining direct storage read (not routed through `getLocalStorage`'s try/catch) and guard it, or catch at the island boundary.
- **Effort:** S.

### D7 — No `color-scheme` declaration; dark-preference UA widgets can render dark over the light UI — Severity S4 — category: visual
- **Evidence:** `probe-dark-fr.json` — `prefers-color-scheme: dark` is true, `html { color-scheme }` is `normal`, no `<meta name="color-scheme">`, page renders light (deliberate: `DESIGN.md:389` "no dark mode until a deliberate token swap"). `home-fr-phone-dark.png` confirms the light rendering. App-styled controls stay light (`select` background ≈ body background), so no visible split today; native scrollbars/autofill/date pickers follow the OS and can render dark.
- **Impact:** cosmetic only, on dark-preference devices.
- **Reproduction:** launch with `colorScheme: dark`, inspect `getComputedStyle(document.documentElement).colorScheme`.
- **Suggested fix (not implemented):** declare `color-scheme: light` on `:root` in `src/app/globals.css` (or a `<meta name="color-scheme" content="light">`) until dark mode ships.
- **Effort:** XS.

### D8 — Welcome: link-expired copy for a simple direct visit — Severity S4 — category: copy
- **Evidence:** `welcome-fr-phone-light.png` — `/fr/welcome` with no session client-redirects to `/fr/sign-in?return=…&error=NO_SESSION` (`src/components/auth/post-auth-landing.tsx:176-181`) and renders "La connexion n'a pas fonctionné. Le lien a peut-être expiré ou déjà servi : demandez-en un nouveau." (`signup.errors.linkFailed`). Nobody attempted a sign-in in this scenario.
- **Impact:** minor trust wobble (the tool blames a link the visitor never used); the form below still works.
- **Reproduction:** fresh context → `/fr/welcome`.
- **Suggested fix (not implemented):** use neutral sign-in copy for `NO_SESSION` reached without an attempt (e.g. "Connectez-vous pour continuer"), and keep the expired-link wording for real Better Auth failure codes.
- **Effort:** XS.

### D9 — Program pages repeat trust primitives per fact (23 badges, ~20 "Signaler une info périmée" triggers) — Severity S4 — category: visual
- **Evidence:** `program-fr-phone-light.png`; `probe-trust-fr.json` (23 `source-badge`, 29 external links), touch counts (104 report buttons in fr phone captures); the 40-stop keyboard walk on the program page is capped and ends mid-page (last stop: a cost note in the tuition section — `program-keyboard.json`).
- **Impact:** repetition dilutes the trust signal and adds many duplicate tab stops; a per-section badge or a single "Signaler" entry point would read calmer. Trust-first is intentional — this is polish, not a defect in the data.
- **Suggested fix (not implemented):** consider collapsing identical source/date rows per section (share one badge when source/date/kind are equal, as the scholarship card already does with `sharedSource`).
- **Effort:** M.

## What was verified sound

- **axe:** 0 violations (critical/serious/moderate/minor) across 71 runs, fr/ar/en, phone/desktop, light/dark, including empty, error, blocked-storage and 404 states. The `color-contrast` incomplete entries sit on the decorative hero mesh gradient; the flagged texts were computed to ≥7:1 (eyebrow `#4434D4`, title `#0D253D`, lead `#273951`, link `#533AFD` on a ≈white mesh), and status/kind chips are dark-on-pale (≥4.5:1).
- **Keyboard:** skip-link is the first tab stop, then brand → nav → sign-in → locale switcher → content; every stop shows a 2px visible outline (focused-vs-blurred differential confirms the ring appears only on focus); no focus traps; standard controls on all audited pages.
- **RTL:** `dir="rtl"`, `lang="ar"`; full visual mirroring (nav, cards, chips, disclosures, checkbox rows); directional icons mirrored via `rtl:rotate-180` (8 components); money and dates isolated in `<bdi>`; no Arabic-Indic digits anywhere; DD/MM/YYYY everywhere; no ISO dates visible.
- **Copy consistency:** no stale "préférences" wording anywhere in the matches UI (filters are "Filtrer vos résultats"; `noPreference` strings are in-filter hints, acceptable); "1 235 programmes masqués par vos filtres" exists for excluded programmes; MAD shows as "1 200 MAD par mois" with the explicit caveat that MAD budgets are not compared; brand is "Jisrr" (35× in fr/en catalogs, 0 legacy "Jisr"), with the deliberate Arabic "جسر" (`shell.siteNameArabic`).
- **Trust primitives:** programme page carries 23 badges with kind pill + "Vérifié le DD/MM/YYYY" + source link; guides show a "General guidance / not a requirement" badge; estimates never say "official"; staleness marks were not triggered (data fresh at audit time); "Signaler une info périmée" present on journey facts.
- **States:** loading skeleton; error alert with retry; blocked storage degrades with an explicit notice; empty states offer the next action; 404 global (trilingual) and locale both brand-consistent; sign-in/account gating works and names its methods.
- **en core journey (phone):** home, matches, program, guide — no copy overflow, no layout breaks.
- **Dark theme:** renders light by design (`DESIGN.md`), no mixed light/dark controls observed.

## Out of scope / not reachable states

- **Signed-in surfaces** (account with a session, welcome completion/import dialog, sign-in confirm with a real token, delete flow): not exercised — the audit is read-only against production and no account was created. Only the signed-out/blocked states of `/sign-in`, `/sign-in/confirm`, `/welcome`, `/account` were captured.
- **Google OAuth hand-off**, emailed magic links, Brevo e-mails: out of scope.
- Real stale-data states (aging/stale marks) were not reproduced: production data is fresh, so the staleness UI could not be observed (code-path verified only).
- Error states for individual shard failures inside matches beyond a full abort; offline mode beyond blocked storage.
- Content/data correctness (T1/T2 tracks), performance budgets (`pnpm perf:js`), SEO — not this track.
- Mobile Safari/WebKit and Firefox were not run (Chromium only); the 0.30 CLS on welcome should be re-checked there.
- Assets: 48 PNGs under `docs/audits/assets/design/` (≈40 target + en journey, dark, loading/error/blocked, focus and ar-privacy bidi evidence).
