# M4a: Save a program and My Application Plan

Status: proposed, awaiting owner approval. Branch `feat/m4-save-and-plan`.

## Goal

A guest student can save up to 4 programs from the matches list and from a program page, and open My Application Plan: a per-program checklist (from `generateChecklist`) with documents, deadlines, trust badges and tick-able steps, all stored only in this browser.

## Decisions (owner, 2026-10-02)

1. **Save control:** both the match card and the program page header; one shared client leaf. Outline "Save" button (bookmark icon) becomes a filled "Saved" button (`aria-pressed`) that unsaves on click; a "Saved" badge also appears on the card. No count in the nav (no saved-list hook in the shell). A static "My plan" nav link is added.
2. **Storage:** `jisr.saved` holds `{schemaVersion: 1, items: [{slug, country, field, snapshotVersion, savedAt}]}`, max 4. If a slug is gone from the current snapshot, the row stays with "no longer published" and a Remove button; nothing is deleted silently.
3. **Plan layout:** program switcher, one checklist at a time, plus a **deadline overview** across all saved programs at the top.
4. **Compare-ready:** one shared `useSaved()` hook (items, `save`, `remove`, `has`, `max`). No GoatCounter now (not installed anywhere in `src`; `program-saved` and `plan-opened` stay for the analytics task).

## Context I checked

- `src/domain/checklist.ts`: pure `generateChecklist({profile, program, match, channel, scholarships, now})` returns 10 steps (`todo|skipped`, a reason code, `facts: FactRef[]`, optional `deadline`, `channel`, `scholarships`). Facts carry `source_url`, `info_kind`, `last_verified_at`. Steps `financial_documents`, `accommodation`, `visa`, `departure` carry no facts (general guidance).
- `src/components/program/personal-match.tsx` + `personal-outcome.ts`: the pattern to copy. A client leaf reads `useProfile`, loads a bundle with `useSnapshotBundle`, and dynamically imports the matching code (`import("./personal-outcome")`) so visitors without a profile never download it. `matchProgram`, `nextIntake`, `scholarshipsForProgram` and the channel lookup (`bundle.core.applicationChannels`) are all available client-side.
- `src/lib/profile/{storage,store,use-profile}.ts`: key prefix `jisr.` (so `clearLocalData`, behind "Clear my data", already wipes any `jisr.*` key), `useSyncExternalStore` with an unhydrated server snapshot, storage-event sync, blocked-storage fallback to memory.
- `src/lib/profile/draft-validate.ts` + `src/lib/guards.ts`: the hand-written validator + Zod twin + differential test pattern. `tests/lib/client-imports.test.ts` bans Zod and `@/data-schema/*` (except types, `dates`, `staleness`) from `src/components`, `src/lib/{profile,snapshot,journey,i18n,design}` and a few single files. **I will add `src/lib/saved` to `CLIENT_DIRECTORIES`.**
- `src/lib/snapshot/plan.ts`: `shardsForProgram(program{country,field,slug}, credentialCountry, manifest)`. A program is only reachable through its `(country, field)` shard, so the saved item stores `country` and `field` (public program metadata, not personal data) to avoid loading every program shard.
- `src/components/match-card.tsx` (shared, no `"use client"`, rendered inside the matches island with `MATCHES_MESSAGE_NAMESPACES`), `program-page-view.tsx` (static server page, `ProgramHeader` is a server component, client leaves behind a nested provider with `PROGRAM_CLIENT_NAMESPACES`), `site-header.tsx` (nav items), `source-badge.tsx`, `deadline-status.tsx`, `empty-state.tsx`, `clear-data-button.tsx` (strings as props).
- `messages/*.json`: `domain.checklist.step.<id>.{title,meaning}` and `domain.checklist.reason.<code>` already exist; I add namespaces `saved` and `plan`.
- E2E: `tests/e2e/{privacy,a11y,journey}.spec.ts`, `support/{seed,matches,traffic,fixture-data}.ts`.
- Spec: M3 plan "Out of M3 (M4)"; MVP Phase 3 (saved universities, application checklist, deadlines and next steps). ADRs 0004 (staleness, privacy), 0005 (match semantics), 0006 (static program pages), 0007 (JS budget, proposed).

## Approach

Two small localStorage stores in a new zod-free `src/lib/saved/` module: the saved list (`jisr.saved`) and step progress (`jisr.plan-progress`: `{schemaVersion: 1, done: {[slug]: ChecklistStepId[]}}`). Both follow the profile store shape (generic `createJsonStore` helper: read, decode, validate, fallback to memory, storage event, notify), are exposed through `useSaved()` and `usePlanProgress()`, and are cleared by the existing "Clear my data" because of the `jisr.` prefix. The hand-written validators are twinned by Zod schemas in `src/data-schema/saved.ts` (tests only) with a differential test. Unsaving keeps the program's ticks (an accidental tap on a card must not lose work); progress is capped to 50 slugs.

The Save control is a client leaf `SaveProgramButton` that takes its strings as props (like `ClearDataButton`), so it works under both the matches provider and the static program page without adding namespaces to the program client provider. On the static program page it renders a neutral disabled placeholder with the "Save" label until hydrated (no clock/profile dependence, ADR 0006). Saving does not need a profile.

The plan page is a client island `PlanClient` in `src/app/[locale]/plan/`, shaped like `MatchesClient`. It needs a profile (the checklist depends on match outcomes); without one it shows the existing profile CTA and says the saved programs are kept. It loads one bundle for all saved items (`shardsForPlan`, a union of `shardsForProgram`), then dynamically imports `plan-outcome.ts` which, per item, runs `matchProgram`, `nextIntake`, the channel lookup, `scholarshipsForProgram` and `generateChecklist`, and returns a plain view model. This keeps domain code out of the plan route's initial chunk. Display reuses `SourceBadge` and `DeadlineStatus`. A step with facts shows each distinct source with its kind and last-verified date; a step with no facts is labelled "General guidance" (the existing `guidance` kind label, no source claim) and links to the program's official page. A `todo` step has a checkbox; a `skipped` step is muted with its reason and no checkbox, never counted. Ticking is the student's own record, never a claim of eligibility, and the "all ticked" copy says so. No green "ok" state is derived from ticks (ADR 0004/0005).

## Steps

1. **Storage (TDD).**
   - `src/lib/saved/{constants,validate,json-store,saved-store,progress-store,use-saved,use-plan-progress}.ts` and `src/data-schema/saved.ts` (Zod twin).
   - `src/lib/constants.ts`: `SAVED_SCHEMA_VERSION`, `PROGRESS_SCHEMA_VERSION`, `MAX_SAVED = 4`.
   - Rules: dedupe by slug, `save` returns `{ok:false, reason:"full"}` at 4, `savedAt` ISO date, unknown or invalid data is reset like the profile (quietly, with a `reset` state exposed so the page can say so).
   - Tests: `tests/lib/saved/*` (validate + differential fuzz vs Zod, store, hook, blocked storage, storage event, clear-data wipes both keys).
   - `tests/lib/client-imports.test.ts`: add `lib/saved`.
2. **Messages.** `messages/{fr,en,ar}.json`: `saved.*` (save, saved, savedBadge, remove, full, announce strings, `noLongerPublished`), `plan.*` (title, meta, empty, noProfile, switcher label, overview heading, progress plural, step status labels, all-ticked note, guidance link, skipped, unpublished, load error). Messages tests: `tests/i18n/plan-messages.test.ts`, trust-wording and forbidden-wording coverage. ICU numbers use preformatted strings with `{n}` selectors only.
3. **SaveProgramButton.** `src/components/saved/save-program-button.tsx` (client, strings as props, `aria-pressed`, polite status output, "full" message with a link to My plan, 44 px touch target, logical utilities, `rtl:` mirror where directional). Component tests, including pressed state, full state, the unhydrated placeholder and blocked storage.
4. **Wire it in.**
   - `MatchCard`: button in the header plus a "Saved" badge (`data-testid`); copy from `useTranslations("saved")`; add `saved` to `MATCHES_MESSAGE_NAMESPACES` and to `tests/components/matches/helpers.tsx`.
   - `ProgramHeader` in `program-page-view.tsx`: server builds the copy through `getTranslations`/`useTranslations` and renders the leaf with `{slug, country, field, snapshotVersion}`. The program page stays static (`dynamicParams = false`, `server-only`).
   - `site-header.tsx`: "My plan" nav item.
5. **Plan domain glue.**
   - `src/lib/snapshot/plan.ts`: `shardsForPlan(items, credentialCountry, manifest)`.
   - `src/components/plan/plan-outcome.ts` (dynamic import target): `buildPlan(profile, bundle, items, locale, now)` returns `PlanView` (per item: `published | missing`, name, institution, deadline `IntakeStatus`, steps with resolved titles keys, facts, documents, channel, scholarship names).
   - Tests: `tests/components/plan/plan-outcome.test.ts` over the synthetic `xx-test-*` fixtures (skipped, unknown_data, closed deadline, missing slug).
6. **Plan page.**
   - `src/app/[locale]/plan/page.tsx` (server shell, same provider pattern as matches, `PLAN_MESSAGE_NAMESPACES`).
   - `src/components/plan/{plan-client,deadline-overview,program-switcher,checklist,checklist-step,plan-states}.tsx`.
   - Layout: phone is a single column (overview, switcher, checklist); desktop (`md:`) is a two-column layout with the overview and switcher in a start-side column. Switcher = list of buttons with `aria-current`. Selection is React state. Dates are DD/MM/YYYY through `formatDate`. Deadline overview sorts upcoming by date, then closed, then unknown, each linking to its checklist and reusing `DeadlineStatus`.
   - Document list: `program.documents` names through `bundle.text`, with its `SourceBadge`.
   - States: unhydrated skeleton, no saved, no profile, reset notice, load error with retry, unpublished row with Remove, compute error.
7. **E2E.** Extend `tests/e2e/`:
   - `save-and-plan.spec.ts` (phone and desktop, fr and ar): save from card and from program page, "Saved" state, reload persistence, max-4 message, plan renders steps, tick persists across reload, "Clear my data" empties both, removed slug shows the unpublished row (route-intercepted newer manifest).
   - `a11y.spec.ts`: axe zero violations on plan (empty, populated, no-profile) in fr and ar.
   - `privacy.spec.ts`: after save, tick and plan visits, no request other than GET `/snapshots/*` and static assets, no cookies, no console output, no request URL containing saved state or ticks.
8. **Budget.** `pnpm build && pnpm perf:js`; record plan route and the matches/program deltas in ADR 0007's table (no ADR status change). Dynamic-import anything over ~5 KB gzipped that is not needed at first paint.
9. **Docs.** Update the M3 plan outcome with an M4a note, `.claude/docs/architecture.md` (storage keys), CLAUDE.md architecture line for `src/lib/saved` and the plan page.
10. **Verify and review.** `pnpm typecheck && pnpm lint && pnpm test && pnpm data:check`, `pnpm test:e2e`, manual browser check in fr (LTR) and ar (RTL) on a phone width and desktop, Opus `reviewer` pass, then conventional commits, push and a draft PR.

## Tests

- Unit: validators and Zod twin (differential), stores and hooks, `plan-outcome`, `shardsForPlan`, message parity and wording (no "official" on estimate/guidance, no eligibility or guarantee words, fr nbsp, `ar` differs from `fr`), client-import guard.
- Component: save button states, match card with the badge, plan checklist (skipped has no checkbox, ticking writes to storage, progress count), deadline overview ordering, states.
- E2E and a11y as in step 7. Verify RTL: switcher and overview order mirror, chevrons and arrows rotate, Latin digits in `ar`.

## Risks / Open questions

- **Guidance steps without a source.** Four steps have no `FactRef`. I label them "General guidance" with a link to the program's official page instead of inventing a source. Content stays generic ("check the official rules"); no visa or cost specifics. Confirm that is acceptable for Release 1.
- **Plan needs a profile.** Matching is part of the checklist (language exam and others), so a student with saved programs but no profile sees a CTA, not a plan. The alternative is a profile-free plan with weaker steps.
- **Unsave keeps ticks.** Intentional, so an accidental unsave loses nothing; orphan progress only goes away with "Clear my data" or the 50-slug cap.
- **JS budget.** Every page is already over 150 KB (ADR 0007 is still Proposed). The match card gains a small button + store (the matches page already loads the profile store); the plan route is new. Numbers will be reported.
- **`ar` copy** is a machine draft until the native review (existing rule).
- **Branch name.** The environment designated `claude/lucid-albattani-9ay9hb`; you asked for `feat/m4-save-and-plan`. I'm using yours and will push that one unless you say otherwise.
- **Environment.** The code-graph MCP is not available in this cloud session; I use Grep/Read instead. The ngrok `allowedDevOrigins` line is not in this checkout, so nothing to leave alone.
- Significant design reasoning was needed for the storage schema and the client-bundle split (architectural tier); no auth, DB or server-side personal data is touched. GDPR: the saved list holds public program identifiers only, stays on the device, is wiped by "Clear my data".
- Out of scope, not touched: Compare, scholarships finder, cost of living, accounts, data pipeline, analytics.

Ready to execute?
