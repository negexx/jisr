# Privacy notice + Terms of use — design spec

**Date:** 2026-10-10
**Status:** Approved (design). Implementation to follow via `writing-plans`.
**Launch gate:** `docs/ops/prelaunch-checklist.md` A4.

## Goal

Ship two static, trilingual legal pages — a **privacy notice** (`/privacy`) and **terms of use** (`/terms`) — that describe what Jisr actually does today (the guest release) and satisfy the A4 launch gate. Linked from the footer, indexable, no new client JavaScript.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Pages | Privacy notice **and** Terms of use |
| Locales | `en`, `fr`, `ar` — **all three equally authoritative** (no "convenience translation" disclaimer) |
| Scope | **Guest release only**; a dated line says the notice is updated before accounts (phase 2) launch |
| Controller | An **individual established in Italy**; name + contact are **placeholders** (`[CONTROLLER NAME]`, `[CONTACT EMAIL]`) to fill before launch |
| Regimes | **GDPR** (controller in the EU) **and** Moroccan **Law 09-08** (users in Morocco). Name both the **Garante** (IT) and the **CNDP** (MA) |
| Processors named | **Vercel** (hosting, Frankfurt `fra1`) and **GoatCounter** (cookieless analytics, EU, script from `gc.zgo.at`) |
| Governing law (terms) | **Italian law**, with a line that mandatory protections where the user lives still apply |
| Content mechanism | **Approach A — MDX** in `content/<locale>/` (rich formatting: lists, bold, links) |

## Architecture

### Toolchain
- Add `@next/mdx` (+ `@mdx-js/loader`, `@types/mdx`), configured with `createMDX()` in `next.config.ts` (preserve the existing `withNextIntl(...)`, `securityHeaderRules`, `SNAPSHOT_HEADER_RULES`, and `agentRules: false`).
- Add a `@content/*` path alias in `tsconfig.json` → `./content/*`.
- **Risk to verify first (with ctx7):** `@next/mdx` under Next 16 **Turbopack**. We use no remark/rehype plugins, so the plain path is expected to work; confirm before finalising `next.config.ts`. If Turbopack rejects it, fall back to `next-mdx-remote/rsc`.

### Content files
```
content/en/privacy.mdx   content/en/terms.mdx
content/fr/privacy.mdx   content/fr/terms.mdx
content/ar/privacy.mdx   content/ar/terms.mdx
```
Each MDX file is the full document body (H1 + sections + lists + links). `ar` is a machine draft like the rest of the app.

### Routes
- `src/app/[locale]/privacy/page.tsx`, `src/app/[locale]/terms/page.tsx`.
- Static Server Components: `hasLocale` guard, `setRequestLocale(locale)`.
- A locale→component map with **static imports** (bundler-friendly), e.g. `src/lib/legal/documents.ts`:
  ```ts
  import EnPrivacy from "@content/en/privacy.mdx";
  // …6 imports…
  export const PRIVACY = { en: EnPrivacy, fr: FrPrivacy, ar: ArPrivacy } as const;
  export const TERMS = { en: EnTerms, fr: FrTerms, ar: ArTerms } as const;
  ```
- `generateMetadata` via `pageMetadata` (`src/lib/seo.ts`), title/description from messages.

### Styling
- `mdx-components.tsx` (location per Next 16 + `src/`: verify) mapping `h1/h2/h3/p/ul/ol/li/strong/a` to Tailwind **logical-property** classes (DESIGN.md type scale 14/16/19/23/28, `text-start`, `max-w-prose`, no shadows, `text-muted-foreground` for secondary text).
- Internal links → locale-aware `Link` (`@/i18n/navigation`); external → `ExternalLink`.
- No typography plugin (not installed; do not add one).

### Metadata / i18n
- New top-level `legal` namespace in `messages/{en,fr,ar}.json` for the page title/description only:
  `legal.privacy.meta.{title,description}`, `legal.terms.meta.{title,description}`, plus a shared `legal.updated` line.
- The **body** lives in MDX (outside the JSON i18n tests, by design).

### Footer + SEO
- `src/components/site-footer.tsx`: add a small **Privacy · Terms** links row (keep the existing `footer.privacy` / `footer.privacyLogs` / `footer.sources` strings unchanged).
- `src/lib/seo.ts`: add `"/privacy"` and `"/terms"` to `INDEXABLE_PATHS` (canonical + hreflang + sitemap).

## Content outline

**Privacy notice**
1. Who we are — controller (individual in Italy), `[CONTACT EMAIL]`, GDPR + Law 09-08.
2. What Jisr does with your data — guest journey; profile/saved/plan stay in your browser; nothing personal sent.
3. What our host sees — Vercel `fra1` standard server logs (IP, URL, time, user agent); no cookies.
4. Analytics — GoatCounter (EU, cookieless), what it records, DNT/GPC honoured, currently off until this notice is live.
5. The data files your browser downloads — snapshot shards naming credential country, destinations and fields; never grades or nationality.
6. What we never collect — grades, nationality, saved list, and the rest.
7. Your rights — GDPR + Law 09-08; how to exercise (`[CONTACT EMAIL]`); complain to the **Garante** and the **CNDP**.
8. How long we keep data — Vercel log retention; nothing else stored by us.
9. Changes to this notice — last updated.

**Terms of use**
1. What Jisr is — free, non-commercial, informational; not a university, not admission advice; no account.
2. Accuracy and sources — hand-checked and dated; data ages; confirm on the official page; no warranty.
3. Acceptable use.
4. Intellectual property — official names/logos belong to their owners.
5. No account, no fees.
6. Limitation of liability.
7. Governing law — Italian law; mandatory protections where you live still apply.
8. Changes and contact.

## Testing

- `tests/i18n/legal-messages.test.ts` — the `legal` meta keys: parity across locales, no empty strings, placeholder parity, forbidden-wording, Arabic digits, fr no-break spaces (same shape as `tests/i18n/scholarships-messages.test.ts`).
- Content-parity test — all three locales have `privacy.mdx` + `terms.mdx`, non-empty.
- Page test — `/[locale]/privacy` and `/[locale]/terms` static HTML contains the document and **no client JS** (mirror `tests/app/scholarships-page.test.tsx`).
- e2e — footer link → page; axe on both pages; extend the existing specs.
- Verify the MDX text does not trip `tests/i18n/forbidden-wording.ts` where those words appear (write the copy to avoid `guarantee`/`certain`/`safe`/`garanti`/`assuré`, etc.).

## Dependencies to justify (in the commit)

`@next/mdx`, `@mdx-js/loader`, `@types/mdx` — required to render the MDX legal documents; no alternative without a toolchain.

## Out of scope

Accounts / phase-2 processors (Neon, Google, email) — a dated line notes the notice updates before accounts launch. No consent banner (no cookies). No admin/editor UI.

## Definition of done

`pnpm typecheck`, `pnpm test`, `pnpm lint` green; `pnpm data:check` unaffected; pages render in **fr and ar (RTL)** verified in a browser; reviewed by the `reviewer` subagent; `docs/ops/prelaunch-checklist.md` A4 updated.
