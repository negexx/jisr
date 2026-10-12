# Health fields and English-taught health programmes (Spec 1)

Date: 2026-10-12. Branch: `design/health-fields-english`. Status: design for owner review before a plan is written.

This is **Spec 1 of a three-spec expansion**:
1. **This spec** — three health fields + English-taught health programmes on the five existing destinations (NL, DE, IT, HU; FR deferred).
2. **Spec 2** — Spain as a new destination.
3. **Spec 3** — the English-programme coverage-gap campaign (existing pipeline).

## Goal

A Moroccan Bac holder who wants to study medicine, pharmacy or a health-adjacent subject should find realistic, costed, sourced options — starting with the **English-taught** programmes that exist today, without pretending a health-science degree is a medical degree.

## Scope

- Add three `fields` vocabulary records: `medicine`, `pharmacy`, `allied-health`.
- Extend the four English-taught importers to classify the health family, so `data:import` stages health programmes: **NL (RIO), DE (DAAD), IT (MUR English), HU (Study Finder)**.
- Stage → audit → promote the resulting records (register-listing tier), then enrich facts with the existing pipeline (`data:read`, `data:national`).
- Update the app's field-driven surfaces only where something hard-codes "three fields".

## Non-goals

- **The clinical single-cycle degrees** (FR PASS/LAS→DFGSM, IT `laurea magistrale a ciclo unico`, DE `Staatsexamen`, HU one-tier `Orvos`/`Gyógyszerész`): excluded; the model stays `level: bachelor`. `medicine`/`pharmacy` therefore have real content only where a first-cycle degree exists (NL, and ES in Spec 2); elsewhere they may be empty and the volume sits in `allied-health`.
- **FR health** (French-taught): deferred to a later FR pass (this spec is English-first). The labels to add then are recorded at the end.
- **Spain**, the coverage campaign, Master's/PhD, non-Bac credentials, UI redesign.

## Field taxonomy (the decision)

Classify by **what the degree is**, not by aspiration:

| slug | fr | en | ar | Rule |
|---|---|---|---|---|
| `medicine` | Médecine | Medicine | الطب | The medical degree you can enter at first cycle, plus the direct pre-medicine path/degrees explicitly named "medicine / medical science" (e.g. NL BSc Geneeskunde; DE Molecular Medicine). |
| `pharmacy` | Pharmacie | Pharmacy | الصيدلة | Pharmacy / pharmaceutical-science degrees (e.g. NL Farmacie; DE Pharmazeutische Biotechnologie; IT L-29). |
| `allied-health` | Santé paramédicale et sciences de la santé | Allied health | العلوم الصحية | Nursing, physiotherapy, biomedical sciences, biotechnology, public health, nutrition, laboratory sciences. |

Biomedical Sciences and Biotechnology are **science** degrees: they go to `allied-health`, never to `medicine`/`pharmacy` (the app must not round a science degree up to a professional one).

## Where a programme's field is decided today (the exhaustive list)

`field` is chosen by code in the importers, never by a model:

| File | What it holds | Spec 1 change |
|---|---|---|
| `scripts/import/fields.ts` | `FieldSlug` union; FR exact-label table (`classifyField`); NL regexes (`classifyDutchProgramme`) | widen the union; add NL health regexes |
| `scripts/import/sources/mur.ts` | `CLASS_FIELD` degree-class → field map (IT) | add health classes |
| `scripts/import/sources/daad.ts` | `classifyDaad` name regexes (DE, English) | add health patterns |
| `scripts/import/sources/studyfinder.ts` | `fieldOfBranch` branch → field map (HU) | add health branches |
| `scripts/import/sources/ba.ts` | Studiensuche SFE study-field table (DE, German-taught) | **deferred** (German-taught, not English-first) |
| `scripts/import/evidence.ts` (~L764) | per-field name regex used when verifying a page states the field | add entries for the new fields |
| `scripts/import/it-stage-candidates.ts` (~L14) | `z.enum([...])` of fields | widen |
| `tests/fixtures/data/e2e-journey/fields/*` | synthetic field fixtures | add one health field |
| `messages/{en,fr,ar}.json` | one example string lists the fields ("Engineering, Computer Science") | update |

The profile field selector, matcher (`src/domain/filter.ts`), snapshot and labels are data-driven (field names come from the record) — confirm and change only if a test or message hard-codes three.

## Code changes (per classifier) — proposed mappings

- **IT — `CLASS_FIELD`** add: `L/SNT1` (nursing), `L/SNT2` (rehabilitation/physiotherapy), `L/SNT3` (technical health professions), `L/SNT4` (prevention) → `allied-health`; `L-2` (biotechnology), `L-13` (biological sciences) → `allied-health`; `L-29` (applied pharmaceutical sciences) → `pharmacy`. (`LM-13`/medicina stayed excluded.) Note the MUR import is English-only, so the IT yield may be small (nursing/physio are mostly Italian).
- **DE — `classifyDaad`** add name patterns: medicine (`/\bmedizin|humanmedizin|molecular medicine/i`, but not "medical engineering"), pharmacy (`/pharmaz|pharmaceutical|pharmatechnik/i`), allied-health (`/gesundheit|health|nursing|pflege|physiotherap|biomedical|biomedizin|public health|nutrition|ernährung/i`).
- **HU — `fieldOfBranch`** add the Study Finder health branches → `allied-health` (Nursing, Physiotherapy, Health Sciences, Public Health). HU medicine/pharmacy are one-tier (excluded), so no `medicine`/`pharmacy` entries.
- **NL — `classifyDutchProgramme`** add: `geneeskunde`/`medicine` → `medicine`; `farmacie`/`pharmacy` → `pharmacy`; `gezondheid|verpleegkund|fysiotherap|biomedisch|voeding|mondzorg|logopedie|health` → `allied-health`.
- **`evidence.ts`** add the field-vs-page regexes for the three new fields (mirroring the existing `/computer|informati/i` pattern).

Each classifier keeps its `high`/`low` confidence rule; a health name that is ambiguous stays `low` and goes to the review sheet.

## Sourcing and import flow (English-first)

For each of NL, DE, IT, HU:

1. `pnpm data:import <cc>` (scope widened by the code change above) → `data-staging/` (ledger writers serialised, one country at a time).
2. Read `data-staging/REVIEW.csv`; drop programmes outside the taxonomy; approve.
3. `pnpm data:promote --confirm-human-read --verified-on YYYY-MM-DD` → `data/` at listing tier.
4. Enrich the facts the campaign cares about, English-first: `data:read` (with `--pages` from `data:pages --topics`) and `data:national` where a national page applies.
5. `pnpm data:check --strict` must be green and `pnpm data:build` must succeed.

New records carry `source_url`, `info_kind` and `last_verified_at` like every other record; a fact no official source states stays `null` (⚠️).

## App, i18n and fixtures

- Add the three field records (fr reviewed where a human reads them; en; ar draft).
- Update the one message string that lists fields; no other i18n change (field names render from the record).
- Add the new field(s) to the synthetic fixture and a health programme, so `typecheck`/`test`/`lint` cover the new field path.

## Trust rules (unchanged)

Official https sources only; never invent a value; missing/ambiguous → `null`. `official` = published requirement, `estimate` = our range, `guidance` = advice. Tuition `official` only. Deadlines need an international-applicant quote. Nothing in this spec relaxes them.

## Done

- `pnpm data:check --strict` 0 errors / 0 stale; `pnpm data:build` OK.
- `pnpm typecheck`, `pnpm test`, `pnpm lint` green.
- `pnpm data:coverage` records a delta for the new fields/programmes.
- Reviewed by the `reviewer` subagent before merge; PR only (never push `main`).

## Risks

- **Thin IT/HU English yield**: nursing/physiotherapy are mostly Italian/Hungarian-taught; the English health offer may be small. Unknown stays unknown; low yield is acceptable.
- **Misclassification**: health names that overlap engineering/business ("Medical Engineering", "Health Economics", "Pharmaceutical Management") — the `low` confidence + review sheet is the guard; keep the classifier conservative and let a person decide.
- **`medicine`/`pharmacy` look empty in 4 of 5 destinations** — expected and honest; the coverage report should say so rather than pad.
- **`field` slug is permanent once programmes reference it** (no rename). The three slugs are chosen now.

## Follow-ups recorded here (not Spec 1)

- **FR health labels** for a later FR pass: "Sciences pour la Santé", "Licence avec option Accès Santé (LAS)", "Génie biologique", "Sciences de la vie" → mostly `medicine`/`allied-health`.
- **DE Studiensuche (`ba.ts`)** health SFE codes for the German-taught pass.
- **Italy/Spain true medicine & pharmacy**: revisit only if a future ADR widens `level` beyond `bachelor`.
