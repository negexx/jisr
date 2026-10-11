# Moroccan study guides — implementation plan

**Date:** 2026-10-11
**Spec:** `docs/superpowers/specs/2026-10-11-study-guides-design.md`
**Status:** Approved (autonomous). Executed via subagent-driven development.

## Goal

Add a `/guides` content hub with five trilingual, sourced long-form guides, migrate the MDX
components to the shipped Gradient Bridge world, and add the provenance/frontmatter subsystem that
`content/` so far lacks. One repo, no new dependencies.

## Architecture

```
content/<locale>/guides/<slug>.mdx      (fr/en/ar × 5 slugs; ESM frontmatter + body)
src/types/mdx.d.ts                       ambient `*.mdx` shim: export const frontmatter: unknown
src/lib/guides/frontmatter.ts            Zod schema + parser (server/build-time)
src/lib/guides/catalog.ts                static imports -> validated GuideEntry[] (server-only)
src/mdx-components.tsx                   migrated to Gradient Bridge tokens + Fact/GuideSteps
src/components/mdx/fact.tsx              Fact = claim text + SourceBadge (reused)
src/components/mdx/guide-steps.tsx       GuideSteps = guidance-styled ordered list
src/app/[locale]/guides/page.tsx         index (static)
src/app/[locale]/guides/[slug]/page.tsx  detail (generateStaticParams + dynamicParams=false)
src/lib/seo.ts / src/app/sitemap.ts      INDEXABLE_PATHS += /guides ; guidePaths param
src/components/site-footer.tsx           Guides link
messages/{fr,en,ar}.json                 new `guides` namespace + footer.guidesLink
```

## Tech Stack

Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 tokens, next-intl, @next/mdx
(already installed), Zod, Vitest + Playwright, Biome, pnpm. **No new dependencies.**

## Global constraints (all tasks)

- Follow `DESIGN.md` (Gradient Bridge) and `.claude/rules/*`. Load the `impeccable` skill before any
  UI/MDX edit and triage its findings.
- No `any`, `@ts-ignore`, non-null `!`. Named exports. Logical Tailwind utilities only (`ms-`, `pe-`,
  `text-start`) — never `ml-`/`pr-`/`left-`.
- Server Components; no new `"use client"`. `src/lib/guides/*` is server-only, never imported by
  client code. No `zod`/runtime `@/data-schema` in client-reachable code.
- Every guide fact cites an official https source read on a stated date; otherwise "à vérifier" /
  "to be checked". Never invent a fact, deadline, fee or document. Three fact kinds distinct; no
  "official" wording on estimates/guidance.
- fr/en/ar in the same change; `ar` MSA, Latin digits, `<bdi>` for Latin; no Darija; no em/en dashes;
  French NBSP before `: ? ! ;`.
- `git log -1` before any `--amend`; stage by explicit path; conventional commits; never commit to
  `main`.
- "Done" per task = `pnpm typecheck && pnpm test && pnpm lint` green (+ `pnpm data:check` if `data/`
  changed). UI tasks also verify in a browser in fr and ar at phone and desktop.

## Review focus (reviewers must check)

1. **Content truth**: every requirement/fee/deadline claim carries an official source badge with a
   real URL and read date; nothing invented; "to be checked" where unpublished; estimates never
   labelled official.
2. **Trust semantics**: `Fact` reuses `KindPill`/`SourceBadge`; no second kind mapping; official =
   teal filled only.
3. **Boundary/SSG**: no client JS added; guide pages static; `src/lib/guides` server-only.
4. **i18n/RTL**: all keys in three locales; logical utilities; `<bdi>`; fr NBSP; forbidden wording.
5. **Migration**: `mdx-components.tsx` uses the new tokens (thin display, `font-light`, indigo links);
   legal pages still render.

---

## Tasks

### T1 — MDX migration + frontmatter plumbing

**Files**
- Create `src/types/mdx.d.ts`:
  ```ts
  declare module "*.mdx" { export const frontmatter: unknown; }
  ```
- Create `src/lib/guides/frontmatter.ts`:
  ```ts
  import { z } from "zod";
  export const GuideFrontmatterSchema = z.object({
    source_url: z.string().regex(/^https:\/\/.+/i, "source_url must be an https URL"),
    info_kind: z.enum(["official", "estimate", "guidance"]),
    last_verified_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date"),
  });
  export type GuideFrontmatter = z.infer<typeof GuideFrontmatterSchema>;
  export function parseGuideFrontmatter(input: unknown): GuideFrontmatter {
    return GuideFrontmatterSchema.parse(input);
  }
  ```
- Rewrite `src/mdx-components.tsx` to the new tokens (h1 `mt-0 text-2xl font-light tracking-tight text-balance`;
  h2 `mt-10 text-xl font-semibold tracking-tight`; h3 `mt-6 text-lg font-semibold`; p `mt-4 text-base text-secondary-foreground`;
  ul `mt-4 flex list-disc flex-col gap-2 ps-5 text-base text-secondary-foreground`; ol likewise; li `leading-normal`;
  strong `font-semibold text-foreground`; `a: MdxLink` unchanged). Add `Fact` and `GuideSteps` to the map.
- Create `src/components/mdx/fact.tsx` (server component):
  ```tsx
  // Fact: a bordered soft callout wrapping a claim + the shipped SourceBadge.
  // props: kind (InfoKind), source (https url), verified (IsoDate), freshness? ("stable"|"volatile"=stable),
  //        basis? (string -> SourceBadge basisText), children
  ```
  Build `FactMeta` = `{ source_url, info_kind, last_verified_at, class: freshness }`; render the claim in a
  `rounded-xl border border-border bg-secondary px-4 py-3` block with `<SourceBadge meta={meta} basisText={basis} />`.
- Create `src/components/mdx/guide-steps.tsx`: `<ol>` with guidance styling (numbered, `text-base text-secondary-foreground`).

**Tests (write first)**
- `tests/lib/guides/frontmatter.test.ts`: valid passes; missing field, non-https source, bad date rejected.
- `tests/components/mdx-components.test.tsx`: h1 uses `font-light` (not `font-bold`); `MdxLink` internal vs external;
  `Fact kind="official"` renders the official kind pill; `Fact kind="guidance"` does not render the official (teal) pill.
- Ensure `tests/app/legal-pages.test.tsx` still passes (legal pages render through the migrated map).

**Verify**: `pnpm typecheck && pnpm test && pnpm lint`. Commit: `feat(mdx): migrate components to the gradient world and add guide fact callouts`.

---

### T2 — Content subsystem + anchor guide + index

**Files**
- Create `content/{fr,en,ar}/guides/studying-in-europe.mdx` — the anchor guide (1 H1, ≥5 H2), each with
  ESM frontmatter (`source_url` = the primary official source from the research dossier, `info_kind`,
  `last_verified_at`). Use `<Fact>` for requirement/fee/deadline claims and `<GuideSteps>` for steps.
- Create `src/lib/guides/catalog.ts`:
  ```ts
  import { AppLocale } from "@/i18n/routing"; // type only
  // static imports: Body + { frontmatter } per (locale, slug)
  export type GuideSlug = "studying-in-europe" | …;
  export type GuideEntry = { slug: GuideSlug; frontmatter: GuideFrontmatter; Documents: Record<AppLocale, ComponentType> };
  export const GUIDES: readonly GuideEntry[];   // ordered
  export const GUIDE_SLUGS: readonly GuideSlug[];
  export function guideBySlug(slug: string): GuideEntry | undefined;
  ```
  Validate each `frontmatter` with `parseGuideFrontmatter` at module load.
- Create `src/app/[locale]/guides/page.tsx` (index) and `src/app/[locale]/guides/[slug]/page.tsx`
  (detail) copying the privacy-page pattern (`hasLocale`, `setRequestLocale`, `pageMetadata`).
  Detail: `export function generateStaticParams()` returning `GUIDE_SLUGS`, `export const dynamicParams = false`,
  one H1 from the MDX, a header with the guide title/lead, the body in `<article className="max-w-prose text-start">`,
  a primary `SourceBadge` for the guide frontmatter, and journey CTAs (`guides.cta.*`).
- `messages/{fr,en,ar}.json`: add the `guides` namespace (index meta + index copy + `guides.<slug>.meta`
  for the anchor + `guides.cta.*` + `guides.related.*`) and `footer.guidesLink`.
- `src/lib/seo.ts`: add `/guides` to `INDEXABLE_PATHS`; change `buildSitemap(env, programSlugs, guidePaths: readonly LocalePath[] = [])`.
- `src/app/sitemap.ts`: pass `GUIDE_SLUGS.map(s => "/guides/"+s as LocalePath)`.
- `src/components/site-footer.tsx`: add the Guides link.

**Tests (write first)**
- `tests/i18n/guides-messages.test.ts` (template: `tests/i18n/legal-messages.test.ts`).
- `tests/content/guides-content.test.ts`: for each slug × locale, file exists, exactly one `^# ` H1, ≥5 `^## `,
  frontmatter valid, ar ≠ fr, no em/en dashes, no forbidden wording, fr NBSP.
- `tests/app/guides-pages.test.tsx`: index + detail render (mock `@/lib/guides/catalog`), translated metadata,
  exactly one h1, no `"use client"` in the new files.
- Update `tests/lib/seo.test.ts` (INDEXABLE_PATHS array; sitemap count formula) and
  `tests/app/metadata-wiring.test.tsx` (indexable pages).
- `tests/e2e/guides.spec.ts`: footer → `/guides` → a guide, one h1, axe, fr + ar.

**Verify**: `pnpm typecheck && pnpm test && pnpm lint && pnpm build && pnpm perf:js`; browser fr + ar phone + desktop.
Commit: `feat(guides): add the guides hub, catalog and the Europe overview guide`.

---

### T3–T6 — one guide each (parallel content tasks)

For each of `bac-and-european-universities`, `documents-and-legalisation`,
`scholarships-for-moroccan-students`, `common-mistakes`:
- Write `content/{fr,en,ar}/guides/<slug>.mdx` from the research dossier and the shipped `data/` route
  records (reuse their `source_url`/`last_verified_at`); 1 H1, ≥5 H2, frontmatter, `<Fact>` callouts,
  `<GuideSteps>` where useful; "to be checked" for anything unpublished.
- **Writes only its three MDX files** (shared wiring is centralized in T7) — a ruling to keep parallel
  tasks conflict-free.
- Each run leaves the guide content ready; the reviewer checks content truth and trilingual parity.

Commit each: `content(guides): add <guide> in fr/en/ar`.

---

### T7 — wiring the batch + full gate

- `src/lib/guides/catalog.ts`: add the four slugs' static imports + entries + `GUIDE_SLUGS`.
- `messages/*.json`: add `guides.<slug>.meta.{title,description}` for the four slugs (three locales).
- `tests/content/guides-content.test.ts` + `tests/i18n/guides-messages.test.ts`: extend vectors.
- Run the full gate: `pnpm typecheck && pnpm test && pnpm lint && pnpm data:check && pnpm build && pnpm perf:js`.

Commit: `feat(guides): wire the four remaining guides into the catalog and messages`.

---

### T8 — whole-branch review + fix wave

- Fresh reviewer subagent over `main..feat/study-guides` (spec compliance + quality + content truth).
- One fix wave for any Critical/Important finding, each fix re-reviewed.
- Final `pnpm test:e2e` (with `LD_LIBRARY_PATH=/tmp/opencode/pwlibs/root/usr/lib/x86_64-linux-gnu`)
  within the ratchet, and the browser verification in fr + ar.

---

## Definition of done

All spec success criteria; all task commits on `feat/study-guides`; PR opened to `main` with the PR
URL, the ledger outcomes and every ruling reported.
