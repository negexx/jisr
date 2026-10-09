# Deploying Jisr (Vercel Hobby, region fra1)

Last updated 2026-10-08. Decisions and reasons: `.claude/docs/decisions/0011-deployment.md`. Limits: `docs/ops/limits-runbook.md`. Launch gates: `docs/ops/prelaunch-checklist.md`.

This guide is written for the owner, who has not used Vercel before. Words in plain type are explained where they first appear. **Never paste a token, secret or password into a chat, an issue, a commit or a file in this repository.** Tokens go only into the GitHub "Secrets" form (step 6 below) and nowhere else.

## 1. Who owns what

| Part | Owner | What it is |
|---|---|---|
| Vercel account, project, dashboard settings, tokens | You | Where the site is hosted. Nothing is created there by the repository. |
| GitHub repository settings, secrets and variables | You | Where the deploy credentials live. |
| DNS and the domain name (later) | You | Bought at a registrar of your choice. |
| `vercel.json`, `.vercelignore`, headers (`next.config.ts`), robots/sitemap, CI (`.github/workflows/ci.yml`), `pnpm ops:smoke` | This repository | Everything that can be written as code. |
| Servers, CDN (the network of caches that serves files close to the visitor), TLS certificates | Vercel | Hosting. |

Terms used below: a **deployment** is one published version of the site. **Production** is the public site; a **preview** is a private test copy built for a pull request. **Scope** (or "environment") is where a Vercel variable applies: Production, Preview or Development.

## 2. How a release works

```
data or code change -> pull request
  -> GitHub Actions CI: verify + e2e          (must be green)
  -> Vercel builds a protected preview        (login required, not indexed)
  -> merge to main
  -> CI runs again on main: verify + e2e
  -> deploy job: vercel pull -> vercel build --prod -> vercel deploy --prebuilt --prod
  -> optional smoke test of SMOKE_URL
  -> live
```

A data change needs no code change: edit `data/`, run `pnpm data:check`, open a pull request. The build regenerates the snapshots (the data files the browser downloads) and every programme page. The snapshot version changes with every data build.

Details of the deploy job (`.github/workflows/ci.yml`, job `deploy`):

- It runs only for a push to `main`, only after `verify` and `e2e` passed, and only when the repository variable `DEPLOY_ENABLED` is `true`. Until you set that variable the job is skipped (grey in the Actions list, not red) and nothing is deployed.
- Once enabled, a first step checks that `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are set and fails fast with a clear message if one is missing. In that case production is not updated.
- The workflow has `permissions: contents: read`, checks out with `persist-credentials: false`, and runs one deploy at a time (`concurrency: deploy-production`, never cancelled midway).
- The token reaches `vercel pull` and `vercel deploy` as the step environment variable `VERCEL_TOKEN`, never as a `--token` argument. `vercel build` runs without the token on purpose (least privilege: the build runs the project's own install and build scripts). If the first deploy fails at the Build step with an authentication error, give that step `env: VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}` and record the change in a new ADR.
- The Vercel CLI is installed with `npm install --global vercel@latest`. It is deliberately not pinned (project rule: latest stable packages). Trade-off: a compromised or broken release of the CLI would run in the deploy job with the token. Accepted for a free, non-commercial site; revisit by pinning if that changes.
- The URL of the new deployment is written to the job's step summary. Smoke tests do not use that URL: Deployment Protection covers `*.vercel.app` deployment URLs, so the smoke step targets the public domain in `SMOKE_URL`.
- Vercel's own Git deployment of `main` is switched off in `vercel.json` (`git.deploymentEnabled.main: false`), so the Actions job is the only way to production. Pull request previews still come from Vercel's Git integration.

## 3. First-time setup (do these in order)

Time needed: about 45 minutes. You need a GitHub login with access to `negexx/jisr`.

### 3.1 Merge the deployment pull request first

Merge the pull request that contains `vercel.json` and the deploy job into `main` before you create the Vercel project. Why: `vercel.json` on `main` tells Vercel not to deploy `main` itself. The deploy job is skipped after the merge because `DEPLOY_ENABLED` is not set yet.

### 3.2 Create the Vercel project

1. Go to https://vercel.com/signup and sign up with **Continue with GitHub**. Choose the **Hobby** plan (free, personal, non-commercial).
2. In the dashboard click **Add New...** then **Project**, find `negexx/jisr` under **Import Git Repository** and click **Import**. If the repository is not listed, use the link to adjust the GitHub permissions of the Vercel app and grant access to this one repository only.
3. On the configure screen:
   - **Framework Preset**: Next.js.
   - **Root Directory**: `./`.
   - Leave **Build Command**, **Output Directory** and **Install Command** empty or at their defaults. The values come from `vercel.json` (`pnpm build`, `pnpm install --frozen-lockfile`). pnpm is picked from `packageManager` in `package.json`.
   - Do not add environment variables here yet.
4. Click **Deploy**. If Vercel offers to skip the first deployment, skip it. If it builds anyway, that is harmless: the result is a non-indexable site (see section 6).
5. Open the project, then **Settings** (project settings, not account settings) and check each of these. Where a label differs from what is written here, look for the nearest wording and follow https://vercel.com/docs/projects/overview.
   - **General**, look for **Node.js Version**: set **24.x**. `package.json` requires `>=24`; CI uses 24.
   - **Functions**, look for **Function Region**: set **Frankfurt, Germany (West) - fra1** as a fallback. `vercel.json` already says `"regions": ["fra1"]`; check again after the first deploy (section 3.8). Static files are served from the CDN everywhere regardless; the region only decides where function invocations (the redirect from `/` and from locale-less paths) run.
   - **Git**: Production Branch is `main`. Look for **Ignored Build Step** and leave it empty.
   - **Deployment Protection**: look for **Vercel Authentication** and make sure it is enabled with the standard setting (previews need a Vercel login, the production domain is public). Password Protection is a paid add-on ($20 a month per project): do not use it. Note that this protection applies to `*.vercel.app` deployment URLs. Before you announce the site, open the production domain in a private browser window without being logged in to Vercel, and check whether it loads. If it asks for a login, change the setting so that the production domain is public, and read https://vercel.com/docs/security/deployment-protection.
   - **Domains**: note the exact production domain Vercel shows (for example `https://jisr.vercel.app`; if the name was taken Vercel adds a suffix). You need it in the next step.

### 3.3 Set the Production environment variable

In **Settings** then **Environment Variables**:

1. Name `NEXT_PUBLIC_SITE_URL`.
2. Value: the production origin from the Domains screen, with `https://`, no path and no trailing slash, for example `https://jisr.vercel.app`.
3. Environments: tick **Production only**. Untick Preview and Development. This matters: a preview that has this variable would present itself as indexable. The code also forces previews to stay non-indexable when Vercel says it is a preview, but do not rely on that alone.
4. Save.

Why this one variable controls indexing: with it unset the build tells search engines to stay away everywhere (robots disallow, `X-Robots-Tag: noindex, nofollow`, no canonical URLs, an empty sitemap). Setting it in Production turns on robots/sitemap/canonical for the production build only.

### 3.4 Link the repository to Vercel from your computer and read the two ids

Run these in the repository folder. They need no secret in the terminal: `login` opens a browser.

```bash
pnpm dlx vercel login
```

```bash
pnpm dlx vercel link
```

Answer the prompts: your account as scope, link to existing project, choose the project you created. This writes the folder `.vercel/` (it is gitignored: never commit it).

```bash
pnpm dlx vercel project inspect
```

This prints the project details and confirms the link. The two ids are in `.vercel/project.json` as `orgId` and `projectId`. Open that file in an editor and copy the two values from there. They are identifiers, not passwords, but treat them like secrets and do not paste them into chat.

### 3.5 Create a Vercel token for GitHub Actions

1. Open https://vercel.com/account/tokens (account menu, **Settings**, **Tokens**).
2. Create a token. Name it `github-actions-jisr`. Set the **scope** to your team (your personal Hobby team) only, and an **expiry of at most 1 year**.
3. Copy it once; Vercel will not show it again. Do not paste it anywhere except the GitHub form in the next step.
4. Put a calendar reminder 2 weeks before the expiry date. Rotate the token (create a new one, replace the GitHub secret, delete the old one) on that date, whenever you add a collaborator to the repository, and the day the repository is made public.

### 3.6 Add the GitHub secrets and the enabling variable

Order matters.

1. In GitHub open `negexx/jisr`, then **Settings**, **Secrets and variables**, **Actions**, tab **Secrets**, **New repository secret**. Add three secrets, one at a time: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. Paste only into the form field.
2. Then open the tab **Variables**, **New repository variable**: name `DEPLOY_ENABLED`, value `true`.

Command line alternative (the value is typed at a hidden prompt, never put on the command line):

```bash
gh secret set VERCEL_TOKEN --repo negexx/jisr
```

```bash
gh variable set DEPLOY_ENABLED --body true --repo negexx/jisr
```

Until `DEPLOY_ENABLED` is `true` nothing is deployed and the job shows as skipped. Once it is `true` and a secret is missing, the `deploy` job turns red with "Repository secret ... is not set" and production is not updated.

### 3.7 First production deployment

1. Merge any pull request to `main` (or push a trivial `docs:` change through a pull request). A direct push to `main` is not how this project works.
2. Open the repository's **Actions** tab, the run for that commit, and watch the jobs `verify`, `e2e`, then `Deploy to Vercel (production)`. The deployment URL is in the job summary.
3. When it is green, open the production domain in a normal browser and a private window. Click through `/fr`, `/ar` and one programme page.
4. Run the smoke test from your computer against the public domain:

```bash
pnpm ops:smoke https://YOUR-DOMAIN --expect=indexable
```

   Replace `YOUR-DOMAIN` with the domain from section 3.2. Every line should say `PASS`. Output never contains page bodies or header values, so it is safe to share. Optional: add `--min-urls=3000` to also fail if the sitemap lists fewer than 3,000 URLs (the sitemap lists 3,387 URLs today: 3 shared paths plus 1,126 programmes, each in 3 locales).
5. Only after this works, add the repository variable `SMOKE_URL` (same place as `DEPLOY_ENABLED`) with the public production origin, for example `https://jisr.vercel.app`. From then on every deploy runs the smoke test automatically. If the production domain is behind Deployment Protection the automatic test will fail; fix the protection setting rather than disabling the test.

### 3.8 Checks that only a real deployment can answer

Do these once after the first deploy and note the result in `docs/ops/prelaunch-checklist.md`.

1. In the Vercel dashboard, open the deployment, then **Functions** or **Settings**; confirm the region is Frankfurt (`fra1`).
2. Check the redirects on Vercel's own router:

```bash
curl -sI https://YOUR-DOMAIN/FR
```

```bash
curl -sI https://YOUR-DOMAIN/fr/x
```

   Expected: `/fr/x` returns `404`; `/FR` should behave as it does locally (the same locale page or a redirect to the locale home, not an error page). Write down what you see.
3. In the dashboard look at the usage page after a day of use (section 1 of the limits runbook) and compare the function invocation count with the number of page views: page views on `/fr/...` paths must not each cost an invocation.
4. If the production domain served a Vercel login page in step 3.7, fix Deployment Protection before sharing the link.

If the first run of the deploy job fails, see section 9.

## 4. Environment variables

All are optional. They are read by `src/lib/site-env.ts` when `next.config.ts` loads, so a malformed value fails `next build` with a message that names the variable. The `NEXT_PUBLIC_` prefix means the value is written into the built files at build time, so changing one needs a new deployment.

| Name | Where to set | Required | Rule checked at build | If unset |
|---|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Vercel, **Production scope only** | No (yes to be found by search engines) | `https://` origin, or `http://localhost...` for local checks; no path, query, hash or trailing slash; no credentials | Build is not indexable: robots `Disallow: /`, `X-Robots-Tag: noindex, nofollow`, no canonical, empty sitemap |
| `NEXT_PUBLIC_GOATCOUNTER_URL` | Vercel, Production scope only | No | `https://<code>.goatcounter.com/count` exactly; only used when the build is indexable | No analytics script is rendered at all |
| `NEXT_PUBLIC_SNAPSHOT_BASE_URL` | Vercel, Production scope, only when snapshots move to a CDN | No | Exactly `/snapshots`, or an `https://` URL without trailing slash, query, hash or credentials | Snapshots are served from the site itself at `/snapshots` |

Nothing secret exists in the guest release. GitHub-side names:

| Name | Kind | Where | Purpose |
|---|---|---|---|
| `VERCEL_TOKEN` | Secret | GitHub Actions secrets | Lets the deploy job pull settings and publish |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Secret | GitHub Actions secrets | Which Vercel team and project the job targets |
| `DEPLOY_ENABLED` | Variable | GitHub Actions variables | `true` turns the deploy job on |
| `SMOKE_URL` | Variable | GitHub Actions variables | Public production origin for the post-deploy smoke test |

Indexing is decided only by `NEXT_PUBLIC_SITE_URL` (Production scope) and `VERCEL_ENV !== 'preview'`. The pages `matches`, `plan` and `compare` are `noindex, follow` and absent from the sitemap in every build, because they are empty shells around a personal client area.

### GoatCounter (analytics), when you want it

1. Create a free account for a non-commercial site at https://www.goatcounter.com (choose the EU option if offered; the code is the part before `.goatcounter.com`).
2. In Vercel set `NEXT_PUBLIC_GOATCOUNTER_URL` to `https://<code>.goatcounter.com/count` in the **Production** scope.
3. Re-run the deploy (section 5).

What it does: an inline script (no extra JavaScript bundle) that runs only in production, loads `https://gc.zgo.at/count.js` after the browser is idle (5 s at most, 2 s fallback), honours Do Not Track and Global Privacy Control, and counts one page view per full page load (moves between pages inside the app are not counted). Five count-only events carry the funnel: `profile-started` (once per full load of the profile page in create mode, so a returning student resuming a draft counts again), `profile-completed` (create mode only), `matches-viewed`, `program-saved` (on add), `plan-opened`. `count.js` itself also sends the page title, referrer, screen width and the query string with each hit; the app has no query strings and no profile data in titles. `gc.zgo.at` is a third-party script origin and must be listed in the privacy notice.

## 5. Redeploying without a code change

An environment variable change (for example `NEXT_PUBLIC_SITE_URL`) takes effect only in a new build. Easiest: merge any pull request. Alternative: in GitHub open **Actions**, the most recent CI run on `main` (never an old one: it would deploy old code), and use **Re-run jobs** on the `deploy` job. The job pulls the current Production variables again.

## 6. Custom domain, later

Candidate names, checked on 2026-10-08 through the public registry service RDAP (this only says whether a name is registered; availability and prices must be re-checked at the registrar when you buy):

| Status | Names |
|---|---|
| Unregistered on 2026-10-08 | `usejisr.com`, `jisr.fyi`, `jisr-study.com`, `jisr.study`, `jisr.school`, `jisr.help`, `jisr.page` |
| Registered | `jisr.org`, `jisr.app`, `jisr.eu`, `jisr.ma`, `jisr.io`, `jisr.com`, `jisr.net`, `jisr.info`, `jisr.guide`, `getjisr.com`, `jisr.online` |

Prices below come from secondary sources, not from a registrar: `.fyi` about $3 for the first year, `.com` about $10-12, `.study` renewals about $30-50 (not recommended).

When you have bought one:

1. In Vercel: project **Settings**, **Domains**, **Add**. Add the apex (for example `jisr.fyi`) and also the `www` form. Make the apex the primary one and set `www` to redirect to it (look for **Redirect to** with a 308 status; https://vercel.com/docs/domains/working-with-domains).
2. Vercel then shows the DNS records to create at your registrar. **Copy the values Vercel shows you**; do not reuse values from this guide or from memory (the usual shape is an A record for the apex and a CNAME for `www`, but the exact targets are shown in the dashboard).
3. Wait until Vercel marks the domain as valid; it issues the HTTPS certificate itself.
4. Change `NEXT_PUBLIC_SITE_URL` in the Production scope to the new origin (for example `https://jisr.fyi`). Redeploy (section 5).
5. Change the repository variable `SMOKE_URL` to the same origin and run `pnpm ops:smoke https://jisr.fyi --expect=indexable`.
6. Revisit the HSTS decision (ADR 0011) only after every subdomain you use serves HTTPS.

## 7. Rollback

If a deployment is bad:

1. Vercel dashboard, your project, **Deployments**, choose the previous good production deployment, open the **...** menu and pick **Instant Rollback**. On Hobby, Vercel may offer only a limited set of earlier deployments; see https://vercel.com/docs/instant-rollback.
2. Or with the CLI (after `vercel login` and `vercel link`):

```bash
pnpm dlx vercel rollback
```

   Without an argument it targets the previous production deployment (check `pnpm dlx vercel rollback --help` for the exact behaviour); you can also pass a deployment URL or id.
3. A rollback does not change the repository. The next push to `main` deploys again, so revert the bad commit on a branch and merge that pull request as well. After a rollback Vercel may stop automatically pointing the production domain at new deployments; look for a notice on the project's Deployments page and follow it (see the page above).

Turning off auto-deploy is not needed: production deploys only through the Actions job, and setting `DEPLOY_ENABLED` to anything but `true` pauses it.

## 8. Running the production build locally

Port 3101 is used so that the dev server on 3000 is never touched. On the owner's Windows machine `next` commands need the SWC cache variable set first (see `swc-native-binding-cache-quirk` in the project memory); in Git Bash:

```bash
export SWC_NATIVE_BINDING_CACHE='C:\Users\dagda\.swc-cache'
```

Default build (not indexable, same as a preview):

```bash
pnpm build
```

```bash
pnpm exec next start -p 3101
```

In a second terminal:

```bash
pnpm ops:smoke http://localhost:3101 --expect=noindex
```

Indexable variant (what production looks like). Stop the server first, then:

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3101 pnpm build
```

```bash
pnpm exec next start -p 3101
```

```bash
pnpm ops:smoke http://localhost:3101 --expect=indexable
```

In PowerShell set the variable with `$env:NEXT_PUBLIC_SITE_URL = "http://localhost:3101"` and remove it afterwards with `Remove-Item Env:NEXT_PUBLIC_SITE_URL`. Rebuild without the variable when you are done: `pnpm build` writes `.next`, and a build made with the variable would otherwise stay indexable in later local runs. `pnpm build:e2e` and `pnpm dev:fixture` overwrite `public/snapshots` and `.next` with the synthetic fixture; run `pnpm data:build` or a real `pnpm build` afterwards.

What `pnpm ops:smoke` checks (read-only GET requests, exit code 1 if anything fails): `/` redirects to a locale (and to `/ar` with `Accept-Language: ar`); `/fr`, `/ar`, `/en/scholarships` are 200 HTML with the right `lang` and `dir`; one programme page is 200; two unknown paths give the trilingual 404; the security headers; the manifest is `no-cache` and a shard is `immutable`; `robots.txt` and the `X-Robots-Tag` match the expected mode; the sitemap is empty (noindex) or well formed with hreflang alternates and no `matches`, `plan` or `compare` URLs (indexable).

## 9. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `deploy` job is grey ("skipped") | `DEPLOY_ENABLED` is not `true`, or the event was a pull request. Expected before setup. |
| `deploy` job is red: "Repository secret X is not set" | A secret is missing or misspelled. Add it (section 3.6). Production was not touched. |
| `vercel pull` fails with 403 or "not authorized" | The token was created for another scope or expired. Create a new token for the team that owns the project and replace `VERCEL_TOKEN`. Check `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` against `.vercel/project.json`. |
| Build step fails with an authentication error | See the note in section 2: give the Build step `VERCEL_TOKEN` and record it in an ADR. |
| Build fails with `NEXT_PUBLIC_...: ...` | A variable has an invalid value (section 4). Fix it in the Production scope. |
| Deploy step rejects or stalls on the upload | The built output is large (about 1.5 GB, about 24,000 files). See "Unverified" below. |
| A pull request preview asks for a Vercel login | Expected: previews are protected by Vercel Authentication. |
| Production site returns `503 DEPLOYMENT_PAUSED` | A Hobby usage cap was reached. See `docs/ops/limits-runbook.md`. |
| Smoke test fails on the sitemap with `NEXT_PUBLIC_SITE_URL` unset | The production build was not indexable: set the variable (section 3.3) and redeploy. |

## 10. Unverified until the first real deployment

These could not be tested without your Vercel account. Check them after the first deploy and record the outcome in the pre-launch checklist.

1. **Output upload size and time (highest risk).** The default build output `.next` is about 1.5 GB with about 24,000 files (3,398 HTML files; `.next/server/app` is 1.4 GB: each programme page is about 140 KB of HTML plus 78 KB of RSC data plus segment files). Whether `vercel deploy --prebuilt` accepts and uploads this, and how long it takes, is unknown. If it is rejected or slow, this is an owner decision for a follow-up, not something this branch solves. Generating only some programme pages with on-demand rendering is **not** possible, because the snapshot is not traced into functions (`public/` is not available to functions; architecture.md). The real options are to shrink the per-page payload, or to move programme pages to incremental static regeneration with the snapshot read from a CDN URL (which the `NEXT_PUBLIC_SNAPSHOT_BASE_URL` seam partly prepares).
2. `vercel build --prod` works without `VERCEL_TOKEN` in the environment.
3. `npm install --global vercel@latest` works on the GitHub runner as written.
4. Vercel honours `fra1` for a `--prebuilt` deployment.
5. Vercel's router honours the compiled proxy matcher the way `next start` does (the proxy runs only for `/` and locale-less paths), and `/FR` (uppercase) behaves as it does locally.
6. Deployment Protection leaves the production domain public (it is documented to protect `*.vercel.app` deployment URLs).
7. Function invocation counts match page views (no invocation per `/fr/...` view).
8. The e2e job runs on a GitHub-hosted runner without the local SWC workaround (already noted in `ci.yml`).

## 11. Repository visibility and branch protection

The repository is private on GitHub Free, where branch protection is not available (GitHub answers "Upgrade to GitHub Pro or make this repository public"). The release gate is therefore the Actions job order (`deploy` needs `verify` and `e2e`), not a branch rule.

Residual risk, accepted and recorded in ADR 0011: a pull request from a branch of this same repository runs its own, possibly modified, `ci.yml`, and same-repository workflows receive repository secrets. GitHub Environments with branch restrictions are not available for private repositories on the Free plan. So write access to the repository equals deploy access, exactly as it already equals the ability to push to `main`. Mitigations: use a team-scoped Vercel token with an expiry of at most 1 year (calendar reminder); rotate it whenever you add a collaborator or make the repository public; do not add collaborators lightly.

Making the repository public was considered and is **not recommended yet**: 5,784 tracked `data-staging/` files are unaudited and include fetched third-party page text; the project is closed-source by decision; there is no LICENSE file. A history scan found no secrets. The design works unchanged if the repository goes public later; then also add branch protection requiring the `verify` and `e2e` jobs, and do the audit first.
