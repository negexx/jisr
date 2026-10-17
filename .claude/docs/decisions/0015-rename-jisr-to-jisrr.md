# ADR 0015 — Rename Jisr to Jisrr

**Status:** Accepted
**Date:** 2026-10-17

## Context

The production surface already carries the new brand: the domain is `jisrr.org`, the Vercel project and the deployment docs (`docs/ops/deploy.md`, ADR 0011) use `jisrr`, and the Brevo sender is `no-reply@jisrr.org`. The code and copy still say **Jisr**. The rename closes that gap so the product reads consistently everywhere a student sees it.

This is a brand-text change, not a rename of the project's machinery. A blind find/replace would break things that must keep working: local-storage keys (`jisr.*`), environment variables (`JISR_*`), the `package.json` name, the GitHub repository (`negexx/jisr`), CSS/animation names (`jisr-*`), window globals (`__jisr*`), test prefixes (`jisr-e2e-*`) and staging labels. The brand word and the identifiers deliberately diverge: the product is named "Jisrr", the code keeps the historical `jisr` token.

## Decision

The capitalised brand word **`Jisr`** becomes **`Jisrr`** wherever it is user-facing text. Nothing else changes. The rule is applied per file, with an explicit change/skip table.

### Change (user-facing brand)

| Surface | Change |
|---|---|
| `messages/{fr,en,ar}.json` | JSON **values** only (never keys), including `shell.siteName`; Latin `Jisr` in `ar` values too (`siteName`, programme meta titles) |
| `content/en/**`, `content/fr/**` | MDX prose (privacy, terms, guides) |
| `src/lib/seo.ts` | `SITE_NAME` |
| `src/lib/auth/server.ts` | `appName` |
| `src/lib/server/email.ts` | sender display name, subjects and bodies (fr/en) |
| `PRODUCT.md`, `DESIGN.md`, `AGENTS.md`, `.claude/**/*.md`, `docs/**/*.md` | prose, including ADR prose (brand word only, no decision content) |
| `tests/fixtures/i18n/guest-copy-golden.json` | the matching guest-copy values, so `copy-audit` stays byte-identical for the changed slots |
| brand-asserting tests | `seo`, `email`, `pending-signup`, `delete-account` and any fixture that asserts the name |

### Skip (identifiers and infra — must keep working)

| Surface | Reason |
|---|---|
| lowercase `jisr` anywhere: `jisr.profile`, `jisr.saved`, `jisr.plan`, `jisr.auth`, `jisr.ml-nonce`, `jisr.account.*`, `jisr.matches-filters` | storage keys; a rename orphans existing devices |
| `JISR_*` env vars (`JISR_EMAIL_FILE_TRANSPORT`, `JISR_IMPORT_REFRESH`, …) | deployed configuration |
| `package.json` `"name": "jisr"` | package identity |
| GitHub repo `negexx/jisr`, `jisr.vercel.app`, GoatCounter code `jisr` | infrastructure |
| `jisr-e2e-*`, `mkdtemp` `jisr-*` test prefixes | test harness naming |
| CSS/animation names `jisr-*`, `__jisr*` window globals | front-end identifiers |
| code comments that mention Jisr | internal, not user-facing |
| file names, in particular `docs/product/jisr_mvp.md` | referenced by links and docs |
| outbound User-Agent identifiers (`Jisr-research`, `JisrDataBot/1.0`) | registered/known bot identity, not copy |
| `.impeccable` design caches, `data-staging` run labels | generated artifacts |

### Keep

- The Arabic wordmark **`جسر`** is unchanged everywhere (Arabic copy, `shell.siteNameArabic`, Arabic email bodies). It is the Arabic brand, not a transliteration of the Latin one.
- `docs/product/jisr_mvp.md` keeps its filename; only its prose brand changes.

### `jisrr.org` alignment

The rename aligns the user-facing brand with the already-chosen production domain `jisrr.org`, the Vercel project and the Brevo sender domain. No DNS, Vercel, repository or package rename is part of this decision.

## Alternatives considered

- **Blind repo-wide find/replace.** Would rewrite storage keys, env vars, the package name and CSS/animation names, breaking existing devices and deployed configuration. Rejected.
- **Rename the identifiers too (storage keys, repo, package).** A migration surface far larger than a brand change, with data-loss risk on user devices, for no user benefit. Rejected; brand and identifiers stay divergent.
- **Transliterate the Arabic wordmark to match.** Arabic readers read `جسر` (bridge) as the brand; a transliteration would be worse, not more consistent. Rejected.
- **Leave the copy as Jisr until the repo/domain/package rename.** The domain is already `jisrr.org`; shipping copy that names a different brand than the address bar is the inconsistency this ADR removes. Rejected.

## Consequences

- Positive: the product name is consistent in the address bar, the UI, the metadata, the emails and the docs; the identifiers that must stay stable are untouched.
- Negative: brand word and code token diverge permanently (`Jisrr` in copy, `jisr` in keys/package/repo); a future reader must know the two are the same project — recorded here.
- Neutral: no behaviour change, no schema change, no data change; `copy-audit` golden values move with the catalogue for the changed slots only.

## How to revisit

ADRs are immutable once committed. If the repo, package or storage keys are ever renamed, write a new ADR that supersedes this one; don't edit this in place. Trigger: a decision to unify the code token with the brand (a storage migration is then required).
