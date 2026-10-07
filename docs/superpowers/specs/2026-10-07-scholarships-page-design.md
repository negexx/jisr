# Scholarships page (MVP page 5 of 7)

Date: 2026-10-07. Branch: `feat/scholarships-page`. Status: design approved by the owner in conversation; this file is the written spec.

## Goal

The Scholarships page answers, for a Moroccan Bac holder: which scholarships can I apply for, how much do they give, what do they cover, what is the deadline, how do I apply, and which programmes do they apply to. Spec source: `docs/product/jisr_mvp.md`, section "4. Scholarship Finder" (who can apply, amount/type, what it covers, deadline, requirements, required documents, how to apply).

Trust is the product: every figure carries its `SourceBadge`; a value the sources do not publish is shown as "not published in the sources we read, to check"; an estimate is never presented as official; no value is invented.

## Decisions (owner, 2026-10-07)

1. **List only**, no per-scholarship detail pages (option A). Deep links stay `#scholarship-<slug>`, the anchor the programme page already uses.
2. **Grouped by destination country, no filters**, no client JS for browsing (option A). Field and deadline filters are not built: 18 of 19 records have no field restriction and none has a deadline.
3. **One small client leaf for nationality** on nationality-restricted cards only (option B).
4. **Programmes grouped by institution** with links, except whole-country scholarships, which show a count and one link to My matches (option A).
5. **Fourth header item and a home-page CTA** (option A).

Decided by the assistant (flagged to the owner): stale data reuses `SourceBadge` and `FreshnessMark` with no new freshness logic; programme pages are left untouched; `messages/*.json` gets additive keys only (see "Messages").

## Data facts this design rests on (checked 2026-10-07)

- 19 scholarships in `data/scholarships`: Deutschlandstipendium (DE), HAN and The Hague UAS (NL), Stipendium Hungaricum (HU), 15 Italian DSU/regional ones (IT).
- All 19 have `deadline.value: null`. Only 2 have an amount (Deutschlandstipendium EUR 300 per month; The Hague UAS EUR 5,000 once). Seven have a non-empty `covers` and no amount; ten have no support data at all. All `last_verified_at` are 2026-10-04 or 2026-10-05, so none is aging yet (volatile aging at 120 days).
- Only Stipendium Hungaricum restricts nationality (`MA`). 18 of 19 name `institutions`; Deutschlandstipendium is the only whole-country record (147 German programmes).
- These gaps are reported to the owner, never filled by code or by hand (scholarships are verified-only through `data:scholarship verify`, staging, audit, `data:promote`).

## Architecture

### Route and reader

- `src/app/[locale]/scholarships/page.tsx`: static page. `import "server-only"`, `generateStaticParams` over the locales, `setRequestLocale`, `generateMetadata` with translated title and description, inherits `dynamicParams = false` from the `[locale]` layout.
- `src/lib/snapshot/server.ts`: new `scholarshipsPageData()` (name to be confirmed in the plan). It reads the manifest and, per destination that has scholarships, the scholarships shard plus the programmes, institutions and text shards, and returns for each scholarship: the resolved record, resolved localized texts (summary, how to apply, documents, rules), the institutions it names (with display names) and its applicable programmes grouped by institution. Applicability uses `appliesToProgram` from `src/domain/scholarships.ts` (explicit programme link, destination, fields, institutions) so this page and the programme pages cannot disagree. Sort order is by slug, as `scholarshipsForProgram` does.
- Pure grouping and ordering logic (country sections, programme grouping by institution, whole-country detection, unmatched-institution detection) lives in a testable pure function next to the view models (`src/lib/scholarships/`), not inside the page file.

### Page content

- Intro stating the trust rule, and a row of anchor links to the country sections (Germany, Netherlands, Hungary, Italy), each with a count.
- One section per destination, cards in slug order. Each card shows, in this order:
  - name and provider;
  - nationality line: "Open to all nationalities" or "For nationals of X" (server-rendered from `eligibleNationalities`), plus the client leaf for restricted records;
  - the localized summary;
  - amount, via `formatMoneyRange` and the `per` period, or the muted line "Amount not published in the sources we read, to check";
  - what it covers (nothing printed when `covers` is empty);
  - deadline via `formatDate` (DD/MM/YYYY) in a `<time>`, or "Deadline not published in the sources we read, to check";
  - link to the official page (`officialUrl`), 44 px tap target on phone;
  - `SourceBadge` for support and for deadline (one badge when both share source, date, kind and class, as the programme page does). A null fact gets no badge, as tuition does.
- A closed `<details>` per card: requirements (`describeRule`, with its coverage notice), required documents, how to apply, each with its own badge or "to check" line.
- A second closed `<details>` per card: applicable programmes.
  - Institution-restricted scholarship: programmes grouped by institution name, each a link to `/programs/<slug>` with `prefetch={false}`. An institution named by the record that has no programme in the data is listed with "no programme of this institution is listed yet".
  - Whole-country scholarship (no `institutions`): a count ("N programmes in <country>, at participating universities") and one link to My matches, no enumeration.
- A neutral note for a country with no scholarship data is not needed today (all four have records); the empty case still renders an honest "none listed" line so a data change cannot break the page.

### Nationality leaf

- `"use client"` component `NationalityCheck`, rendered only on cards whose `eligibleNationalities` is non-empty. The server renders a neutral placeholder with no claim.
- After mount it reads the guest profile (`jisr.profile`) through the existing client store and hand-written validator (no Zod, nothing runtime from `@/data-schema`), then shows one of: "Open to your nationality", "Not open to your nationality (this scholarship is for <countries>)", or "Create your profile to check".
- Nationality only. It makes no other eligibility claim ("based on the published nationality rule only"). Strings arrive as props from the server (as `FreshnessMark`), so the leaf needs no message provider.

### Stale and missing data

- Volatile facts (support, deadline) go through `SourceBadge`, which already mounts `FreshnessMark`: aging and stale facts show the existing "may be outdated, check the official source" mark on the client. No new freshness code, no new JS.
- A stale amount or deadline therefore keeps its published value with the stale mark, as on programme pages. The static HTML contains no freshness claim (the clock is the visitor's).
- Null amount, null deadline: muted "to check" line plus the official link, never a badge, never a zero.

### Navigation and home

- Header: a fourth item "Scholarships" (fr "Bourses", ar "المنح") in the server header's item list. `NavLinks` already takes its labels as props, so the client bundle gains a few bytes only. Verified at 343 px in fr and ar on every page; if it does not fit, shorten the label before changing the layout.
- Home page: a CTA beside the existing ones (server component).
- Programme pages are not modified (no new client code reaches them). A link from the programme's scholarship section to this page is a possible follow-up, out of scope here.

### Messages

All new copy goes through next-intl in `en`, `fr`, `ar` (`ar` is a machine draft until the native review). New keys are added under new namespaces (`scholarshipsPage`, plus `nav.scholarships` and a home CTA key) and nothing existing is edited. The nationality leaf takes its strings as props from the server, so the page needs no nested `NextIntlClientProvider` and no `pickMessages` namespace list.

`messages/en.json` and `messages/fr.json` show as modified in `git status` while `git diff` is empty (line-ending flags; `.gitattributes` forces LF). The additive edits are written with LF and the commit diff is checked to contain only added keys. This is the one exception to "do not touch `messages/*.json`" and the owner approved it in the design review.

## Constraints that apply

Logical Tailwind utilities only; money only through `formatMoney` and `formatMoneyRange`; dates through `formatDate`; Latin digits in `ar` (ICU arguments are preformatted strings); Biome; `src/domain` stays pure; no Zod or `@/data-schema` runtime in client code; `data/` is never edited by hand; no unrelated UI changes; the client JS ratchet in `tests/e2e/support/js-budget.ts` only goes down, so `/scholarships` gets a new row sized to what it measures and no existing row is raised.

## Testing

- Unit (Vitest): the grouping and ordering function (country sections, slug order, institution grouping, whole-country detection, unmatched institution); the reader against the synthetic fixture; `appliesToProgram` parity between the page data and a programme page for the same scholarship.
- Component: `NationalityCheck` (no profile, matching nationality, other nationality, invalid stored profile, neutral server markup); card states (amount, null amount, deadline, null deadline, covers empty, shared-source badge).
- Page test: the static HTML contains no profile-dependent or clock-dependent claim.
- E2E (Playwright + axe): fr and ar, phone and desktop; anchors, `<details>`, header fit at 343 px, nationality leaf with a seeded profile.
- Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm data:check`, `pnpm build`, `pnpm perf:js` against the ratchet, a real-browser pass in fr (LTR) and ar (RTL) at phone and desktop width including a card with null amount and deadline and a stale one (a stale case is checked by a fixture or a clock override, since no real record is stale today).

## Out of scope

Detail pages per scholarship, filters (country, covers, field, deadline), a "relevant to your saved programmes" marker, new or edited scholarship data, changes to programme pages, accounts, and an admin or search layer (ADR 0003).

## Risks

- Header width with four items at 343 px in French (mitigation: label length, verified visually).
- Static HTML size from the programme lists (Italy and Hungary); the lists sit in closed `<details>` and are cached on the CDN; measured in the build.
- Programme link labels depend on the text shards for programme names; the plan must confirm the cheapest way to resolve names at build time.
- Almost all fields render as "to check" today, so the page can look empty; the intro and the per-card official link carry the value until the data is enriched.
