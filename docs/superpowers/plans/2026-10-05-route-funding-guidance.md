# Route funding guidance (CROUS, BAföG) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. UI work: invoke `impeccable:impeccable`; verify in a browser in fr and ar.

**Status:** planned, not started. Decision of 2026-10-05 (owner delegated the choice): do not build it inside the Italy work. Reason: it needs a schema field, the snapshot, one UI block and three locales, and `.claude/docs/decisions/0008` says the client JS headroom on the program page is tiny, which can only be checked with `pnpm test:e2e` / `build:e2e` (they overwrite `.next`; the owner's dev server is on :3000). Do it as its own PR.

**Goal:** tell a student, on the programme page of France and Germany, that the national need-based grants (Crous bourse sur critères sociaux; BAföG) are generally not available to someone who arrives on a study visa alone, with an official source and a verified date, without touching match status.

**Why not `route.conditions`:** every condition is evaluated (`src/domain/match.ts`); a `manual_check` returns `unknown`, which turns the whole match into "check" and can never reach a tick, and for the `foundation` route (Germany) conditions are never shown. Funding is not an admission requirement.

**Architecture:** an optional `guidance` array on `AdmissionRouteRecordSchema` (`src/data-schema/records/admission-route.ts`): items `{ id, source, info_kind: "guidance", note: LocalizedText }`, validated and provenance-checked like conditions but never evaluated, never read by `src/domain`. The snapshot carries it with the route; the programme page renders it in the "Bourses" section under the heading "À savoir sur les aides du pays" (and en/ar), each note with its `SourceBadge` (guidance wording never says "official").

## Verified source material (re-check before use; read 2026-10-05)

- France, `https://www.etudiant.gouv.fr/fr/bourses-sur-criteres-sociaux-pour-qui-2980`: "soit être titulaire d'un titre de séjour en cours de validité et être domicilié en France depuis au moins 2 ans et attester d'un foyer fiscal de rattachement en France depuis au moins 2 ans" (other nationalities; refugee, protected and stateless people, and Andorrans, have their own conditions: say "unless refugee or protected status").
- Germany, `https://www.xn--bafg-7qa.de/bafoeg/de/das-bafoeg-alle-infos-auf-einen-blick/_documents/bafoeg-auch-ohne-deutschen-pass.html`: "Haben Ausländerinnen und Ausländer eine Bleibeperspektive in Deutschland und sind sie gesellschaftlich integriert, gelten sie als förderberechtigt." followed by examples ("etwa": permanent residence right, Erlaubnis zum Daueraufenthalt-EG, Niederlassungserlaubnis) and refugee/protection statuses; § 8 BAföG on gesetze-im-internet.de lists the qualifying residence permits. A study visa is not among them: keep the hedge "generally".
- Drafted notes (fr/en/ar, 400 characters max each) were in commit `c7f4ceef` (`data/admission-routes/ma-bac-to-fr.yaml`, `ma-bac-to-de.yaml`, removed in `8d4feb5e`): reuse their wording.

## Files

- Modify `src/data-schema/records/admission-route.ts` (field + unique ids), `src/data-schema/snapshot.ts` and the snapshot builder (`scripts/data/build.ts`, `src/data-schema/resolved.ts`) so the field reaches the client as a type-only shape; no Zod in client code (`tests/lib/client-imports.test.ts`).
- Modify the programme page view model (`src/lib/journey/page-facts.ts` or the closest existing file) and the Bourses section component under `src/components/program/`.
- Modify `messages/{en,fr,ar}.json` (heading, one line explaining that this is guidance about national aid, not a requirement).
- Create `tests/data-schema/admission-route-guidance.test.ts` (accepts the field, refuses a duplicate id, refuses `info_kind: official` without a quote-backed source if the rule applies), a domain test that a `direct` route with guidance can still reach the tick (match status unchanged), a component test (renders in fr and ar, nothing when absent).
- Data: add the two guidance items to `data/admission-routes/ma-bac-to-fr.yaml` and `ma-bac-to-de.yaml` with sources `crous` and `bafoeg` (verified-on date = the day a human read the page), owner approval in the PR.

## Steps

- [ ] Brainstorm the wording with the owner (one short sentence per route; "generally" hedge; refugee carve-out).
- [ ] Tests first (schema, domain no-change, component fr/ar), then the schema and snapshot field, then the UI.
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm data:check`, then ask the owner to allow `pnpm build:e2e` / `pnpm test:e2e` to measure the JS ratchet (`tests/e2e/support/js-budget.ts`); run `pnpm data:build` afterwards.
- [ ] Browser check in fr and ar, phone and desktop; Opus `reviewer`; draft PR.
