# ADR 0011 — Deployment of the guest release: Vercel Hobby, CI-gated production deploy, safe-by-default indexing

**Status:** Accepted
**Date:** 2026-10-08

## Context

The guest release (no accounts, no database) is ready to be hosted. ADR 0004 chose Vercel Hobby (fra1) and listed a "Before launch" checklist, but its Vercel figures came from secondary sources of 2026-09-29. This ADR records how the site is deployed, the facts verified on 2026-10-08, and the decisions that follow. Spec: `docs/superpowers/specs/2026-10-08-deployment-design.md`. Runbooks: `docs/ops/deploy.md`, `docs/ops/limits-runbook.md`, `docs/ops/prelaunch-checklist.md`.

Constraints: one developer; zero recurring cost; the repository is private on GitHub Free, where branch protection is unavailable ("Upgrade to GitHub Pro or make this repository public"); no Vercel, GitHub or DNS resource is created by the repository; nothing here may raise the client JavaScript ratchet in `tests/e2e/support/js-budget.ts`.

### Facts verified on 2026-10-08

Sources: https://vercel.com/docs/limits, https://vercel.com/docs/plans/hobby, https://vercel.com/docs/limits/fair-use-guidelines, https://vercel.com/docs/cli/deploy, https://vercel.com/docs/project-configuration.

- Hobby monthly included usage: CDN Requests 1,000,000; Fast Data Transfer 100 GB; Fast Origin Transfer 10 GB; Function Invocations 1,000,000; Active CPU 4 hours; Provisioned Memory 360 GB-hours.
- Hobby builds: 45 minutes, 8 GB memory, 2 vCPU; 100 deployments per day. A CLI source upload is limited to 15,000 files and 100 MB (applies to a plain `vercel deploy` from a checkout; `--prebuilt` uploads built output).
- Over a limit, a Hobby project waits 30 days in most cases and serves `503 DEPLOYMENT_PAUSED`; it resumes only manually from the dashboard. Nothing is billed. Spend Management is Pro-only, so there are no usage alerts on Hobby.
- Fair use: Hobby is non-commercial. Commercial use includes any way of requesting or processing payment, advertising a product or service, being paid to create, update or host the site, affiliate links as the primary purpose, and ads. Asking for donations is explicitly not commercial use.
- Password Protection is a Pro add-on ($20 a month per project); Vercel Authentication is available on Hobby. Deployment Protection protects `*.vercel.app` deployment URLs.
- `vercel pull`, `vercel build --prod`, `vercel deploy --prebuilt --prod` is Vercel's documented Actions flow. With `--prebuilt` the system variables (`VERCEL_ENV`, `VERCEL_URL`) are not injected at build time, so nothing may depend on them being present at build time.
- Measured locally on the data of this branch (1,126 programmes): the default `.next` output is about 1.5 GB with about 24,000 files (3,398 HTML files; `.next/server/app` is 1.4 GB; each programme page is about 140 KB of HTML plus 78 KB of RSC plus segment files). The snapshot version changes with every data build. The sitemap lists 3,387 URLs (3 paths plus 1,126 programmes, times 3 locales).

## Decision

### 1. Release flow: Vercel previews, production by a CI-gated Actions job
- Pull requests get a protected preview from Vercel's Git integration (Vercel Authentication on; previews are also non-indexable).
- Production is deployed only by the `deploy` job in `.github/workflows/ci.yml`: `needs: [verify, e2e]`, push to `main` only, `vars.DEPLOY_ENABLED == 'true'`, `concurrency: deploy-production` without cancelling, `timeout-minutes: 30`. It runs `vercel pull --yes --environment=production`, `vercel build --prod`, `vercel deploy --prebuilt --prod`, writes the deployment URL to the step summary, and runs `pnpm ops:smoke` against `vars.SMOKE_URL` when that is set.
- `vercel.json` sets `git.deploymentEnabled: { "main": false }` so Vercel does not also deploy `main`.
- Until the owner sets `DEPLOY_ENABLED` the job is skipped; once enabled, a secrets pre-check fails fast on purpose when `VERCEL_TOKEN`, `VERCEL_ORG_ID` or `VERCEL_PROJECT_ID` is missing. Owner order: secrets, then `DEPLOY_ENABLED=true`, then (after the first successful deploy and DNS) `SMOKE_URL`.
- Least privilege in the workflow: `permissions: contents: read`; checkout with `persist-credentials: false`; the token is a step-level environment variable (`VERCEL_TOKEN`), never a `--token` argument, and only on the pre-check, `vercel pull` and `vercel deploy`. `vercel build` runs **without** the token because the build executes project scripts whose child processes would inherit it. If the first deploy fails at Build with an authentication error, give that step the token and record the change in a new ADR.
- The Vercel CLI is installed with `npm install --global vercel@latest`, unpinned, following the project rule of latest stable packages. Supply-chain trade-off accepted: a compromised CLI release would run with the token.
- The smoke step targets the public production domain in `SMOKE_URL`, not the deployment URL, because Deployment Protection covers `*.vercel.app` deployment URLs.
- Rollback: Vercel Instant Rollback (dashboard) or `vercel rollback`.

### 2. No branch protection; residual risk accepted
Branch protection is unavailable (private repository on GitHub Free), and so are GitHub Environments with branch restrictions. The release gate is the job order in Actions. **Residual risk:** a pull request from a branch of the same repository runs its own, possibly modified, `ci.yml` with the repository secrets, so write access to the repository equals deploy access, as it already equals push to `main`. Mitigation: a team-scoped Vercel token with an expiry of at most 1 year (calendar reminder); rotate it when a collaborator is added or the repository is made public. Making the repository public was considered and is not recommended yet: 5,784 tracked `data-staging/` files are unaudited and include fetched third-party page text; the project is closed-source by decision; there is no LICENSE; a history scan found no secrets. The design works unchanged if the repository becomes public later; then branch protection requiring `verify` and `e2e` is added and the audit comes first.

### 3. Safe-by-default indexing
`src/lib/site-env.ts` validates three optional variables when `next.config.ts` loads (a malformed value fails the build): `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SNAPSHOT_BASE_URL`, `NEXT_PUBLIC_GOATCOUNTER_URL`. A build is indexable only when `NEXT_PUBLIC_SITE_URL` is set and `VERCEL_ENV !== 'preview'`. The variable is set in the Vercel **Production scope only**, so previews, which have no value, are never indexable without relying on a system variable that `--prebuilt` does not provide. Not indexable means: `robots.txt` `Disallow: /`, `X-Robots-Tag: noindex, nofollow` on all responses, no canonical or alternates, an empty sitemap, and no analytics script. Indexable means canonical, hreflang (`fr`, `en`, `ar`, `x-default` = `fr`), basic Open Graph and Twitter metadata, an allowing `robots.txt` and the sitemap. `/matches`, `/plan` and `/compare` are `noindex, follow` and absent from the sitemap in every build: they are static shells around a personal client area (thin content, nothing about the student in the HTML). Apex is canonical and `www` redirects to it once a domain is chosen.

### 4. Security headers; structural CSP
`src/lib/security-headers.ts` adds on all routes: `Strict-Transport-Security: max-age=63072000`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy` denying camera, microphone, geolocation, payment, usb and browsing-topics, and `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`. The existing snapshot cache rules (immutable shards, `no-cache` manifest) are unchanged. `X-Frame-Options` is omitted because `frame-ancestors` covers it.
- **No `script-src`.** Every page is static, so there is no per-request nonce, and Next's inline bootstrap scripts would force `'unsafe-inline'`, which adds no protection. Revisit when Next supports hash-based or SRI-based CSP for statically rendered pages.
- **HSTS without `includeSubDomains` or `preload`.** Both are hard to undo and unsafe before the production domain is final. Revisit after the domain is final and every subdomain in use serves HTTPS.

### 5. Proxy narrowed to `/` and locale-less paths
Every matched request is a Vercel Function invocation (Hobby: 1,000,000 a month). The matcher in `src/proxy.ts` now also skips locale-prefixed paths (`/fr`, `/fr/...`, `/en...`, `/ar...`), which are served from the static prerender. The proxy runs only for `/` and locale-less paths, where it redirects. Hreflang comes from page metadata and the sitemap, with `alternateLinks: false` in `src/i18n/routing.ts`. A test keeps the locale alternation in the matcher equal to `routing.locales`.
- **Consequence:** the proxy no longer sets next-intl's locale header on locale-prefixed paths, so every dynamically rendered future `[locale]` route must call `setRequestLocale(locale)` itself (the existing pages and layout already do).
- **Unverified on Vercel:** that the platform router honours the compiled matcher as `next start` does, and that `/FR` (uppercase) behaves as locally. Owner check after the first deploy: `curl -sI https://<url>/FR`, `curl -sI https://<url>/fr/x`, and the function-invocation count in the dashboard.

### 6. Sitemap composition
`src/app/sitemap.ts` lists the home, profile and scholarships paths and every programme page, each in all three locales with hreflang alternates (3,387 URLs today, far under the 50,000 limit). `pnpm ops:smoke --expect=indexable` checks its structure (more than 9 URLs, a multiple of 3, every programme with its `fr`, `en` and `ar` twin, `x-default`, no personal-shell URLs) rather than an absolute size; `--min-urls=N` adds a floor.

### 7. GoatCounter: inline loader and a closed event list
`src/components/analytics-loader.tsx` is a server component that emits one inline script (zero client bundle). It renders only in an indexable build with `NEXT_PUBLIC_GOATCOUNTER_URL` set. It honours Do Not Track and Global Privacy Control, waits for the page `load` and then for idle time (`requestIdleCallback` with a 5 s timeout; 2 s `setTimeout` fallback), and injects `https://gc.zgo.at/count.js`. That is a third-party script origin and must be listed in the privacy notice. One page view is counted per full page load; client-side navigations are not counted, and journey events carry the funnel. `src/lib/analytics.ts` allows exactly five count-only events with no payload: `profile-started`, `profile-completed`, `matches-viewed`, `program-saved` (on add), `plan-opened`; each fires at most once per page load. `profile-completed` fires in create mode only; `profile-started` fires once per full load of `/profile` in create mode, so a returning student resuming a draft counts again. `count.js` itself also sends the page title, referrer, screen width and the query string with each hit; the app has no query strings and puts no profile data in titles. Setup for the owner: create a free non-commercial site at goatcounter.com (EU), set `NEXT_PUBLIC_GOATCOUNTER_URL=https://<code>.goatcounter.com/count` in the Production scope, redeploy.

### 8. Sentry deferred
Sentry is not added in this release. It would add client JavaScript against a ratchet that has almost no room: after the analytics change the `/fr/matches` initial row has about 0.1 KB of headroom (192.9 of 193 KB on the fixture build) and the programme until-idle row about 0.1 KB (239.9 of 240). The next change to those routes needs an owner decision on the ratchet. The ratchet was not touched by this work. ADR 0004 section 3 remains the plan for Sentry.

### 9. `.vercelignore` and `--prebuilt`
`.vercelignore` guards only a manual `vercel deploy` from a checkout against the CLI source-upload caps (15,000 files, 100 MB). It has no effect on Vercel Git builds (which clone the repository) or on `--prebuilt` deployments (which upload built output); the file says so.

### 10. Region
`vercel.json` sets `regions: ["fra1"]`. After the first deploy the owner confirms `fra1` in the dashboard and also sets Settings, Functions, region to Frankfurt as a fallback. Static files are served from the CDN everywhere regardless; the region only decides where function invocations (redirects from `/` and locale-less paths) run.

### 11. Refinement of ADR 0004 section 1
ADR 0004 is immutable; this ADR refines it:
- The request cap is now called **CDN Requests** (ADR 0004: "edge requests"), and **Fast Origin Transfer** (10 GB) was not in ADR 0004's list.
- **Donations are allowed.** Vercel's fair-use page says asking for donations is not commercial use. The "risk" bullet of ADR 0004 section 1 narrows accordingly: ads, affiliate links as the primary purpose, payments, being paid to create, update or host the site, and sponsorship paid in exchange for placement remain out. Re-read the page before a donation link goes live.
- Spend Management is Pro-only, so the monthly manual check and the 60% rule (`docs/ops/limits-runbook.md`) are the only early warning.

### 12. Unverified until the first real deployment
Listed in `docs/ops/deploy.md` section 10 and the pre-launch checklist: (1) whether `vercel deploy --prebuilt` accepts and how long it takes to upload an output of about 1.5 GB and about 24,000 files (risk number 1); (2) `vercel build` without the token; (3) `npm install --global vercel@latest` on the runner; (4) `fra1` honoured with `--prebuilt`; (5) proxy matcher and `/FR` on Vercel's router; (6) Deployment Protection leaving the production domain public; (7) function invocation counts against page views; (8) the GitHub-hosted runner running e2e without the local SWC workaround.

If the upload in (1) is rejected or too slow, this ADR does not solve it. Generating a subset of programme pages with on-demand rendering is not possible, because the snapshot is not traced into functions (`public/` is not available to functions; `dynamicParams = false`, ADR 0006). The real options, for a follow-up decision by the owner, are shrinking the per-page payload, or moving programme pages to incremental static regeneration with the snapshot read from a CDN URL (the `NEXT_PUBLIC_SNAPSHOT_BASE_URL` seam partly prepares this).

## Alternatives considered

- **Vercel auto-deploy of `main` through the Git integration:** simplest, but production would then deploy independently of the `verify` and `e2e` jobs, and without branch protection nothing would gate it. Rejected; previews keep the Git integration.
- **Making the repository public to get branch protection:** rejected for now for the reasons in decision 2.
- **GitHub Environments with required reviewers or branch rules:** unavailable for private repositories on the Free plan.
- **Vercel Pro:** removes the caps and adds Spend Management and Password Protection, but ends the free, non-commercial setup. Reserved as the contingency for a pause.
- **Cloudflare Pages for the whole site:** free egress, but the app relies on the Next.js proxy and the unified 404; it would be a larger migration without a measured need. Cloudflare R2 or Pages stays the plan for snapshots only, at 60% of a cap (ADR 0004).
- **A strict `script-src` CSP with nonces:** needs per-request rendering, which would turn static pages into function invocations; with hashes it is not supported by Next for static pages yet.
- **Relying on `VERCEL_ENV` alone to decide indexing:** not available at build time with `--prebuilt`; the Production-scope variable works on every path and `VERCEL_ENV` is only a second safeguard.

## Consequences

- Positive: production changes only after the full CI passes; previews and unconfigured builds cannot be indexed; the proxy no longer costs an invocation per page view; the headers, robots and sitemap are code with tests; analytics add no bundle weight; the owner has numbered runbooks and a smoke tool.
- Negative: write access to the repository equals deploy access until branch protection exists; the `vercel@latest` install is unpinned; the production deploy path is untested until the owner adds secrets; the output size is a real risk; the CSP has no `script-src`; a usage cap pauses the site and only a manual check warns about it; the matches and programme routes have almost no JavaScript budget left, which also keeps Sentry out.
- Neutral: the proxy's role shrinks to redirects; future dynamic `[locale]` routes must call `setRequestLocale`; no `www` redirect or custom domain exists until the owner buys one.

## How to revisit

ADRs are immutable once committed. If this decision turns out wrong, write a new ADR that supersedes this one — don't edit this in place. Triggers: the first deploy shows the output upload fails or is slow; the repository goes public or gains collaborators (branch protection, token rotation); a usage figure reaches 60% of a cap; the domain is chosen (HSTS `includeSubDomains`/`preload`); Next supports hash-based CSP for static pages; the owner decides on Sentry and the JavaScript ratchet; Vercel changes its fair-use or Hobby terms.
