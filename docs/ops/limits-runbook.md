# Hobby limits runbook

Last updated 2026-10-15. This refines ADR 0004 section 1 (see ADR 0011). On the Hobby plan Vercel does not bill: when a monthly cap is reached the project is **paused**. This runbook is how to notice that early. Hobby does get Vercel's automatic usage notification emails, but their thresholds are not configurable, and Spend Management and configurable thresholds are Pro-only (https://vercel.com/docs/notifications, https://vercel.com/docs/pricing/manage-and-optimize-usage). So the monthly check below is the deliberate 60% early warning; the emails are the backstop. In your Vercel account notification settings (look for **Notifications**, https://vercel.com/docs/notifications) confirm that email notifications for usage are on, and that mail from Vercel is not going to spam.

## 1. The limits (verified 2026-10-08)

Sources: https://vercel.com/docs/limits, https://vercel.com/docs/plans/hobby, https://vercel.com/docs/limits/fair-use-guidelines. Re-read them at each quarterly review; Vercel renames and changes caps (ADR 0004 said "edge requests"; Vercel now says "CDN Requests", and "Fast Origin Transfer" was not listed there).

| Resource (monthly, included on Hobby) | Cap | 60% mark (act here) | What uses it on this site |
|---|---|---|---|
| CDN Requests | 1,000,000 | 600,000 | Every file a visitor loads: HTML, JavaScript chunks, CSS, fonts, snapshot shards. Likely the first cap to bind. |
| Fast Data Transfer | 100 GB | 60 GB | Bytes sent from the CDN to visitors. |
| Fast Origin Transfer | 10 GB | 6 GB | Bytes between the CDN and Vercel functions or origin. Small here (static pages). |
| Function Invocations | 1,000,000 | 600,000 | Guests: only the redirect from `/` and from locale-less paths; page views on `/fr/...`, `/en/...`, `/ar/...` skip the proxy by design. Once accounts are on, signed-in students also add the `/api/auth/*` requests (sign-in, link verification, Google callback, session lookup, deletion) and Server Actions: about two per full page load (one session lookup, one `loadAccountData`) plus one per save, tick, report or profile save. Guests add none. |
| Active CPU | 4 hours | 2.4 hours | Function compute time. |
| Provisioned Memory | 360 GB-hours | 216 GB-hours | Function memory time. |
| Uploads per day (Vercel API, Hobby) | 5,000 | 3,000 | Each file of a deployment upload counts. Not monthly: it matters on deploy days. The build output has about 24,000 files, which is why the deploy uses `--archive=tgz` (see below). |

Build and deployment limits that matter: build time 45 minutes; build memory 8 GB on 2 vCPUs; 100 deployments per day; a CLI deployment of source files is limited to 15,000 files and 100 MB (documented for source uploads; whether these caps also apply to the built output that `--prebuilt` uploads is **unverified**; they certainly apply if you ever deploy by hand from a checkout, which is what `.vercelignore` guards). The built output has about 24,000 files against the Hobby API limit of 5,000 uploads per day. The deploy job therefore runs `vercel deploy --prebuilt --archive=tgz --prod`, which Vercel documents "to minimize the number of files uploaded and avoid hitting upload limits" (https://vercel.com/docs/cli/deploy); it is documented with `--prebuilt` but unverified in this repository until the first deployment, and archived uploads can be slower. If the HTML embeds the snapshot version, every data deploy changes many files, so the flag matters for each data release. See risk 1 in `docs/ops/deploy.md` section 10.

What a pause looks like: the site answers `503` with the code `DEPLOYMENT_PAUSED`. Vercel's Hobby page says that in most cases, once you exceed a limit, you wait until 30 days have passed (Hobby has no billing cycles); some features have shorter pauses. How and when the project resumes is not something this runbook has verified: follow the email Vercel sends and the notice in the dashboard (https://vercel.com/docs/errors/DEPLOYMENT_PAUSED). Nothing is billed.

## 2. Monthly check (first Monday of each month, 5 minutes)

1. Open the Vercel dashboard (https://vercel.com/dashboard), choose your team, and look for **Usage** (team menu or sidebar).
2. Read the current period's numbers for the five resources in the log below.
3. Add one row to the Log table in section 7.
4. If any value is at or above its 60% mark, follow section 3 the same day.
5. Also look at the Deployments list for failed production deployments.
6. Once accounts are on, open Brevo (Statistics, transactional email) and read the busiest day of the month. The Free plan sends up to 300 emails a day after Brevo has approved the account (https://www.brevo.com/pricing/, read 2026-10-15; re-read it at each quarterly review). The 60% mark is 180 emails in a day. Every sign-in link and every account-deletion link is one email, so a Bac-results spike can reach the cap; past it new links are not sent and signing in fails, while the guest journey is unaffected. Options at the mark: wait, or move to a paid Brevo plan (this ends the zero-cost setup, so decide it deliberately and write it down).
7. Function Invocations now include account traffic (section 1). In the Vercel dashboard (Usage, Function Invocations) look at which routes invoke: `/api/auth/*` and the Server Action requests on `/fr/...` pages are expected, anything else is not. If a reading is at or above 60%, follow section 4.
8. Neon: open the Neon console, the project's Usage page, and read compute (CU-hours) and storage. The Free plan gives each project 100 CU-hours of compute a month (compute scales to zero when idle) and 1 GB of Postgres storage (https://neon.com/pricing, read 2026-10-15; re-read it at each quarterly review). The 60% marks are 60 CU-hours and 0.6 GB.
9. Add one row to the accounts log in section 7.

## 3. The 60% rule: what to do

The first move for traffic caps is to take the snapshot shards (the data files the browser downloads, many per visit) off Vercel's CDN, as ADR 0004 decided. This lowers CDN Requests and Fast Data Transfer because the shards a journey downloads are part of its requests: in the local measurement of section 6 they were 53 of the 100 requests (the biggest share) but only 33% of the bytes, so moving them cuts the request cap pressure by about half and the data-transfer pressure by about a third, not more. It does **not** move the HTML pages, JavaScript or CSS, which stay on Vercel. If the cap that is near is Function Invocations, Active CPU or Fast Origin Transfer, moving shards does not help: look at section 4 instead.

The site reads the snapshot base URL from `NEXT_PUBLIC_SNAPSHOT_BASE_URL` (validated by `src/lib/site-env.ts`: an `https://` URL with no trailing slash, query or hash). The browser then requests `<base>/manifest.json` and `<base>/s/<shard file>`, exactly the layout of `public/snapshots`.

1. Create a Cloudflare account and an R2 bucket (https://developers.cloudflare.com/r2/). Make the bucket publicly readable through a custom domain or a Cloudflare-managed public URL. Use a hostname you control, for example `snapshots.<your-domain>`; the `r2.dev` URL is meant for testing only.
2. Build the data: `pnpm data:build`. The files to publish are everything under `public/snapshots/`: `manifest.json` and the folder `s/`.
3. Upload the shards under `s/` first, then `manifest.json` last. Use any S3-compatible uploader (rclone, or Cloudflare's `wrangler r2 object put`; look up the flags for content type and cache control in the R2 documentation). Set these object headers, because the site's own cache headers (`src/lib/snapshot-headers.ts`) no longer apply once the files live elsewhere:

   | Object | `Content-Type` | `Cache-Control` |
   |---|---|---|
   | `s/*.json` | `application/json` | `public, max-age=31536000, immutable` |
   | `manifest.json` | `application/json` | `no-cache` |

4. Configure CORS on the bucket (look for **CORS policy** in the bucket settings): allow `GET` from the site origin (your `NEXT_PUBLIC_SITE_URL`, exactly, with no trailing slash). Without it the browser blocks the cross-origin download and every journey page shows a network error.
5. In Vercel, set `NEXT_PUBLIC_SNAPSHOT_BASE_URL` to the bucket's public origin (for example `https://snapshots.example.org`) in the Production scope, Type **Config** (a public value). Redeploy (docs/ops/deploy.md section 5).
6. Verify on the CDN directly (replace the host and take a real shard file name from `public/snapshots/s/`):

```bash
curl -sI https://snapshots.example.org/manifest.json
```

```bash
curl -sI -H "Origin: https://YOUR-DOMAIN" https://snapshots.example.org/s/core.<hash>.json
```

   Expect status 200, the `Cache-Control` values above and an `Access-Control-Allow-Origin` header naming your site. Then open the site with the browser's network tab and confirm the shard requests go to the CDN host.
7. Run `pnpm ops:smoke https://YOUR-DOMAIN --expect=indexable`. Note that its manifest and shard checks hit the site's own `/snapshots` copy, which is still deployed (programme pages are generated from it at build time); step 6 is what proves the CDN.
8. For every later data release publish the new shards and then the manifest **before** the deployment that goes live; old shards stay (they are immutable and content-hashed), so visitors with an open page keep working.

To go back, unset the variable and redeploy.

## 4. If the near cap is not CDN traffic

- **Function Invocations or Active CPU:** a guest page view is not supposed to invoke a function. Check `src/proxy.ts` (the matcher skips `/fr`, `/en`, `/ar` and everything below them) and look at the dashboard to see which routes invoke. Crawler traffic on locale-less paths is the usual cause; it is cheap per request but can add up. With accounts on, signed-in traffic does invoke functions (section 1): look at `/api/auth/*` and the Server Action requests first. The sync layer already limits itself to one `loadAccountData` per full page load and one when a tab returns after more than 60 seconds hidden (`REHYDRATE_AFTER_HIDDEN_MS` in `src/lib/account-sync/visibility.ts`, ADR 0013 decision 5); lengthening that interval is the first lever, and unsetting `ACCOUNTS_ENABLED` (then redeploying) the last.
- **Fast Data Transfer:** check the first-load JavaScript with `pnpm perf:js` and the largest files in the browser's network tab.

## 5. When the site is paused, and the non-commercial rule

If you see `503 DEPLOYMENT_PAUSED`:

1. Read the email Vercel sent and the notice in the dashboard: they say which limit was hit.
2. Follow the steps in that email and notice to resume. In most cases the wait is 30 days from the moment the limit was exceeded (Hobby page above); do not assume a particular resume button exists.
3. Options, honestly: wait; or upgrade the team to a paid Pro plan for a month (this ends the free, non-commercial setup, so decide it deliberately and write it down). Moving the same build to another host is **not** a drop-in option: the app is not a static export (it needs the proxy for redirects and the unified 404), so a different host would be a new decision and a new ADR.

Non-commercial rule (Vercel fair-use guidelines, https://vercel.com/docs/limits/fair-use-guidelines). Hobby is for personal, non-commercial use. The umbrella definition is a deployment "used for the purpose of financial gain of anyone involved in any part of the production of the project". Examples Vercel lists include any way of requesting or processing payment, advertising a product or service, being paid to build, update or host the site, affiliate links as the main purpose, and showing ads. Asking for donations is explicitly **not** commercial use, so donations are allowed. Ads, affiliate-first content, payments and paid hosting or editing are not. Sponsorship paid in exchange for placement is this project's reading of "advertising a product or service", not a case Vercel names: treat it as not allowed. If you are unsure about a particular arrangement, ask Vercel support before accepting money. This narrows the "donations" risk in ADR 0004 section 1 (recorded in ADR 0011). The project instruction "do not accept donations before checking the terms" is satisfied by this check; re-read the fair-use page before the first donation link goes live.

## 6. Estimate: visits per month at each cap

**This is an estimate from a local `next start`, not from Vercel.** Measured 2026-10-09 on the default real-data build (1,126 programmes, snapshot `6c740a0cd15b`, 97 shards) served by `next start -p 3101`, with a throwaway Playwright script (Chromium, fresh browser context per cold case, Chrome DevTools network events). A request counts when it went to the server; responses served from the browser's HTTP cache are not counted (they cost the CDN nothing). Size is the encoded (compressed) bytes on the wire, headers excluded. Vercel's CDN may add requests (for example for the platform's own paths) or coalesce them, and may compress differently from Next's server, so treat the figures as an order of magnitude.

| Case | Requests | Transferred | `/_next/static/*` (JS, CSS, fonts) | HTML and RSC | `/snapshots/*` shards |
|---|---|---|---|---|---|
| (a) Cold load of `/fr` alone | 27 | 459.8 KB | 19 req, 431.1 KB | 8 req, 28.6 KB | 0 |
| (b) Cold load of one programme page | 30 | 497.7 KB | 22 req, 452.8 KB | 8 req, 45.0 KB | 0 (the page is pre-rendered) |
| (c) Full journey: home, profile opened, matches (prepared profile, full page load), programme (client navigation), Save, plan (client navigation) | 100 | 860.0 KB | 28 req, 490.5 KB | 19 req, 84.0 KB | 53 req, 285.6 KB |
| Returning visitor, `/fr` again (browser cache warm) | 8 | 22.4 KB | 0 (cached) | 8 req, 22.4 KB | 0 |
| Returning visitor, `/fr/matches` again | 9 | 23.0 KB | 0 (cached) | 8 req, 22.4 KB | 1 req, 0.6 KB (the manifest, `no-cache`; shards are cached) |

Shares of the full journey (c): `/_next/static/*` 28% of requests and 57% of bytes; HTML and RSC 19% and 10%; shards 53% and 33%. Step by step: home 27 requests, 459.8 KB; profile page opened 3 requests (three shards), 11.1 KB; matches 59 requests, 309.4 KB (50 shards, 274.5 KB; 21 further responses came from the browser cache); programme page by client navigation 4 requests, 40.6 KB; Save 6 requests, 31.9 KB; plan 1 request, 7.3 KB. The matches page loads about 50 of the 97 shards (the data shards for all countries and fields plus the French text shards; the exact list was not recorded) and the count did not change when the profile's destinations were `[]` or `["FR"]`. The prepared profile was a Moroccan Bac, track Sciences Mathematiques A, grade 15/20, three fields, no destination filter; the journey clicked the first programme card.

Formulas (1 GB taken as 10^9 bytes, 1 KB as 1,024 bytes):

- Visits per month at the request cap = 1,000,000 / requests per visit.
- Visits per month at the transfer cap = 100 x 10^9 / (KB per visit x 1,024).
- Take the smaller of the two: that cap binds first. The 60% mark (section 1) is the same formula with 600,000 requests or 60 GB.

| Visitor type | At 1,000,000 CDN requests | At 100 GB Fast Data Transfer | Binding cap | 60% mark (requests / transfer) |
|---|---|---|---|---|
| (a) cold `/fr` only | 37,037 visits | 212,388 visits | CDN Requests | 22,222 / 127,433 |
| (c) full journey, cold | 10,000 visits | 113,553 visits | CDN Requests | 6,000 / 68,132 |
| Returning `/fr` (warm cache) | 125,000 visits | about 4.36 million visits | CDN Requests | 75,000 / about 2.6 million |

Reading: the request cap binds well before the transfer cap for every case (about 5.7x sooner for (a), about 11x for (c)), which agrees with section 1. A month with 10,000 full-journey visitors who all arrive with an empty cache reaches the cap; real traffic mixes bouncing visitors (case a), journeys and returning visitors, so the real number of visits lies between the rows. Returning visitors are cheap because `/_next/static/*` and the shards are immutable; `public/snapshots/manifest.json` and the HTML are revalidated. This also means that a data release or a code deploy, which changes the hashes, makes every returning visitor load the changed files once. Not measured: the real mix of visitors, crawler traffic (every programme page is in the sitemap, 3,378 programme URLs, and each crawler fetch is at least one CDN request) and the Vercel CDN's own counting.

## 7. Log

| Date | Fast Data Transfer | CDN Requests | Function Invocations | Fast Origin Transfer | Active CPU |
|---|---|---|---|---|---|
| (first check after launch) | | | | | |

### Accounts log (once accounts are on)

| Date | Brevo: busiest day (emails) | Neon: compute (CU-hours) | Neon: storage | Notes |
|---|---|---|---|---|
| (first check after accounts launch) | | | | |
