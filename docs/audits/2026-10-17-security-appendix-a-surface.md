# T2 hunter — surface map

- **Audited commit:** `f0cc00efed2f74e7e8a816ea59585d7462f4eebe` (merge PR #60 `feat/sign-in-single-flow`), branch `audit/scratch-security`.
- **Method:** read-only static analysis. Inputs traced from every attacker-reachable entry point to its data sink (DB read/write, email send, JSON export, log) with exact file:line evidence. No requests were made against production; no files were modified outside this draft. Node was not run (Windows-built `node_modules`).
- **Files reviewed:** `src/proxy.ts`; `src/app/api/**`; `next.config.ts`; `vercel.json`; `src/lib/security-headers.ts`; `src/lib/snapshot-headers.ts`; `src/lib/site-env.ts`; `src/lib/analytics.ts`; `src/components/analytics-loader.tsx`; `src/app/{robots,sitemap,global-not-found}.ts(x)`; all `"use server"` modules (`src/lib/server/{signup,import,consent,account-actions}.ts` + their `account-guard/session/account-store/import-store/account-export(-store)/account-erasure/email(-cooldown)/pending-signup` dependencies); the whole `src/lib/auth/**` tree; `src/db/{index,pool,schema/app,schema/auth}.ts`; the `[locale]` pages and the auth/account client islands; the guides/MDX pipeline; the snapshot client/server readers. Also read the prior pass `docs/ops/security-review-accounts.md`, ADR 0013, ADR 0011, `docs/ops/prelaunch-checklist.md`, `.claude/rules/{auth,database,nextjs-app}.md`.
- **Scope note:** the brief says accounts are **live**; `docs/ops/prelaunch-checklist.md` D11 still records `ACCOUNTS_ENABLED` empty. This draft assumes live, because that is the stricter posture; the kill-switch paths are mapped either way.
- **New surface since the prior pass:** commit `ac6a72e5` ("one passwordless flow") removed the `signup`/`signin` mode radio and made **every** form request a signup intent (`src/lib/auth/signup-intent.ts:7-11`, `src/lib/server/signup.ts:121-138`); `f39950a2`/`8d4ae70a` changed the send-failure log. The prior review (PR 3, todo 28) did not cover these. They are analysed below.

---

## Attack surface map

Legend — **Authz** is the check in front of the sink. EP = entry point.

### A. HTTP route handlers (`src/app/api/**`)

| # | Path / function | Attacker input | Authz | Sink | Notes |
|---|---|---|---|---|---|
| EP1 | `src/app/api/auth/[...all]/route.ts:3` → `src/lib/auth/handler.ts:34-52` `GET/POST` on every `/api/auth/*` | Method, path, body, cookies, `Origin`/`Referer`. Better Auth parses all of it. | `handle()` first checks `accountsEnabled()` (`handler.ts:35`); while off, `accountsOffResponse` (`accounts-gate.ts:32-34`) → `GET /get-session` = `200 null`, everything else `403`. While on, Better Auth's own origin/CSRF checks (`advanced.disableOriginCheck:false`, `server.ts:267`). | DB read/write via Drizzle adapter; `Set-Cookie` (session); email send (magic-link, delete-account); logs | The **only** route file under `api/auth` (3 lines). Sub-endpoints of interest: `POST /sign-in/magic-link` (send), `POST /sign-in/social` + `GET /callback/:id` (Google), `POST /magic-link/confirm` (ours), `GET /magic-link/verify` and `GET /delete-user/callback` (closed by the before-hook, `server.ts:147-150`), `POST /delete-user` (send / token delete), `POST /sign-out`, `GET /get-session`, `POST /update-user`. |
| EP2 | `src/app/api/account/export/route.ts:3-6` → `src/lib/server/account-export.ts:27-44` `GET /api/account/export` | None (no params). Cross-site **top-level** GET would carry the Lax session cookie but the response is unreadable cross-origin. | `accountsEnabled()` (`account-export.ts:28`) then `readSessionUser()` (`:30`, session only — consent deliberately not required). | Read-only `repeatable read` snapshot of the user's own rows (`account-export-store.ts:85-232`); `Cache-Control: no-store`; `Content-Disposition` fixed filename (`account-export.ts:19-21`). | Column allow-list; session/verification/OAuth-token/password/IP/UA are never selected (`account-export-store.ts:20-24`). |

### B. Server Actions (`"use server"` — each export is a network-callable endpoint)

| # | File:line / export | Attacker input | Authz | Sink | Notes |
|---|---|---|---|---|---|
| EP3 | `src/lib/server/signup.ts:113-143` `requestSignInLink` | `{ email, consent, ageConfirmed, locale, returnPath }` (from the sign-in form; callable by anyone) | `accountsEnabled()` first (`:116`); `RequestSchema` + `SignInEmailSchema` (`:117-124`); requires `consent && ageConfirmed` (`:122`). **No session required (public by design).** | Writes `pending_signups` (via the auth before-hook), sends a Brevo email (via the magic-link plugin), writes `email_cooldowns` + `auth_email_days` | `returnPath` is only length-bounded here; sanitised downstream by `authCallbackUrls`→`safeReturnPath` (`callback-urls.ts:23-31`). |
| EP4 | `account-actions.ts:41` `loadAccountData` | none | `guarded(requireAccountReady)` (`:42`) | Read | |
| EP5 | `account-actions.ts:47-53` `saveProgram(item)` | `SavedProgram` | `withReadyAccount(SavedProgramInputSchema)` (`:50`) | Insert `saved_programs` (cap 12) | Scoped to `userId` from session. |
| EP6 | `account-actions.ts:55-61` `unsaveProgram(slug)` | slug | `withReadyAccount(ProgramSlugInputSchema)` | Delete `saved_programs` + `checklist_progress` for that user/slug | |
| EP7 | `account-actions.ts:63-74` `setStepDone(slug, step, done)` | slug, step, bool | `withReadyAccount(StepToggleInputSchema)` | Insert/delete `checklist_progress` (plan cap 50) | |
| EP8 | `account-actions.ts:76-80` `forgetProgress(slug)` | slug | `withReadyAccount(ProgramSlugInputSchema)` | Delete `checklist_progress` | |
| EP9 | `account-actions.ts:82-92` `saveProfile(profile, expectedRevision)` | full `Profile` + revision | `withReadyAccount(ProfileWriteInputSchema)` | Compare-and-set `profiles.data/revision` | 16 KB JSON bound (`account-inputs.ts:42-45`). |
| EP10 | `account-actions.ts:94-98` `createFeedbackReport(report)` | record, path, sourceUrl, snapshotVersion, note | `withReadyAccount(FeedbackInputSchema)` | Insert `feedback_reports` (20/24 h) | `sourceUrl` must be http(s); stored, never rendered as a link (`report-button.tsx` sends none). |
| EP11 | `account-actions.ts:103-107` `clearAccountData` | none | `guarded(requireAccountReady)` | Delete the user's rows; `retireProfile` | |
| EP12 | `import.ts:19-29` `importGuestData(payload, mode)` | whole guest payload + `auto|replace` | `withReadyAccount(GuestImportInputSchema)` | One transaction: profile, saved, ticks, import marker | Caps + distinct-slug checks (`account-inputs.ts:84-109`). |
| EP13 | `consent.ts:21-32` `acceptCurrentConsent` | none | `accountsEnabled()` + `readSessionUser()` | Update the session user's `consent_version/consented_at` (server constants/clock) | `input:false` fields, so a direct update of the session row. |

### C. Auth pipeline (hooks and plugins inside EP1)

| # | File:line | Function | Attacker input | Authz / control | Sink |
|---|---|---|---|---|---|
| EP14 | `server.ts:147-158` | `beforeAuthEndpoint` (hooks.before) | `ctx.body.email` on `/sign-in/magic-link` | `accountsEnabled`; `looksLikeEmail`; **claim before write**; signup-intent ALS gates the pending row | `email_cooldowns`, `auth_email_days`, `pending_signups`; blocks `GET /magic-link/verify` and `GET /delete-user/callback` |
| EP15 | `server.ts:164-168` | `afterAuthEndpoint` (hooks.after) | `ctx.body.token` on `/delete-user` | none needed (deletion already authorised) | Expires the session cookie on the real response |
| EP16 | `magic-link-confirm.ts:54-108` | `POST /api/auth/magic-link/confirm` (our plugin) | `{ token }` in a JSON body | `accountsEnabled`; `formCsrfMiddleware`; `TOKEN` regex; single-use token | Runs Better Auth's verify as a plain call; carries the inner `Set-Cookie`; consumes the nonce row |
| EP17 | `server.ts:225-256` | magic-link plugin `sendMagicLink` | none (post-authorisation) | `isSignupFor` (ALS) derives mode; nonce written before send | `verification` (nonce hash); email |
| EP18 | `server.ts:290-321` | `deleteUser.sendDeleteAccountVerification` / `beforeDelete` / `afterDelete` | none (session-holder) | `claimSendSlot`; `accountsEnabled` in `beforeDelete` | deletion email; erasure |
| EP19 | `server.ts:323-371` | `databaseHooks` (`user.create.before`, `session.create.before`, `account.create/update.before`, `verification.create.before`) | user record from provider | `accountsEnabled`; `evaluateAdmission(evidence, now, current)` | Admission decision; nulls `userAgent`/`ipAddress`/`idToken` |
| EP20 | `admission.ts:43-53` | `evaluateAdmission` (pure) | evidence from EP14/Google callback | — | Returns reject / allow-with-null-consent / allow-stamped |
| EP21 | `accounts-gate.ts:41-51` | `accountsGate` plugin | every `/api/auth` request | `accountsEnabled()` per request | Refuses all while off (defence behind EP1) |

### D. Pages and rendering

| # | Path | Dynamic input | Authz | Sink | Notes |
|---|---|---|---|---|---|
| EP22 | `/[locale]/programs/[slug]/page.tsx:29-68` | `slug` | `dynamicParams=false` + `generateStaticParams` (`programStaticParams`); unknown slug → 404; alias slug → `redirect()` 307 | `readBuildSnapshot` (`server-only`) | All slugs prerendered; no runtime render of an unknown slug. |
| EP23 | `/[locale]/guides/[slug]/page.tsx:17-43` | `slug` | `dynamicParams=false`; `guideBySlug` only | MDX bodies statically imported (`catalog.ts:1-33`) | No runtime file read; frontmatter Zod-validated at module load. |
| EP24 | `/[locale]/{sign-in,sign-in/confirm,welcome,account,account/delete}/page.tsx` | none server-side; token read from the fragment client-side | `accountsEnabled()` + `notFound()` (`account/page.tsx:21-37` etc.) | Prerendered static shells | `noindex`. |
| EP25 | `/[locale]/matches|plan|compare|profile|scholarships` | localStorage/local filters (client) | none (guest) | Snapshot shards fetched from `/snapshots` | Integrity: byte length + sha256 (`snapshot/client.ts:191-209`). |
| EP26 | `src/proxy.ts:5,13` | URL path | none (routing/UX only) | i18n redirect for `/` and locale-less paths | Matcher excludes `api|_next|_vercel|snapshots|locales|*.*`; optimistic only. |
| EP27 | `src/app/robots.ts`, `src/app/sitemap.ts` → `lib/seo.ts` | none | `readSiteEnv().indexable` | Static text; sitemap = live slugs only | Preview/noindex handled here. |
| EP28 | `src/app/global-not-found.tsx:31-78` | none (never echoes the request) | — | Static trilingual 404 | |
| EP29 | `src/components/analytics-loader.tsx:43-47` | `goatCounterUrl` from env | `readSiteEnv` restricts to `https://<code>.goatcounter.com/count` (`site-env.ts:17,85-91`); null unless indexable | Inline `<script>`; `JSON.stringify`-escaped URL | Only `dangerouslySetInnerHTML` in the app; fixed template. |
| EP30 | `next.config.ts:31-33` → `lib/security-headers.ts:6-25`, `lib/snapshot-headers.ts` | none | — | Response headers | CSP = `frame-ancestors/base-uri/object-src/form-action` only (no script-src by design); HSTS, nosniff, Referrer-Policy, Permissions-Policy; snapshot immutable cache. |

### E. Outbound / infrastructure (including build + CI)

| # | Path | Input | Authz | Sink |
|---|---|---|---|---|
| EP31 | `server/email.ts:244-338` → Brevo `POST https://api.brevo.com/v3/smtp/email` | address, URL, token (server-composed) | `accountsEnabled`; `selectTransport` refuses unless Brevo key or dev/test file transport or explicit opt-in off-Vercel | Third-party mail; failure logs `{kind,status}` only |
| EP32 | `server/email.ts:255-270` `writeMailFile` | same | allow-list `NODE_ENV ∈ {development,test}` **or** `JISR_EMAIL_FILE_TRANSPORT=1`; `VERCEL_ENV` set ⇒ refuse | File `tests/e2e/.mail/*.json` (mode 0600) — dev/test only |
| EP33 | `src/db/{index,pool}.ts` → Neon Postgres | all of the above | TLS + `DATABASE_URL` secret; `SET TIME ZONE 'UTC'` per checkout | Authoritative user data |
| EP34 | `public/snapshots/**` (served statically) | none (`NEXT_PUBLIC_SNAPSHOT_BASE_URL` only allows `/snapshots` or https) | build-generated, sha256-pinned | Public read |
| EP35 | `.github/workflows/ci.yml` (+ `playwright.accounts.config.ts:60-72`) | repo/PR content | GitHub Actions secrets; `ACCOUNTS_ENABLED` set only in the accounts test-server env | Deploy (`DEPLOY_ENABLED` gate), e2e DB |

---

## Trust boundaries

- **Browser ↔ Next server.** The session cookie is HttpOnly; the `jisr.auth` hint is **not** an authorisation signal (`session-hint.ts:11-14`) and every server action re-reads the session (`session.ts:17-22`). The proxy is optimistic only (`rules/nextjs-app.md:15`).
- **Server ↔ Neon.** `DATABASE_URL` secret; user-owned rows cascade from `user.id`; reference data never in Postgres (`rules/database.md`).
- **Server ↔ Brevo.** Outbound only; token/link ride a server-composed URL; delivery failures log kind+status only (`email.ts:312-314`).
- **Server ↔ Google OAuth.** `baseURL` explicit, never inferred from `Host` (`server.ts:389`), so magic-link/deletion URLs are not poisonable; only verified Google emails are admitted (`server.ts:84`).
- **Guest (localStorage) vs signed-in (server-authoritative).** Guest keys `jisr.profile|saved|plan` vs account cache `jisr.account.*` (`account-cache.ts:11-14`); a sign-in clears the cache before setting the hint; sign-out never touches guest keys.
- **Build-time vs runtime.** The `ACCOUNTS_ENABLED` switch is read at prerender **and** per request (`rules/auth.md:12`); the snapshot read on program pages is `server-only` build-time.
- **Unauthenticated public boundary.** Only EP3 (`requestSignInLink`) and the auth sub-endpoints are reachable without a session; both are bounded by `email_cooldowns` + `auth_email_days` and by the signup-intent ALS.

---

## Candidate vulnerabilities

Honest calibration: this surface has already been through a `security-review` + Opus threat review (todo 28) and the code carries real defence-in-depth (claim-before-write, hashed tokens, ALS signup intent, closed GET verify/delete, server-set consent stamps, log scrubber, sha256 snapshot integrity). I could not construct a High/Critical path. The leads below are the only ones with a nameable path; each states its real strength. Everything else I checked is in the "checked and sound" list.

### C1 — Unauthenticated third party can plant consent/age evidence (`pending_signups`) for an address they do not own, which that address's magic-link confirm then consumes

- **File/function:** `src/lib/server/signup.ts:113-143` (`requestSignInLink`) → `src/lib/auth/server.ts:151-157` (`beforeAuthEndpoint`) → `src/lib/auth/pending-signup.ts:20-31` (`recordPendingSignup`); consumed in `admissionEvidence` (`server.ts:86-87`) via `readPendingSignup` (`pending-signup.ts:35-49`).
- **Attacker capability:** any anonymous visitor. No session, no ownership proof, no rate limit per address beyond the 60 s mailbox cooldown and the shared 230/day sign-in ceiling.
- **Attack path:** (1) the attacker calls `requestSignInLink({ email: "victim@example.com", consent: true, ageConfirmed: true, locale, returnPath })` (or crafts the equivalent `POST /api/auth/sign-in/magic-link` through the Next action endpoint); (2) the before-hook claims a slot then `recordPendingSignup` writes `{ consentVersion: CURRENT_CONSENT_VERSION, ageConfirmed: true, consentedAt: <server now>, expiresAt: +15 min }` keyed by the victim's address — a value the attacker, not the victim, authored; (3) the server emails the victim; (4) if the victim opens and confirms within 15 min, the create hook reads that row and stamps the account.
- **Impact:** **Low.** The consent version and the account's `consentedAt` are re-derived at create time (`evaluateAdmission(evidence, new Date(), version)` returns `now`, `admission.ts:49-52`; `readPendingSignup` does not even select `consentedAt`), so the *account's* consent record is not falsified and the victim's click remains the consent act. What is real: (a) the address owner can receive branded sign-up mail they never requested, and (b) the `pending_signups` row — disclosed in the owner's own export (`account-export-store.ts:157-227`) — records age/consent evidence authored by a third party, with no field marking it unverified, which weakens the audit value of the pre-account table. The mail-volume half is the already-accepted risk (ADR 0013 §3), so the **only new angle here is the evidence-provenance/audit one.**
- **CWE candidate:** CWE-345 (Insufficient Verification of Data Authenticity); CWE-799 (Improper Control of Interaction Frequency) for the mail half.
- **Evidence (quoted):**
  - `signup-intent.ts:7-11` — "Every form request is a signup intent: it may write a pending_signups row …".
  - `server.ts:155-157` — `await claimSendSlot("magic-link", email);\n  if (isSignupFor(email)) await recordPendingSignup(email);`
  - `pending-signup.ts:21-26` — the row's fields, including `consentedAt: now`, `ageConfirmed: true`.
  - `admission.ts:49-52` — a matching version yields `{ consentVersion: currentVersion, consentedAt: now }` where `now` is the create-hook clock, not the row's.
  - `account-export-store.ts:157-166` — the owner's export selects the row by `normalizeEmail(owner.email)`.
- **Safe verification idea:** with the PGlite harness (`scripts/db/harness.ts`) and the existing `tests/db/pending-signup.test.ts` scaffolding, call the action with a toy address the tester controls and assert (i) a `pending_signups` row exists with `consentedAt`≈request time, (ii) it is returned in an export for a user with that email, (iii) the created account's `consentedAt` equals the *create* time. No network, no production.

### C2 — Targeted magic-link denial: the per-mailbox cooldown is attacker-holdable, so an attacker can keep refusing a chosen victim's sign-in

- **File/function:** `src/lib/server/email-cooldown.ts:22-37` (`claimEmailSendSlot`, `setWhere lastSentAt <= excluded.last_sent_at - 60s`), reached via `server.ts:111-114` (`claimSendSlot`).
- **Attacker capability:** anonymous; can send one accepted request per ~61 s to an address.
- **Attack path:** the attacker posts a sign-in request for `victim@example.com` (or any alias that maps to the same `cooldownKey`, e.g. `victim+anything@gmail.com`, `v.i.c.t.i.m@gmail.com`) every ~61 s. Each accepted request refreshes the `(cooldownKey, kind)` row. The victim's own request inside any 60 s window is refused with `429 EMAIL_COOLDOWN` (`server.ts:100-106`), which the UI words identically to the daily ceiling ("try again later", `sign-in-form.tsx:113-117`) — so the victim cannot tell a transient throttle from an exhaustion.
- **Impact:** **Low.** Sign-in is delayed by ≤60 s per attacker send; an attacker who also exhausts the shared 230-send/day batch can extend it to UTC midnight. The global-exhaustion variant is the owner-accepted risk; the **narrow, targetable per-mailbox lock is not called out** in `docs/ops/security-review-accounts.md:46-48`, which is why I list it.
- **CWE candidate:** CWE-770 / CWE-799 (resource exhaustion / interaction frequency).
- **Evidence (quoted):**
  - `email-cooldown.ts:30-34` — `onConflictDoUpdate({ target: [emailCooldowns.email, emailCooldowns.kind], set: {...}, setWhere: sql\`${emailCooldowns.lastSentAt} <= excluded.last_sent_at - make_interval(secs => ${EMAIL_COOLDOWN_S})\` })`.
  - `normalize-email.ts:13-22` — `cooldownKey` drops `+tag` for every domain and Gmail dots.
  - `server.ts:111-114` — both limits throw the same `emailCooldownError()`.
- **Safe verification idea:** against the PGlite harness, capture `claimEmailSendSlot` with an injected `now` (the test already does this) and assert that a claim at t+59 s is refused and t+61 s accepted; drive two identities (`a+1@x`, `a+2@x`) and show one slot. Purely local.

### C3 — Pre-account rows for addresses that never become accounts are only purged lazily, and a non-owner has no erasure path for them

- **File/function:** `src/lib/server/email-cooldown.ts:71-85` (`purgeExpiredAuthRows`, called only from `claimAuthEmailSend:114`), `pending-signup.ts:33-34` ("An expired row is ignored here rather than swept (no worker …): lazy expiry").
- **Attacker capability:** anonymous (plants rows via C1's path). No victim-facing "forget my address" endpoint exists while signed out; the signed-in request path (`eraseAccountResidue`) only runs for an account's own email.
- **Attack path:** a burst of sign-up requests for addresses that never confirm leaves `pending_signups` (email + ageConfirmed + tipped consentVersion + timestamps) and `email_cooldowns`/`auth_email_days` rows. They are removed only when *some* later auth email is granted (`purgeExpiredAuthRows`). If Jisrr sends no further auth email, the rows persist indefinitely.
- **Impact:** **Low / privacy-hygiene.** No read path exposes these rows to anyone but the address owner's export (`account-export-store.ts:157`). The retention is disclosed and the design is explicit (`ADR 0013 §11`, privacy wording "deleted the next time Jisrr sends … email"). Listed because the auditor's asset list names "consent records" and "email addresses", and a non-owner has no direct erasure route for a row keyed to them.
- **CWE candidate:** CWE-459 (Incomplete Cleanup) / CWE-359-ish privacy exposure (no victim read access, so no classic CWE-200).
- **Evidence (quoted):**
  - `email-cooldown.ts:71-85` — `purgeExpiredAuthRows` deletes `pendingSignups` past `expiresAt`, `emailCooldowns` >24 h, `authEmailDays` past days; wrapped in try/catch, "best effort".
  - `email-cooldown.ts:112-115` — purge is called only from `claimAuthEmailSend`.
  - `account-erasure.ts:40-44` — erasure is keyed by the *deleted account's* address.
- **Safe verification idea:** PGlite: insert a `pending_signups` row with `expiresAt` in the past, assert `readPendingSignup` ignores it while the row still exists; then call any auth-email claim and assert it disappears. Read-only assertions, local.

---

## Checked and sound (with evidence)

1. **Kill switch fails closed and is per-request, not build-frozen.** `accounts-enabled.ts:8-14` accepts only `true`/`1`; `handler.ts:35`, `accounts-gate.ts:44-49`, `server.ts:112,121,296,315,333,367,395` all re-read it. Static pages read it at prerender and `notFound()` (`account/page.tsx:21-37`).
2. **Admission gate cannot be satisfied off-path.** `evaluateAdmission` rejects unless `evidence.ageConfirmed === true` (`admission.ts:48`); evidence is scoped by path (`server.ts:80-90`), the Google callback additionally requires `user.emailVerified === true` (`server.ts:84`), and a direct `POST /sign-in/magic-link` writes no pending row (ALS not set ⇒ `isSignupFor` false, `signup-intent.ts:20-21`), so it cannot create an account.
3. **The emailed magic-link/delete link signs in / deletes only on an explicit button, and the GET verify/callback are closed.** `server.ts:147-150` throws `NOT_FOUND` for `GET /magic-link/verify` and `GET /delete-user/callback`; tokens ride the URL **fragment** (`callback-urls.ts:104-106,134-142`) and a POST body, not a query, so no request log/Referer exposure; the confirm page strips the hash immediately (`sign-in-confirm.tsx:53-59`, `account-delete-confirm.tsx:35-43`).
4. **`confirm` endpoint is CSRF-protected and single-use.** `magic-link-confirm.ts:62-79` uses `formCsrfMiddleware`, a `TOKEN` regex and `consumeVerificationValue`; success carries the inner `Set-Cookie` explicitly.
5. **Browser binding is timing-safe and non-forgeable.** `magic-link-nonce.ts:30-50`: 24 random bytes, only a sha256 stored, `timingSafeEqual`; the value is a server-set cookie, so the client cannot fixate it. A mismatch only withholds the import (fail-safe).
6. **Account actions are session- and consent-gated before input parsing.** `account-guard.ts:26-38` calls `requireAccountReady` (session + current consent, `session.ts:26-31`) **before** `schema.safeParse`; every `where` is scoped to the session `userId` (`account-store.ts:165,184,187,205,214,235,264,293,329-336`; `import-store.ts:104-133`; `consent.ts:29`). No IDOR found.
7. **Input bounds are tighter than the columns and enforced server-side.** `account-inputs.ts:27-109` (slug ≤120, profile JSON ≤16 384, saved cap 12, plan cap 50, feedback ≤20/24 h with server-side count); the `check`s in `schema/app.ts:78,128,141` back them up.
8. **Writes that must see each other are serialised by a real DB lock, and profile writes are compare-and-set.** `lockUser` `FOR UPDATE` (`account-store.ts:82-89`) around caps and the import; `saveProfileFor` is `UPDATE … WHERE revision = expected` (`account-store.ts:255-285`) with monotonic revisions (`nextProfileRevision`/`user_data_state`).
9. **Deletion erases what Better Auth leaves behind, and a GET can never delete.** `eraseAccountResidue` removes verification rows (JSON-safe via `pg_input_is_valid`, `account-erasure.ts:18,36-37`), `email_cooldowns` (both key forms) and `pending_signups` (`:41-44`); deletion is confirmed only by `POST /delete-user` with a token; `DELETE_TOKEN_EXPIRY_S = 3600` (`server.ts:44`); the session cookie is expired on the real response (`server.ts:164-168`).
10. **Export is a named-column allow-list over the user's own rows.** `account-export-store.ts:85-232` never selects session/verification/OAuth/password/IP/UA; `Cache-Control: no-store` (`account-export.ts:13,38`).
11. **No PII reaches logs, and the scrubber has real coverage.** `redactLogText` blanks absolute+relative URLs, `token=…` (including `%40` addresses) (`log.ts:10-25`); Better Auth's logger is fully replaced (`server.ts:270`, `createLogger` calls `options.log` and never `console.*` when `log` is a function, verified in `@better-auth/core` 1.7.7); `onAPIError.onError` wraps non-APIError into a detail-free 500 and keeps the original only as `cause` (`log.ts:58-66`); unknown send failures log class name + SQLSTATE only (`signup.ts:95-111`); `tests/lib/privacy/no-pii.test.ts` drives the real flows and fails on any canary.
12. **Tokens are stored hashed/encrypted and unneeded secrets are nulled.** `storeToken: "hashed"` (`server.ts:228`); OAuth tokens `encryptOAuthTokens: true` (`server.ts:274`); `idToken` nulled on create/update (`server.ts:357-360`); session `ipAddress`/`userAgent` nulled (`server.ts:325-327`).
13. **Open-redirect / callback-URL handling is closed.** `baseURL` is explicit and never inferred from `Host` (`server.ts:389`); every redirect-based flow finishes on one landing built by `authCallbackUrls` (`callback-urls.ts:45-48`), whose `return` is a same-origin path under a known locale with safe segments (`:18-31`) and is re-validated on read (`:153-160`).
14. **Server-action output carries no raw errors.** `guarded` logs only action + SQLSTATE and throws a fixed message (`account-guard.ts:14-21`); `failureOf` whitelists three variable-name-only classes (`signup.ts:62-81`); `AUTH_MISCONFIGURED` returns `{code}` only (`handler.ts:23-28`).
15. **Snapshot data is integrity-checked and structurally typed.** Length + sha256 in the browser (`client.ts:191-209`) and at build (`server.ts:69-79`); manifest entries must match `s/<name>.<12-hex>.json` and no slash/`..` is possible (`manifest.ts:21,29-44`); `checkShardShape` binds a shard to its manifest name (`manifest.ts:186-195`).
16. **No HTML-injection sink.** The only `dangerouslySetInnerHTML` is the fixed analytics template (`analytics-loader.tsx:45-46`); external links require an `https:` host or render as inert text (`external-link.tsx:9-33`); user-authored feedback is stored, never rendered; no `eval`/`new Function` in `src`.
17. **No secret reaches a client bundle.** `process.env` is read only in `server-only` modules + `accounts-enabled.ts`; the only client read is `NEXT_PUBLIC_SNAPSHOT_BASE_URL` (`use-snapshot.ts:35`); `.env*` is git-ignored except `.env.example`; no `NEXT_PUBLIC_*` secret exists.
18. **Security headers and deployment config are sane.** `security-headers.ts:6-25` (HSTS, nosniff, Referrer-Policy, Permissions-Policy closing camera/mic/geo/payment/usb/browsing-topics, CSP `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`); `vercel.json` has no redirects (`ADR 0013 §10`); `robots.ts`/`sitemap.ts` disallow everything when not indexable (`seo.ts:43-48,56`).
19. **Email transport fails closed.** `selectTransport` refuses the file transport outside dev/test or off an explicit opt-in, and refuses it whenever `VERCEL_ENV` is set (`email.ts:244-253`); a send that cannot leave throws `AuthEmailTransportNotConfigured` rather than looking sent (`email.ts:316-326`).
20. **Import never silently overwrites and never runs without a click.** `"auto"` refuses an account that already holds data (`import-store.ts:105`); the landing shows the OtherBrowserWarning when the nonce did not match (`post-auth-landing.tsx:193-206`), and the actual import fires only from an explicit button press (`post-auth-landing.tsx:114,135,151`).

---

## Notes / accepted or out-of-scope (do not re-report as new)

- Magic-link **login-CSRF residual** (a victim who presses confirm on an attacker's look-alike link signs into the attacker's account, with the import withheld): accepted by the owner, ADR 0013 §7, `security-review-accounts.md:32`. The single-flow change did not weaken the confirm page or the nonce.
- **Unknown-address sign-in email volume, no IP limit** (global 230/day exhaustion): owner-accepted, `security-review-accounts.md:46-48`, ADR 0013 §3. C2 above isolates the narrower *per-mailbox* lock-over, which is not in that list.
- **File email transport outside Vercel** (F7) and **held profile conflict lost on reload** (F8): owner-accepted, `security-review-accounts.md:43-45`.
- **Doc/code drift (not a vulnerability):** ADR 0013 §3 line 43 still says a cooldown-refused request refreshes the pending row "because the row is written before the claim"; the code now claims first and writes after (`server.ts:155-157`), which is the safer order (F2 fix). Worth a doc correction, not a finding.
- **Not present:** no Sentry/instrumentation file exists (`grep` for `sentry|instrumentation` finds nothing), matching `no-pii.test.ts`'s guarantee; no extra `api/` route besides EP1/EP2; `docs/audits/` was empty before this draft.
