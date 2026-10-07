---
paths:
  - "data/**/*"
  - "src/data-schema/**/*.ts"
  - "scripts/data/**/*.ts"
  - "content/**/*.mdx"
---

# Curated reference data (YAML → snapshots)

- `data/` is the source of truth; git history is the audit trail. Files are Zod-validated by `pnpm data:check` (`src/data-schema/`); the build fails on any invalid or provenance-less record. Never edit built snapshots.
- Release 1 scope is France, Germany, Netherlands × Computer Science, Engineering, Business/Economics. The schema itself stays generic (origin country, destination country, field) — expanding scope is a data change, not a code change.
- Every fact carries `source_url` (https, official domain: university, government, DAAD, Campus France, Studielink, Nuffic, etc.), `info_kind` (`official | estimate | guidance`) and `last_verified_at` (ISO 8601 date you actually checked the source). Any `estimate` fact (costs included) also carries a `basis` explaining how the range was derived; the schema enforces this for `estimate` facts only.
- Never invent or "fill in" a value. If something isn't published, leave it null and let the UI show ⚠️ "to be checked".
- Program `tuition` is one official published fee or, when the university states a lowest and a highest fee, an official range (`maxAmountMinor`, optional `basis: income_based`; ADR 0010), by convention the one applicable to the Release 1 audience (students from outside the EU/EEA, e.g. Moroccan students). Non-null requires `info_kind: official` (`data:check` errors otherwise); if not published, leave it null. `coverage: complete` requires at least one rule (error); a `complete` program with teaching languages but no `language_proficiency` rule warns.
- Admission routes are their own records: `(origin country, credential type) → (destination country, level)` with outcome `direct | foundation | not_eligible | check`, conditions and a source. Morocco/Bac is the first origin; don't hard-code it in the schema or domain.
- Program requirements are rules-as-data validated against the rule schema in `src/data-schema/`; adding a program must not need a code change.
- Structural values are language-neutral (enums, numbers, dates, official names — never translate official names). Short text (≤ ~300 chars) is a `LocalizedText` map: `fr` required and the fallback, `en`/`ar` optional, each with status `draft` (machine-assisted) or `reviewed` (a fluent human read it). Long-form guides are MDX in `content/<locale>/` with `source_url`, `info_kind`, `last_verified_at` in frontmatter. Arabic is Modern Standard Arabic. Write original summaries, never copy marketing text or long passages from source pages.
- Stable slugs as ids (`fr-univ-lyon-1-cs-bachelor`). Renaming a slug breaks saved user data, and the slug alias/redirect mechanism is not yet supported (to be built before accounts persist slugs, phase 2) — so do not rename.
- Freshness classes and thresholds live in `src/data-schema/staleness.ts` (volatile: aging 120d / stale 270d; stable: aging 270d / stale 545d; see ADR 0004). `data:check` fails only on invalid or provenance-less records and prints a staleness + translation-coverage report; `--strict` also fails on stale records. The source watcher hashes each `source_url`, flags changed pages first for review, and never edits data; only a human read updates `last_verified_at`.
- Snapshots are content-hashed and immutable, sharded by destination country and field, with a manifest pointing at the current versions. The snapshot format is the contract with the web app — change it only with a version bump.
- Keep `data/` self-contained (no imports from app code) so it can be licensed or open-sourced separately later.
