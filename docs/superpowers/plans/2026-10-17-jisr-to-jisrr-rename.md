# Jisr → Jisrr rename — Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Rename the user-facing brand from Jisr to Jisrr without touching storage keys, env vars, the package name, the repo, CSS/global identifiers, test prefixes, the Arabic wordmark, or file names.

**Architecture:** A string-and-prose edit scoped by an explicit change/skip rule, plus a new ADR and a residual audit. No behavior change.

**Spec:** `docs/superpowers/specs/2026-10-17-jisr-to-jisrr-rename-design.md`

## Global Constraints

- Run pnpm through Windows: `cmd.exe /c "cd /d C:\Users\dagda\Downloads\nex\UniWay\.worktrees\rename-jisrr && set SWC_NATIVE_BINDING_CACHE=C:\Users\dagda\.swc-cache&& pnpm <cmd>"`.
- Change only the exact capital `Jisr` in user-facing string values/prose (spec list). Never lowercase `jisr`, code comments, identifiers, file names, the Arabic `جسر`, or infra.
- Keep `package.json` name, every `jisr.*` key, `JISR_*` env vars, `jisr-e2e-*` prefixes, CSS/`__jisr*`, and `docs/product/jisr_mvp.md` unchanged.
- Done = `pnpm typecheck`, `pnpm test`, `pnpm lint` green; conventional commit; stage by explicit path.

---

### Task 1: Apply the brand rename to copy, content, email and docs

**Files (expected, verify with `git grep -n "Jisr"`):** `messages/{fr,en,ar}.json`; `content/{en,fr}/**/*.mdx`; `src/lib/seo.ts`; `src/lib/auth/server.ts`; `src/lib/server/email.ts`; `PRODUCT.md`, `DESIGN.md`, `AGENTS.md`, `.claude/**/*.md`, `docs/**/*.md`; `tests/fixtures/i18n/guest-copy-golden.json`; brand-asserting tests.

**Interfaces:** none — text only.

- [ ] **Step 1: Enumerate the real hits.** Run `git grep -n "Jisr"` and `git grep -n "جسر"`. Build a per-file list. **Do not edit yet.**
- [ ] **Step 2: Edit user-facing string values.** In `messages/*.json`, change `Jisr` → `Jisrr` in values (not keys), including `shell.siteName`. In the golden fixture, apply the identical value changes so copy-audit stays green. Arabic values that use `جسر` stay.
- [ ] **Step 3: Edit prose.** `content/en/**` and `content/fr/**` MDX, `PRODUCT.md`, `DESIGN.md`, `AGENTS.md`, `.claude/**/*.md`, `docs/**/*.md` (including ADR prose). Leave code comments and file names.
- [ ] **Step 4: Edit the three string-literal sites.** `SITE_NAME` in `src/lib/seo.ts`, `appName` in `src/lib/auth/server.ts`, and the sender display name / subjects / bodies in `src/lib/server/email.ts`. Arabic email bodies keep `جسر`. Do not touch comments in those files.
- [ ] **Step 5: Update brand-asserting tests** (`tests/lib/seo.test.ts`, `tests/lib/server/email.test.ts`, any signup/delete-account/golden test that asserts the brand) to expect `Jisrr`.
- [ ] **Step 6: Add ADR `0015-rename-jisr-to-jisrr.md`** with the decision + change/skip table and the `jisrr.org` alignment. Update the brand word in existing ADR prose only.
- [ ] **Step 7: Residual audit.** `git grep -n "Jisr"` must return only skipped contexts (code comments/identifiers/file names); list every remaining hit and justify. `git grep -n "جسر"` count unchanged.
- [ ] **Step 8: Gate.** `pnpm typecheck`, `pnpm test`, `pnpm lint` green; confirm `copy-audit` and i18n tests pass.
- [ ] **Step 9: Commit** by explicit path, conventional message (`docs: rename Jisr to Jisrr` / `chore: rename Jisr to Jisrr` depending on the dominant change).

## Self-Review

- Spec coverage: change list, skip list, Arabic, ADR, golden, tests, residual audit → all covered.
- Risk: an accidental lowercase/identifier edit. Mitigation: Step 7 audit + `git diff` review that no `jisr.`/`JISR_`/`package.json`/CSS line changed.
