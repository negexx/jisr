# Deployment infrastructure (guest release) — design

Date: 2026-10-08. Branch: `feat/deployment`. Status: approved by the owner in chat ("go") after the five decisions below.

## Goal

Deploy the guest release (no accounts, no database) to Vercel Hobby, region `fra1`, safely and repeatably, and document it. Infrastructure only: no product features, no data changes, no phase-2 work. Nothing is created in the owner's Vercel, GitHub or DNS accounts by this branch; it prepares config, tests and a runbook.

## Owner decisions

| # | Decision | Answer |
|---|---|---|
| 1 | Domain | `*.vercel.app` for now; custom domain later by setting one env var and DNS. Apex canonical, `www` redirects to apex when a domain is chosen. Candidates checked 2026-10-08 (RDAP): `usejisr.com`, `jisr.fyi` unregistered; `jisr.org/.app/.eu/.ma/.io/.com/.net/.guide` taken. |
| 2 | Deploy trigger | PR previews through the Vercel Git integration. Production is deployed by a GitHub Actions job that runs only after CI is green. The repo is private on GitHub Free, so branch protection is unavailable (API: "Upgrade to GitHub Pro or make this repository public"). Making the repo public was considered and **not** recommended yet (5,784 tracked unaudited `data-staging/` files, scraped page text, closed-source decision in CLAUDE.md, no LICENSE); the design works unchanged if the repo later goes public. |
| 3 | GoatCounter | Code now, inert until `NEXT_PUBLIC_GOATCOUNTER_URL` is set. |
| 4 | Sentry | Later. Documented only; it would add client JS against the ratchet in `tests/e2e/support/js-budget.ts`, which this branch must not raise. |
| 5 | Previews | Protected by Vercel Authentication (Hobby has it; Password Protection is a $20/month Pro add-on). Previews are also non-indexable. |

## Facts verified against Vercel docs on 2026-10-08

- Hobby monthly included usage: Fast Data Transfer 100 GB, Fast Origin Transfer 10 GB, **CDN Requests 1,000,000**, Function Invocations 1,000,000, Active CPU 4 h, Provisioned Memory 360 GB-h. ADR 0004 called the request cap "edge requests"; Vercel now names it CDN Requests, and Fast Origin Transfer was not in the ADR.
- Hobby: build time 45 min, build memory 8 GB, 2 vCPU, disk 32 GB, 100 deployments/day. CLI source uploads: 100 MB and 15,000 files (applies to a plain `vercel deploy` from a checkout; `--prebuilt` uploads output instead). No upper limit on output files, but 100,000+ files slow builds.
- Over a limit, Hobby waits 30 days in most cases; a paused project serves `503 DEPLOYMENT_PAUSED` and resumes only manually from the dashboard. Spend Management (alerts) is Pro-only, so the runbook relies on a monthly manual check.
- Fair use: Hobby is non-commercial. Commercial = any method of requesting or processing payment, advertising a product or service, being paid to create/update/host the site, affiliate links as the primary purpose, or ads. **Asking for donations is explicitly not commercial.** This narrows ADR 0004 §1's donation risk; ads, paid work on the site and payments stay out.
- `vercel pull` / `vercel build --prod` / `vercel deploy --prebuilt --prod` is Vercel's documented Actions flow; with `--prebuilt`, system env vars (`VERCEL_ENV`, `VERCEL_URL`) are not injected at build time. So nothing in this design may depend on system env vars at build time.

## Baseline (origin/main 1dd8de43, local, 11 workers)

`pnpm build`: data:check + data:build + `next build` = 1m26s, 3,399 static pages (1,125 programmes × 3 locales + 24), 97 shards, snapshot `6c740a0cd15b`. Output size, file count and first-load JS are measured in Task 7 and reported.

## Design

### A. Release flow
- PR → CI (`verify`, `e2e`) + a Vercel preview build (Git integration, protected, noindex).
- Merge to `main` → CI runs again on the push → new `deploy` job (`needs: [verify, e2e]`, `if` push to `main`) runs `vercel pull --environment=production`, `vercel build --prod`, `vercel deploy --prebuilt --prod`. Secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` are repo secrets the owner adds (GitHub Environments are not used: private repos on Free lack them). `concurrency: deploy-production`, `cancel-in-progress: false`.
- `vercel.json` sets `git.deploymentEnabled: { "main": false }` so Vercel does not also deploy `main`; preview deployments from other branches keep working.
- Optional post-deploy smoke step when repo variable `SMOKE_URL` is set, running `pnpm ops:smoke <url>`.
- Rollback: Vercel Instant Rollback (dashboard) or `vercel rollback`; both documented.

### B. Config as code
- `vercel.json`: `$schema`, `framework: nextjs`, `regions: ["fra1"]`, `installCommand: pnpm install --frozen-lockfile`, `buildCommand: pnpm build`, the `git` override. Node 24 comes from `engines` (the dashboard Node setting must be 24.x; documented as an owner step), pnpm from `packageManager`.
- `.vercelignore`: guards a manual `vercel deploy` from a checkout (15,000-file / 100 MB source cap): `data-staging/`, `docs/`, `tests/`, `.claude/`, `test-results/`, `node_modules`. It does nothing for Git builds or `--prebuilt`; the file says so.
- Headers (a new `src/lib/security-headers.ts` next to `src/lib/snapshot-headers.ts`, both used by `next.config.ts`): keep the immutable shard rule and `no-cache` manifest rule; add on all routes `Strict-Transport-Security: max-age=63072000` (no `includeSubDomains`/`preload`: unsafe before the domain is chosen), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying camera, microphone, geolocation, payment, usb, browsing-topics, and `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`. **No `script-src`**: all pages are static, so there is no per-request nonce, and Next's inline bootstrap scripts would force `'unsafe-inline'`, which adds no protection. This is recorded in ADR 0011 together with the condition for revisiting (Next hash-based SRI/CSP support). `X-Frame-Options` is omitted because `frame-ancestors` covers it. When the build is not indexable, also `X-Robots-Tag: noindex, nofollow`.
- Proxy: keep the existing exclusion of assets, `_next`, `_vercel`, `api`, `snapshots`, dotted paths. Task 5 additionally stops running the proxy on already-locale-prefixed paths (`/fr`, `/fr/...`, `/en...`, `/ar...`), so each page view is not a function invocation; the proxy remains only for `/` and locale-less paths, where it redirects. Hreflang then comes from page metadata and the sitemap, not the proxy's `Link` header (`alternateLinks: false`). Verified by tests on the matcher and by a `next start` redirect check; abandoned (and reported) if behaviour changes.

### C. Safe-by-default site identity (`src/lib/site-env.ts`)
Single source for deployment env, hand-written validators (no Zod: client-reachable rules do not apply but keeping it light), loaded by `next.config.ts` so a malformed value fails the build.
- `NEXT_PUBLIC_SITE_URL`: absolute `https://` (or `http://localhost…` for local checks) origin, no path/query/trailing slash. Set in the Vercel **Production** scope only. Unset ⇒ the build is **not indexable**: robots disallow all, `X-Robots-Tag: noindex`, no canonical, empty sitemap. This is why previews (which have no Production-scope variable) are never indexed, without relying on `VERCEL_ENV`. If `VERCEL_ENV === "preview"` is present it also forces non-indexable (belt and braces).
- `NEXT_PUBLIC_SNAPSHOT_BASE_URL`: unset, a path starting with `/`, or an absolute `https://` URL; no query, hash or trailing slash.
- `NEXT_PUBLIC_GOATCOUNTER_URL`: unset or `https://<code>.goatcounter.com/count`; only honoured when indexable (production).
- `.env.example` and the env table in `docs/ops/deploy.md` list all three; nothing secret exists in the guest release.

### D. SEO
- `metadataBase` from `NEXT_PUBLIC_SITE_URL`; per-page canonical and `alternates.languages` (fr, en, ar, `x-default` = fr) via one helper; OG/Twitter basics (title, description, site name, `og:locale`, no image until a designed one exists). The program page keeps its title/description and gains canonical + alternates.
- `src/app/robots.ts`: indexable ⇒ allow `/`, point to `/sitemap.xml`; otherwise `Disallow: /`.
- `src/app/sitemap.ts`: every locale of the home, profile, scholarships routes and every programme page, with hreflang alternates. About 3,400 URLs, far under the 50,000 limit. Programme list from `programStaticParams()`. Empty when not indexable. `/matches`, `/plan` and `/compare` are static empty shells around a personal client island (thin content, nothing about the student in the HTML), so they get `robots: { index: false }` and stay out of the sitemap.
- Behaviour on Vercel documented and tested via `next start`: `/` redirects through the proxy to a locale, unknown paths and slugs return the trilingual `global-not-found` with status 404, `/robots.txt` and `/sitemap.xml` bypass the proxy.

### E. Analytics (GoatCounter, ADR 0004 §2)
- A server-rendered inline script in the `[locale]` layout (zero client JS bundle): after `load`, wait for `requestIdleCallback` (fallback `setTimeout`), then inject `https://gc.zgo.at/count.js` with `data-goatcounter=<NEXT_PUBLIC_GOATCOUNTER_URL>` and `no_onload` unset (one pageview per full load; client-side navigations are not counted, journey events carry the funnel). Rendered only when the URL is set and the build is indexable.
- `src/lib/analytics.ts`: `track(event)` where `event` is the closed union `profile-started | profile-completed | matches-viewed | program-saved | plan-opened`; no payload, no path argument, no-op when `window.goatcounter` is absent; once per page load per event. Call sites in the existing journey components, one line each. Tests prove the allowlist and the no-op.
- Privacy copy: GoatCounter is a third-party script origin (`gc.zgo.at`); the pre-launch checklist lists it for the privacy notice.

### F. Documentation
- `docs/ops/deploy.md` (setup, release flow, rollback, local production run, env table, ownership), `docs/ops/limits-runbook.md`, `docs/ops/prelaunch-checklist.md` (ties to ADR 0004's five items, split code-done vs owner-action), ADR `0011-deployment.md`. CLAUDE.md gets only the facts that changed (new commands, new files, ADR list).
- ADR 0004 is immutable: ADR 0011 refines its §1 with the facts above rather than editing it.

### G. Tools
- `scripts/ops/smoke.ts` + `pnpm ops:smoke <base-url>`: fetches `/`, `/fr`, `/ar/scholarships`, a programme page, an unknown path, `/robots.txt`, `/sitemap.xml`, `/snapshots/manifest.json`; checks status, redirect target, security headers, cache headers, `x-robots-tag`, robots/sitemap shape. Used for the local `next start` check, the optional post-deploy step, and by the owner after DNS.

## Out of scope (stated so they are not mistaken for omissions)
Sentry; accounts/Neon/Better Auth; a privacy notice and terms pages (checklist item, owner/content decision); an OG image; custom domain purchase; any `data/` change; any change to `tests/e2e/support/js-budget.ts`.

## Risks and how they are handled
- First-load JS: the GoatCounter loader and `track()` calls must not push any ratchet row. Measured with `pnpm perf:js` and the e2e `perf.spec.ts`; if any row would be exceeded, stop and report.
- `vercel build` cannot be run without the owner's login, so the exact Vercel-side behaviours (output file count, `--prebuilt` flow, Deployment Protection, proxy invocation counts, redirect/404 behaviour on Vercel's router) are **unverifiable** here and listed in the final report.
- The CDN-request cap (1,000,000/month) is likely the binding Hobby limit (each visit loads HTML + JS chunks + shards). Task 7 counts requests per visit with the e2e browser and puts a visits-per-month estimate in the runbook.
