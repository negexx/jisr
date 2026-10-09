# Hobby limits runbook

Last updated 2026-10-08. This refines ADR 0004 section 1 (see ADR 0011). On the Hobby plan Vercel does not bill: when a monthly cap is reached the project is **paused**. This runbook is how to notice that early, because Spend Management (usage alerts) is a Pro-only feature and Hobby has no alerts.

## 1. The limits (verified 2026-10-08)

Sources: https://vercel.com/docs/limits, https://vercel.com/docs/plans/hobby, https://vercel.com/docs/limits/fair-use-guidelines. Re-read them at each quarterly review; Vercel renames and changes caps (ADR 0004 said "edge requests"; Vercel now says "CDN Requests", and "Fast Origin Transfer" was not listed there).

| Resource (monthly, included on Hobby) | Cap | 60% mark (act here) | What uses it on this site |
|---|---|---|---|
| CDN Requests | 1,000,000 | 600,000 | Every file a visitor loads: HTML, JavaScript chunks, CSS, fonts, snapshot shards. Likely the first cap to bind. |
| Fast Data Transfer | 100 GB | 60 GB | Bytes sent from the CDN to visitors. |
| Fast Origin Transfer | 10 GB | 6 GB | Bytes between the CDN and Vercel functions or origin. Small here (static pages). |
| Function Invocations | 1,000,000 | 600,000 | Only the redirect from `/` and from locale-less paths; page views on `/fr/...`, `/en/...`, `/ar/...` skip the proxy by design. |
| Active CPU | 4 hours | 2.4 hours | Function compute time. |
| Provisioned Memory | 360 GB-hours | 216 GB-hours | Function memory time. |

Build and deployment limits that matter: build time 45 minutes; build memory 8 GB on 2 vCPUs; 100 deployments per day; a plain `vercel deploy` from a checkout uploads at most 15,000 files and 100 MB of source (not relevant for the Actions job, which uploads built output with `--prebuilt`; relevant if you ever deploy by hand, which is what `.vercelignore` guards).

What a pause looks like: the site answers `503` with the code `DEPLOYMENT_PAUSED`. In most cases Vercel makes you wait 30 days for the usage to reset; the project resumes only by a manual action in the dashboard. Nothing is billed. Look in the dashboard for a banner on the project page and an email from Vercel.

## 2. Monthly check (first Monday of each month, 5 minutes)

1. Open the Vercel dashboard (https://vercel.com/dashboard), choose your team, and look for **Usage** (team menu or sidebar).
2. Read the current billing cycle's numbers for the five resources in the log below.
3. Add one row to the Log table in section 6.
4. If any value is at or above its 60% mark, follow section 3 the same day.
5. Also look at the Deployments list for failed production deployments.

## 3. The 60% rule: what to do

The first move for traffic caps is to take the snapshot shards (the data files the browser downloads, many per visit) off Vercel's CDN, as ADR 0004 decided. This lowers CDN Requests and Fast Data Transfer because the shards a journey downloads are part of its requests (section 6 will give the measured share). It does **not** move the HTML pages, JavaScript or CSS, which stay on Vercel. If the cap that is near is Function Invocations, Active CPU or Fast Origin Transfer, moving shards does not help: look at section 4 instead.

The site reads the snapshot base URL from `NEXT_PUBLIC_SNAPSHOT_BASE_URL` (validated by `src/lib/site-env.ts`: an `https://` URL with no trailing slash, query or hash). The browser then requests `<base>/manifest.json` and `<base>/s/<shard file>`, exactly the layout of `public/snapshots`.

1. Create a Cloudflare account and an R2 bucket (https://developers.cloudflare.com/r2/). Make the bucket publicly readable through a custom domain or a Cloudflare-managed public URL. Use a hostname you control, for example `snapshots.<your-domain>`; the `r2.dev` URL is meant for testing only.
2. Build the data: `pnpm data:build`. The files to publish are everything under `public/snapshots/`: `manifest.json` and the folder `s/`.
3. Upload the shards under `s/` first, then `manifest.json` last. Use any S3-compatible uploader (rclone, or Cloudflare's `wrangler r2 object put`; look up the flags for content type and cache control in the R2 documentation). Set these object headers, because the site's own cache headers (`src/lib/snapshot-headers.ts`) no longer apply once the files live elsewhere:

   | Object | `Content-Type` | `Cache-Control` |
   |---|---|---|
   | `s/*.json` | `application/json` | `public, max-age=31536000, immutable` |
   | `manifest.json` | `application/json` | `no-cache` |

4. Configure CORS on the bucket (look for **CORS policy** in the bucket settings): allow `GET` from the site origin (your `NEXT_PUBLIC_SITE_URL`, exactly, with no trailing slash). Without it the browser blocks the cross-origin download and every journey page shows a network error.
5. In Vercel, set `NEXT_PUBLIC_SNAPSHOT_BASE_URL` to the bucket's public origin (for example `https://snapshots.example.org`) in the Production scope. Redeploy (docs/ops/deploy.md section 5).
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

- **Function Invocations or Active CPU:** a page view is not supposed to invoke a function. Check `src/proxy.ts` (the matcher skips `/fr`, `/en`, `/ar` and everything below them) and look at the dashboard to see which routes invoke. Crawler traffic on locale-less paths is the usual cause; it is cheap per request but can add up.
- **Fast Data Transfer:** check the first-load JavaScript with `pnpm perf:js` and the largest files in the browser's network tab.

## 5. When the site is paused, and the non-commercial rule

If you see `503 DEPLOYMENT_PAUSED`:

1. Confirm in the dashboard which cap was hit and when the cycle resets.
2. The Hobby plan resumes manually from the project page once the cap resets or you act; look for a **resume** control and follow Vercel's message. In most cases the wait is 30 days.
3. Options, honestly: wait; or upgrade the team to a paid Pro plan for a month (this ends the free, non-commercial setup, so decide it deliberately and write it down). Moving the same build to another host is **not** a drop-in option: the app is not a static export (it needs the proxy for redirects and the unified 404), so a different host would be a new decision and a new ADR.

Non-commercial rule (Vercel fair-use guidelines, paraphrased). Hobby is for personal, non-commercial use. Commercial use means, among other things, any way of asking for or processing payment, advertising a product or service, being paid to build, update or host the site, affiliate links as the main purpose, or showing ads. Asking for donations is explicitly **not** commercial use, so donations are allowed. Ads, affiliate-first content, payments, paid hosting or editing, and sponsorship paid in exchange for placement are not. If you are unsure about a particular arrangement, ask Vercel support before accepting money. This narrows the "donations" risk in ADR 0004 section 1 (recorded in ADR 0011). The project instruction "do not accept donations before checking the terms" is satisfied by this check; re-read the fair-use page before the first donation link goes live.

## 6. Estimate: visits per month at each cap

<!-- TASK8 -->

## 7. Log

| Date | Fast Data Transfer | CDN Requests | Function Invocations | Fast Origin Transfer | Active CPU |
|---|---|---|---|---|---|
| (first check after launch) | | | | | |
