# Moroccan study guides — long-form content subsystem — design spec

**Date:** 2026-10-11
**Status:** Approved (design), autonomous session. Implementation to follow via `writing-plans`.
**Classification:** architectural (new content subsystem + routes).
**Owner decisions:** all auto-approved in an owner-absent session (most-recommended option at each gate; see Rulings).

## Goal

Ship Jisr's first long-form, Moroccan-focused **study guides**: a small trilingual set of sourced
articles, rendered as static pages under `/guides`, that turn the "Moroccan-Focused Features"
promised in `docs/product/jisr_mvp.md` (lines 159-169) into shipped content. Each guide carries the
same provenance the reference-data rule requires, links into the journey, and wears the trust/design
treatment of the shipped "Gradient Bridge" world.

## Non-negotiable — product truth

- **Every guide carries provenance in its frontmatter**: `source_url` (an official https page),
  `info_kind` (`official | estimate | guidance`), `last_verified_at` (the date the source was
  actually read).
- **Every fact cites an official source.** Never invent a fact, deadline, fee or document. Where a
  source does not publish something, the guide says "à vérifier" / "to be checked" — never a guess.
  Write original summaries; never copy marketing text or long passages.
- **The three fact kinds stay visually and verbally distinct** (teal filled = official ONLY; dashed
  cream = estimate; grey = guidance). "Official" wording appears only on official facts. The MDX
  fact callout reuses the shipped `KindPill`/`SourceBadge`; no second mapping.
- **Voice.** Plain, calm, honest, written for a school-leaver. No hype, no guarantees, never
  "eligible"/"admitted" as a promise, no percentages, no testimonials. No em/en dashes; French
  no-break space before `: ? ! ;`.
- **Trilingual fr / en / ar in the same change.** `ar` is Modern Standard Arabic (الإجازة for the
  Bachelor's, العلامة for a grade), Latin digits, RTL-native (logical utilities only, `<bdi>` for
  Latin names/URLs/numbers). No Darija. (Auto-drafted `ar`, as elsewhere in the app, pending the
  native review tracked at prelaunch C1.)
- **Trust treatment.** Each guide shows its primary source badge and, inside the body, a `Fact`
  callout for any claim that is a *requirement*, a *fee* or a *deadline*.

## Rulings (owner-absent, auto-approved)

| # | Decision | Chosen option | Cost if wrong |
|---|---|---|---|
| R1 | Frontmatter mechanism | **ESM `export const frontmatter` inside each MDX**, typed by a global ambient `declare module "*.mdx"` shim and validated by Zod at build time. `@next/mdx` does not support YAML frontmatter and Turbopack plugin support for `remark-frontmatter` is uncertain; this is zero-new-dependency and Turbopack-safe. | Provenance is co-located and machine-enforced, but is not literal YAML. If the project later wants YAML, add `remark-frontmatter` + an fs reader and migrate (mechanical). |
| R2 | Guide set | **Five guides + a `/guides` index**: overview, bac eligibility, documents and legalisation, scholarships, common mistakes. | Larger content surface to research/translate; the smallest *self-standing* set is index + overview + eligibility, and the plan sequences the anchor first so it can stop early with a coherent set. |
| R3 | Guide route | **Dynamic `[locale]/guides/[slug]`** with `generateStaticParams` (the five slugs) and `dynamicParams = false`. | One page module instead of five; if `generateStaticParams` is ever wrong, an unknown slug 404s (desired). |
| R4 | JS budget | **Do not add guide routes to the e2e ratchet `PAGES`**; rely on `pnpm perf:js` (report + Zod backstop) and the fact that this change adds **no new client component**. | A future guide-page JS regression would not be caught by the ratchet. Mitigation: no new client code; the reused `FreshnessMark` leaf is already shipped. Revisit if guides ever gain a client island. |
| R5 | Provenance UI | **Reuse the shipped `SourceBadge`/`KindPill`** (server-rendered; its `FreshnessMark` client leaf is already shipped). No new trust component. | A small client leaf is present on guide pages (same as program/scholarship pages). |
| R6 | `ar` copy | Machine draft, no `TODO-translate` (keys are genuinely translated), consistent with the legal docs; flagged for the native review (C1). | Arabic copy may read imperfectly until reviewed; the prelaunch gate already tracks this. |
| R7 | Internal linking | Add a **Guides** link to the footer; each guide links into `/profile`, `/matches`, `/scholarships`, `/plan`. | A footer slot is used; the link set is small. |
| R8 | Product-surfaces redesign | The `2026-10-11-product-surfaces-redesign` spec is **not on `main`** (it lives on `design/product-surfaces`). Implement against the shipped `DESIGN.md` gradient world and current code; migrate **only** `src/mdx-components.tsx`, as the task requires. | The broader product-surfaces redesign remains unshipped; out of scope here. |

## Decisions

1. **Content layout** — `content/<locale>/guides/<slug>.mdx`, locales fr/en/ar, five slugs:
   `studying-in-europe`, `bac-and-european-universities`, `documents-and-legalisation`,
   `scholarships-for-moroccan-students`, `common-mistakes`.
2. **Frontmatter (R1)** — each MDX starts with:
   ```mdx
   export const frontmatter = {
     source_url: "https://…",
     info_kind: "official",
     last_verified_at: "2026-10-11",
   };
   ```
   A global ambient module shim `src/types/mdx.d.ts` adds `export const frontmatter: unknown` to
   `*.mdx`; a Zod schema in `src/lib/guides/frontmatter.ts` validates shape, an https `source_url`,
   the `info_kind` enum and an ISO date.
3. **Registry** — `src/lib/guides/catalog.ts` statically imports each `(locale, slug)` MDX (body +
   frontmatter), validates every frontmatter, and exports the ordered catalog plus
   `GUIDE_SLUGS`. Server-only usage (never imported by client code).
4. **Routes** — `src/app/[locale]/guides/page.tsx` (index of cards) and
   `src/app/[locale]/guides/[slug]/page.tsx` (static detail; `generateStaticParams` +
   `dynamicParams = false`). Both are Server Components: `hasLocale` guard, `setRequestLocale`,
   `generateMetadata` via `pageMetadata`.
5. **MDX migration** — rewrite `src/mdx-components.tsx` to the Gradient Bridge world (h1 = Headline
   `text-2xl font-light tracking-tight`; h2 Title `text-xl font-semibold`; h3 Subtitle
   `text-lg font-semibold`; body `text-base`, no `leading-relaxed`; lists/strong to current tokens)
   and add two content components: `Fact` (a bordered soft callout wrapping the claim + a
   `SourceBadge`) and `GuideSteps` (an ordered, numbered guidance list; guidance styling only).
6. **Messages** — a new top-level `guides` namespace in all three catalogs: `guides.meta.*` (index),
   `guides.index.*` (headings/lead/card labels), `guides.<slug>.meta.{title,description}`,
   `guides.related.*` and `guides.cta.*` for the journey links. Visible H1/lead live in the MDX.
7. **SEO / sitemap** — add `/guides` to `INDEXABLE_PATHS`; extend `buildSitemap(env, programSlugs,
   guidePaths = [])` and pass the catalog slugs from `sitemap.ts`; each guide has a translated
   `generateMetadata` title/description.
8. **Footer** — add a Guides link next to Privacy · Terms.
9. **Content research** — each guide is written from official pages gathered by research agents
   (Campus France Maroc / Études en France, DAAD / uni-assist, Studielink / Nuffic, Stipendium
   Hungaricum / studyinhungary, Universitaly, government and university pages) and from the shipped
   `data/` route records, whose `source_url`/`last_verified_at` the guides reuse. Sources not found
   are written as "to be checked".

## Content outlines (each guide: 1 H1, ≥5 H2, sourced)

1. **Étudier en Europe après le bac marocain** (overview) — the five destinations, the shape of the
   journey (profile → options → costs → scholarships → steps), what "to be checked" means, how to
   read a source badge.
2. **Le bac marocain et l'accès aux universités européennes** — per destination: direct entry or a
   foundation/integration year, the application channel (Études en France/DAP, uni-assist, Studielink,
   Stipendium Hungaricum, Universitaly), with the route records' sources.
3. **Documents, traductions et légalisation** — the document list, sworn translation, and the
   verification chain (Morocco is not an apostille state — verify and cite); per-destination extras.
4. **Bourses pour les étudiants marocains** — Stipendium Hungaricum, Italian DSU/MAECI, DAAD/
   Deutschlandstipendium, Holland Scholarship, French aid realities, Moroccan government/AMCI; each
   with an official amount/level/deadline or "to be checked".
5. **Erreurs courantes à éviter** — missed windows, wrong channel, late/invalid documents, wrong
   language certificate, proof of funds, visa timing, trusting unofficial agents.

## Testing

- `tests/lib/guides/frontmatter.test.ts` — schema accepts a valid frontmatter, rejects a missing/invalid
  field, a non-https source and a bad date.
- `tests/content/guides-content.test.ts` — for every slug × locale: file exists, exactly one H1, ≥5
  H2, frontmatter valid, `ar` differs from `fr`, no em/en dashes, no forbidden wording, French NBSP.
- `tests/i18n/guides-messages.test.ts` — the `guides` namespace: key/placeholder parity vs `fr`, no
  empty strings, forbidden wording, no dashes/TODO/ICU-number, no Arabic-Indic digits under `ar-EG`,
  NBSP, `ar` ≠ `fr`, footer key truthy.
- `tests/app/guides-pages.test.tsx` — index and detail render (mocked catalog), translated metadata,
  exactly one H1, no `"use client"` in the new page/registry files.
- `tests/components/mdx-components.test.tsx` — migrated h1/h2/p tokens, `MdxLink` internal/external,
  `Fact` renders a source badge with the right kind.
- Update `tests/lib/seo.test.ts` (INDEXABLE_PATHS array + sitemap count), `tests/app/metadata-wiring.test.tsx`
  (indexable pages), and (e2e) add `tests/e2e/guides.spec.ts` (footer → index → guide, one H1, axe, fr + ar).

## Constraints and risks

- **JS budget (ADR 0008).** No new client component; guides reuse `SourceBadge`. `pnpm perf:js` and the
  e2e ratchet must not regress (R4).
- **Client boundary.** `src/lib/guides/*` and `src/app/[locale]/guides/*` are server-only; nothing
  client-reachable gains `zod` or runtime `@/data-schema`. `tests/lib/client-imports.test.ts` must pass.
- **SSG.** Guide pages are static; anything clock-dependent (freshness) is the existing
  `FreshnessMark` client leaf, whose server output is a neutral placeholder.
- **Content truth (the whole risk).** Every claim traces to an official URL read on a stated date;
  otherwise "to be checked". The content test and the reviewer must catch invented facts.
- **RTL / Arabic.** Verified in `fr` and `ar` at phone and desktop in a browser.

## Out of scope

- The product-surfaces redesign (R8); accounts/phase 2; a search index; a CMS/admin; TOC or
  client-side interactivity; a second typeface; dark mode; a guide for destinations or fields outside
  Release 1; native-speaker Arabic review (tracked at prelaunch C1).

## Success criteria (verifiable)

1. `/guides` and `/guides/<slug>` render in the Gradient Bridge world in `fr` (LTR) and `ar` (RTL) at
   phone and desktop, verified in a browser.
2. Every guide has valid provenance frontmatter with an official https `source_url`, an `info_kind`
   and a real `last_verified_at`; every requirement/fee/deadline claim carries a source badge; missing
   facts say "to be checked".
3. Trust semantics intact: three fact kinds distinct; no "official" wording on estimates/guidance.
4. `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm data:check`, `pnpm build`, `pnpm perf:js` and
   `pnpm test:e2e` green; no ratchet row exceeded.
5. All new strings exist in fr/en/ar; the forbidden-wording and trust-wording i18n tests pass.
6. `DESIGN.md` consistent (no change needed unless a new token is added, which is not planned).
7. The final whole-branch reviewer has no open Critical/Important findings.
