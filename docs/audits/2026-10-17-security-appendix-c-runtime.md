# T2 hunter — runtime & supply chain

- **Audited commit:** `f0cc00efed2f74e7e8a816ea59585d7462f4eebe` (merge PR #60 `feat/sign-in-single-flow`), branch `audit/scratch-security`, worktree `.worktrees/audit-security`.
- **Method:** read-only static analysis + registry advisory lookup. Dependencies audited with `pnpm audit` (through Windows `cmd.exe`, WSL cannot run the Windows-built `node_modules`). Candidate findings trace to exact file:line with quoted evidence. No production requests, no fixes, no files written outside this draft. Reference data, config and lockfile read from the working tree.
- **Commands run and results:**
  - `cmd.exe /c "cd … && set SWC_NATIVE_BINDING_CACHE=… && pnpm audit --prod"` → **8 vulnerabilities: 2 high, 5 moderate, 1 low.**
  - `cmd.exe /c "… && pnpm audit"` (full) → **9 vulnerabilities: 3 high, 5 moderate, 1 low** (adds `braces`, a `shadcn` CLI dev dependency).
  - `pnpm audit --json` → advisory ids/severities/CWEs extracted (below).
  - Installed versions: `next 16.3.7`, `better-auth 1.7.7`, `drizzle-orm 0.45.4`, `pg 8.23.1`, `unpdf 1.8.1`.
  - Lockfile: `lockfileVersion 9.0`, **885 `integrity:` pins, 0 `git`/`tarball` resolutions**; `"packageManager": "pnpm@10.33.2"`; `vercel.json` `installCommand` uses `--frozen-lockfile`.
- **Files reviewed:** `next.config.ts`, `vercel.json`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.env.example`, `.gitignore`, `.vercelignore`, `.github/workflows/ci.yml`; `src/lib/{site-env,security-headers,snapshot-headers,analytics}.ts`; `src/components/{analytics-loader,external-link,numbeo-link,site-header}.tsx`; `src/proxy.ts`; `src/mdx-components.tsx`; `src/lib/auth/{accounts-enabled,handler,server,log,callback-urls,magic-link-confirm}.ts`; `src/lib/server/{email,account-export,signup}.ts`; `src/app/api/{auth/[...all],account/export}/route.ts`; `src/lib/snapshot/client.ts`; `scripts/import/{http,pdf,discover,search,llm}.ts`; `scripts/db/{harness,harness-serve}.ts`; the `content/<locale>/*.mdx` corpus. Also read the prior pass `docs/ops/security-review-accounts.md` and the sibling drafts in `docs/audits/drafts/`.

---

## Candidates

### C1 — Next.js 16.3.7 carries 6 advisories in `pnpm audit` (8 production findings overall, incl. esbuild and source-map-js), including a HIGH SSRF, patched only in ≥16.3.8

- **File/function:** dependency `next` (direct, `package.json:69` `"next": "^16.3.7"`; installed `16.3.7`). Reachability of each advisory is analysed; none is currently exploitable in this app, but the version is behind the patched line and the advisories will run until the dependency is bumped.
- **Advisories (from `pnpm audit`):**
  - **HIGH — SSRF in Image Optimization** `GHSA-cjq9-62q9-8jv4`, `CWE-918`, vulnerable `>=16.0.0 <16.3.8`.
  - MODERATE — SSG/ISR cache poisoning, self-hosted `GHSA-4jqv-mc3x-m676`, `CWE-524`.
  - MODERATE — SSG/ISR cache poisoning → cross-user content substitution + persistent DoS `GHSA-mcj8-r9mp-w47p`, `CWE-524`.
  - MODERATE — pending `use cache` fill leaks Draft Mode content `GHSA-3w37-wq28-93x7`, `CWE-524`.
  - MODERATE — App Router metadata image routes dynamicParams bypass `GHSA-f87g-xv8r-7p7x`, `CWE-346`.
  - LOW — dev-server MCP endpoint information disclosure `GHSA-39w2-rjm5-chcv`, `CWE-346`.
- **Attacker capability:** unauthenticated network client (for the SSRF/cache variants, if ever reachable).
- **Attack path / real reachability:**
  - **Image SSRF:** needs `next/image` with a remote `src` and `images.remotePatterns`. **Not reachable** — no `images` key in `next.config.ts`, no `from "next/image"` anywhere in `src` (grep returns only the `site-header.tsx:19` raw `<img>` + a biome-ignore explaining the JS-budget choice).
  - **`use cache` Draft Mode leak:** **not reachable** — no `use cache`/`unstable_cache`/`revalidate` in `src/app`; pages are static SSG.
  - **Metadata image dynamicParams bypass:** **not reachable** — no `opengraph-image*`/`twitter-image*`/`icon.*`/`apple-icon.*` route files and no `ImageResponse`/`generateImageMetadata` in `src` (a static `src/app/favicon.ico` exists; the advisory needs dynamic metadata route files).
  - **SSG/ISR cache poisoning (self-hosted):** app is deployed on Vercel (platform cache) and emits static pages; `dynamicParams = false` on the dynamic child (`nextjs-app.md` rule, program pages). Practical exposure minimal.
- **Impact:** latent — becomes real only if `next/image`, `use cache` or metadata image routes are added before the dependency is patched.
- **CWE:** CWE-918 (SSRF predominate), CWE-524, CWE-346.
- **Evidence:**
  - `pnpm audit` block: `Next.js has Server-Side Request Forgery in Image Optimization … Vulnerable versions >=16.0.0 <16.3.8 … Patched versions >=16.3.8`.
  - `next.config.ts:16-34` — no `images` key, only `headers()`, `experimental.globalNotFound`, `outputFileTracingExcludes`.
  - `grep -rn "next/image" src` → only a biome-ignore comment in `src/components/site-header.tsx:19`.
- **Safe verification idea (local only):** after a hypothetical `pnpm up next@16.3.8`, re-run `pnpm audit` and grep the same patterns; no runtime test needed. No fix performed here.

### C2 — Third-party analytics script (`gc.zgo.at/count.js`) is loaded without integrity, and the CSP has no `script-src` to constrain it

- **File/function:** `src/components/analytics-loader.tsx:8` `const COUNT_JS = "https://gc.zgo.at/count.js"`; injected at `:29-32` `s.src = …; s.setAttribute("data-goatcounter", url)`. Header policy in `src/lib/security-headers.ts:6-7` (`frame-ancestors/base-uri/object-src/form-action` only — no `script-src`/`default-src`, by documented design).
- **Attacker capability:** whoever controls `gc.zgo.at` (GoatCounter's CDN) or can MITM it; also any future dependency that can inject a script tag (none today).
- **Attack path:** the loader appends `count.js` to `<head>` on every indexable production page; the script runs same-origin with full DOM access. There is no `integrity`/`crossorigin` attribute and no `script-src` allow-list, so the browser trusts the CDN's bytes unconditionally. A compromised/updated `count.js` could read `localStorage` (the guest profile/saved/plan keys hold the student's own data), issue authenticated fetches, or exfiltrate.
- **Impact:** Low. The session cookie is HttpOnly (not readable by JS), the URL is validated to `https://<code>.goatcounter.com/count`, the script only loads when the build is indexable, and DNT/GPC opt-out is honoured (`analytics-loader.tsx:13`). This is the standard third-party-supply-chain exposure accepted by ADR 0004/0011; listed for completeness because it is the only third-party runtime code in the app.
- **CWE:** CWE-494 (download of code without integrity check); CWE-353.
- **Evidence:** `analytics-loader.tsx:8,29-32` (no `integrity`/`crossorigin`); `security-headers.ts:6-7` comment — "No script-src or default-src on purpose … Next's inline bootstrap scripts would force 'unsafe-inline'". `site-env.ts:17,85-91` restricts the endpoint pattern.
- **Safe verification idea:** locally, inspect a production HTML response (or the built `AnalyticsLoader` output) and confirm the injected `<script>` has no `integrity` attribute; compare with a local `integrity="sha384-…"` variant. Read-only.

### C3 — `ACCOUNTS_ENABLED` is read at build time for static pages and per-request for the handler, so the two surfaces can desynchronise

- **File/function:** `src/lib/auth/accounts-enabled.ts:10-14` (per-call, `env.ACCOUNTS_ENABLED`), used by `src/lib/auth/handler.ts:35` and every hook in `src/lib/auth/server.ts`; static `/[locale]/{sign-in,welcome,account}` pages read it at prerender (`.env.example:43-47` — "Static pages read it when they are built, so a change also needs a redeploy").
- **Attacker capability:** none directly — this is a deployment/operator-semantics gap, not attacker-triggerable.
- **Attack path:** if `ACCOUNTS_ENABLED` is set only in the Vercel *runtime* scope after a guest build, `/api/auth/*` and the auth Server Actions turn on while no UI links to them; if it is removed at runtime but was set at build, the static sign-in shell stays visible while the handler 403s. Server-side enforcement is always present (the gate plugin + `user.create.before` + `verification.create.before` re-check `accountsEnabled()`), so this cannot create an account or bypass a check — it only desynchronises presentation from capability.
- **Impact:** Low / operational. Worth a prelaunch note that the flag must be present in both the Build and Runtime scopes of the same production deployment for a coherent state.
- **CWE:** CWE-16 (configuration).
- **Evidence:** `accounts-enabled.ts:3-13` ("read per call — never frozen at build time"); `.env.example:46-47` ("Static pages read it when they are built, so a change also needs a redeploy before the sign-in pages appear or disappear"); `next.config.ts` reads `readSiteEnv()` at config load (`:10`) but the accounts flag is not part of `site-env.ts`.
- **Safe verification idea:** build twice locally (`ACCOUNTS_ENABLED=` then `ACCOUNTS_ENABLED=true`) and diff the presence of the sign-in route in `public`/prerender output; then call `accountsEnabled` with a stubbed env at runtime. Read-only / local.

### C4 — The data importer performs SSRF-capable fetches (no loopback/private-IP guard, redirects followed) on URLs it scrapes

- **File/function:** `scripts/import/http.ts:83-136` `fetchText(url, …)` (`fetch(url, { … })` with `redirect` default `follow`), `:174-211` `probeHttps` (`request(\`https://${host}\`, { redirect: "follow" })`); link discovery in `scripts/import/discover.ts:16-37` `extractLinks` (accepts any `https:` link found on crawled pages) and `:252-265` (follows external links from a register page).
- **Attacker capability:** a third party who controls a page the importer crawls (an institution/site that hosts a link to `https://127.0.0.1/…`, `https://169.254.169.254/…`, `https://[::1]/…`, or an internal hostname), or whoever can add a URL to the curated registry consumed by the importer.
- **Attack path:** the crawler scores and fetches links found on target pages; `extractLinks` only filters scheme (`javascript|data|mailto|tel` rejected, `http:` rejected) and same-site for scoring — it has **no** block on private/link-local/loopback hosts, and `fetch` follows redirects. A malicious page could point the importer at an internal service and the fetched body would be cached under `.cache/import` and passed to the reader/verifier.
- **Impact:** Low. This code never runs in the production bundle or on Vercel — it is a `pnpm data:*` CLI run by the developer on their own machine, over curated sources, and `pdf.ts:56` additionally requires `https://`. The cached body is text-extracted, not executed. Listed because the brief explicitly asks for "network fetches with attacker-influenced URLs".
- **CWE:** CWE-918 (SSRF).
- **Evidence:** `http.ts:102-105` (`fetch(url, { headers, signal })`, no redirect/host policy); `discover.ts:22-29` (scheme filter only); `pdf.ts:56` (`if (!url.startsWith("https://")) throw`); no `onlyBuiltDependencies`-style allow-list and no `isPrivateHost`/`127.0.0.1` check anywhere in `scripts/` (grep).
- **Safe verification idea:** unit-test `extractLinks`/the fetch layer with a stub `fetchFn` and a link to `https://127.0.0.1/x` to show it is passed through; `http.ts` already accepts an injected `fetch`, so this is a pure local test (no network).

### C5 — `BETTER_AUTH_URL` accepts `http://` in production, unlike `NEXT_PUBLIC_SITE_URL` which requires https

- **File/function:** `src/lib/auth/server.ts:185-192` `isAbsoluteHttpUrl(value)` returns true for `http:` **or** `https:`; `getAuth()` (`:390-405`) accepts it as-is and `createAuth` uses it as `baseURL` (`:259`), from which magic-link and OAuth redirect URLs are built. Compare `src/lib/site-env.ts:40-42`, which rejects non-https except localhost.
- **Attacker capability:** none — misconfiguration by the operator only.
- **Attack path:** if `BETTER_AUTH_URL` is set to `http://jisrr.org` (or a stray host), the auth instance starts and every emailed magic-link/deletion link and the Google redirect URI is generated over plain HTTP; the misconfiguration is silent (no 500), unlike a missing/relative value. The app's own `NEXT_PUBLIC_SITE_URL` validation is stricter, so the two env validators disagree.
- **Impact:** Low. Requires operator error; secrets are not exposed by an http base URL per se, but links/tokens would travel over cleartext if a user clicked them. `deleteConfirmUrl`/`signInLinkUrl` keep only the origin (`server.ts:196-198,221`), so the risk is the scheme, not a path.
- **CWE:** CWE-1188 / CWE-16 (insecure default / configuration).
- **Evidence:** `server.ts:185-192` (`protocol === "http:" || protocol === "https:"`); `server.ts:397-399` (only "is not an absolute http(s) URL" is rejected); `site-env.ts:40-42` rejects http unless localhost.
- **Safe verification idea:** unit-call `getAuth()`/the validator with `BETTER_AUTH_URL=http://example.invalid` and assert it currently starts rather than failing. Purely local, no secret needed.

### C6 — Dev-only transitive advisories and pnpm build-script policy

- **File/function:** `pnpm-lock.yaml` / `node_modules/.modules.yaml`.
- **Advisories (not reachable in the production app):**
  - HIGH — `braces <=3.0.3` stack-exhaustion DoS `GHSA-vfj7-8cjw-p6xm`, `CWE-674`; path `.>shadcn>fast-glob>micromatch>braces` (the `shadcn` CLI, a devDependency).
  - HIGH — `source-map-js >=1.0.0 <1.2.2` event-loop DoS `GHSA-68fv-2mgg-jv7q`, `CWE-1284`; paths `./better-auth>vitest>vite>postcss>source-map-js` and `.>@tailwindcss/postcss>@tailwindcss/node>source-map-js` (build/postcss only).
  - MODERATE — `esbuild <=0.24.2` dev-server request proxy `GHSA-67mh-4wv8-2f99`, `CWE-346`; paths `.>drizzle-kit>@esbuild-kit/…>esbuild` and `.>better-auth>drizzle-kit>@esbuild-kit/…>esbuild` (drizzle-kit only).
  - Build-script policy: `package.json` has no `postinstall`/`prepare`; `pnpm-workspace.yaml` lists only `ignoredBuiltDependencies: [sharp]`, and `node_modules/.modules.yaml:1861` `ignoredBuilds` shows `esbuild@0.18.20/0.25.12/0.28.2`, `@parcel/watcher@2.6.0`, `@swc/core@1.16.12` blocked by pnpm 10's default (no `onlyBuiltDependencies` declared). `pendingBuilds: []`.
- **Attacker capability:** for braces/source-map-js/esbuild, an attacker who can influence the pattern/input processed by a dev tool. Not reachable from the running site.
- **Impact:** Low — dev/build-time only; the installed esbuild binaries ship as platform optional deps, so blocking their postinstall does not break the build (the project builds and tests green per its own CI). Note that the build-script allow-list is implicit; declaring `onlyBuiltDependencies` explicitly would make the posture auditable.
- **CWE:** CWE-674, CWE-1284, CWE-346.
- **Evidence:** `pnpm audit` output (paths above); `node_modules/.modules.yaml:1861-1867`; `pnpm-workspace.yaml:1-2`.
- **Safe verification idea:** `pnpm audit --prod --json` vs full `--json` diff shows `braces` only in the full set; grep `.modules.yaml` for the blocked builds. No fix.

### C7 — `.env.example` omits the importer/test-only variables, and importer scripts load `.env.local` at runtime

- **File/function:** `.env.example` documents the app surface (`NEXT_PUBLIC_*`, `DATABASE_URL*`, `BETTER_AUTH_*`, `GOOGLE_*`, `BREVO_*`, `JISR_EMAIL_FILE_TRANSPORT`, `ACCOUNTS_ENABLED`) but **not** `OPENCODE_API_KEY` (`scripts/import/llm.ts:226,233`), `JISR_IMPORT_REFRESH` (`scripts/import/http.ts:71,85,179`), or `TEST_POSTGRES_URL` (`tests/db-race/pg.ts:27`). `scripts/import/search.ts:62-71` `readKey` calls `process.loadEnvFile?.(".env.local")` lazily at runtime to pick up a missing key.
- **Attacker capability:** none — developer-tooling hygiene.
- **Attack path:** a contributor running `pnpm data:*` without documenting these vars gets a confusing failure; `loadEnvFile(".env.local")` reads whatever `.env.local` is present in cwd, which is git-ignored (`.gitignore` `.env.*`) and untrusted if a clone is seeded with one. The script redacts the key from error bodies (`search.ts:77` `body.split(key).join("[redacted]")`).
- **Impact:** Informational. No secret is committed (see sound list), `.env.example` is complete for the app surface, and the importer is dev-only.
- **CWE:** CWE-1059 (documentation) / CWE-16.
- **Evidence:** `.env.example` (48 lines, no `OPENCODE_API_KEY`/`JISR_IMPORT_REFRESH`/`TEST_POSTGRES_URL`); `search.ts:62-71`; `llm.ts:226,233`.
- **Safe verification idea:** grep `process.env` across `src/` and `scripts/` and compare the set against `.env.example`. Read-only.

---

## Checked and sound (with evidence)

1. **No secret is committed.** `git ls-files` shows only `.env.example`; `.gitignore` ignores `.env`/`.env.*` except the example. `git grep -lE 'sk_live_|sk_test_|AKIA…|-----BEGIN|AIza…|xkeysib-…'` matches only three test files, all fabricated fixtures redacted in this report: `tests/lib/privacy/no-pii.test.ts`, `tests/lib/server/email.test.ts`, `tests/scripts/import/llm.test.ts` (e.g. `xkeysib-<REDACTED>`, `oc_sk_test_<REDACTED>`); a fourth match, `scripts/import/llm.ts:403`, is a redaction regex, not a secret.
2. **`.env.example` matches the app's env surface.** Every env name read by `src/` is documented: `DATABASE_URL` (`src/db/index.ts:12`), `GOOGLE_CLIENT_ID/SECRET` (`src/lib/auth/server.ts:277-278`), `NEXT_PUBLIC_SNAPSHOT_BASE_URL` (`src/lib/snapshot/use-snapshot.ts:35`), `ACCOUNTS_ENABLED` (`accounts-enabled.ts:11`), `BREVO_API_KEY`/`BREVO_SENDER`/`JISR_EMAIL_FILE_TRANSPORT` (`email.ts:245-251`), `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` (`server.ts:392-393`), plus `NEXT_PUBLIC_SITE_URL`/`NEXT_PUBLIC_GOATCOUNTER_URL` (site-env; `NODE_ENV`/`VERCEL_ENV` are structural, not in the example). The only omissions are importer/test-only (C7).
3. **The file email transport is impossible on Vercel.** `selectTransport` (`email.ts:244-253`): an empty `BREVO_API_KEY` on any `VERCEL_ENV` set throws before the file branch; the file branch needs `NODE_ENV ∈ {development,test}` or `JISR_EMAIL_FILE_TRANSPORT=1`, and `JISR_EMAIL_FILE_TRANSPORT=1` is still refused whenever `VERCEL_ENV` is defined. `writeMailFile` writes `mode: 0o600` under a fixed `tests/e2e/.mail` dir with a `randomUUID()` name (no traversal). Backed by `tests/lib/server/email.test.ts:330-338`.
4. **`BREVO_API_KEY=""` is treated as absent, not as a credential.** `(env.BREVO_API_KEY ?? "").trim()` → falsy (`email.ts:245`), so it falls through to the Vercel refusal instead of attempting an unauthenticated Brevo call.
5. **No `NEXT_PUBLIC_*` leaks anything sensitive.** The three public vars are the site origin, the snapshot base (must be `/snapshots` or an https origin, no credentials — `site-env.ts:61-83`) and the GoatCounter endpoint (regex `^https://[a-z0-9-]+\.goatcounter\.com/count$`, `site-env.ts:17`). None is a secret; `readSiteEnv` is server/build-only (`site-env.ts:93-95`).
6. **Security headers are present and sane.** `security-header-rules` (`security-headers.ts:15-25`) emits HSTS (`max-age=63072000`; `includeSubDomains`/`preload` deliberately omitted with a rationale), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` closing camera/mic/geolocation/payment/usb/browsing-topics, CSP `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'` (no `script-src`/`default-src` by design — static pages, documented), and `X-Robots-Tag: noindex, nofollow` whenever not indexable (`:23`). Applied to `/:path*` via `next.config.ts:31-33`. Clickjacking is covered by `frame-ancestors 'none'`. Snapshot cache rules are separate (`snapshot-headers.ts:7-16`).
7. **Vercel config is minimal and safe.** `vercel.json` has no rewrites/redirects/headers, pins region `fra1`, `installCommand: pnpm install --frozen-lockfile`, `buildCommand: pnpm build`, and `git.deploymentEnabled.main: false` (deploys go through the CI `deploy` job gated on `vars.DEPLOY_ENABLED == 'true'`; `.github/workflows/ci.yml:197`). CI `permissions: contents: read` (`ci.yml:12-13`).
8. **Proxy matcher is narrow.** `src/proxy.ts:13` excludes `api|_next|_vercel|snapshots|(?:fr|en|ar)(?:/|$)|.*\..*`; `next.config.ts:28-30` excludes `tests/**` from function traces; `.vercelignore` excludes `tests/`, `docs/`, `.claude/`, `data-staging/` and never the dirs the build needs.
9. **The MDX/content pipeline is build-time and repo-curated.** `content/<locale>/*.mdx` are statically imported (`src/lib/legal/documents.ts`, `src/lib/guides/catalog.ts`) and compiled by `@next/mdx` with a fixed `components` map (`src/mdx-components.tsx:17-39`); there is no runtime file read and no user-supplied MDX. The only `dangerouslySetInnerHTML` in the app is the fixed analytics template (`analytics-loader.tsx:45-46`). External links require an `https:` host or render as inert text (`external-link.tsx:9-33`).
10. **Server logging carries no PII.** `scrubbedAuthLog` blanks URLs, `token=` values and addresses (`src/lib/auth/log.ts:10-25`) and drops object arguments; `onAuthApiError` turns non-APIError into a detail-free 500 (`:58-66`); email failures log `{ kind, status }` only (`email.ts:312-314`); `signup.ts:95-111` logs only a whitelisted class message or a class name + SQLSTATE; `account-guard.ts:18` logs action + SQLSTATE. Backed by `tests/lib/privacy/no-pii.test.ts` (confirmed present, driving real flows).
11. **No Sentry SDK is integrated yet** — `grep -rn "sentry|@sentry"` finds no source/config, only `docs/ops/prelaunch-checklist.md` and a test; matches the rule's "Sentry config presence" as not-yet-present.
12. **Analytics events are a closed, PII-free set.** `src/lib/analytics.ts:3-9` `JOURNEY_EVENTS` is a fixed literal union; `track` takes only those strings (`:28-33`); call sites pass literals (`profile-wizard.tsx:109,214`, `matches-client.tsx:82`, `plan-client.tsx:57`, `saved/actions.ts:47`). No profile value reaches GoatCounter.
13. **Outbound email is not SSRF-able.** The Brevo endpoint is a hard-coded constant (`email.ts:56` `https://api.brevo.com/v3/smtp/email`); the destination address comes from the parsed/validated sign-in input; failure handling never reads the response body (`discardBody`, `:303-310`). No custom endpoint variable.
14. **`pglite` never reaches the app bundle.** Grep for `pglite` matches only `scripts/db/harness*.ts`, `tests/db/**`, `package.json` (devDependencies) and lockfile; `src/` has zero matches. It is wired only into the Playwright/Vitest command chains.
15. **No command injection / dynamic code execution in reachable code.** `child_process` appears only in tests (`spawnSync`) and dev scripts (`scripts/db/harness.ts:101`, `harness-serve.ts:73`, `scripts/data/demo-fixture.ts:162`), with fixed argv (`pnpm exec drizzle-kit|biome`). No `eval`/`new Function`/`vm.` in `src`.
16. **Importer file writes are hash-named or fixed-path.** `http.ts:62-64` `cachePath` = sha1(url); `pdf.ts:39-40` likewise; snapshot writer `scripts/data/run-build.ts:121-123` writes fixed shard names under `outDir`. No attacker-controlled path segment.
17. **Supply-chain lockfile posture is strong.** `lockfileVersion 9.0`, 885 `integrity:` pins, **0** `git`/`tarball`/`http` resolutions, `packageManager: pnpm@10.33.2`, install via `--frozen-lockfile`. No `postinstall` in `package.json`. `pendingBuilds: []`.

---

## Open questions

- Does the Vercel production project set `ACCOUNTS_ENABLED` in **both** the Build and Runtime scopes (needed for C3 to be benign)? Cannot be read from the repo; `docs/ops/prelaunch-checklist.md` D11 still records the flag empty while the brief says accounts are live. Worth a deployment-doc line.
- Is the `source-map-js` HIGH advisory (via `better-auth>vitest>vite>postcss`) present in the actually deployed Vercel build, or only in the local dev graph? `pnpm audit --prod` reported it, which suggests the resolver walks dev tooling through `better-auth`'s optional peers; a `pnpm audit --prod --json` on the CI runner would confirm the deployed shape.
- GoatCounter: should the loader add `integrity`/`crossorigin` (if GoatCounter publishes a stable hashed URL) or a `script-src` allow-list once Next supports hash-based CSP for static pages — ADR 0011 says "revisit". No decision recorded.
- Ownership/acknowledgement: the `docs/audits/drafts/` tree already contains `t2-hunter-surface.md` and `t2-hunter-authdata.md`; this draft intentionally does not re-derive their account/auth findings. If a consolidated run wants one document, the three should be merged by the lead.
