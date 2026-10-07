# ADR 0004 — Analytics, error reporting, privacy, data freshness, translations, hosting limits

**Status:** Accepted
**Date:** 2026-09-29

## Context

ADR 0003 left six items open. Facts below come from secondary sources found via web search on 2026-09-29 (vendor pages, law-firm and consultancy summaries). Re-verify anything marked "verify" against the official source before relying on it.

## Decisions

### 1. Hosting: Vercel Hobby, free, non-commercial
Hobby is allowed as long as nothing is charged and no one involved earns money from the site. Hobby has hard monthly caps (reported: 100 GB fast data transfer, 1M edge requests, 1M function invocations, 4 CPU-hours) and **pauses the project when a cap is hit; it never bills** — verify at vercel.com/docs/plans/hobby.
- Design consequence: the static data plane and browser-side domain core keep function/edge usage tiny. The `proxy.ts` matcher must exclude assets, `_next` and snapshots.
- Snapshot budget: each gzipped snapshot shard ≤ 300 KB; initial JS ≤ 150 KB gzipped (targets, enforced in review).
- Check usage monthly. At **60% of any cap**, move snapshots/assets to Cloudflare R2 or Pages (free egress) behind a CDN subdomain; the manifest URL is the only thing that changes.
- **Risk:** donations, sponsorship, ads or grants may count as commercial use. Read Vercel's fair-use terms before accepting any; if in doubt, move to Pro or another host first.

### 2. Analytics: GoatCounter
EU data residency, cookieless, free for non-commercial sites, no server load on us (Umami self-hosting would consume Vercel invocations and Neon storage). No consent banner is needed if we set no cookies and store no personal data. It has no funnel UI: track journey steps as events (`profile-started`, `profile-completed`, `matches-viewed`, `program-saved`, `plan-opened`) and compare counts. Fallback if funnels prove necessary: Umami Cloud (US-primary, SCCs).
- Never put profile values (grades, nationality) in paths, query strings or event names.

### 3. Error reporting: Sentry, Developer plan, EU region
Free tier reported at 5,000 errors/month, 30-day retention, EU data region (`de.sentry.io`) available — verify. Configuration: `sendDefaultPii: false`, tracing/profiling off (`tracesSampleRate: 0`) to protect quota, no session replay, `beforeSend` strips request bodies, cookies and URL query strings, filter browser-extension noise, and rate-limit duplicate events. Confirm Next.js 16 SDK setup with `ctx7` and check the client bundle cost against the JS budget before adding.

### 4. Data freshness thresholds
Thresholds are constants in `src/data-schema/staleness.ts` and take `now` as an argument.

| Class | Examples | Aging (label) | Stale (warning) |
|---|---|---|---|
| Volatile | deadlines, intake dates, tuition/fees, cost-profile fee lines (insurance, visa, setup), scholarship amounts and deadlines | 120 days | 270 days |
| Stable | admission requirements, routes, program descriptions, rent/food/transport cost estimates | 270 days | 545 days |

- Aging: the verified-on date is shown emphasised. Stale: a "may be outdated — check the official page" banner.
- **Stale data never produces ✅ or ❌**: any result depending on a stale fact is ⚠️ with the reason "source not re-verified recently".
- A deadline in the past is never shown as upcoming: show "Closed — next dates not yet published" until a new cycle is entered.
- `pnpm data:check` fails on invalid/provenance-less records only; staleness is a warning report (`--strict` fails on stale, for pre-launch). The source watcher only flags pages whose content hash changed (review those first); an unchanged hash does **not** extend `last_verified_at`, only a human read does.

### 5. Translation storage
- **Short text** (≤ ~300 chars: summaries, notes, step explanations) is an inline `LocalizedText` map in the YAML record: `{ fr: string, en?: string, ar?: string }`; `fr` is required and is the fallback for every locale.
- **Long-form guides** (Moroccan-specific guidance, common mistakes, document explanations) are MDX under `content/<locale>/…`, with frontmatter carrying the same provenance fields (`source_url`, `info_kind`, `last_verified_at`).
- Translation status per record and locale: `draft` (machine-assisted) or `reviewed` (a human fluent in the language has read it). Draft text may ship but shows a small "translated automatically" note until reviewed; a coverage report is printed by `data:check`. Arabic is Modern Standard Arabic.
- Official names (universities, programs, exams, portals) are never translated.
- Snapshots: structural data is locale-neutral; text is a separate shard per locale so a user downloads only their language.
- UI strings stay in `messages/{en,fr,ar}.json`.

### 6. Privacy and legal (Morocco Law 09-08 + GDPR)
Secondary sources indicate Law 09-08 can apply to foreign controllers processing data of people in Morocco, requires prior declaration to the CNDP for automated processing (authorization for sensitive data and for some transfers), and treats the EU as an adequate destination for transfers — **verify with the CNDP or a Moroccan data-protection lawyer before public launch of accounts; this ADR is not legal advice**. Product consequences:
- **Guest mode stores nothing server-side** (profile in localStorage; analytics cookieless and anonymous), keeping the launch footprint minimal. The **CNDP declaration and privacy notice are a gate for launching accounts (phase 2)**, not for the guest release.
- Data stays in the EU (Vercel fra1, Neon Frankfurt, Sentry EU, GoatCounter EU). Processors (Vercel, Neon, Google sign-in, email provider) are listed in the privacy notice, with DPAs signed where offered.
- Privacy notice and terms in en/fr/ar; explicit, unticked consent at signup; store `consent_version` and `consented_at` on the user row.
- Accounts require age ≥ 16 (conservative floor; Bac graduates are usually 17–18). Younger visitors stay in guest mode.
- Account deletion cascades all user data; export returns profile, saved programs and checklist as JSON.
- Grades and nationality are personal but not "sensitive" categories; still never logged and never sent to third parties.

## Alternatives considered

- **Umami self-hosted / PostHog:** better funnels, but consume Vercel invocations, Neon storage or raise consent and residency questions.
- **Plausible Cloud:** EU and good, but paid; conflicts with the zero-cost goal.
- **Sentry alternatives (GlitchTip self-hosted):** extra ops for one person.
- **Single stale threshold for all facts:** simpler, but treats a program description like a tuition figure.
- **Separate translation files per locale for all text:** atomic edits become three-file edits and drift is likelier.

## Consequences

- Positive: zero recurring cost; no consent banner; the guest release has minimal legal surface; freshness rules are explicit, testable and tied to trust.
- Negative: no built-in funnel analysis; Vercel Hobby caps can pause the site during a viral spike (mitigated by the 60% rule); Sentry adds client bundle weight; `data:check` output needs regular attention from the one editor.
- Neutral: several figures (Vercel caps, Sentry quota, CNDP rules) came from secondary sources and must be re-verified before launch.

## Before launch checklist

1. Verify Vercel Hobby limits and fair-use wording; decide policy on donations/sponsorship.
2. Verify Sentry free-tier quota and EU region; measure SDK bundle impact.
3. Confirm CNDP obligations with the CNDP/a lawyer; file the declaration before accounts go live.
4. Publish privacy notice and terms in en/fr/ar.
5. Run `pnpm data:check --strict` on Release 1 data.

## How to revisit

ADRs are immutable once committed. If this decision turns out wrong, write a new ADR that supersedes this one — don't edit this in place.
