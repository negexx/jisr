# Performance audit — 2026-10-17

- **Audited commit:** `f0cc00efed2f74e7e8a816ea59585d7462f4eebe` (branch `audit/scratch-perf`, worktree `.worktrees/audit-perf`).
- **Production origin:** `https://jisrr.org` (Vercel Hobby, edge `fra1`), measured 2026-10-17.
- **Method & tooling:**
  - **Build + bundle budget:** `pnpm build` (Windows; runs `data:check` + `data:build` + `next build`) then `pnpm perf:js` (`scripts/perf/first-load-js.ts`; gzip level 6 of every `<script src>` in the prerendered HTML, `noModule` excluded), compared against `tests/e2e/support/js-budget.ts` and the real-data column of `docs/ops/prelaunch-checklist.md` (row A2, last measured 2026-10-09).
  - **Runtime:** Playwright/Chromium via the repo's own Chromium (`playwright.audit-perf.config.ts` + `tests/audit-perf/`), no `webServer`, targeting production. Mobile `390×844`, `isMobile`, DPR 3, CPU **4×** (`Emulation.setCPUThrottlingRate`), network **4G** (`Network.emulateNetworkConditions`: 4 Mbps down / 3 Mbps up / 40 ms RTT, `cellular4g`). Fresh browser context per load, 3 loads per page, medians reported. No sign-in; public pages only.
  - **Caveats:** (1) This worktree has **no `.env.local`** (accounts env absent), so the local build is the **guest build**; `pnpm perf:js` numbers are guest-build real-data numbers (the ratchet uses the same method, so they are comparable). (2) `curl` from the WSL side shows a constant ~15 s connection overhead (environment artifact); every runtime number below comes from the Windows Chromium `performance` timelines, not `curl`. (3) Cache headers/compression come from `curl -sI`.

## 1. First-load JS per route (measured vs ratchet vs last measured)

Real-data build, `pnpm perf:js` (initial JS, gzip level 6, KB). Ratchet = `tests/e2e/support/js-budget.ts` (2026-10-17). "Last measured" = prelaunch A2 real-data column (2026-10-09). `/fr` and `/ar` are identical.

| Route | Measured (initial) | Ratchet | Headroom | Last measured (A2) | Δ vs A2 |
|---|---|---|---|---|---|
| `/fr` (home) | **173.8** | 176 | 2.2 | 168.5 | +5.3 |
| `/fr/profile` | **188.0** | 191 | 3.0 | 185.2 | +2.8 |
| `/fr/matches` | **201.6** | 204 | 2.4 | 192.6 | +9.0 |
| `/fr/plan` | **190.7** | 193 | 2.3 | 186.1 | +4.6 |
| `/fr/compare` | **192.1** | 195 | 2.9 | 187.3 | +4.8 |
| `/fr/scholarships` | **174.1** | 176 | 1.9 | 170.0 | +4.1 |
| `/fr/programs/<slug>` (all 3,726 program pages) | **187.5** | 188 | **0.5** | 183.9 | +3.6 |

**Flags.**
- **Nothing exceeds the ratchet.** The tightest route is the **program page: 187.5 KB against a 188 KB ratchet — 0.5 KB of headroom** (measured identically on all 3,726 program pages). The next-tightest is scholarships (1.9 KB). Any new client code on either route trips the ratchet.
- The **+9.0 KB on `/matches`** is explained by the 2026-10-17 Task 6 move of the filter panel onto the matches page (documented in the ratchet header); the header prefetches `/matches` from every page, which is why the other routes each rose ~3–5 KB versus A2.
- **Every user-facing content route is still above the original ADR 0004 target of 150 KB** (ADR 0008 accepted this). Routes not in the ratchet: `/guides/*`, `/privacy`, `/terms` all measure **170.0 KB** (24 pages), and the account stubs (`/sign-in`, `/welcome`, `/account*`, 404 in this local guest build — production has accounts live) measure **128.1 KB**. All program pages carry a `+38.7 KB noModule` legacy polyfill chunk (excluded from the measurement, same as the ratchet).
- Zod never reaches the browser in this build (`perf:js` marker scan is clean).

Build wall time: **~93 s** from `pnpm build` start to finish (log spans 22:57:18→22:58:51; inside it: `next build` compiled 19.2 s, TypeScript 21.8 s, 3,788 static pages generated in 36.6 s; data:check + data:build before that). 146 shards, snapshot `9b97c260f692`.

## 2. Core Web Vitals (production, throttled mobile) — medians of 3 loads

Mobile 390×844, CPU 4×, 4G. LCP/CLS/TBT from `PerformanceObserver` (buffered); TTFB from Navigation Timing. **INP is not reported**: these are read-only page loads with no interaction, so no reliable INP sample exists. TBT (long-task blocking time, `Σ max(0, duration−50)`) and long-task counts are given as the responsiveness proxy, and that is stated explicitly rather than inferred.

| Page | LCP (ms) | CLS | TBT (ms) | long tasks | TTFB (ms) | FCP (ms) | DCL (ms) | nav→ready (ms) | requests | transferred body | JS body | snapshot req / bytes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/fr` (home) | 1276 | **0.000** | 447 | 3 | 77 | 940 | 457 | 456 | 33 | 504.7 KB | 245.8 KB | 0 / 0 |
| `/fr/matches` (empty, no profile) | 712 | 0.000 | 120 | 3 | 82 | 712 | 489 | 1332 | 34 | 505.6 KB | 247.3 KB | 0 / 0 |
| `/fr/profile` | **1424** | 0.012 | 125 | 3 | 68 | 680 | 465 | 1370 | 38 | 515.3 KB | 247.6 KB | 3 / 12.8 KB |
| `/fr/programs/<slug>` | 856 | 0.029 | 447 | 4 | 74 | 856 | 477 | 477 | 36 | 538.1 KB | 269.0 KB | 0 / 0 |
| `/fr/scholarships` | 1012 | 0.000 | 315 | 3 | 196 | 1012 | 666 | 666 | 35 | 536.4 KB | 254.9 KB | 0 / 0 |
| `/fr/plan` (empty) | 660 | 0.000 | 83 | 2 | 78 | 660 | 483 | 1112 | 37 | 528.7 KB | 271.7 KB | 0 / 0 |
| **`/fr/matches` (profile seeded)** | 696 | 0.000 | **1817** | 4 | 68 | 696 | 499 | **4085** | **112** | **880.0 KB** | 247.6 KB | **77 / 378 KB** |

**Reading.**
- **The field-quality vitals are green** (LCP ≤ 1.4 s, CLS ≤ 0.029, TTFB 68–196 ms) — but **on `/matches` the LCP element is the server-rendered shell, not the results**. The personalised results only appear **4.09 s after navigation** (median), with **1.82 s of total blocking time** on the main thread. Core Web Vitals therefore *understate* the real `/matches` experience; the "time to results" column is the honest number.
- Worst LCP is `/profile` at **1.42 s** (dcl→LCP 936 ms): the form is a client island that renders after hydration. Still within the "good" 2.5 s threshold.
- CLS is comfortably good everywhere (max 0.029 on the program page, 0.012 on profile).
- TTFB on `/scholarships` (196 ms) is the slowest document response in the sample (single-run variance; no pattern).
- Requests are ~33–38 per page for non-snapshot pages, of which **20 are scripts**; home also issues **7 `_rsc` RSC prefetch requests (~28 KB)** for `/fr`, `/fr/profile`, `/fr/matches`.

## 3. Snapshot loading (`/matches`) — the hot path

Measured on `/fr/matches` with a real Moroccan-Bac profile seeded (`credential.country = MA`), so the browser actually loads the shards.

**Plan executed:** `shardsForMatches` (`src/lib/snapshot/plan.ts`) deliberately loads **every program shard in the manifest** plus `institutions.<D>`, `costs.<D>`, `scholarships.<D>` for every destination that has programs, plus the per-locale `text.*` twins. The comment states this is so a filter can only hide a loaded program, never omit it.

**Requests and bytes (median, mobile 4G):**

| Metric | Value |
|---|---|
| Snapshot requests | **77** (1 manifest + 76 shards) |
| Snapshot transferred (brotli/gzip) | **387,530 B ≈ 378 KB** |
| Snapshot decoded (JSON the browser must parse) | **6,637,152 B ≈ 6.33 MB** |
| Manifest | 28,777 B raw, **8,472 B br**, `no-cache` |
| Total page transferred body | **880 KB** (vs 505 KB for the empty matches page) |
| Total requests | **112** (vs 34) |
| Time from navigation to results rendered | **4085 ms** |
| Main-thread blocking (TBT) | **1817 ms** (4 long tasks) |

The heavy shards: `programs.FR.business-economics` (38,767 B br; **1.34 MB raw**), `programs.FR.engineering` (27,306 B), `text.fr.programs.FR.business-economics` (27,507 B), `programs.FR.computer-science` (19,636 B), plus the same for DE/HU/IT/NL/ES. **26 program shards + ~35 matching `text.fr.*` shards** are fetched regardless of the profile's filters or the student's destination interests.

**Cache headers and compression** (`curl -sSI https://jisrr.org/snapshots/...`):
- Shard: `cache-control: public, max-age=31536000, immutable`, `content-encoding: br`, weak `etag`, `age: ~23,000`, `x-vercel-cache: HIT` → correct, content-hashed, permanently cacheable.
- Manifest: `cache-control: no-cache`, `content-encoding: br`, `etag`, `last-modified`, `x-vercel-cache: HIT` → correct, always revalidated (the one mutable pointer).
- Document `/fr`: `cache-control: public, max-age=0, must-revalidate`, `content-encoding: br`, `x-vercel-cache: HIT`, `content-length: 83,342 B` (uncompressed), `x-nextjs-prerender: 1`.

**Local `public/snapshots` for reference:** `manifest.json` 28,777 B; `s/` holds 146 files / ~11 MB raw; largest `programs.FR.business-economics` 1.4 MB raw / 38.6 KB gzip (well under the ADR 0004 300 KB-gzip shard cap).

**Verdict: the current shard strategy does hurt the phone experience, and it is the single largest runtime cost.** On a 4G/4×-throttled phone, `/matches` costs an extra **+375 KB over the wire, +112 requests, and +4.1 s to first results**, with 94% of that added weight being data (the JS bundle is unchanged). The optimizer is fine (immutable, brotli, CDN HIT); the client just asks for the whole catalogue. Because LCP fires on the shell, this cost is invisible to Core Web Vitals and to the JS ratchet.

## 4. Resources (fonts / images / third parties)

`/fr` resource breakdown (median load, `performance.getEntriesByType('resource')`):

| Category | Requests | Transferred | Notes |
|---|---|---|---|
| script | 20 | 246 KB | React/Next runtime, next-intl, page chunks |
| **font (Arabic)** | **1** | **166,452 B** | **`3fd1b3eda9c5392f…woff2` = Noto Sans Arabic** |
| font (Geist) | 1 | 29,588 B | preloaded latin subset |
| CSS | 1 | 14,702 B | one stylesheet (`3tii3q64ubzq7.css`) |
| image | 1 | 10,568 B | `/logo-mark.png` |
| RSC prefetch (`_rsc`) | 7 | 28 KB | `/fr`, `/fr/profile`, `/fr/matches` |
| third party | 2 | ~0 B | `gc.zgo.at/count.js` + `negexx.goatcounter.com/count` |

- **Fonts — the headline finding.** `Geist` is loaded with `next/font` (self-hosted, `font-display: swap`, latin subset preloaded **as designed**). `Noto_Sans_Arabic` is correctly configured `preload: false` (`src/app/fonts.ts`) — yet the browser **downloads the full 166 KB Arabic subset on `/fr` and `/en`**. Cause: the header's locale switcher renders the native language name **"العربية"** on every page (`messages/{fr,en,ar}.json` → `localeSwitcher.names.ar`), and that single Arabic word matches the Noto Sans Arabic `@font-face` unicode-range, so Chromium fetches the whole subset. This is **~33% of the home page transfer** and appears on every non-Arabic page (cached after the first load).
- **Images:** only `/logo-mark.png` (10.6 KB, fixed 160×108, `<img>` with a deliberate `biome-ignore` explaining the `next/image` runtime is out of budget). No oversized images. The home "trust band" glow is a CSS `radial-gradient`, not an image. `favicon.ico` is 25.9 KB (served lazily; not in the resource timeline of these loads).
- **Third parties:** the only third party is GoatCounter. It is an inline server-rendered loader (`src/components/analytics-loader.tsx`, zero client JS) that injects `https://gc.zgo.at/count.js` **after `window.load` and an idle callback** (`requestIdleCallback`, 5 s timeout / 2 s fallback), honouring DNT/GPC. It is **not render-blocking** and adds 2 requests with no measurable transfer. No other third-party scripts.

## 5. Accounts paths (code review + TTFB observations)

Read-only review of `src/lib/server/account-*` + `src/lib/auth/*`. **Accounts are LIVE in production** (owner: since 2026-10-17; verified the same day: `/fr/sign-in` 200 with the real sign-in page, `/fr/welcome` 200, `/fr/account` 200, `/api/auth/get-session` 200). Guest pages still run no account code for signed-out browsers (`AccountSyncEntry` returns `null`), but `/api/auth/*` now goes through Better Auth (`src/lib/auth/handler.ts`) and signed-in requests touch Neon.

**Queries per operation (no N+1 found):**
- `requireAccountReady` → `readSessionUser` → `getAuth().api.getSession()` = **1 session query** (no cookie cache is configured, by design). Runs first in every action.
- `loadAccountData` (page hydration) → session (1) + one transaction: profile (1), saved programs (1 bulk `select`), checklist progress (1 bulk `select`) = **~4 queries**, all set-based.
- `saveProgram` / `unsaveProgram` / `setStepDone` / `forgetProgress` → session (1) + 1–2 statements.
- `saveProfile` → session (1) + transaction (`lockUser` select, update/insert, `user_data_state`).
- `createFeedbackReport` → session (1) + `count()` + insert.
- `loadAccountDataFor` loads saved programs and checklist steps with **one query each** (`eq(userId)`), not per-row → **no N+1 risk**. Input is Zod-validated in the `"use server"` wrapper; the session is re-checked inside each action.

**TTFB of `GET /api/auth/get-session` (public GET, no session cookie):** cold **65 ms**, then warm **22–41 ms** (6 samples). The requests carried no cookie, so no session lookup or Neon query runs on the happy path; this measures Vercel Function cold/warm start only and is **not** a measurement of signed-in latency (accounts are live; a signed-in request additionally pays Better Auth + Neon, including possible Neon compute wake-ups).

**Owner-check items (need the Vercel/Neon dashboards; not measurable from a browser):** real signed-in TTFB once `ACCOUNTS_ENABLED=true` (Better Auth session query + Neon compute cold-start on an idle database); function invocation counts per route after accounts launch; the `fra1` function region vs Neon's Frankfurt region round-trip. Neon's serverless compute can suspend, so the **first** signed-in request after idle may pay a Neon cold start on top of the function cold start — worth confirming before launch (D8/D10).

## 6. ADR 0007 levers verification

Verified from source **and** network traces (seeded profile/saved list so the prefetches are live):

- **Match cards:** `prefetch={false}` confirmed. `/fr/matches` (seeded) issues `_rsc` prefetches for **`/fr`, `/fr/matches`, `/fr/plan`, `/fr/profile` — and none for `/programs/*`**. ✓ (the lever ADR 0007 records as saving ~17 KB until-idle holds)
- **Locale switcher:** the current-locale link is `prefetch={false}` (`src/components/locale-switcher.tsx`). The Arabic name that triggers the 166 KB font is a separate issue (see §4).
- **Primary nav:** `/profile` and `/matches` are prefetched on every page (home: `/fr/profile` 10,767 B + `/fr/matches` 9,416 B RSC). `/scholarships` is `prefetch: false`. `/plan` is prefetched **only when the saved count > 0**.
- **Quantified lever — skip the `/plan` prefetch:** with saved programs, `/compare` prefetches `/plan`; without, it does not. Until-idle **script** bytes on `/fr/compare`: **297,383 B = 290.4 KiB (seeded) vs 265,318 B = 259.1 KiB (empty) = ~31.3 KiB** extra when `/plan` is prefetched. This is the concrete saving behind the ADR's "not prefetching /plan from /compare recovers ~15 KB" note — measured here at **~32 KB per load** (chunk re-partitioning). `matches` (seeded) is 278,408 B until idle for the same reason.
- **Other ADR 0007 levers** (merge-free shell classes, dropping next-intl's client `Link`/provider: ~5–15 KB) are code-level and not separately re-measured here; the shell + next-intl baseline remains in the bundle.

## 7. Ranked bottlenecks (evidence | saving | risk | effort)

1. **Arabic font download on every non-Arabic page — 166 KB (~33% of home transfer).**
   *Evidence:* `/fr` loads `3fd1b3eda9c5392f…woff2` (166,452 B), `@font-face` family `Noto Sans Arabic`, triggered by the literal string "العربية" rendered by the locale switcher (§4). *Saving:* **~166 KB on first load of every `/fr` and `/en` page**. *Risk:* low (options: render the `ar` locale entry as a bare "AR"/globe label, or a preload-free subset, or mark that one word `font-arabic`-less). *Effort:* low (one component/one message).

2. **`/matches` snapshot fan-out — 76 shards, 378 KB transferred, 6.33 MB parsed, 4.1 s to results, 1.8 s TBT.**
   *Evidence:* §3. `shardsForMatches` loads **all** program shards for all 6 destinations regardless of the profile's interests. *Saving:* loading only the shards a destination/field needs could cut the transfer by roughly 2–4× and the parse proportionally, moving "time to results" from ~4.1 s toward ~1.5–2 s. *Risk:* medium-high (changes what "hidden vs omitted" means, `totalPrograms` counts, and the filter contract — needs a domain decision, ADR-worthy). *Effort:* medium-high.

3. **Program page 0.5 KB from the ratchet; all content routes over the 150 KB target.**
   *Evidence:* §1 (program 187.5 / 188; home 173.8 / 176). *Saving:* the ADR 0007 shell levers (~5–15 KB) would restore headroom and shrink every route. *Risk:* medium (shared-component class resolution). *Effort:* medium.

4. **`/plan` prefetch from `/compare` and `/matches` when something is saved — ~32 KB per load.**
   *Evidence:* §6 (compare seeded 290.4 KiB vs empty 259.1 KiB until idle). *Saving:* **~31 KB** on those loads; add `prefetch={false}` to the nav `/plan` link (as `/scholarships` already has). *Risk:* low-medium (slower first paint of `/plan` for a user who navigates there). *Effort:* low.

5. **`/profile` LCP 1.42 s / dcl→LCP 936 ms (form island hydration).**
   *Evidence:* §2. *Saving:* modest LCP improvement if the first form field renders server-side or the island is lighter. *Risk:* low. *Effort:* medium.

(Ruled out as bottlenecks: images, CSS — 14.7 KB br, GoatCounter — deferred & non-blocking, cache headers — all correct, Zod — absent from the client.)

## What is verified sound

- **No route exceeds its JavaScript ratchet**; Zod is absent from all client chunks.
- **Snapshot delivery is configured correctly:** immutable `max-age=31536000` on content-hashed shards, `no-cache` on the manifest, brotli on both, CDN HIT, largest shard 38.6 KB gzip (cap 300 KB).
- **No oversized images**, no image-blocking, no render-blocking third parties; GoatCounter waits for `load` + idle and respects DNT/GPC.
- **No N+1 queries** in the account store; session/consent is re-checked inside every Server Action; accounts are fully inert on guest pages.
- **TTFB is good** (68–196 ms) and CLS is good everywhere (≤ 0.029).
- **Font strategy is correct by design** (`preload: false` for Arabic) — the leak is content-driven, not configuration-driven.

## Owner decisions needed

1. **Fix or accept the 166 KB Arabic font on fr/en** — the cheapest, largest win; needs a copy/UX call on how the `ar` entry in the locale switcher is labelled.
2. **Authorise a `/matches` shard strategy change** (per-destination / per-field planning) — a domain + product decision with an ADR, because it changes the "hidden, never omitted" contract and the counts.
3. **`/plan` prefetch policy** — keep the ~32 KB prefetch on `/compare`/`/matches` (faster `/plan`) or drop it (lighter page).
4. **Program-page ratchet headroom (0.5 KB)** — before the next client change to program pages, raise the ratchet deliberately or fund the shell trim.
5. **Accounts latency** — accounts are live (2026-10-17); read function invocations, cold starts and Neon compute wake-ups in the dashboards (D10); this audit exercised only signed-out paths.
