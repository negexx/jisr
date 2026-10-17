# ADR 0012 — Spain as a destination

**Status:** Accepted
**Date:** 2026-10-13

## Context

Adding a destination is a product-scope change, not a data-only edit. ADR 0003 says growth happens by adding data, and that holds for programmes, institutions and costs, but a new destination also needs a small set of code touchpoints: enumerations of destination countries in the import scripts, a register importer for the country's national mass, and per-country guidance entries in the reading pipeline. Spain is the first destination after the five of Release 1, so it is also the first test of what "add a destination" actually costs. This ADR records the decision and the touchpoints; the full design is in the spec.

Spec: `docs/superpowers/specs/2026-10-13-spain-destination-design.md`. Plan: `docs/superpowers/plans/2026-10-13-spain-destination-code.md` (this plan wires the skeleton and the importer; the data runs that populate ES programmes are Plan 2).

## Decision

1. **Spain (ES) is Jisrr's 6th destination**, delivered inside the existing model, with no change to the domain shape: `level: bachelor`; eligibility is `(origin credential country, credential type) → (destination, level)` routes first, then program rules. No new credential type — the route uses the existing `ma-bac`.

2. **Teaching language is two-wave.** Wave 1 is English-taught Grado first: it proves ES end-to-end (country, route, channels, programme page, matches, save, plan) from a smaller, cleaner set. Wave 2 is Spanish-taught Grado, the national norm: English-taught Grados are rare, and Spanish-taught is the mass. The two waves share one pipeline; only the discovery input differs.

3. **The Spanish mass uses a thin new RUCT importer** (`scripts/import/sources/ruct.ts`, exporting `importSpain()`), the canonical backbone for wave 2: per-university identity/title list plus per-degree HTML detail, mirroring `scripts/import/sources/mur.ts`. English-taught discovery for wave 1 leans on **SEPIE**'s official English-taught Bachelor table plus a curated cross-check, with no importer.

4. **Living costs use the Numbeo link plus narrow official 2026 city lines.** No official 2026 national living-cost figure exists, so ES programme pages link to Numbeo (verified city page where one exists, else the country page), and a cost profile is written only where a clean official 2026 city line exists (Madrid and Barcelona transport today).

5. **The admission route `ma-bac-to-es` is `outcome: check`, never a claimed direct access.** A Moroccan Bac has no automatic direct access: the path is homologación to the *Título de Bachiller* → UNEDasiss *credencial* / PCE → per-programme *nota de corte*, and each region or university decides. The route note states this and does not assert Morocco's non-reciprocity as a hard legal fact (it is an inference from absence, flagged in the spec).

6. **Code touchpoints.** Adding a destination touches, explicitly:
   - `src/lib/numbeo-links.ts` — add the ES country name and verified ES city pages.
   - `scripts/import/national.ts` — add `"ES"` to the country selector enum.
   - `scripts/import/costs.ts` — add `ES: "Spain"` to `COUNTRY_NAMES`.
   - `scripts/import/sources/ruct.ts` (new) plus `run.ts` (`SOURCES`), `owners.ts` (`OWNS`) and `summaries.ts` (`SummarySource`) — the ES register importer.
   - `scripts/import/reader.ts` (`COUNTRY_NOTES`), `evidence.ts` (`CHANNEL_WORDS`), `checker.ts` (`CHANNEL_TEXT`), `topics.ts` / `discover.ts` (search words) — the ES guidance entries; these live in Plan 2.

## Alternatives considered

- **Pure data, no code (hold ADR 0003 literally):** impossible here. A destination must be recognised by the import-script country enumerations and, for the national mass, needs a register importer; without them ES cannot be validated or staged.
- **One wave (English only, or Spanish first):** English-only would omit the norm and most of the market; Spanish-first would put the harder, larger, scrape-bound wave on the end-to-end proof. Two waves proves the journey cheaply first.
- **A bulk dataset or API for Spanish Grado:** none exists (`datos.gob.es` has only per-university snippets, RUCT has no API). A thin scrape of the official register is the honest option.
- **A RUCT-only route with no SEPIE/curation for wave 1:** RUCT has no teaching-language field, so it cannot identify English-taught Grados; SEPIE is the official English list.
- **An official national living-cost figure for ES:** none is published for 2026; an estimate would violate the trust model.

## Consequences

- **Refines ADR 0003's "growth = data" for destinations.** Growth still happens by adding data, but a new destination requires data **and** a small set of code touchpoints (per-country enumerations, a register importer where no clean API exists, guidance entries). ADR 0003 is immutable; this ADR refines it only for the destination case, as stated here.
- Positive: Spain is delivered inside the existing model, with no schema change and no new credential type; the two-wave split de-risks the journey by proving it on English-taught Grados first; the ES guidance is reusable for later destinations.
- Negative: the RUCT importer is a **scrape** — a session-bound, ISO-8859-1 HTML register with no API — with no teaching-language field, so English status stays a SEPIE lead until the programme's own page confirms it, and many Spanish-taught programmes keep `teachingLanguages` unknown until read. Non-EU tuition is per-university and residence-status dependent, so many Grado tuition values may stay `null` → ⚠️. Wave 2 is hundreds of staged records behind the audit sample.
- Neutral: **private institutions and the health fields are out of scope here** (health fields are a separate spec); ES scholarships are out of scope (no 2026 scheme targets a non-EU Bachelor entrant); the visa proof-of-funds line is a separate owner task and is not a cost line.
- Neutral: no change to `level` (stays `z.literal("bachelor")`), to the snapshot format, or to `demo-data`.

## How to revisit

ADRs are immutable once committed. If this decision turns out wrong, write a new ADR that supersedes this one — don't edit this in place. Triggers: RUCT publishes an API or a bulk dataset (the thin importer can go); the two-wave order proves wrong once wave 1 meets real demand; a destination beyond ES needs the same touchpoints often enough that the per-country enumerations and the importer registration should be generalised; private institutions or health fields come into scope (supersede this ADR in a new one).
