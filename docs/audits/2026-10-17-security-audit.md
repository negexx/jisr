# Security audit — 2026-10-17

- **Audited commit:** `f0cc00efed2f74e7e8a816ea59585d7462f4eebe` (main; PR #61 open, docs-only). Audit window 2026-10-17 → 2026-10-18.
- **Target:** accounts are **live** in production `https://jisrr.org` since 2026-10-17 (verified during the audit: `/fr/sign-in` 200, `/fr/welcome` 200, `/fr/account` 200; `docs/ops/prelaunch-checklist.md` still records `ACCOUNTS_ENABLED` empty (section intro line 48; D11 is the switch row) — stale on this point).
- **Method:** the `security-research` workflow, executed as a 5-role team: threat model first (assets: accounts, email addresses, consent records, profile data, saved programs; actors: anonymous, signed-in, attacker who knows a victim's email, mail scanner), then three independent hunters (attack-surface map; auth & data; runtime & supply chain), then two PoC engineers who reproduced/falsified the strongest candidates against the local PGlite harness, then cross-check. The team-mode plugin is not enabled in this environment, so the roster ran as parallel subagents of the orchestrating session instead (`team_*` unavailable).
- **Companion artifacts:** the bug & correctness audit (`2026-10-17-bug-correctness-audit.md`) ships as its own report; `T1c-F*` references below point to its Part C.
- **Rules of engagement:** read-only; no requests against production beyond harmless public GETs; all PoC execution local (in-process Postgres 18.6 / PGlite 0.5.9, mail transport mocked, reserved `@example.org`/`@example.com` addresses); no fixes.
- **Severity standard:** CWE for classification; no severity without an attack path; no CVSS precision claimed. Full hunter evidence and PoC transcripts are in the appendices (A–E). PoC specs: `tests/audit-repro/t2poc-a-*.test.ts`, `t2poc-b-*.test.ts` on scratch branch `audit/repros-2026-10-17` (not for merge).

## Verdict: PASS WITH FINDINGS

No High or Critical path was found or constructed. The accounts surface carries real defence-in-depth (claim-before-write ordering, hashed single-use tokens, ALS-scoped signup intent, closed GET verify/delete, session-scoped writes, CAS + row locks, no-PII log scrubbing, sha256 snapshot integrity), the prior pass (`docs/ops/security-review-accounts.md`, F1–F8) remains valid, and nothing was re-raised without new evidence. Two independent PoC engineers confirmed the mechanics of every surviving finding locally; one candidate (consent forgery of an account record) was **falsified** and its impact narrowed. The findings are Low: record provenance, availability/cost, privacy hygiene, and latent dependency exposure — none grants third-party access, impersonation or account takeover.

## Findings

| # | Severity | Title | CWE | Exploitability (verified locally) | Impact | Fix |
|---|---|---|---|---|---|---|
| SEC-1 | Low | Consent/age evidence is client-asserted: a crafted sign-in request can stamp `consent_version`/`consented_at` without the consent UI ever being shown | CWE-807 | **Reproduced** (PoC-A): `POST /sign-in/social` with `additionalData` stamps on create; magic-link twin via the action's plain booleans; self-only, mailbox-verified | Only matters if the columns are treated as probative proof of a displayed-and-accepted notice; otherwise by design | Decide the legal semantic (asserted vs probative); if probative, add a provenance marker — no bypass to patch |
| SEC-2 | Low | A third party can plant `pending_signups` consent/age evidence for an address they do not own; the row is disclosed in that address owner's export | CWE-345 | **Reproduced** (PoC-B); the account's own consent timestamp is **not** forgeable (create-time stamping — falsified) | Unsolicited branded mail (already-accepted risk, ADR 0013 §3) + third-party-authored rows in the owner's export with no provenance marker | Mark row provenance, or re-derive/annotate the assertion source in the create hook |
| SEC-3 | Low | No rate limiting: `/api/auth/sign-in/social` writes unbounded `verification` rows (`auth-state:*`); `/api/auth/magic-link/confirm` runs ~4 DB statements/request unbounded; orphan state rows are never swept | CWE-770 / CWE-799 | **Reproduced** (PoC-A + PoC-B): 50×200 no 429; limiter provably off (`disableIpTracking` ⇒ `getIP()` null); lazy purge covers only `pending_signups`/`email_cooldowns`/`auth_email_days` | Availability/cost only: Neon storage growth + function invocations; Hobby caps pause the site rather than bill | Add a `verification` arm to `purgeExpiredAuthRows` (`expires_at < now()`), and/or a per-request cap on social starts |
| SEC-4 | Low | The per-mailbox cooldown is attacker-holdable: targeted ≤60 s sign-in delay per send; alias spellings share the key; both refusal reasons return an identical 429 body | CWE-770 / CWE-799 | **Reproduced** (PoC-B, injected clock); bounded: a continuous hold exhausts the shared 230/day budget in ≈3 h 54 m, after which the owner-accepted global ceiling applies | Targeted nuisance denial; no data impact | Optional: distinguish the two refusal reasons in copy; no exploitable escalation to patch |
| SEC-5 | Low (hygiene) | Pre-account rows are purged only lazily; a non-owner has no erasure path for a row keyed to their address; account erasure also misses a different spelling of the same mailbox (cross-ref T1c-F1 (companion report)) | CWE-459 | **Reproduced** (PoC-B): an expired row persists until the next granted auth email; refused claims purge nothing | Privacy hygiene; the only read path is the owner's own export | Add the sweep arm (SEC-3) and decide the `pending_signups` mailbox keying (T1c-F1) |
| SEC-6 | Low (latent) | Next.js 16.3.7 carries 6 advisories in `pnpm audit` (8 production findings overall — the other two are esbuild and source-map-js) including a **HIGH SSRF** (Image Optimization, patched in ≥16.3.8) | CWE-918 / CWE-524 / CWE-346 | `pnpm audit`; none currently reachable — no `next/image`, no `use cache`, no metadata image routes in `src/` | Becomes real if those features are added before the bump | Bump to `next@≥16.3.8` (then re-run `pnpm audit` + the same greps) |
| SEC-7 | Low (accepted by design) | GoatCounter `count.js` loads without SRI; the CSP has no `script-src` (documented choice) | CWE-494 | Static read; standard third-party supply-chain exposure; session cookie is HttpOnly | A compromised CDN script could read guest localStorage (profile/saved/plan) | Revisit per ADR 0011; add SRI if GoatCounter publishes stable hashed URLs. Resolved 2026-10-21: `count.v5.js` with SRI (`src/components/analytics-loader.tsx`). |
| SEC-8 | Low (ops) | `ACCOUNTS_ENABLED` is read at build for the static pages and per-request for the handler; a mis-scoped deploy can desynchronise UI and capability | CWE-16 | Static read; server-side enforcement (gate plugin + create hooks) is always present | Presentation/capability mismatch only; no check bypass | Document & set the flag in both Build and Runtime scopes for the same production deployment |
| SEC-9 | Low (dev tooling) | The data importer follows redirects and has no private-IP/loopback guard on links it scrapes | CWE-918 | Static read; never runs in production or on Vercel | A malicious crawled page could point the importer at an internal service | Add a private-host block in `scripts/import` if it ever runs unattended |

### Informational / hardening (no attack path)

- `BETTER_AUTH_URL` accepts `http:` (stricter than `NEXT_PUBLIC_SITE_URL`, which requires https except localhost) — reject non-https in production.
- Dev-only transitive advisories: `braces` (via `shadcn` CLI), `source-map-js` (via dev tooling), `esbuild` (via `drizzle-kit`); plus an implicit pnpm build-script allow-list — declare `onlyBuiltDependencies` to make the posture auditable.
- `.env.example` omits importer/test-only variables (`OPENCODE_API_KEY`, `JISR_IMPORT_REFRESH`, `TEST_POSTGRES_URL`); the importer reads `.env.local` at runtime (git-ignored).
- `beforeDelete` refuses while accounts are off, and the delete pages `notFound()` in the same state → no offline erasure path during a switch-off window (GDPR availability question; owner call).
- ADR 0013 §3 (line 43) and D9 still say a cooldown-refused request "refreshes the pending row", while the code claims first and writes after (the safer order, security-review F2) — doc/code drift worth correcting (see T1c-F3 (companion report)).

### Finding details (SEC-1 … SEC-5; full evidence in appendices A–E)

**SEC-1.** `sign-in-form.tsx:127-131` sends `additionalData: { ageConfirmed: true, consentVersion: CURRENT_CONSENT_VERSION }` for Google; Better Auth spreads it into the encrypted, cookie-bound OAuth state (`oauth2/state.mjs:24` → `state.mjs:63`), and `confirmationFromOAuthState` reads those top-level booleans on callback (`admission.ts:64-69`). The magic-link twin: `requestSignInLink` accepts plain booleans (`signup.ts:121-124`) and `recordPendingSignup` hardcodes `ageConfirmed: true` + `CURRENT_CONSENT_VERSION` (`pending-signup.ts:21-26`). PoC-A drove both paths locally: no form, no notice, no checkbox — a raw POST plus the callback creates the user with `consent_version = CURRENT_CONSENT_VERSION`, `consented_at` non-null. Replay without the initiator's state cookie is refused (`state_security_mismatch`). The only enforceable server check on the Google path (verified mailbox) holds. This is a **self-declared record**, not a third-party attack; it matters only if the columns are treated as CNDP-probative.

**SEC-2.** `requestSignInLink` is public by design; one anonymous call writes `pending_signups` (email, `ageConfirmed: true`, current `consentVersion`, `consentedAt` = request clock) keyed by `normalizeEmail`. PoC-B planted a row for a toy address, rewrote its `consentedAt` to 2020, then confirmed: the created account's `consented_at` is the **create** clock (falsifying the forgery angle), while `exportAccountDataFor` returns the planted row verbatim to the address owner — third-party-authored evidence with no provenance marker. The mail-volume half is the owner-accepted risk.

**SEC-3.** `server.ts:267` sets `advanced.ipAddress.disableIpTracking: true`; `@better-auth/core` `ip.mjs:203-204` then returns `null` from `getIP`, and `rate-limiter/index.mjs:242-243`/`:292-295` switch the limiter off entirely. PoC-A: 50 unauthenticated `POST /sign-in/social` → 50×200 and exactly +50 `auth-state:` rows; a granted claim's purge removed a `pending_signups` control row but left all 50 state rows; 50 junk confirms → 400s, never 429, ~4 statements each. PoC-B independently confirmed on a different endpoint (25× `magic-link` posts, distinct addresses, no 429 — a live limiter would have answered the 4th). Impact is availability/cost only; the caps are the harm.

**SEC-4.** PoC-B with injected clock: accept at t0, refuse at +59 s, accept at +61 s; `victim+1@`/`victim+2@`/`victim@` and Gmail-dot variants share one slot; identical `{code:"EMAIL_COOLDOWN"}` for mailbox-throttle and daily-ceiling. Holding one mailbox needs ≈1 accepted send/61 s; ~230 accepted sends exhaust the shared budget in ≈3 h 54 m, converting the targeted lock into the already-accepted global exhaustion. Realistic worst case without budget burn: ≤60 s delay per send.

**SEC-5.** PoC-B: an expired `pending_signups` row is ignored by `readPendingSignup` while still present; only a granted auth-email claim (which runs `purgeExpiredAuthRows`) deletes it; a refused claim purges nothing. Combined with T1c-F1 (erasure misses a Gmail-spelling variant of the same mailbox), the pre-account row story has two small completeness gaps; no read path exposes rows to anyone but the address owner's export.

### Downgraded or rejected candidates

| Candidate | Outcome |
|---|---|
| "A planted pending row forges the account's consent timestamp" | **Falsified** (PoC-B: create hook stamps the create clock; `readPendingSignup` never reads `consentedAt`) — impact narrowed to export/audit provenance |
| "Third party can stamp consent/age on someone else's account" | **Falsified**: the OAuth state is cookie-bound (replay → `state_security_mismatch`), Google requires a verified mailbox, and the magic-link path needs the emailed token |
| "`/magic-link/confirm` allows token brute force" | **Rejected**: token entropy 62³² + single-use atomic consume; only the unbounded-work angle survives (SEC-3) |
| "`/sign-in/social` write amplification is Medium" | Kept **Low**: no data exfiltration; Hobby caps self-limit (site pause is the harm) |
| "Per-mailbox cooldown hold is a real targeted DoS" | Kept **Low but recorded**: genuine ≤60 s targeted delay, budget-bounded; not previously called out in `security-review-accounts.md:46-48` |
| Login-CSRF residual, unknown-address mail volume, file-transport F7, profile-conflict F8 | Prior-pass items; accepted by the owner — not re-raised |

## Checked and sound (consolidated; full lists in appendices A–C)

1. **Kill switch fails closed, per request, on every surface** (`handler.ts:35`, `accounts-gate.ts:41-51`, create hooks, send paths, `readSessionUser`, prerendered pages) — while off: `GET get-session` → `200 null`, everything else `403`.
2. **Admission cannot be satisfied off-path**: no evidence → reject; evidence is path-scoped; a direct `POST /sign-in/magic-link` writes no pending row (ALS intent can only be set by the checked action).
3. **Emailed links act only on an explicit button**; `GET /magic-link/verify` and `GET /delete-user/callback` are closed; tokens ride the URL fragment + a POST body (no request-log/Referer exposure); the islands strip the fragment immediately.
4. **Confirm endpoint**: `formCsrfMiddleware`, token-shape regex, single-use consume, inner `Set-Cookie` carried onto the real response.
5. **Browser binding is timing-safe and non-forgeable** (24 random bytes, sha256 stored, `timingSafeEqual`, server-set cookie).
6. **No IDOR**: every store `where` uses the session `userId`; inputs are strictObjects without identity fields; export selects by session id; a cross-student export test exists.
7. **Every account action re-checks the session** (and consent) before parsing input; `readSessionUser` re-reads the DB (no cookie cache).
8. **Input bounds are server-side and tighter than the columns** (slug ≤120, profile JSON ≤16 KB, saved ≤12, plan ≤50, feedback ≤20/24 h counted under lock).
9. **CAS + real locks**: `saveProfileFor` is `UPDATE … WHERE revision = expected`; caps/import/clear serialise on `lockUser FOR UPDATE`; races covered by the CI `db-race` job.
10. **Export is a named-column allow-list** over the user's own rows; no session/verification/OAuth/password/IP/UA ever selected; `no-store` + `attachment`.
11. **Deletion**: session-bound, single-use, 1 h token; another student's token, replay, no-session and GET paths all fail; `eraseAccountResidue` removes the three verification shapes (JSON-safe via `pg_input_is_valid`), cooldowns in both key forms, and pending rows (exact key); session cookie expired on the real response.
12. **Send throttles are atomic** (`INSERT … ON CONFLICT … setWhere` on the DB clock; cooldown before budget so a refused request spends nothing; deletion reserve honoured).
13. **No PII reaches logs**: scrubber blanks URLs/`token=`/addresses; Better Auth's logger fully replaced; send failures log class names + SQLSTATE only; `no-pii.test.ts` drives real flows; no Sentry SDK is integrated.
14. **Tokens hashed/encrypted; unnecessary data discharged**: `storeToken: "hashed"`, OAuth tokens encrypted, `idToken` nulled, session IP/UA nulled, IP tracking off.
15. **Open redirect closed**: `safeReturnPath` (leading `/`, known locale, safe segments) applied at every read/write site; `baseURL` explicit, never inferred from `Host`.
16. **Email transport fails closed** and is un-SSRF-able (fixed Brevo endpoint; file transport impossible on Vercel; no template/header injection); analytics events are a closed, PII-free set.
17. **No HTML-injection sink**: the only `dangerouslySetInnerHTML` is the fixed analytics template; MDX is build-time, repo-curated, statically imported; external links require `https:` or render inert.
18. **CSRF reasoning holds for the JSON-only router** (form POST → 415; cross-site fetch → CORS preflight refused; origin check on cookie-bearing requests; SameSite=Lax).
19. **No secret committed**; `.env.example` covers the app surface; lockfile has 0 git/tarball resolutions, 885 integrity pins, `--frozen-lockfile` installs; pglite never reaches the app bundle.
20. **Security headers & deployment config are sane** (HSTS, nosniff, Referrer-Policy, Permissions-Policy, CSP `frame-ancestors 'none'; base-uri; object-src; form-action`; no Vercel rewrites; snapshot shards immutable, manifest `no-cache`, brotli, CDN HIT).

## Residual risk / what was not tested

- **Production was never attacked** (only public GETs: sign-in/welcome/account/get-session for the live check). No load testing; platform-cap math (Neon 1 GB, Hobby invocations) is reasoned from ADRs, not exercised.
- **Harness ≠ production**: PoCs ran on in-process PGlite (PG 18.6) with mocked mail; real Neon behaviour (cold starts, storage) untested; browser-level account journeys were not re-driven (existing e2e-accounts specs were read, not executed).
- **Team-mode note**: `team_*` tools unavailable; the 5-role roster ran as subagents (equivalent work products in appendices D–E).
- **Not covered**: mobile app browsers for the flows (production rendering was a separate design track), third-party CDN compromise scenarios beyond SEC-7, future features (`next/image`, `use cache`) that would activate SEC-6.

## Owner decisions needed

1. **CNDP semantics**: are `consent_version`/`consented_at` probative or asserted? (SEC-1/SEC-2 wording, possible provenance column.)
2. **Rate-limit mitigation**: add the `verification` sweep arm and/or a social-start cap? (SEC-3.)
3. **Erasure keying** for `pending_signups` (Gmail-spelling gap) — with T1c-F1 (companion report).
4. **Next.js bump to ≥16.3.8** before any image/cache feature is added. (SEC-6.)
5. **GoatCounter SRI/CSP revisit** per ADR 0011. (SEC-7.)
6. Off-accounts deletion window (GDPR availability) + the small hardening batch (https-only `BETTER_AUTH_URL`, `onlyBuiltDependencies`, `.env.example` docs).

## Appendices

- A — attack-surface map: `2026-10-17-security-appendix-a-surface.md`
- B — auth & data candidates: `2026-10-17-security-appendix-b-authdata.md`
- C — runtime & supply chain: `2026-10-17-security-appendix-c-runtime.md`
- D — PoC engineer A: `2026-10-17-security-appendix-d-poc-a.md`
- E — PoC engineer B: `2026-10-17-security-appendix-e-poc-b.md`
