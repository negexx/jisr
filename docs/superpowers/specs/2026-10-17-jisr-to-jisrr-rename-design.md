# Design — Rename Jisr → Jisrr

**Date:** 2026-10-17
**Branch:** `chore/rename-jisr-to-jisrr` (stacked on Task A, `feat/profile-steps-to-matches-filters`)
**Status:** Approved by the owner (change/skip buckets + defaults)

## Context

The product is renamed from **Jisr** to **Jisrr**. The production domain `jisrr.org`, Vercel project and deployment docs already use `jisrr`; the code and copy still say Jisr. This is a brand-text change, **not** a blind find/replace: storage identifiers, env vars, the package name, the GitHub repo, CSS/animation names and test prefixes must keep working.

## Decisions

### CHANGE (user-facing brand)

The capitalised brand word **`Jisr`** → **`Jisrr`** only when it is user-facing text:

- JSON **values** in `messages/{fr,en,ar}.json` (never keys), including `shell.siteName`.
- **Prose** in `content/en/**` and `content/fr/**` (privacy, terms, guides).
- User-facing **string literals** in:
  - `src/lib/seo.ts` (`SITE_NAME`),
  - `src/lib/auth/server.ts` (`appName`),
  - `src/lib/server/email.ts` (sender display name, subjects, bodies).
- `PRODUCT.md`, `DESIGN.md`, `AGENTS.md`, `.claude/**/*.md`, `docs/**/*.md` (product prose and ADRs).
- The corresponding values in `tests/fixtures/i18n/guest-copy-golden.json`, and every test that asserts a brand string.

### SKIP (identifiers and infra — must keep working)

Never change lowercase **`jisr`** anywhere:

- localStorage keys `jisr.profile`, `jisr.profile-draft`, `jisr.saved`, `jisr.plan`, `jisr.auth`, `jisr.ml-nonce`, `jisr.account.*`, `jisr.matches-filters`.
- env vars `JISR_EMAIL_FILE_TRANSPORT`, `JISR_IMPORT_REFRESH`, and any `JISR_*`.
- `package.json` `"name": "jisr"`.
- GitHub repo `negexx/jisr`, `jisr.vercel.app`, GoatCounter code `jisr`.
- test prefixes `jisr-e2e-*`, `mkdtemp` `jisr-*` names.
- CSS/animation names `jisr-*` and `__jisr*` window globals.
- `data-staging/**/calls.jsonl` `jisr-read-*` run labels and `.impeccable` caches.
- **Code comments** that mention Jisr (internal, not user-facing) — the brief says do not change these blindly; leave them.
- **File names**, in particular `docs/product/jisr_mvp.md`.

### KEEP

- The **Arabic wordmark `جسر`** is unchanged everywhere (Arabic copy, Arabic site name, Arabic email bodies). It is the Arabic brand, not a transliteration.
- `docs/product/jisr_mvp.md` keeps its filename (links and docs reference it); only its prose brand changes.

### ADR

- Add a new ADR `0015-rename-jisr-to-jisrr.md` recording this decision, the change/skip table and the `jisrr.org` alignment.
- Update the brand word **in the prose of existing ADRs** (`Jisr` → `Jisrr`), per the owner's default. Do not change any decision content.

## Explicit change rule

A hit changes only if **all** hold: it is the exact token `Jisr` (capital J), and it sits inside a user-facing string value or prose document listed above. A hit is skipped if it is lowercase `jisr`, inside a code comment/identifier, a file name, the Arabic wordmark, or any infra identifier.

## Verification

- `pnpm typecheck`, `pnpm test`, `pnpm lint` green (copy-audit must stay byte-identical for **changed** values).
- `git grep -n "Jisr"` afterwards: every remaining hit is a skipped context (comment/identifier/file name); list them and justify.
- `git grep -n "جسر"` count unchanged.
- UI spot-check: the brand reads “Jisrr” in fr/en and still “جسر” in ar.
- No `jisr.*` key, env var, `package.json` name or test prefix changed (diff review).

## Out of scope

Task A (filters), accounts, repo/domain/package/env renames, the Arabic wordmark.
