# Privacy notice + Terms of use Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two static, trilingual legal pages (`/[locale]/privacy`, `/[locale]/terms`) whose bodies are MDX under `content/<locale>/`, linked from the footer and indexable, adding no client JavaScript.

**Architecture:** `@next/mdx` (`createMDX()` in `next.config.ts`, preserving `withNextIntl`, `securityHeaderRules`, `SNAPSHOT_HEADER_RULES`, `agentRules: false`) compiles six MDX documents; a static locale→component map (`src/lib/legal/documents.ts`) feeds two static Server Components; one `src/mdx-components.tsx` maps MDX elements to Tailwind logical-property classes. Verified with ctx7: `@next/mdx` works under Next 16 Turbopack; with no remark/rehype plugins (the function-to-Rust caveat does not apply) the plain path is used. Fallback if Turbopack rejects it: `next-mdx-remote/rsc` (documented in Task 3).

**Tech Stack:** Next.js 16.3.7 App Router (`src/app`), React 19, next-intl 4, Tailwind v4, MDX (`@next/mdx@16.3.7`, `@mdx-js/loader`, `@mdx-js/react`, `@types/mdx`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-privacy-terms-design.md`

## Global Constraints

Copied verbatim from the spec and CLAUDE.md; every task's requirements include them.

- Locales `en`, `fr`, `ar`, all three **equally authoritative** (no "convenience translation" note). `ar` is a machine draft like the rest of the app.
- Scope: **guest release only**; a dated line says the notice is updated before accounts (phase 2) launch.
- Controller: an individual established in Italy; name + contact are placeholders `[CONTROLLER NAME]` / `[CONTACT EMAIL]`, visibly marked.
- Regimes: **GDPR** and Moroccan **Law 09-08**; name the **Garante** (IT) and the **CNDP** (MA).
- Processors named: **Vercel** (hosting, Frankfurt `fra1`) and **GoatCounter** (cookieless analytics, EU, script from `gc.zgo.at`).
- Terms governing law: **Italian law**, with a line that mandatory protections where the user lives still apply.
- TypeScript strict; no `any`, no `@ts-ignore`, no non-null `!`. Server Components by default; add **no new client JavaScript**.
- Tailwind logical utilities only (`ms-`, `me-`, `ps-`, `pe-`, `text-start`), never `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`/`text-left`. Type scale only 14 / 16 / 19 / 23 / 28 px; prose capped at `max-w-prose`; no shadows.
- Dates `DD/MM/YYYY`. All page strings through next-intl. No Zod and no runtime `@/data-schema` import in client-reachable code (none here).
- **Copy must not match `tests/i18n/forbidden-wording.ts`** for its locale (en: `guarantee`, `certain`, `sure`, `safe`, `eligible`…; fr: `garanti`, `assuré`, `certain`, `admis`, `éligib`…; ar: `قبول`, `ضمان|نضمن|تضمن|مضمون`, `مؤهل`, `يمكنك التقديم`, `يحق لك`). Say "no warranty" / "we do not promise"; in fr avoid `garantie` too (write "sans engagement", "nous ne promettons pas"); in ar use "بدون تعهّد"/"لا نَعِد" — never a word containing `ضمان` or `تضمن`.
- French uses a **no-break space (U+00A0)** before `: ? ! ;` in every message.
- Conventional commits; stage explicit paths only; justify new dependencies in the commit message. PRs only.

## Review Focus

Inputs/conditions the spec implies but no listed test names; each is pinned to a task's tests.

1. A locale whose MDX file is missing or empty at build time — a broken import fails `next build` (Task 3) and the content test checks all six files (Task 2).
2. An internal link (e.g. privacy ↔ terms) rendered from MDX without the locale prefix — the `a` mapper must use the locale-aware `Link`; the content test checks the raw cross-links (Task 2) and the e2e asserts the rendered href starts with `/${locale}/` (Task 5).
3. A non-`https` external link — `ExternalLink` degrades to plain text; the content test allows only `https://` external links (Task 2) and the page test checks external anchors (Task 3).
4. A wrong or missing locale in the URL — `hasLocale` guard must `notFound()` in both the page and its metadata (Task 3).
5. More than one or zero `<h1>` in the static HTML — exactly one per document, asserted by the content test (Task 2) and the page test (Task 3).

---

### Task 1: `legal` messages + footer link keys

**Files:**
- Modify: `messages/en.json`, `messages/fr.json`, `messages/ar.json`
- Test: `tests/i18n/legal-messages.test.ts` (Create)

**Interfaces:**
- Produces (message keys, in all three catalogues): `legal.updated`, `legal.privacy.meta.title`, `legal.privacy.meta.description`, `legal.terms.meta.title`, `legal.terms.meta.description`, `footer.privacyLink`, `footer.termsLink`. Task 3/4 consume `legal.*` and `footer.*Link`.

- [ ] **Step 1: Write the failing test** `tests/i18n/legal-messages.test.ts`, mirroring `tests/i18n/scholarships-messages.test.ts`: import `ar/en/fr` JSON, `FORBIDDEN` from `./forbidden-wording`, and `LOCALES, namespaceMessages, placeholderNames` from `./trust-wording`. Assert, over `namespaceMessages(locale, ["legal"])`:
  - key set and distinct placeholder names equal `fr`'s (parity across locales);
  - no empty string;
  - `FORBIDDEN[locale]` never matches;
  - no `–`/`—`, no `TODO-translate`, no `(?<!')#`, no `,\s*(number|date|time)\b`;
  - rendering with `createTranslator` under the worst-case locale `"ar-EG"` yields no Arabic-Indic digit (`/[٠-٩۰-۹]/u`);
  - plus a `describe("legal messages: language rules")`: fr has a no-break space before `: ? ! ;` (same two regexes as the scholarships test), and `footer.privacyLink` / `footer.termsLink` are truthy in all three catalogues.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test tests/i18n/legal-messages.test.ts`
Expected: FAIL — `no legal namespace in fr` (the `namespaceMessages` throw) / missing keys.

- [ ] **Step 3: Add the keys** to all three catalogues. Use exactly these values (they are already forbidden-word clean and fr uses U+00A0 before `:`):

`en.json` add top-level `legal` and two keys inside `footer`:
```json
"legal": {
  "updated": "Last updated: 10/10/2026",
  "privacy": { "meta": { "title": "Privacy notice", "description": "How Jisrr handles your data: what stays in your browser, what our host and analytics see, and your rights under the GDPR and Moroccan Law 09-08." } },
  "terms": { "meta": { "title": "Terms of use", "description": "The rules for using Jisrr: a free, informational service with no account, no fees and no warranty, governed by Italian law." } }
},
"footer": { "privacyLink": "Privacy", "termsLink": "Terms", ...existing keys unchanged }
```
`fr.json`: `updated` = `"Dernière mise à jour\u00a0: 10/10/2026"` (NBSP before the colon — write the literal U+00A0 character, not `\u00a0`), `privacy.meta.title` = `"Politique de confidentialité"`, `privacy.meta.description` = `"Comment Jisrr traite vos données\u00a0: ce qui reste dans votre navigateur, ce que voient notre hébergeur et nos statistiques, et vos droits au titre du RGPD et de la loi marocaine 09-08."`, `terms.meta.title` = `"Conditions d'utilisation"`, `terms.meta.description` = `"Les règles d'utilisation de Jisrr\u00a0: un service gratuit et informatif, sans compte, sans frais et sans engagement, régi par le droit italien."`, `footer.privacyLink` = `"Confidentialité"`, `footer.termsLink` = `"Conditions d'utilisation"`.

`ar.json`: `updated` = `"آخر تحديث: 10/10/2026"`, `privacy.meta.title` = `"إشعار الخصوصية"`, `privacy.meta.description` = `"كيف يتعامل جسر مع بياناتك: ما يبقى في متصفحك، وما يراه مزوّد الاستضافة والتحليلات، وحقوقك بموجب النظام الأوروبي RGPD والقانون المغربي 09-08."`, `terms.meta.title` = `"شروط الاستخدام"`, `terms.meta.description` = `"قواعد استخدام جسر: خدمة مجانية إعلامية، بدون حساب وبدون رسوم وبدون تعهّد، يخضع للقانون الإيطالي."`, `footer.privacyLink` = `"الخصوصية"`, `footer.termsLink` = `"شروط الاستخدام"`.

- [ ] **Step 4: Run the test and the existing message tests**

Run: `pnpm test tests/i18n/legal-messages.test.ts tests/i18n/messages.test.ts tests/i18n/vocabulary.test.ts`
Expected: PASS (key parity holds because all three catalogues gain the same keys).

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/fr.json messages/ar.json tests/i18n/legal-messages.test.ts
git commit -m "feat: add legal page messages and footer legal link labels"
```

---

### Task 2: MDX documents + content-parity test

**Files:**
- Create: `content/en/privacy.mdx`, `content/en/terms.mdx`, `content/fr/privacy.mdx`, `content/fr/terms.mdx`, `content/ar/privacy.mdx`, `content/ar/terms.mdx`
- Test: `tests/content/legal-content.test.ts` (Create)

**Interfaces:**
- Produces: six MDX files, each a complete document (one `# ` H1 + `## ` sections). Task 3 imports them via `@content/<locale>/<doc>.mdx`.

- [ ] **Step 1: Write the failing test** `tests/content/legal-content.test.ts` using `node:fs` + `node:path` and `FORBIDDEN` from `../i18n/forbidden-wording`. `LOCALES = ["en","fr","ar"]`, `DOCS = ["privacy","terms"]`, `read(locale, doc)` = `readFileSync(path.resolve(process.cwd(), "content", locale, `${doc}.mdx`), "utf8")`. Assert `describe.each(LOCALES)`:
  - for each doc: `source.trim().length > 200`; exactly one line matching `/^# /`; at least 5 lines matching `/^## /`;
  - for `privacy`: the text contains `"Vercel"`, `"GoatCounter"`, `"[CONTROLLER NAME]"`, `"[CONTACT EMAIL]"`, `"Garante"`, `"CNDP"`;
  - for each doc: no `FORBIDDEN[locale]` pattern matches. Also a top-level `it("Arabic is not a copy of French")` that `read("ar", doc) !== read("fr", doc)` for both docs, and a cross-link check: `read(locale, "privacy")` contains `"(/terms)"` and `read(locale, "terms")` contains `"(/privacy)"` in every locale.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test tests/content/legal-content.test.ts`
Expected: FAIL — `ENOENT: no such file ... content/en/privacy.mdx`.

- [ ] **Step 3: Write the six documents.** Each is the full document. English is the reference; `fr` and `ar` are faithful, equally-authoritative translations (keep proper nouns `Vercel`, `GoatCounter`, `Garante`, `CNDP`, `RGPD`/`GDPR` as needed, and the literal placeholders `[CONTROLLER NAME]` / `[CONTACT EMAIL]`). Use `##` for every section, `-`/`1.` lists, `**bold**` for terms, and links: internal as `[text](/privacy)` / `[text](/terms)`, external as `[text](https://…)` only. `ar` uses الإجازة for the Bachelor's and Latin digits.

`content/{locale}/privacy.mdx` — H1 = the privacy title; sections:
1. **Who we are** — Jisrr is run by one individual established in Italy; controller name `[CONTROLLER NAME]`, contact `[CONTACT EMAIL]`; note it is the data controller under the GDPR and a handler under Moroccan Law 09-08.
2. **What Jisrr does with your data** — one guest journey: profile → options → costs → scholarships → application plan; the profile, saved list and ticked steps live only in your browser (local storage); nothing personal is sent to us.
3. **What our host sees** — Vercel hosts Jisrr (Frankfurt, `fra1`); like any host it keeps standard server logs (IP, URL, time, user agent); no cookies are set.
4. **Analytics** — GoatCounter: cookieless, EU, loaded from `gc.zgo.at`; records page views without a persistent identifier; Do Not Track / Global Privacy Control honoured; analytics is off until this notice is live.
5. **The data files your browser downloads** — to compute results your browser downloads reference files whose names include your diploma's country, destination countries and fields (the ones you chose plus those of programs you open or save).
6. **What we never collect** — grades, nationality, your saved list, and the rest; never sent.
7. **Your rights** — under the GDPR and Law 09-08 (access, rectification, erasure, objection…); write to `[CONTACT EMAIL]`; complain to the Garante (Italy) or the CNDP (Morocco).
8. **How long we keep data** — only the host's standard log retention; Jisrr stores nothing else about you.
9. **Changes to this notice** — updated before accounts (phase 2) launch; link to `/terms`.

`content/{locale}/terms.mdx` — H1 = the terms title; sections:
1. **What Jisrr is** — free, non-commercial, informational; not a university and not admission advice; no account.
2. **Accuracy and sources** — facts are hand-checked and dated, age over time; confirm on the official page; Jisrr gives **no warranty**.
3. **Acceptable use** — no scraping-at-scale, no attempts to break or overload the service.
4. **Intellectual property** — university and program names and logos belong to their owners.
5. **No account, no fees** — nothing to pay, nothing to register.
6. **Limitation of liability** — Jisrr is not liable for decisions taken from its information.
7. **Governing law** — Italian law; mandatory protections where you live still apply.
8. **Changes and contact** — write to `[CONTACT EMAIL]`; link to `/privacy`.

- [ ] **Step 4: Run the test**

Run: `pnpm test tests/content/legal-content.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add content tests/content/legal-content.test.ts
git commit -m "feat: add trilingual privacy and terms MDX documents"
```

---

### Task 3: MDX toolchain, documents map, and the two pages

**Files:**
- Modify: `package.json`, `next.config.ts`, `tsconfig.json`
- Create: `src/mdx-components.tsx`, `src/lib/legal/documents.ts`, `src/app/[locale]/privacy/page.tsx`, `src/app/[locale]/terms/page.tsx`
- Test: `tests/app/legal-pages.test.tsx` (Create)

**Interfaces:**
- Consumes: `@content/<locale>/{privacy,terms}.mdx` (Task 2), `legal.*` messages (Task 1).
- Produces: `PRIVACY` and `TERMS` (`Record<AppLocale, MDXComponent>`) from `@/lib/legal/documents`; two page modules each exporting `generateMetadata` and a default async page.

- [ ] **Step 1: Install and wire the toolchain.**
  - `pnpm add -D @next/mdx@16.3.7 @mdx-js/loader @mdx-js/react @types/mdx`. All four are build-time only (nothing imports them at request time), so devDependencies; `@mdx-js/react` is not imported but satisfies `@next/mdx`'s declared peer dependency, keeping the install clean. Confirm `pnpm view @next/mdx@16.3.7 version` returns `16.3.7` before adding.
  - `next.config.ts`: `import createMDX from "@next/mdx";` then `const withMDX = createMDX({});` and `export default withNextIntl(withMDX(nextConfig));` — keep `agentRules: false`, `experimental.globalNotFound`, and the `headers()` function exactly as they are. Do **not** add `pageExtensions` (the MDX files are imported, not routed).
  - `tsconfig.json`: add `"@content/*": ["./content/*"]` to `paths`.

- [ ] **Step 2: Write `src/mdx-components.tsx`** (named export only; no `"use client"`). `import type { MDXComponents } from "mdx/types"; import { ExternalLink } from "@/components/external-link"; import { Link } from "@/i18n/navigation";`. Export `useMDXComponents(): MDXComponents` returning:
  - `h1`: `className="text-2xl font-bold tracking-tight text-balance"` (the one page H1);
  - `h2`: `"mt-8 text-xl font-semibold"`; `h3`: `"mt-6 text-lg font-medium"`;
  - `p`: `"mt-4 text-base leading-relaxed text-muted-foreground"`;
  - `ul`: `"mt-4 flex list-disc flex-col gap-2 ps-5 text-base text-muted-foreground"`; `ol`: same with `list-decimal`; `li`: `"leading-relaxed"`;
  - `strong`: `"font-semibold text-foreground"`;
  - `a`: `({ href, children }) => typeof href === "string" && /^https?:\/\//.test(href) ? <ExternalLink href={href}>{children}</ExternalLink> : <Link href={typeof href === "string" ? href : "#"}>{children}</Link>`.

- [ ] **Step 3: Write `src/lib/legal/documents.ts`** — six static default imports from `@content/…`, then `export const PRIVACY = { en: EnPrivacy, fr: FrPrivacy, ar: ArPrivacy } as const;` and `export const TERMS = { en: EnTerms, fr: FrTerms, ar: ArTerms } as const;`.

- [ ] **Step 4: Write the two pages.** Each mirrors `src/app/[locale]/scholarships/page.tsx`: `type Props = { params: Promise<{ locale: string }> }`; `generateMetadata` awaits params, `hasLocale(routing.locales, locale)` else `notFound()`, `getTranslations({ locale, namespace: "legal.privacy.meta" })` (resp. `legal.terms.meta`), returns `pageMetadata({ env: readSiteEnv(), locale, path: "/privacy", title: t("title"), description: t("description") })`. The default page: guard, `setRequestLocale(locale)`, `const t = await getTranslations({ locale, namespace: "legal" })`, `const Document = PRIVACY[locale]` (resp. `TERMS[locale]`), return `<article className="max-w-prose text-start"><Document /><p className="mt-8 text-sm text-muted-foreground">{t("updated")}</p></article>`.

- [ ] **Step 5: Write the failing test** `tests/app/legal-pages.test.tsx` (`// @vitest-environment jsdom`). Mock `@/lib/legal/documents` with stub components, one per locale/doc, that render `<h1 data-doc="privacy">privacy document</h1>` (and a matching terms stub), e.g. `vi.mock("@/lib/legal/documents", () => { const Doc = (id: string) => () => <h1 data-doc={id}>{id} document</h1>; return { PRIVACY: { en: Doc("privacy"), fr: Doc("privacy"), ar: Doc("privacy") }, TERMS: { en: Doc("terms"), fr: Doc("terms"), ar: Doc("terms") } }; });`. Mock `next-intl/server` with the real catalogues (copy the block from `tests/app/scholarships-page.test.tsx`). Import both page modules with `await import(...)`. Assert for each `[privacy, terms]` and each locale in `["fr","ar"]`:
  - `generateMetadata` returns the catalogue value of `legal.<doc>.meta.title` / `.description` via `pageMetadata` (compare `metadata.title`/`metadata.description`);
  - unknown locale (`"xx"`) rejects with a 404 digest from both the page and `generateMetadata`;
  - `renderToString` of the awaited element (wrapped in `NextIntlClientProvider` with the language catalogue) contains exactly one `<h1>` with the stub `data-doc`, and the `legal.updated` text;
  - every `a[href]` starts with `/${locale}/` or `https://` or `#`.
  - Add one test: none of `src/app/[locale]/privacy/page.tsx`, `src/app/[locale]/terms/page.tsx`, `src/lib/legal/documents.ts`, `src/mdx-components.tsx` contains `"use client"` (read with `readFileSync`).

- [ ] **Step 6: Run the test, then verify the real MDX toolchain**

Run: `pnpm typecheck && pnpm test tests/app/legal-pages.test.tsx`
Expected: PASS.
Then prove `@next/mdx` compiles the documents under Turbopack with a real build:
Run: `pnpm build`
Expected: exit 0, no MDX loader error. If Turbopack rejects the plain path (a build error naming the MDX rule), switch to the documented fallback `next-mdx-remote/rsc`, but first try adding `pageExtensions: ["js","jsx","ts","tsx","mdx"]` to `nextConfig` — that is the standard MDX setup and is the most likely fix.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml next.config.ts tsconfig.json src/mdx-components.tsx src/lib/legal/documents.ts "src/app/[locale]/privacy/page.tsx" "src/app/[locale]/terms/page.tsx" tests/app/legal-pages.test.tsx
git commit -m "feat: render trilingual privacy and terms pages from MDX"
```
Commit body: justify `@next/mdx`, `@mdx-js/loader`, `@mdx-js/react`, `@types/mdx` ("required to render the MDX legal documents; no alternative without a build-time toolchain; `@mdx-js/react` satisfies `@next/mdx`'s peer dependency").

---

### Task 4: Footer links + SEO

**Files:**
- Modify: `src/components/site-footer.tsx`, `src/lib/seo.ts`, `tests/lib/seo.test.ts`, `tests/app/metadata-wiring.test.tsx`

**Interfaces:**
- Consumes: `footer.privacyLink` / `footer.termsLink` (Task 1), the page modules (Task 3).

- [ ] **Step 1: Add the footer links row.** In `src/components/site-footer.tsx`, import `Link` from `@/i18n/navigation` and, inside the first column after the existing `<p>`s, add one line: `<p className="text-sm"><Link href="/privacy" className="font-medium text-primary underline underline-offset-4">{t("privacyLink")}</Link><span aria-hidden="true" className="mx-2 text-muted-foreground">·</span><Link href="/terms" className="font-medium text-primary underline underline-offset-4">{t("termsLink")}</Link></p>`. Keep `footer.privacy`, `footer.privacyLogs` and `footer.sources` unchanged.

- [ ] **Step 2: SEO.** In `src/lib/seo.ts` extend `INDEXABLE_PATHS` to `["", "/profile", "/scholarships", "/privacy", "/terms"]`.

- [ ] **Step 3: Update the two affected tests.**
  - `tests/lib/seo.test.ts`: the `INDEXABLE_PATHS` expectation becomes `["", "/profile", "/scholarships", "/privacy", "/terms"]` (rename the test "lists the home, profile, scholarships, privacy and terms routes"); the sitemap length becomes `(5 + 2) * 3`.
  - `tests/app/metadata-wiring.test.tsx`: add `vi.mock("@/lib/legal/documents", () => { const Doc = () => null; return { PRIVACY: { en: Doc, fr: Doc, ar: Doc }, TERMS: { en: Doc, fr: Doc, ar: Doc } }; });` next to the existing mocks, import `* as privacy from "@/app/[locale]/privacy/page"` and `* as terms from "@/app/[locale]/terms/page"`, and add `["privacy", "/privacy", …]` and `["terms", "/terms", …]` to `indexablePages`.

- [ ] **Step 4: Run the tests**

Run: `pnpm test tests/lib/seo.test.ts tests/app/metadata-wiring.test.tsx`
Expected: PASS (canonical + alternates for `/privacy` and `/terms`; sitemap length matches).

- [ ] **Step 5: Commit**

```bash
git add src/components/site-footer.tsx src/lib/seo.ts tests/lib/seo.test.ts tests/app/metadata-wiring.test.tsx
git commit -m "feat: link privacy and terms from the footer and the sitemap"
```

---

### Task 5: End-to-end coverage and the pre-launch checklist

**Files:**
- Create: `tests/e2e/legal.spec.ts`
- Modify: `docs/ops/prelaunch-checklist.md`

- [ ] **Step 1: Write `tests/e2e/legal.spec.ts`.** Loop `E2E_LOCALES` (`tests/e2e/support/locales.ts`) and `translatorFor(locale)` (`tests/e2e/support/messages.ts`). For each locale:
  - from `page.goto(`/${locale}`)`, click the footer link named `t("footer.privacyLink")`, expect the URL to end `/privacy`, expect one visible `h1`, expect `page.getByText("GoatCounter")` and `page.getByText("Vercel")` visible (proper nouns, same in every locale);
  - assert an internal cross-link rendered from the MDX is locale-prefixed: on the privacy page, the link whose href ends `/terms` has an href starting `/${locale}/` (this is the only place the `a` mapper runs on real MDX);
  - run `expectNoSeriousViolations(page, \`privacy ${locale}\`, testInfo)`;
  - back on the home page, click the footer link named `t("footer.termsLink")`, expect `/terms`, one `h1`, `expectNoSeriousViolations(page, \`terms ${locale}\`, testInfo)`.

- [ ] **Step 2: Run the spec**

Run: `pnpm test:e2e tests/e2e/legal.spec.ts`
Expected: PASS for the `phone` and `desktop` projects, `fr` and `ar`. The `webServer` command builds the e2e fixture and starts `next start`; a cold run takes minutes.

- [ ] **Step 3: Update `docs/ops/prelaunch-checklist.md` A4.** Set Status to `Code done` and put in Evidence: the two routes, the content paths (`content/{en,fr,ar}/{privacy,terms}.mdx`), the footer link, and `tests/e2e/legal.spec.ts`; keep the existing note that the controller placeholders `[CONTROLLER NAME]` / `[CONTACT EMAIL]` and the final legal review remain an Owner action.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/legal.spec.ts docs/ops/prelaunch-checklist.md
git commit -m "test: cover the legal pages end to end and close pre-launch A4"
```

---

## Final verification (whole branch)

- [ ] `pnpm typecheck` — PASS
- [ ] `pnpm test` — PASS
- [ ] `pnpm lint` — PASS
- [ ] `pnpm data:check` — unaffected (no `data/` change)
- [ ] Browser check in **fr (LTR)** and **ar (RTL)** on `/fr/privacy`, `/ar/privacy`, `/fr/terms`, `/ar/terms`: one H1, readable RTL, footer links work.
- [ ] `reviewer` subagent over the full branch diff.
- [ ] `finishing-a-development-branch`: open a PR from `feat/privacy-terms` (never push to `main`).
