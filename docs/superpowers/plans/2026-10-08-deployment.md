# Deployment infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything needed to deploy the guest release to Vercel Hobby (fra1) safely and repeatably: safe-by-default site identity, security and cache headers, SEO files, inert-until-configured GoatCounter, config as code, a CI-gated production deploy job, a smoke tool, and the runbook/ADR/checklist.

**Architecture:** One pure module (`src/lib/site-env.ts`) reads and validates the three optional env vars and decides whether a build is indexable (safe by default: no `NEXT_PUBLIC_SITE_URL` ⇒ noindex everywhere). Headers, robots, sitemap, metadata and the analytics loader consume it. Production deploys come from a GitHub Actions job gated on the existing CI jobs; PR previews come from Vercel's Git integration. Nothing depends on Vercel system env vars at build time.

**Tech Stack:** Next.js 16.3 (App Router, Turbopack, `proxy.ts`), next-intl 4, TypeScript strict, Vitest, Playwright, GitHub Actions, Vercel CLI, pnpm 10, Node 24, Biome.

Spec: `docs/superpowers/specs/2026-10-08-deployment-design.md` (read it first; it lists the verified Vercel facts).

## Global Constraints

- Worktree `C:\Users\dagda\Downloads\nex\UniWay-deploy`, branch `feat/deployment`, based on `origin/main` 1dd8de43. Never touch `C:\Users\dagda\Downloads\nex\UniWay` (owner's checkout, dev server on :3000).
- Before any pnpm/next command: `export SWC_NATIVE_BINDING_CACHE='C:\Users\dagda\.swc-cache'`. The Bash tool strips backslashes: write regexes and Windows paths with the Edit/Write tools, not shell heredocs/sed.
- Do not create, link, configure or deploy anything in the owner's Vercel/GitHub/DNS accounts. Never ask for tokens or secrets. Do not run `vercel login`/`vercel link`/`vercel deploy`.
- Do not edit `data/` or `data-staging/`. Do not edit `tests/e2e/support/js-budget.ts` (any row). If a change would exceed a ratchet row, STOP and report the numbers.
- Conventions: named exports (Next file conventions excepted), no `any`, no `@ts-ignore`, no non-null `!`, Biome formatting (2 spaces, 100 cols, double quotes), `src/domain` untouched, client-reachable code imports no Zod. Latest stable packages, no new dependencies in this plan.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`), `git add` explicit paths, never `git add -A`, never amend another agent's commit, never push to `main`. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Verification commands (all from the worktree): `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm data:check`, `pnpm build`, `pnpm perf:js`, `pnpm test:e2e` (alone, nothing else running).
- Every task ends with an Opus `reviewer` pass (orchestrator dispatches it); the task is not done until the reviewer approves.

## Execution protocol (for the orchestrator)

Tasks 1 to 3 are sequential (each uses the previous one's module). Tasks 4, 5, 6 are independent of each other once Task 3 is merged but run sequentially because they edit shared files (`next.config.ts`, `layout.tsx`, `ci.yml`, `package.json`). Task 7 (docs) comes after 6; Task 8 (measure, docs numbers, full verification) last. Implementer model: Sonnet (`implementer`). Reviewer: Opus (`reviewer`).

## File map

| File | Responsibility |
|---|---|
| `src/lib/site-env.ts` (new) | Parse/validate `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SNAPSHOT_BASE_URL`, `NEXT_PUBLIC_GOATCOUNTER_URL`; derive `indexable`. Pure. |
| `src/lib/security-headers.ts` (new) | `securityHeaderRules(indexable)`; HSTS, nosniff, Referrer-Policy, Permissions-Policy, structural CSP, optional X-Robots-Tag. |
| `src/lib/seo.ts` (new) | Pure builders: `buildRobots`, `buildSitemap`, `pageMetadata`, `localizedUrl`. |
| `src/app/robots.ts`, `src/app/sitemap.ts` (new) | Thin Next wrappers over `seo.ts`. |
| `src/lib/analytics.ts` (new) | `JOURNEY_EVENTS`, `track()`. Client-safe, tiny. |
| `src/components/analytics-loader.tsx` (new) | Server component emitting the inline idle loader when enabled. |
| `src/proxy.ts`, `src/i18n/routing.ts` | Narrow matcher; `alternateLinks: false`. |
| `next.config.ts` | Validate env at load; add security headers. |
| `vercel.json`, `.vercelignore` (new) | Vercel project config as code. |
| `.github/workflows/ci.yml` | New `deploy` job. |
| `scripts/ops/smoke.ts` (new), `package.json` | `pnpm ops:smoke <url>`. |
| `tests/e2e/deploy-surface.spec.ts` (new) | Headers/robots/sitemap/404 on the fixture build. |
| `docs/ops/*.md`, `.claude/docs/decisions/0011-deployment.md` | Runbook, limits runbook, checklist, ADR. |

---

### Task 1: Site environment module, build-time validation, `.env.example`

**Files:**
- Create: `src/lib/site-env.ts`
- Create: `tests/lib/site-env.test.ts`
- Modify: `next.config.ts`, `.env.example`
- Read first: `src/lib/snapshot/use-snapshot.ts` (the `snapshotBaseUrl` function and what it accepts), `tests/next-config.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type SiteEnv = {
    siteUrl: string | null;        // origin without trailing slash, e.g. "https://jisr.vercel.app"
    indexable: boolean;            // siteUrl !== null && VERCEL_ENV !== "preview"
    snapshotBaseUrl: string | null;
    goatCounterUrl: string | null; // validated always, returned only when indexable
  };
  export class SiteEnvError extends Error {}
  export function readSiteEnv(env?: Record<string, string | undefined>): SiteEnv; // default process.env; throws SiteEnvError
  ```

- [ ] **Step 1: Write the failing tests** (`tests/lib/site-env.test.ts`)

```ts
import { describe, expect, it } from "vitest";

import { readSiteEnv, SiteEnvError } from "@/lib/site-env";

describe("readSiteEnv", () => {
  it("is not indexable and has no urls when nothing is set (safe by default)", () => {
    expect(readSiteEnv({})).toEqual({
      siteUrl: null,
      indexable: false,
      snapshotBaseUrl: null,
      goatCounterUrl: null,
    });
  });

  it("treats blank values as unset", () => {
    expect(readSiteEnv({ NEXT_PUBLIC_SITE_URL: "  ", NEXT_PUBLIC_GOATCOUNTER_URL: "" }).siteUrl).toBe(null);
  });

  it("is indexable with a valid site url", () => {
    const env = readSiteEnv({ NEXT_PUBLIC_SITE_URL: "https://jisr.vercel.app" });
    expect(env.siteUrl).toBe("https://jisr.vercel.app");
    expect(env.indexable).toBe(true);
  });

  it("is never indexable on a Vercel preview even with a site url", () => {
    const env = readSiteEnv({ NEXT_PUBLIC_SITE_URL: "https://jisr.vercel.app", VERCEL_ENV: "preview" });
    expect(env.indexable).toBe(false);
    expect(env.siteUrl).toBe("https://jisr.vercel.app");
  });

  it.each([
    "jisr.vercel.app",
    "ftp://jisr.vercel.app",
    "http://jisr.vercel.app",
    "https://jisr.vercel.app/",
    "https://jisr.vercel.app/fr",
    "https://jisr.vercel.app?x=1",
    "https://user:pw@jisr.vercel.app",
  ])("rejects site url %s", (value) => {
    expect(() => readSiteEnv({ NEXT_PUBLIC_SITE_URL: value })).toThrow(SiteEnvError);
  });

  it("allows http only for localhost", () => {
    expect(readSiteEnv({ NEXT_PUBLIC_SITE_URL: "http://localhost:3101" }).siteUrl).toBe("http://localhost:3101");
  });

  it.each(["/snapshots", "https://cdn.example.com/snapshots", "https://cdn.example.com"])(
    "accepts snapshot base url %s",
    (value) => {
      expect(readSiteEnv({ NEXT_PUBLIC_SNAPSHOT_BASE_URL: value }).snapshotBaseUrl).toBe(value);
    },
  );

  it.each(["snapshots", "//cdn.example.com", "http://cdn.example.com", "/snapshots/", "/s?x=1", "/s#h"])(
    "rejects snapshot base url %s",
    (value) => {
      expect(() => readSiteEnv({ NEXT_PUBLIC_SNAPSHOT_BASE_URL: value })).toThrow(SiteEnvError);
    },
  );

  it("accepts a goatcounter url only in production, but validates it always", () => {
    const url = "https://jisr.goatcounter.com/count";
    expect(readSiteEnv({ NEXT_PUBLIC_SITE_URL: "https://jisr.vercel.app", NEXT_PUBLIC_GOATCOUNTER_URL: url }).goatCounterUrl).toBe(url);
    expect(readSiteEnv({ NEXT_PUBLIC_GOATCOUNTER_URL: url }).goatCounterUrl).toBe(null);
    for (const bad of ["https://evil.example/count", "http://jisr.goatcounter.com/count", "https://jisr.goatcounter.com/count?x=1", "https://jisr.goatcounter.com"]) {
      expect(() => readSiteEnv({ NEXT_PUBLIC_GOATCOUNTER_URL: bad })).toThrow(SiteEnvError);
    }
  });

  it("names the offending variable in the error", () => {
    expect(() => readSiteEnv({ NEXT_PUBLIC_SITE_URL: "nope" })).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});
```

- [ ] **Step 2: Run to confirm failure.** `pnpm exec vitest run tests/lib/site-env.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `src/lib/site-env.ts`. Behaviour exactly as the tests state. Sketch (keep functions small, no Zod):

```ts
export class SiteEnvError extends Error {}

type RawEnv = Record<string, string | undefined>;

function read(env: RawEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === undefined || value === "" ? undefined : value;
}

function fail(name: string, why: string): never {
  throw new SiteEnvError(`${name}: ${why}`);
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parseSiteUrl(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const name = "NEXT_PUBLIC_SITE_URL";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fail(name, `"${raw}" is not an absolute URL`);
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    return fail(name, "must be https (http only for localhost)");
  }
  if (url.username !== "" || url.password !== "" || url.origin !== raw) {
    return fail(name, "must be a bare origin: no credentials, path, query, hash or trailing slash");
  }
  return url.origin;
}
```
Write `parseSnapshotBaseUrl` (accept `/x` that is not `//x`, no `?`/`#`, no trailing `/`; or `https://` URL whose `origin + pathname` has no trailing slash unless pathname is `/`... the three accepted examples in the tests include a bare origin, which `new URL().pathname === "/"`; accept it and return the raw value) and `parseGoatCounterUrl` (regex `^https:\/\/[a-z0-9-]+\.goatcounter\.com\/count$`). Before writing the snapshot parser, read `snapshotBaseUrl()` in `src/lib/snapshot/use-snapshot.ts` and make sure every value this parser accepts is handled by it, and add a test line for anything it treats specially.

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Wire into `next.config.ts`.** Import `readSiteEnv` by relative path (`./src/lib/site-env`, like the existing `./src/lib/snapshot-headers` import) and call it once at module load: `const siteEnv = readSiteEnv();`. A thrown `SiteEnvError` fails the build with a readable message. Do not use `siteEnv` for anything yet (Task 2 does). Add one test in `tests/next-config.test.ts` that importing the config does not throw with the current (unset) environment — it already imports it, so assert `nextConfig` is defined. Do not stub `process.env` in that file.

- [ ] **Step 6: `.env.example`.** Replace its contents' guest-release section with:

```
# Jisr environment variables. Copy to .env.local for local overrides; never commit real values.
# The guest release needs none: every variable below is optional and the site is safe without them.
# Values are validated at build time (src/lib/site-env.ts); a malformed value fails `next build`.
#
# Public origin of the site, e.g. https://jisr.vercel.app (no path, no trailing slash). Set it ONLY in
# the Vercel *Production* environment scope. Unset => the build is not indexable: robots.txt
# disallows everything, pages send X-Robots-Tag: noindex, and there is no sitemap or canonical URL.
# This is what keeps preview deployments out of search engines.
# NEXT_PUBLIC_SITE_URL=
# Base URL of the published data snapshots. Defaults to /snapshots (same origin); set it only when
# snapshots move to a CDN (ADR 0004). A path starting with "/" or an https:// URL, no trailing slash.
# NEXT_PUBLIC_SNAPSHOT_BASE_URL=
# GoatCounter endpoint, https://<code>.goatcounter.com/count. Only used when the build is indexable
# (production). Unset => no analytics script is rendered at all.
# NEXT_PUBLIC_GOATCOUNTER_URL=
#
# Phase 2 (accounts, Neon EU, Better Auth) — not used yet:
# DATABASE_URL=
# DATABASE_URL_UNPOOLED=
# BETTER_AUTH_SECRET=
# BETTER_AUTH_URL=
```

- [ ] **Step 7: Verify and commit.** `pnpm typecheck && pnpm lint && pnpm exec vitest run tests/lib/site-env.test.ts tests/next-config.test.ts`. Prove the build gate once by hand: `NEXT_PUBLIC_SITE_URL=nope pnpm exec next build` must abort with `NEXT_PUBLIC_SITE_URL: ...` (it fails at config load, before compiling). Then:

```bash
git add src/lib/site-env.ts tests/lib/site-env.test.ts next.config.ts tests/next-config.test.ts .env.example
git commit -m "feat: validated site environment with safe-by-default indexing"
```

---

### Task 2: Security headers

**Files:**
- Create: `src/lib/security-headers.ts`, `tests/lib/security-headers.test.ts`
- Modify: `next.config.ts`, `tests/next-config.test.ts`

**Interfaces:**
- Consumes: `readSiteEnv()` / `SiteEnv.indexable` (Task 1); `SNAPSHOT_HEADER_RULES` (existing).
- Produces: `export function securityHeaderRules(indexable: boolean): HeaderRules` (same `HeaderRules` type as in `src/lib/snapshot-headers.ts`; export that type from there if it is not exported yet).

- [ ] **Step 1: Write failing tests.** Assert, for `securityHeaderRules(true)`: one rule with `source: "/:path*"` containing exactly these header keys with these values:
  - `Strict-Transport-Security`: `max-age=63072000`
  - `X-Content-Type-Options`: `nosniff`
  - `Referrer-Policy`: `strict-origin-when-cross-origin`
  - `Permissions-Policy`: `camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()`
  - `Content-Security-Policy`: `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`
  and no `X-Robots-Tag`. For `securityHeaderRules(false)` the same plus `X-Robots-Tag: noindex, nofollow`. Assert the CSP string contains no `script-src`/`default-src`, with a comment explaining why (static pages have no per-request nonce; see ADR 0011). In `tests/next-config.test.ts` assert that `nextConfig.headers()` still contains the immutable shard rule and the `no-cache` manifest rule, and that a `/:path*` rule exists with the nosniff header.
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement** `securityHeaderRules` returning `[{ source: "/:path*", headers: [...] }]`.
- [ ] **Step 4: `next.config.ts`:** `async headers() { return [...SNAPSHOT_HEADER_RULES, ...securityHeaderRules(siteEnv.indexable)]; }`.
- [ ] **Step 5: Real check.** `pnpm build:e2e` is not needed; run the real `pnpm build` then `pnpm exec next start -p 3101` in the background and `curl -sI http://localhost:3101/fr`, `/snapshots/manifest.json` and one `/snapshots/s/...` file (list `public/snapshots/s` for a name). Paste the three header sets into your report. Confirm `Cache-Control` on snapshot paths is unchanged and the security headers are on all three. Confirm the page is not broken by the CSP: open `/fr` and `/fr/profile` in the Browser pane (or Playwright) and check the console for CSP violations (none expected: there is no `script-src`). Stop the server. Port 3101 only; never 3000.
- [ ] **Step 6: Commit.**

```bash
git add src/lib/security-headers.ts src/lib/snapshot-headers.ts tests/lib/security-headers.test.ts next.config.ts tests/next-config.test.ts
git commit -m "feat: security headers, structural CSP and noindex header for non-production builds"
```

---

### Task 3: Robots, sitemap, canonical/hreflang and social metadata

**Files:**
- Create: `src/lib/seo.ts`, `tests/lib/seo.test.ts`, `src/app/robots.ts`, `src/app/sitemap.ts`
- Modify: `src/app/[locale]/layout.tsx` (add `generateMetadata`/`metadata` for `metadataBase` and `openGraph.siteName`), the `generateMetadata` of `src/app/[locale]/page.tsx`, `profile/page.tsx`, `scholarships/page.tsx`, `programs/[slug]/page.tsx`, and `matches/page.tsx`, `plan/page.tsx`, `compare/page.tsx` (noindex), plus the existing page tests under `tests/app/` if they assert metadata.
- Read first: each page's current metadata, `src/lib/snapshot/server.ts` (`programStaticParams`), `messages/en.json` `metadata`.

**Interfaces:**
- Consumes: `SiteEnv` (Task 1), `routing.locales`, `AppLocale`.
- Produces (all in `src/lib/seo.ts`, no `server-only`, no Next imports except types):
  ```ts
  export const INDEXABLE_PATHS: readonly string[]; // ["", "/profile", "/scholarships"] — locale-relative, "" = home
  export function localizedUrl(siteUrl: string, locale: AppLocale, path: string): string; // `${siteUrl}/${locale}${path}`
  export function buildRobots(env: SiteEnv): MetadataRoute.Robots;
  export function buildSitemap(env: SiteEnv, programSlugs: readonly string[]): MetadataRoute.Sitemap;
  export function pageMetadata(args: {
    env: SiteEnv; locale: AppLocale; path: string; title: string; description: string; index?: boolean;
  }): Metadata;
  ```
  `index` defaults to `true`. `buildRobots` returns `{ rules: { userAgent: "*", disallow: "/" } }` when not indexable, else `{ rules: { userAgent: "*", allow: "/" }, sitemap: `${siteUrl}/sitemap.xml` }`. `buildSitemap` returns `[]` when not indexable; else one entry per `INDEXABLE_PATHS` × locale and per programme slug × locale (`/programs/${slug}`), each `url` the `fr`... no: each entry's `url` is its own locale URL and `alternates.languages` maps `fr`, `en`, `ar` and `x-default` (= the `fr` URL) to the sibling URLs. `pageMetadata` returns `{ title, description }` plus, when `env.indexable`: `alternates: { canonical, languages }` (absolute URLs via `localizedUrl`), `openGraph: { type: "website", siteName: "Jisr", title, description, url, locale: <fr_FR | en_GB | ar_MA> }`, `twitter: { card: "summary", title, description }`; when `index === false` it adds `robots: { index: false, follow: true }` (and no alternates). When not indexable it returns `{ title, description }` only (no relative URLs, so Next's metadataBase warning cannot fire) plus the `robots` entry when `index === false`. The layout sets `metadataBase: new URL(env.siteUrl)` only when `siteUrl` is not null.

- [ ] **Step 1: Failing unit tests** in `tests/lib/seo.test.ts` for every behaviour above: robots both modes; sitemap `[]` when not indexable; for `programSlugs = ["a","b"]` the indexable sitemap has `(3 paths + 2 slugs) × 3 locales = 15` entries, every entry has `alternates.languages` with exactly `fr`, `en`, `ar`, `x-default`, `x-default` equals the `fr` URL of the same path, no `/matches`, `/plan` or `/compare` URL appears, no trailing slashes; `pageMetadata` for indexable/non-indexable/`index:false`; `localizedUrl("https://x.test","ar","/profile") === "https://x.test/ar/profile"` and home `""` gives `https://x.test/ar`.
- [ ] **Step 2: Run, see failures. Step 3: Implement `src/lib/seo.ts`.**
- [ ] **Step 4: Wrappers.** `src/app/robots.ts`: `export default function robots() { return buildRobots(readSiteEnv()); }`. `src/app/sitemap.ts`: `import "server-only"`? No: the sitemap route is not a page; read `programStaticParams()` from `@/lib/snapshot/server` (it is `server-only`, which is fine in a route module) and return `buildSitemap(readSiteEnv(), params.map((p) => p.slug))`. Both must stay statically generated (check the `next build` route table: `○ /robots.txt`, `○ /sitemap.xml`; if sitemap shows as dynamic add `export const dynamic = "force-static"`).
- [ ] **Step 5: Pages.** Replace each page's returned metadata with `pageMetadata({...})` using its existing translated title/description (home: path `""`; profile `/profile`; scholarships `/scholarships`; program `/programs/${slug}`; matches/plan/compare pass `index: false`). Keep every existing title and description string identical. In the layout add `export function generateMetadata()` returning `metadataBase` (when set) and nothing else that a page would override. Update `tests/app/*.test.tsx` only where they asserted the old metadata shape.
- [ ] **Step 6: Real check** (needs a production build with the site URL set; do not leave it set afterwards): `NEXT_PUBLIC_SITE_URL=http://localhost:3101 pnpm build`, `pnpm exec next start -p 3101`, then fetch `/robots.txt`, `/sitemap.xml` (count `<url>` = 3,375+9 = expected, report the number; check one entry has `xhtml:link` for fr/en/ar/x-default), view-source of `/ar/scholarships` and a programme page for `<link rel="canonical">`, `<link rel="alternate" hreflang>`, `og:` tags and `<html lang dir>`; and `/fr/matches` for `noindex`. Then rebuild WITHOUT the variable (`pnpm build`) and confirm `/robots.txt` is `Disallow: /`, `/sitemap.xml` has no `<url>`, pages have no canonical, and `X-Robots-Tag: noindex, nofollow` is present. Also check `curl -sI http://localhost:3101/` (redirect target and status), `/no-such`, `/fr/no-such`, `/fr/programs/no-such-slug` (expect the trilingual 404 with status 404 for the last two; report what `/no-such` does). Report all results.
- [ ] **Step 7: Commit** (explicit paths of every file touched).

```bash
git commit -m "feat: robots, sitemap with hreflang alternates, canonical and social metadata"
```

---

### Task 4: Stop running the proxy on locale-prefixed paths

**Files:**
- Modify: `src/proxy.ts`, `src/i18n/routing.ts`, `tests/proxy.test.ts`

**Why:** every matched request is a Vercel Function invocation (Hobby: 1,000,000/month). Locale-prefixed paths are already served from the static prerender; the proxy only needs to redirect `/` and locale-less paths.

**Interfaces:**
- The matcher stays one inline string literal (Next parses it statically; `tests/proxy.test.ts` extracts it). New value:

```ts
matcher: ["/((?!api|_next|_vercel|snapshots|(?:fr|en|ar)(?:/|$)|.*\\..*).*)"],
```

- [ ] **Step 1: Update `tests/proxy.test.ts` first (failing).** `runs the proxy on`: `/`, `/programs`, `/profile`, `/france` (starts with "fr" but is not a locale), `/arabic`, `/enx/y`. `skips the proxy on`: all existing entries plus `/fr`, `/en`, `/ar`, `/fr/matches`, `/ar/programs/some-slug`, `/en/scholarships`. Add a test that reads the locale alternation out of the matcher literal and asserts it equals `routing.locales` (import `routing` from `@/i18n/routing`; that module has no Next imports, unlike `proxy.ts`).
- [ ] **Step 2: See the new cases fail; edit `src/proxy.ts`; see them pass.** Update the comment above the matcher: why locale-prefixed paths are skipped and that it must be kept equal to `routing.locales` (the test enforces it).
- [ ] **Step 3: `src/i18n/routing.ts`:** add `alternateLinks: false` to `defineRouting` with a comment (hreflang now comes from page metadata and the sitemap; the proxy no longer sees locale-prefixed paths, so its `Link` header would be inconsistent). Verify the option name against next-intl docs with `npx ctx7@latest docs /amannn/next-intl "alternateLinks routing option middleware"` (use `MSYS_NO_PATHCONV=1`; run `library` first if the id is wrong).
- [ ] **Step 4: Real behaviour check** (production build of the fixture is not required; use the real build): `pnpm build`, `next start -p 3101`; `curl -sI` for `/` (expect a redirect to `/fr` or the Accept-Language locale: try `-H "Accept-Language: ar"` and `en`), `/programs` (redirect to `/fr/programs` then 404), `/fr`, `/ar/scholarships`, `/en/matches` (all 200, same body as before: compare `curl -s` of `/ar/scholarships` against a build from `origin/main` is NOT needed; just confirm 200, `lang`/`dir` correct and no `Link:` header). Then run `pnpm exec vitest run` for proxy/i18n tests and `pnpm exec playwright test tests/e2e/smoke.spec.ts` (builds the fixture, port 3100 only). If anything about locale routing, redirects or language switching differs from before, revert the matcher change, keep the tests as documentation of the attempt, and report instead of forcing it.
- [ ] **Step 5: Commit.**

```bash
git add src/proxy.ts src/i18n/routing.ts tests/proxy.test.ts
git commit -m "perf: run the proxy only for / and locale-less paths (Hobby function invocations)"
```

---

### Task 5: GoatCounter loader and journey events

**Files:**
- Create: `src/lib/analytics.ts`, `tests/lib/analytics.test.ts`, `src/components/analytics-loader.tsx`, `tests/components/analytics-loader.test.tsx`
- Modify: `src/app/[locale]/layout.tsx` (render the loader), journey call sites (find them: profile form start/complete, matches island results visible, program saved, plan island with items), `tests/lib/client-imports.test.ts` only if it must learn the new module.
- Read first: the GoatCounter docs (`https://www.goatcounter.com/help/js`, `/help/events`) via WebFetch to confirm: `window.goatcounter` settings (`endpoint`, `no_onload`), `data-goatcounter` attribute, `goatcounter.count({ path, event: true })`, and that count.js is served from `https://gc.zgo.at/count.js`. If any of that differs from this plan, follow the docs and say so in the report.

**Interfaces:**
- Consumes: `SiteEnv.goatCounterUrl` (non-null only in production builds).
- Produces:
  ```ts
  export const JOURNEY_EVENTS = ["profile-started","profile-completed","matches-viewed","program-saved","plan-opened"] as const;
  export type JourneyEvent = (typeof JOURNEY_EVENTS)[number];
  export function track(event: JourneyEvent): void;
  ```
  `AnalyticsLoader({ goatCounterUrl }: { goatCounterUrl: string | null })` — renders `null` when the URL is `null`.

Behaviour of `track`: a no-op unless `window.__jisrAnalytics === true` (set by the inline loader, so disabled builds do nothing and never queue); once per event per page load (module-level `Set`); if `window.goatcounter?.count` exists call `count({ path: event, event: true })`, otherwise push the event name onto `window.__jisrEvents` for the loader to flush when count.js has loaded. No argument other than the closed union; no path, title, referrer or payload is ever passed. Declare the `window` augmentation in `analytics.ts`.

Behaviour of the loader (a server component): one `<script dangerouslySetInnerHTML>` with a small IIFE (no external script tag): sets `window.__jisrAnalytics = true` and `window.goatcounter = { endpoint: URL }`; defines `load()` that appends `<script async src="https://gc.zgo.at/count.js" data-goatcounter="URL">` and, on its `load`, flushes `window.__jisrEvents` through `window.goatcounter.count`; runs `load` after `window.load` and then `requestIdleCallback(load, { timeout: 5000 })` (fallback `setTimeout(load, 2000)`). The URL is embedded with `JSON.stringify` (it is already validated by `site-env`, which only allows `https://<code>.goatcounter.com/count`).

- [ ] **Step 1: Failing tests.** `analytics.test.ts` (jsdom): (a) without `__jisrAnalytics` nothing is called or queued; (b) with it and a stub `window.goatcounter.count`, `track("matches-viewed")` calls `count` with exactly `{ path: "matches-viewed", event: true }` once, a second call is ignored; (c) without `count`, the event lands in `__jisrEvents`; (d) `JOURNEY_EVENTS` equals the five names (a regression guard that nobody adds an event without thinking about privacy); (e) none of the names contain a digit or any profile word (`grade`, `nationality`, `country`, `field`). Use `vi.resetModules()` per test because of the module-level `Set`. `analytics-loader.test.tsx`: renders nothing for `null`; for a URL renders a script whose HTML contains the URL, `gc.zgo.at/count.js`, `requestIdleCallback` and `__jisrAnalytics`, and contains no `<script src`.
- [ ] **Step 2: See failures. Step 3: Implement both files.**
- [ ] **Step 4: Layout.** In `[locale]/layout.tsx` import `readSiteEnv` and render `<AnalyticsLoader goatCounterUrl={readSiteEnv().goatCounterUrl} />` as the last child of `<body>`. The layout is statically rendered, so this is decided at build time.
- [ ] **Step 5: Call sites.** Use the codebase graph or Grep to find the single best place for each event and add one `track("...")` line each: `profile-started` (profile form first mount with no saved profile, in an effect), `profile-completed` (where the completed profile is saved), `matches-viewed` (matches island when results are first shown), `program-saved` (the save toggle when it adds, not when it removes; use `src/lib/saved/actions.ts` or the button, whichever already runs only on add), `plan-opened` (plan island when it renders with at least one saved program). Keep each call out of render (effects or event handlers). Do not change any other behaviour. Add a unit test for any call site that has an existing component test and is cheap to extend; otherwise rely on the e2e privacy spec staying green.
- [ ] **Step 6: Budget check.** `pnpm build && pnpm perf:js` and compare against the baseline numbers printed before your change (run `pnpm perf:js` on a clean build of the previous commit first if you do not have them: `git stash` is NOT allowed, use `git worktree`-free method: build, record, then apply your change). Report per-route first-load KB before/after. Then run the Playwright perf spec alone: `pnpm exec playwright test tests/e2e/perf.spec.ts` and report pass/fail. If any ratchet row would be exceeded, STOP and report; do not edit `js-budget.ts`.
- [ ] **Step 7: Production-mode smoke by hand.** Build with `NEXT_PUBLIC_SITE_URL=http://localhost:3101 NEXT_PUBLIC_GOATCOUNTER_URL=https://example.goatcounter.com/count pnpm build`, `next start -p 3101`; confirm the inline script is in the HTML of `/fr`, there is no request to `gc.zgo.at` before idle in the Browser pane network list (the request may fail since the site code is fake: that is fine), and that without the variables the HTML contains no `goatcounter`. Rebuild without the variables afterwards.
- [ ] **Step 8: Commit** (explicit paths).

```bash
git commit -m "feat: env-gated GoatCounter loader and count-only journey events"
```

---

### Task 6: Vercel config as code, CI deploy job, smoke tool, e2e surface spec

**Files:**
- Create: `vercel.json`, `.vercelignore`, `scripts/ops/smoke.ts`, `tests/scripts/ops-smoke.test.ts`, `tests/vercel-config.test.ts`, `tests/e2e/deploy-surface.spec.ts`
- Modify: `.github/workflows/ci.yml`, `package.json` (`"ops:smoke": "tsx scripts/ops/smoke.ts"`)
- Read first: `.github/workflows/ci.yml`, `tests/scripts/` for the existing script-test style, `tests/e2e/smoke.spec.ts`.

- [ ] **Step 1: `vercel.json`.**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "regions": ["fra1"],
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm build",
  "git": { "deploymentEnabled": { "main": false } }
}
```
  Verify each key against current docs (WebFetch `https://vercel.com/docs/project-configuration`): in particular `regions` for a static+proxy project, and the exact shape of `git.deploymentEnabled` with a branch map. If a key is invalid or has a different shape, use the documented one and say so.
- [ ] **Step 2: `tests/vercel-config.test.ts`** reads `vercel.json` and asserts: `regions` is exactly `["fra1"]`; `buildCommand` is `pnpm build`; main deployments by Git are disabled (`git.deploymentEnabled.main === false`) and previews are not globally disabled (no top-level `deploymentEnabled: false`); no `headers`/`rewrites` keys (headers live in `next.config.ts`, one place); and `package.json` `engines.node` is `>=24`.
- [ ] **Step 3: `.vercelignore`** with a header comment (guards a manual `vercel deploy` from a checkout against the 15,000-file / 100 MB CLI source cap; has no effect on Git builds or `--prebuilt`): `data-staging/`, `docs/`, `tests/`, `.claude/`, `.impeccable/`, `.superpowers/`, `test-results/`, `playwright-report/`, `node_modules/`, `.next/`, `.git/`. Do NOT ignore `data/`, `public/`, `scripts/`, `src/`, `messages/`, `content/`, `package.json`, `pnpm-lock.yaml`: the build needs them. Add to the same test file a check that those needed paths are not listed.
- [ ] **Step 4: `scripts/ops/smoke.ts`** — `pnpm ops:smoke <base-url> [--expect=indexable|noindex]` (default `noindex` unless the URL is https and not localhost? NO: always require the flag explicitly; print usage and exit 2 without it). Uses `fetch` with `redirect: "manual"`. Export the check logic as pure functions (`checkHeaders(headers, expectIndexable)`, `checkRobots(body, expectIndexable)`, `checkSitemap(xml, expectIndexable)`) so `tests/scripts/ops-smoke.test.ts` can test them without a network. Checks, each printed as `PASS|FAIL name`, exit 1 if any FAIL:
  1. `GET /` → 307/308 `Location` ending with `/fr`, `/en` or `/ar` (try again with `Accept-Language: ar` and expect `/ar`).
  2. `GET /fr`, `/ar`, `/en/scholarships` → 200, `content-type` html, `content-language`/`<html lang dir>` consistent (`ar` ⇒ `dir="rtl"`).
  3. A programme page: read `/sitemap.xml` for the first programme URL when `--expect=indexable`, otherwise `/snapshots/manifest.json` plus the first `programs` shard to derive a slug (read how `src/lib/snapshot/manifest.ts` names shards); 200.
  4. `GET /fr/no-such-page` and `/fr/programs/no-such-slug` → 404 and the body contains the trilingual marker (`lang="ar"`).
  5. Security headers on `/fr`: HSTS, nosniff, Referrer-Policy, Permissions-Policy, CSP containing `frame-ancestors 'none'`.
  6. `/snapshots/manifest.json`: `cache-control: no-cache`; one `/snapshots/s/...` file: `immutable`.
  7. `/robots.txt`: `Disallow: /` for noindex, `Allow: /` + `Sitemap:` for indexable; `x-robots-tag` contains `noindex` on `/fr` only for noindex mode and is absent for indexable.
  8. `/sitemap.xml`: no `<url>` for noindex; for indexable: more than 3,000 `<url>`, contains `hreflang="x-default"`, no URL containing `/matches`, `/plan` or `/compare`.
  Keep it dependency-free (Node 24 `fetch`), no secrets, no writes.
- [ ] **Step 5: Tests for the pure checkers**, failing first, then pass. Include one that proves a missing HSTS header fails and one that proves `indexable` with a `noindex` `x-robots-tag` fails.
- [ ] **Step 6: `tests/e2e/deploy-surface.spec.ts`** (fixture build, no `NEXT_PUBLIC_SITE_URL`): `/robots.txt` is `Disallow: /`; `/fr` response has `x-robots-tag` noindex, HSTS, nosniff, CSP `frame-ancestors 'none'`; `/sitemap.xml` has no `<url>`; `/fr/no-such-page` is 404; `/` redirects to a locale. Use `request.get`/`page.request` with `maxRedirects: 0`. Do not run the whole e2e suite in this task; run only this spec: `pnpm exec playwright test tests/e2e/deploy-surface.spec.ts --project=desktop`.
- [ ] **Step 7: CI deploy job** appended to `.github/workflows/ci.yml` (the existing jobs are untouched except that nothing else changes):

```yaml
  # Production deploy. Runs only on a push to main, only after verify and e2e passed. Vercel's own
  # Git deployments of main are disabled in vercel.json (git.deploymentEnabled), so this is the only
  # path to production. PR previews still come from the Vercel Git integration.
  # Requires three repository secrets (never in code): VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID.
  # Until they are added the job fails fast with a clear message and production is not updated.
  deploy:
    name: Deploy to Vercel (production)
    needs: [verify, e2e]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    timeout-minutes: 30
    concurrency:
      group: deploy-production
      cancel-in-progress: false
    env:
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
      NEXT_TELEMETRY_DISABLED: "1"
    steps:
      - name: Check deploy secrets are configured
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
        run: |
          for name in VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID; do
            if [ -z "${!name}" ]; then echo "::error::Repository secret $name is not set (see docs/ops/deploy.md)"; exit 1; fi
          done
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm
      - name: Install Vercel CLI
        run: pnpm add --global vercel@latest
      - name: Pull Vercel production settings
        run: vercel pull --yes --environment=production --token="$VERCEL_TOKEN"
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      - name: Build
        run: vercel build --prod --token="$VERCEL_TOKEN"
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      - name: Deploy prebuilt output
        id: deploy
        run: echo "url=$(vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN")" >> "$GITHUB_OUTPUT"
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      - name: Smoke test the public site
        if: ${{ vars.SMOKE_URL != '' }}
        run: pnpm ops:smoke "${{ vars.SMOKE_URL }}" --expect=indexable
```
  Check with the Vercel CLI docs (WebFetch `https://vercel.com/docs/cli/deploy`) that `vercel deploy` prints only the URL on stdout so the capture works, and that `vercel pull --environment=production` writes the Production-scoped variables (so `NEXT_PUBLIC_SITE_URL` reaches `vercel build --prod`). Add a comment in the job noting that `pnpm install` is needed for the smoke step (add `- run: pnpm install --frozen-lockfile` before it) and fix the job accordingly. Validate the YAML syntactically (`pnpm dlx yaml-lint` is not allowed to add deps; use `node -e` with the already installed `yaml` package if present, else `npx --yes js-yaml`; or run `actionlint` only if already installed) and add `tests/ci-workflow.test.ts` that reads `ci.yml` as text and asserts: the `deploy` job `needs` both `verify` and `e2e`, its `if` restricts to push on main, and no step echoes a secret. Keep it a text-level test; do not add a YAML dependency.
- [ ] **Step 8: Run** `pnpm typecheck && pnpm lint && pnpm test`, the deploy-surface spec, and `pnpm ops:smoke http://localhost:3101 --expect=noindex` against a `next start -p 3101` of the non-indexable `pnpm build` (report the PASS/FAIL list), then once more against an indexable build (`NEXT_PUBLIC_SITE_URL=http://localhost:3101 pnpm build`) with `--expect=indexable`. Rebuild without the variable afterwards.
- [ ] **Step 9: Commit** (explicit paths).

```bash
git commit -m "chore: Vercel project config, CI-gated production deploy job and smoke tool"
```

---

### Task 7: Runbook, limits runbook, pre-launch checklist, ADR 0011

**Files (all new unless stated):**
- `docs/ops/deploy.md`, `docs/ops/limits-runbook.md`, `docs/ops/prelaunch-checklist.md`, `.claude/docs/decisions/0011-deployment.md`
- Modify: `.claude/CLAUDE.md` (Architecture/commands/ADR list only where facts changed: new `pnpm ops:smoke`, new files, ADR 0011, correction of the donations note with a pointer to ADR 0011, deploy flow one-liner), `.claude/docs/architecture.md` (one paragraph "Deployment surface"), `README` mentions only if a README already links ops docs (do not create one).
- Read first: the spec, ADR 0004, ADR 0003, the final state of Tasks 1 to 6 (so every command and env name is exact), `.claude/docs/decisions/0001-template.md`.

Content requirements (each bullet must be present; commands must be exact and copy-pasteable; steps that the owner must do are numbered and written for someone who has never used Vercel):

- **deploy.md**: (1) Who owns what table (owner: Vercel/GitHub/DNS dashboards and secrets; repo: config, headers, CI; Vercel: hosting). (2) First-time setup, click-by-click or CLI, in order: create the Vercel account with GitHub login on the Hobby plan; import the repo `negexx/jisr` (Add New → Project → Import Git Repository); Framework Preset Next.js; Root Directory `./`; leave build/install fields empty (they come from `vercel.json`); Node.js version 24.x under Settings → General; confirm Settings → Functions region is `fra1` (Frankfurt) / that `vercel.json` `regions` applies; Settings → Git: confirm Production Branch `main` and that "Ignored Build Step" is empty; deployment protection: Settings → Deployment Protection → Vercel Authentication enabled for Standard Protection (previews protected; production domain public) and explain the production `*.vercel.app` URL behaviour; env vars in Production scope only (`NEXT_PUBLIC_SITE_URL`, later `NEXT_PUBLIC_GOATCOUNTER_URL`), never in Preview. CLI route: `pnpm dlx vercel login`, `pnpm dlx vercel link` (writes `.vercel/`, gitignored), `vercel project inspect`; where to read `orgId`/`projectId` (`.vercel/project.json`); create a token (Account Settings → Tokens, scope to this team, expiry ≤ 1 year with a calendar reminder); add GitHub repo secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (Settings → Secrets and variables → Actions) and optional variable `SMOKE_URL`; the first production deploy: merge any PR to `main`, watch the `deploy` job, open the URL, run `pnpm ops:smoke https://<url> --expect=indexable`; after the first success set `SMOKE_URL`. State plainly that until the secrets exist the `deploy` job fails with a clear error and nothing is deployed. (3) Custom domain later: buy, add in Settings → Domains, apex is primary and `www` redirects to apex (308) — Vercel's dashboard option —, DNS records Vercel shows (A `76.76.21.21`/CNAME `cname.vercel-dns.com` — tell the owner to copy the values Vercel displays, not these), change `NEXT_PUBLIC_SITE_URL` in the Production scope, redeploy (any merge or "re-run the deploy job"), re-run the smoke. List the candidate domains and the 2026-10-08 availability result with the caveat that availability and prices must be re-checked at checkout. (4) Release flow diagram in text (data PR → CI + preview → merge → CI → deploy job → live), including that a data change needs no code. (5) Rollback: Vercel dashboard → Deployments → previous production deployment → ⋯ → Instant Rollback; CLI `vercel rollback`; note that a later push to main deploys again (so revert the commit as well). Disabling auto-deploy is not needed. (6) Run the production build locally on port 3101 (`pnpm build`, `pnpm exec next start -p 3101`, `pnpm ops:smoke http://localhost:3101 --expect=noindex`, and the indexable variant). (7) Env var table: name, scope, required, validated how, what happens if unset. (8) Repo-private/public note: branch protection unavailable on GitHub Free private repos; why CI gating is done in Actions; what changes if the repo is made public later (add branch protection; the job stays) and the audit items that should come first. (9) Troubleshooting: deploy job red because secrets missing; `vercel pull` 403 (token scope); preview shows Vercel login (expected); site shows 503 DEPLOYMENT_PAUSED (see limits runbook).
- **limits-runbook.md**: the verified Hobby limits table with the 2026-10-08 date and source URLs (`https://vercel.com/docs/limits`, `/docs/plans/hobby`, `/docs/limits/fair-use-guidelines`); monthly check (first Monday: Vercel dashboard → Usage; record Fast Data Transfer, CDN Requests, Function Invocations, Fast Origin Transfer, Active CPU in a small table kept in the doc's "Log" section with columns date/FDT/CDN/Fn/FOT/CPU); the 60% rule and exactly what to do at 60% (move `public/snapshots` to Cloudflare R2/Pages: steps to publish the files, set `NEXT_PUBLIC_SNAPSHOT_BASE_URL`, check the CORS headers needed and cache headers, redeploy, verify with `ops:smoke`; note this moves shard traffic off Vercel CDN Requests/Fast Data Transfer but not the pages/JS); what a cap-pause looks like (`503 DEPLOYMENT_PAUSED`, 30-day wait in most cases, manual resume per Vercel; no billing on Hobby) and the contingency (upgrade to Pro for a month, or deploy the same `.vercel/output` elsewhere is NOT supported — say instead: static export is not enabled, so the contingency is Pro or waiting; keep it honest); the estimate section (filled in Task 8 with measured requests per visit and visits per month at each cap, leave a clearly marked `<!-- TASK8 -->` marker that Task 8 replaces); non-commercial rule: quote-free paraphrase of Vercel's definition and the explicit statement that donations are allowed while ads, affiliate-primary, payments, paid hosting/editing and sponsorship-for-payment are not; contact Vercel support if unsure; this refines ADR 0004 §1.
- **prelaunch-checklist.md**: a table of every ADR 0004 "Before launch" item plus the items from this work, each with Status (`Code done` / `Owner action` / `Blocked: decision`), evidence (file or command) and who: Vercel limits verified (done 2026-10-08, link), donation policy (decision recorded), Sentry (deferred: why, what quota to verify when enabled), CNDP (not needed for guest release; gate for accounts), privacy notice + terms in en/fr/ar (Owner action; note the footer already states server logs; the notice must also list Vercel (hosting, fra1) and GoatCounter (script from gc.zgo.at, cookieless) as processors), `pnpm data:check --strict` result (filled in Task 8), `NEXT_PUBLIC_SITE_URL` set in Production, secrets added, first deploy + smoke, Node 24 set, Deployment Protection on, custom-domain decision, GoatCounter site created + env var, ar copy review status (machine draft: report the translations line from `data:check`), `lint/test/e2e green on main`, rollback rehearsed once.
- **0011-deployment.md** (ADR template from 0001, Status Accepted, date 2026-10-08): decisions (CI-gated Actions deploy + Git previews, why not branch protection; safe-by-default indexing via the Production-scope variable; structural CSP without `script-src` and the revisit condition; HSTS without includeSubDomains/preload and the revisit condition; proxy narrowed to `/` and locale-less paths; sitemap composition and noindex of personal shells; GoatCounter inline loader + closed event union; Sentry deferred with the measured reason; no `.vercelignore` effect on prebuilt); facts verified 2026-10-08 with URLs; refinement of ADR 0004 §1 (CDN Requests name, Fast Origin Transfer, donations allowed); alternatives considered (Vercel auto-deploy main, public repo, Pro, Cloudflare Pages); consequences; how to revisit.
- **CLAUDE.md / architecture.md**: minimal, factual.

- [ ] **Step 1: Write the four documents. Step 2: Verify every command and env name in them against the repo (grep), every URL is the one used above, and that nothing asks the owner to paste a secret into chat. Step 3: Run `pnpm lint` (Biome checks Markdown? it ignores it; also make sure `.claude` edits do not break anything) and commit:**

```bash
git add docs/ops .claude/docs/decisions/0011-deployment.md .claude/CLAUDE.md .claude/docs/architecture.md
git commit -m "docs: deployment runbook, limits runbook, pre-launch checklist and ADR 0011"
```

---

### Task 8: Measure, fill numbers, full verification

**Files:** Modify `docs/ops/limits-runbook.md` (replace the `<!-- TASK8 -->` marker), `docs/ops/prelaunch-checklist.md`, maybe `docs/ops/deploy.md`.

- [ ] **Step 1: Numbers.** On a clean `pnpm build` (non-indexable, default): record wall-clock time (`time pnpm build`), `.next` total size and file count, `.next/server/app` HTML file count (PowerShell `Get-ChildItem -Recurse -File | Measure-Object` is faster than `find` on this machine), `public/snapshots` size and file count, number of prerendered pages from the build log, `pnpm perf:js` first-load table. State the build's Hobby-limit fit: 45 min limit (Vercel builds on 2 vCPU; note local has 11 workers), 8 GB memory (record peak RSS if you can: `/usr/bin/time -v` is not on Windows; skip and say so), file counts versus the 15,000-source-file cap for a manual CLI upload (count the tracked files that `.vercelignore` leaves in: `git ls-files` minus ignored prefixes) and the 100 MB cap.
- [ ] **Step 2: Requests per visit.** With the fixture or real build under `next start -p 3101` and the Browser pane (or a throwaway Playwright script in the scratchpad, not committed), load `/fr`, then `/fr/profile`, `/fr/matches` with a saved profile, and one programme page; count network requests and transferred KB for a cold visit of the home page alone and for the full journey (home → profile → matches → programme → save → plan). Compute visits/month at 1,000,000 CDN requests and at 100 GB transfer. Put the table and the formula into the runbook, labelled as an estimate from a local `next start` (Vercel's CDN may add or coalesce requests).
- [ ] **Step 3: Strict data check.** `pnpm data:check --strict` — paste the result lines into the checklist (if it fails, report which records and do not touch `data/`).
- [ ] **Step 4: Full gate, in order, each output summarised in the report:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm data:check`, `pnpm build`, `pnpm perf:js`, then alone `pnpm test:e2e`. Any red: use superpowers:systematic-debugging, fix the root cause, re-run the whole gate.
- [ ] **Step 5: Whole-branch Opus review** (orchestrator): `git diff origin/main...HEAD`; fix findings; re-verify.
- [ ] **Step 6: Commit docs numbers; push branch; open a DRAFT PR** with title `feat: deployment infrastructure for the guest release (Vercel Hobby, fra1)`, body = summary, owner dashboard steps (numbered), numbers, unverified-until-real-deploy list, decisions needed; link `docs/ops/deploy.md` and `docs/ops/prelaunch-checklist.md`; attribution line per project instructions.
