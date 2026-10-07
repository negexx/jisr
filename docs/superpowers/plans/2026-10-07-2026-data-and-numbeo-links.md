# Only 2026 figures, and Numbeo links where we have none

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Owner decision (2026-10-07):** "only use 2026 data; if you don't have it, use Numbeo links". Eurostat was researched and cannot help under this rule: its newest price figures are 2024 (Hungary transport ticket), 2022 (German rent per m2), 2019 and older for the rest, and the 2024 price-level indices and the 2020 household budget survey have no euro amounts per student.

**Goal:** the cost block shows a figure only when its source is dated 2026 (or is a rate in force in 2026 on a 2026-verified page); everywhere a living-cost line is missing, the programme page links the student to Numbeo for that city (a link, no Numbeo figure is stored or shown).

## Rule applied to the six promoted profiles

| Profile | Source date | Decision |
|---|---|---|
| fr-official, fr-paris-official | Campus France pages updated 26 June and 7 July 2026; Service-Public verified 1 Aug 2026; CVEC 2026-2027 | keep |
| hu-official | NAV rate "from 1 January 2026" | keep |
| de-official | DAAD, 2023 social survey | remove |
| nl-official | Nibud 2024; the IND fee page states no year | remove |
| it-official | Questura notice of 2017 | remove |

Removal is by an owner decision, as with the two French programmes removed on 2026-10-04: delete the three files from `data/cost-profiles/` in a commit that cites this plan; the staged proposals move to `data-staging/proposals-cost-official/parked/` and stay re-verifiable if a 2026 page appears. The verifier's estimate age rule moves from 2023 to 2026 (`MIN_ESTIMATE_YEAR`), so a re-run cannot re-admit older figures.

## Numbeo link design

- Final decision: shown on the programme page only (not on match cards or compare, for client JS budget reasons), only when at least one of housing, food and transport is missing (`line.status === "missing"`), as one outbound link with a short note that Numbeo is not official: fr "Voir les prix de {city} sur Numbeo", en "See {city} prices on Numbeo", ar equivalent, with an external-site cue and `rel="noopener noreferrer"`, `target="_blank"`, through the existing `ExternalLink`.
- URL: the city page when we have verified it exists (the verified list comes from the Numbeo pages already fetched: the exact urls in `data-staging/parked-numbeo/*.yaml` `sources.numbeo.url`, stored as a small zod-free constant in `src/lib/numbeo-links.ts` keyed by country and city slug); otherwise the country page `https://www.numbeo.com/cost-of-living/country_result.jsp?country=<Country>` (valid for all five countries, verified 2026-10-05). Numbeo's own city URLs are `Name-Country` for most cities and bare for a few, and an unknown name returns a "Cannot find city id" page, so we never build a city URL we have not verified.
- It is a link only: no Numbeo number is shown, so there is no Numbeo data to credit beyond the link text. Not "official"; the link text says Numbeo, an external crowdsourced site.
- No new client JS: the link is the server-only component `src/components/numbeo-link.tsx`, rendered by the static programme page, so the city table stays out of every client bundle and the budget ratchet in `tests/e2e/support/js-budget.ts` needs no raise.

## Tasks

### Task 1: data and verifier rule (controller)
- [x] `git rm` the three profiles, move their proposals to `parked/`, move `MIN_ESTIMATE_YEAR` to 2026 in `scripts/import/official-costs-checks.ts` and its tests (fix tests that use 2023 figures), commit `data: keep only 2026 cost profiles (owner decision)` and `fix: official estimates must be dated 2026 or later`. Follow-up after the Opus review: official lines need a 2026 year too (a `dateQuote` dates the page, not the figure).

### Task 2: the link (implementer with `impeccable:impeccable`)
- [x] `src/lib/numbeo-links.ts` (`numbeoLinkFor(country, citySlug)` returns `{ url, kind: "city" | "country" }`, pure, tested: the five country URLs; a verified city returns its city url; an unverified city returns the country url; unknown country returns null), the server-only `NumbeoLink` on the programme page, messages in `messages/{fr,en,ar}.json` (namespace `costBreakdown`; ar is a machine draft), tests (component: shown iff a living line is missing, correct href and rel, absent when all three lines are present; i18n key parity), `pnpm build` and `pnpm perf:js` unchanged, browser check in fr and ar (RTL). Opus review.

### Task 3: docs, PR text
- [x] `data/README.md` and `.claude/CLAUDE.md`: the 2026 rule, what was removed and why, the Numbeo link, Eurostat findings (no 2026 euro price data; kept as a note), update PR #15 description. Commit `docs: 2026-only cost rule, Numbeo link and what was removed`.

## Open decisions (defaults here)
1. Verified-city links only (about 20 cities today); everything else links the Numbeo country page.
2. Link shown whenever any of housing, food, transport is missing.
