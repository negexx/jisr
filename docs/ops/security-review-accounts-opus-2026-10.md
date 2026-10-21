# Security review of accounts (phase 2): independent second opinion

**Date:** 2026-10-21
**Reviewer:** Opus 5.5 (reviewer-complex), read-only. No file, env or production setting was changed.
**Scope:** `src/lib/auth/*`, `src/lib/server/*`, `src/app/api/auth/[...all]`, `src/app/api/account/export`, `src/app/[locale]/{sign-in,sign-in/confirm,welcome,account,account/delete}`, the browser halves they call (`src/components/auth/{sign-in-confirm,other-browser-warning,post-auth-landing}.tsx`), `src/db/{index,pool}.ts`, `src/db/schema/*`, `drizzle/0000-0002`, `src/proxy.ts`, `src/lib/security-headers.ts`, `src/components/analytics-loader.tsx`. ADR 0013 and `docs/ops/security-review-accounts.md` were read first and their claims tested against the code and the library.
**Versions reviewed:** git `02b9643f`. Installed: better-auth 1.7.7, @better-auth/core 1.7.7, @better-auth/drizzle-adapter 1.7.7, better-call 1.4.0, drizzle-orm 0.45.4, drizzle-kit 0.31.11, next 16.3.7, pg 8.23.1, zod 4.6.5. The review worktree has no `node_modules`, so library code was read in the main checkout, which is at the same commit with an identical `package.json`. In the citations below, `better-auth/dist/…` stands for `node_modules/.pnpm/better-auth@1.7.7_drizzle-k_ce0cda7c101b6fa2152b65ad63cb1651/node_modules/better-auth/dist/…`.

## Resolution (2026-10-21)

Branch `fix/auth-rate-limit`, plan `docs/superpowers/plans/2026-10-21-auth-rate-limit.md`, recorded in ADR 0013.

**Fixed.**
- **I1** (no request-level throttling): Better Auth's limiter is back on with a Postgres store of daily-rotating HMAC keys (`request_throttles`, migration `0003`), the sign-in action takes its own per-address slots before any budget is claimed, a direct `POST /sign-in/magic-link` without the signup intent is refused, and a domain with no mail route is refused before any claim. The privacy notice names the fingerprint. Accepted residuals: windows restart at UTC midnight, students sharing one address share a bucket, a many-address botnet is not stopped.
- **S2** GoatCounter loaded without integrity: versioned `count.v5.js` with SRI (`src/components/analytics-loader.tsx`); the matching notes in ADR 0011, `docs/audits/2026-10-17-security-audit.md` (SEC-7) and `docs/audits/2026-10-17-security-appendix-c-runtime.md` (C2) are marked resolved.
- **S3** session lifetime: pinned at 7 days with a one-day update age.
- **S4** export: now lists the session dates, each sign-in method's provider account id and the role.
- **S5** deletion not atomic: documented as failure-safe ordering (ADR 0013 decision 9).
- **S6** `import "server-only"` on the four store modules.
- **S7** stored name and picture: blanked on create and update, and by migration `0004` for existing accounts; the notice now says they are received and not kept.
- **S8** ADR drift: decision 2 (every form request is a signup intent) and decision 3 (expired verification rows are swept about an hour after expiry) corrected.

**Left with the owner.**
- **S1** read-only sync after "continue" on another browser (a change to ruling Q19).
- An absolute session cap (a product trade-off for shared computers).
- A Vercel WAF rule or Cloudflare Turnstile against a many-address botnet.
- The Brevo bounce-rate alert and the `auth_email_days.sent` alert at 200 (`docs/ops/limits-runbook.md`, section 8).
- Whether the notice change needs a consent-version bump: not bumped here (the throttle is a legitimate interest, and no new data is collected from the student), so the owner should confirm.
- Run `pnpm db:migrate` (`0003`, `0004`) on the production Neon branch before merging the pull request, because the merge deploys (`docs/ops/deploy.md`, section 9).

## Summary verdict

**No Critical finding. One Important finding. Several Suggestions.**

The core of the accounts surface holds up:

- authorization and IDOR,
- the kill switch,
- CSRF,
- the consent and age gate,
- magic-link token handling,
- the compare-and-set and caps,
- deletion and export completeness,
- log scrubbing.

I tried to break each of these against the library source and could not. The earlier review's conclusion of "no Critical or High" stands.

My one real disagreement is about severity. With Better Auth's rate limiter fully off and no request-level throttle, an anonymous caller can cheaply exhaust the daily auth-email budget every day. Doing it with made-up addresses also risks the Brevo account itself. That is more than the "accepted residual" the earlier review records, because accounts are now live with real users.

## Critical

None.

## Important

### I1. No request-level throttling at all. The daily email budget is a cheap, repeatable denial of service, and bounces put the Brevo account at risk

**Confidence:** the mechanism is CONFIRMED. The Brevo suspension is PLAUSIBLE.

**Refs:**
- `src/lib/auth/server.ts:262-267` (`disableIpTracking: true`)
- `better-auth/dist/api/rate-limiter/index.mjs:242-243`: `if (!ip && ctx.options.advanced?.ipAddress?.disableIpTracking) return null;` makes the limiter a no-op for every path.
- `@better-auth/core/dist/utils/ip.mjs:204` (`getIP` returns null when tracking is disabled)
- `better-auth/dist/context/create-context.mjs:172-175` (the limiter's defaults would otherwise be on, using in-memory storage)
- `src/lib/server/email-cooldown.ts:107-116`
- `src/lib/constants` (`AUTH_EMAILS_PER_DAY` 250, reserve 20)

**What's wrong:** Better Auth's limiter is not just weakened, it is completely off for every endpoint. The only throttles are the per-mailbox 60-second cooldown and the global daily counter.

The earlier review accepted this as "an attacker spending the sign-in share of the daily budget". Three aspects were not weighed:

1. **The daily DoS is trivially repeatable.** About 230 anonymous POSTs to `/api/auth/sign-in/magic-link` (or the `requestSignInLink` Server Action), each with a distinct made-up mailbox, block every sign-in and sign-up on jisrr.org until UTC midnight. A one-line cron does it every day. No IP is needed, and nothing in the app can tell it apart from real traffic.
2. **Made-up recipients hard-bounce.** Brevo, like any ESP, suspends or reviews accounts with high bounce or complaint rates. A suspended sender also loses the 20 deletion-reserve emails. Deletion confirmations are the only path to erasure (Art. 17), and Better Auth swallows the send failure (`create-context.mjs:215-225`), so the student is told "sent". The reserve protects against the counter, not against losing the provider.
3. **Other unauthenticated database writes are unthrottled.** `POST /api/auth/sign-in/social` writes one `auth-state:` verification row per call (`better-auth/dist/state.mjs:76-86`). It counts against Neon compute and storage and Vercel invocations, with no cap except the Hobby hard limits, which pause the whole site. Expired rows are swept on the next `findVerificationValue` (`db/internal-adapter.mjs:753-757`), so storage does not grow without limit, but compute and invocations are burned.

In addition, the cooldown and daily claim are taken in `hooks.before`, which runs before the endpoint's own `formCsrfMiddleware` and the body's `z.email()` (`api/dispatch.mjs`: before-hooks run, then `endpoint(internalContext)`). So a request that is then refused for CSRF or a stricter address check still spends budget. This is minor next to points 1-3.

**Exploit/failure scenario:** a script sends 230 sign-in requests a day for `random@nonexistent-domain-N.com`. Real students get `EMAIL_COOLDOWN` ("try again later") all day, every day. After a few days of bounces, Brevo pauses the account, and deletion emails silently stop too.

**Recommended fix (owner decision; options are not exclusive):**
- (a) A Vercel Firewall / WAF rate-limit rule on `POST /api/auth/sign-in/*` and on the sign-in page's Server Action POSTs. Rate limiting happens at the edge and the app records no IP, but check that the rule type is available on Hobby.
- (b) Cloudflare Turnstile on the sign-in form, verified in `requestSignInLink`, with direct `POST /sign-in/magic-link` refused unless the signup intent or a verified challenge is present. This is a third-party processor and has to be disclosed.
- (c) Cheap bounce reduction before claiming: refuse a domain with no MX record (one DNS lookup, no IP involved).
- (d) An operational alert on `auth_email_days.sent` approaching 230 and on Brevo bounce rate (`docs/ops/limits-runbook.md`).
- Separately, refuse a direct `POST /sign-in/magic-link` that has no Server Action intent if the product does not need it. Today every legitimate UI request goes through the Action (`src/lib/server/signup.ts:133-138`), so the direct HTTP route serves only scripts.

## Suggestions

### S1. Login-CSRF residual: after "continue", the victim's later edits sync to the attacker's account

**Confidence:** PLAUSIBLE.

**Refs:** `src/components/auth/post-auth-landing.tsx:194-206`, `src/components/auth/other-browser-warning.tsx` (`onContinue`), ADR 0013 decision 7.

**What's wrong:** the confirm page plus the soft nonce stop the guest import. But a victim who presses "Sign in" on an attacker's link and then "continue" is signed into the attacker's account. From then on the hint makes every profile, save and tick write to that account, including grades and nationality typed afterwards. The masked address is the only remaining guard. This is documented and accepted (ruling Q19), so it is listed only as a hardening option.

**Recommended fix:** when `sameBrowser` is false, keep the sync layer read-only (or keep the hint unset) until the student explicitly confirms "this is my account (a***@x)". Or make Sign out the default action and "continue" the secondary one.

### S2. Third-party script on token-bearing pages, without SRI and without `script-src`

**Confidence:** PLAUSIBLE (supply-chain risk only).

**Refs:** `src/components/analytics-loader.tsx:8,24-33`, `src/lib/security-headers.ts:6-7`.

**What's wrong:** `https://gc.zgo.at/count.js` is injected on every page, including `/sign-in/confirm`, `/account/delete` and `/account`, with no integrity attribute and no `script-src`. The fragment is stripped before the idle load (`sign-in-confirm.tsx:57-59`, `account-delete-confirm.tsx:39-41`), and the token is held in React state. A compromised CDN script could still press the buttons, read the token from memory or the DOM, or call same-origin `/api/account/export` and `/api/auth/delete-user` with the HttpOnly cookie.

**Recommended fix:** do not render `AnalyticsLoader` on the four account routes (they are `noindex` and carry no journey events). Or pin the script with SRI.

### S3. Session lifetime is 7 days and sliding, which is long for shared devices

**Confidence:** CONFIRMED.

**Refs:** `better-auth/dist/cookies/index.mjs:47` (`maxAge: options.session?.expiresIn || sec("7d")`), `context/create-context.mjs:147` (`updateAge` 1 day), no `session` block in `src/lib/auth/server.ts:257-379`.

**What's wrong:** an active session never expires. The account cache (profile with grades and nationality) lives in `jisr.account.*` on the device. Many students in the target audience use family or shared computers.

**Recommended fix:** set `session.expiresIn` explicitly (for example 7 days) with a smaller `updateAge`, or an absolute cap. At minimum, pin the value in code so a library default change cannot silently alter it (ADR 0013 already lists this as unpinned).

### S4. Export omits some personal data

**Confidence:** CONFIRMED (minor).

**Refs:** `src/lib/server/account-export-store.ts:85-232`.

**What's wrong:** the export does not include:
- session rows (created/expires timestamps; IP and user agent are null),
- `account.accountId` (the Google subject identifier, personal data),
- `user.role`.

None of these is sensitive, but Art. 15/20 cover all personal data. Separately, `pendingSignup` is looked up only by `normalizeEmail` while erasure sweeps both `normalizeEmail` and `cooldownKey` forms (`account-erasure.ts:46-48`). The two are consistent in practice, because pending rows are always written with `normalizeEmail` (`pending-signup.ts:29`).

**Recommended fix:** add a `sessions: {createdAt, expiresAt}[]` section and `accountId` per sign-in method.

### S5. Deletion is not a single transaction

**Confidence:** CONFIRMED. The order is safe.

**Refs:** `better-auth/dist/api/routes/update-user.mjs:355-361`, `db/internal-adapter.mjs:232-245`, `src/lib/auth/server.ts:314-320`.

**What's wrong:** the steps run as separate statements in this order:
1. `beforeDelete` erasure (its own transaction),
2. sessions,
3. accounts,
4. user,
5. sessions again,
6. accounts again,
7. `afterDelete` erasure.

A failure part-way leaves either a user with no sessions (they sign in again and re-request deletion) or a deleted user whose residue sweep threw (ADR 0013 decision 14 already records this). No partial state leaks data to another party.

**Recommended fix:** none required. Document "not atomic, failure-safe ordering" in ADR 0013 decision 9 instead of implying completeness.

### S6. Store modules lack `import "server-only"`

**Confidence:** CONFIRMED (defence in depth).

**Refs:** `src/lib/server/account-store.ts:1`, `import-store.ts:1`, `account-export-store.ts:1`, `rows.ts:1`.

**What's wrong:** these functions take a `userId` argument. They are safe today because only the `"use server"` wrappers call them, with the session's id (`account-guard.ts:33-37`). If one were ever re-exported from a `"use server"` file, it would become an IDOR endpoint. `server-only` would also stop a client import at build time.

**Recommended fix:** add `import "server-only"` (the race specs may need the same alias the other server tests use).

### S7. Data minimisation in Better Auth's own endpoints

**Confidence:** CONFIRMED (low).

**Refs:** Better Auth `POST /update-user` (enabled by default) accepts arbitrary `name`/`image` strings with no length bound. Google's `name`/`picture` are stored unused (ADR 0013 decision 9).

**Recommended fix:** a `databaseHooks.user.create.before` / `update.before` that blanks `name` and nulls `image`, or `mapProfileToUser` on the Google provider. This removes stored PII nobody reads.

### S8. Documentation drift in ADR 0013

**Confidence:** CONFIRMED.

1. Decision 2 (ADR line 36) says *"'Sign in' mode writes no row; an address with no account comes back as AGE_NOT_CONFIRMED"*. The code makes **every** form request a signup intent and requires both boxes for every request (`src/lib/server/signup.ts:22-24,122-124,138`; `src/lib/auth/server.ts:157`). Only a direct HTTP POST writes no row.
2. Decision 3 (line 42) says an unused `delete-account` verification row "stays until the account is deleted". In fact Better Auth deletes **every** expired verification row on each `findVerificationValue` (`better-auth/dist/db/internal-adapter.mjs:753-757`), so such rows go away about 1 hour after expiry, at the next sign-in or OAuth callback. The same sweep covers unused magic-link rows (which contain the address) and the Q19 nonce rows. This is good news for retention and worth stating in the privacy notice's retention wording.

## Verified correct

**1. Session re-check and kill switch.**
- Every exported Server Action (11 in total) is gated:
  - `loadAccountData`, `saveProgram`, `unsaveProgram`, `setStepDone`, `forgetProgress`, `saveProfile`, `createFeedbackReport`, `clearAccountData` and `importGuestData` run `requireAccountReady()` before parsing input (`src/lib/server/account-actions.ts:41-107`, `import.ts:19-29`, `account-guard.ts:26-38`).
  - `acceptCurrentConsent` checks the switch and then the session (`src/lib/server/consent.ts:21-31`).
  - `requestSignInLink` is unauthenticated by design and checks the switch first (`signup.ts:116`).
- `readSessionUser` returns null while off (`session.ts:17-22`).
- The export route answers 403 before any session work (`account-export.ts:28`).
- The auth handler answers by itself while off (`handler.ts:34-35`). Behind it, the gate plugin's `onRequest` (`accounts-gate.ts:41-50`), the user and verification create hooks (`server.ts:333,366-368`), the confirm endpoint (`magic-link-confirm.ts:72-77`), `beforeDelete` (`server.ts:315`) and `sendAuthEmail` (`email.ts:323`) each refuse too.
- The pages are `notFound()` at build (`sign-in/page.tsx:24,38` and siblings).
- No session check depends on `proxy.ts`, which does not even match `/api` (`src/proxy.ts:13`).
- The only `"use server"` files are `account-actions.ts`, `consent.ts`, `import.ts` and `signup.ts`.

**2. IDOR.** Every query in `account-store.ts`, `import-store.ts` and `account-export-store.ts` filters on the `userId` that `withReadyAccount` / `readSessionUser` take from the session. No client input carries a user id.

**3. Zod at the boundaries.**
- `strictObject` everywhere in `account-inputs.ts:34-109`; profile JSON size limit at `:42-45`.
- Import caps (`MAX_SAVED_PROGRAMS`, `MAX_PLAN_PROGRAMS`, distinct slugs and steps) at `:84-102`.
- Record keys are kebab slugs, so `__proto__` and `constructor` cannot pass (`src/data-schema/primitives.ts:8-10`).
- Server Action bodies are capped by Next's default 1 MB.
- The confirm body is `z.object({token: z.string()})` plus a bounded regex (`magic-link-confirm.ts:32,62,79`).
- The signup request is parsed, then the address is parsed with `SignInEmailSchema` (`signup.ts:44-50,117-120`).

**4. Compare-and-set and caps.**
- `saveProfileFor` is one `UPDATE … WHERE user_id = $1 AND revision = $2 RETURNING revision` with a returned-row check (`account-store.ts:261-266`).
- The first insert runs under `lockUser` with `nextProfileRevision` (`:268-283`).
- The revision floor is kept by `retireProfile` with `greatest()` (`:100-113`).
- The saved, plan and feedback caps, Clear my data and the import all take `SELECT … FOR UPDATE` on the user row (`:82-89`, `import-store.ts:103-105`).
- I found no deadlock ordering: profile UPDATEs take no `FOR KEY SHARE` on `user`.
- A real-Postgres race suite exists and CI fails on skipped specs (`.github/workflows/ci.yml:127-172`).

**5. Cooldown and daily-counter atomicity.** Each is one `INSERT … ON CONFLICT DO UPDATE … WHERE … RETURNING` on the database clock (`email-cooldown.ts:27-36,51-60`). The cooldown is claimed before the daily unit. There is no enumeration: the response and code path are identical for existing and unknown addresses, because the plugin does not look the user up at send time (`better-auth/dist/plugins/magic-link/index.mjs:87-115`).

**6. Magic-link token.**
- 32 characters of `[a-zA-Z]`, about 182 bits (`magic-link/index.mjs:89`).
- Stored SHA-256/base64url (`storeToken: "hashed"`, `server.ts:228`; `magic-link/utils.mjs:4-7`).
- 15-minute expiry (`server.ts:43,226`; `index.mjs:98`).
- Single use: `consumeVerificationValue` runs under a lock in a transaction with `consumeOne` (delete-returning), and the expiry is checked after consumption (`db/internal-adapter.mjs:815-857`; `index.mjs:170-176`).
- `allowedAttempts` exists but is fixed at 1 (`index.mjs:42-46`).
- The GET verify is closed: `hooks.before` compares `ctx.path`, which is the endpoint's template path, not the request URL (`api/dispatch.mjs:194-203`), so trailing-slash or encoding variants cannot evade it (`server.ts:148-150`).
- The confirm endpoint drops the inner verify's JSON, which contains `session.token` (`index.mjs:207-211`), and copies only `Set-Cookie` (`magic-link-confirm.ts:98-104`).
- `formCsrfMiddleware` refuses cross-site navigations and validates Origin for any browser request (`api/middlewares/origin-check.mjs:131-153`), and a JSON body forces a CORS preflight from foreign origins.
- The nonce is 24 random bytes, stored as a hash, compared timing-safely, and the cookie is HttpOnly, Lax and Secure on https (`magic-link-nonce.ts:30-61`).
- Emailed links are built from `BETTER_AUTH_URL`, never from the Host header (`server.ts:196-222,390-406`).
- The return path is restricted to plain segments under a known locale (`callback-urls.ts:16-31`) and re-sanitised on the page (`:153-160`).

**7. Consent and admission.**
- No path creates a user without age confirmation. Evidence is scoped by `ctx.path` (`server.ts:76-91`):
  - `/callback/:id` reads the OAuth state and refuses a Google address Google has not verified.
  - `/magic-link/confirm` reads the pending row.
  - Anything else (ID-token sign-in, server calls, `/sign-up/email`) is rejected (`admission.ts:43-53`).
- The OAuth state is bound to the browser by a signed `state` cookie (`better-auth/dist/state.mjs:76-77,128-134`). Its schema is `looseObject`, so the self-declared `ageConfirmed`/`consentVersion` survive (`state.mjs:8`), and server fields override `additionalData` (`oauth2/state.mjs:23-34`).
- Consent fields are `input: false` (`server.ts:286-288`). A version bump gates every action through `hasCurrentConsent` (`session.ts:29`).
- A pending row is written only after the claim, and only under the Server Action's AsyncLocalStorage intent (`server.ts:155-157`, `signup-intent.ts`).

**8. Account linking.** It is implicit, but requires Google `email_verified` **and** a verified local address (`requireLocalEmailVerified` defaults to true; `better-auth/dist/oauth2/link-account.mjs:136-139`). Magic-link users are always `emailVerified: true` (`magic-link/index.mjs:183-187`). `/link-social` refuses a different email by default (`api/routes/account.mjs:211`). I see no pre-hijack path.

**9. Deletion.**
- POST only. A tokenless call only sends an email (`update-user.mjs:298-310`).
- A token call needs a session, Better Auth's origin check (the cookie is present, `origin-check.mjs:43-46,101-108`), and a token whose stored value equals the session's user id (`update-user.mjs:351-352`).
- The token is about 165 bits, expires after 1 hour (`server.ts:44,294`; `update-user.mjs:300-305`) and rides the URL fragment.
- `GET /delete-user/callback` is closed (`server.ts:148`).
- Completeness against every table in `src/db/schema`:

  | Table | Removed by |
  |---|---|
  | `user`, `session`, `account` | Better Auth (`internal-adapter.mjs:232-245`) |
  | `profiles`, `saved_programs`, `checklist_progress`, `feedback_reports`, `user_data_state` | `ON DELETE cascade` (`drizzle/0000_lame_iron_patriot.sql` FK block; matches `schema/app.ts:36,43,147` and siblings) |
  | `verification` | `eraseAccountResidue`: by `value = user.id`, by `magic-link:` email, and by OAuth link `userId`/`email` (`account-erasure.ts:31-39`); Better Auth's identifier prefix confirmed at `magic-link/index.mjs:39`, `state.mjs:37` |
  | `email_cooldowns`, `pending_signups` | `eraseAccountResidue`, both key forms |
  | `auth_email_days` | holds no personal data |
  | Q19 nonce rows | hold no personal data; swept once expired |

**10. Export.** Session-gated, `no-store`, `attachment` with a fixed filename, JSON; `nosniff` is applied globally (`account-export.ts:27-43`, `security-headers.ts:18`). Named-column allow-list, so no tokens, password, IP or user agent. Repeatable-read, read-only transaction. A cross-site GET can only download the file into the victim's own browser.

**11. CSRF on Server Actions.** Next 16.3.7 refuses an Origin/Host mismatch (`next/dist/server/app-render/action-handler.js:439-450`). A missing Origin is let through only for non-browser clients. All auth POSTs pass Better Auth's global `originCheckMiddleware` (`better-auth/dist/api/index.mjs:161`). `disableOriginCheck: false` is explicit (`server.ts:267`) and `skipCSRFCheck` is false (`create-context.mjs:210-211`).

**12. Cookies.** With an https `BETTER_AUTH_URL` the session cookie is `__Secure-better-auth.session_token`, HttpOnly, Secure, SameSite=Lax, Path=/ (`cookies/index.mjs:23,30-37`). No cookie cache is configured, so every check reads the database.

**13. Logging and Sentry.**
- No Sentry or instrumentation file and no `@sentry` dependency.
- `logger.log` and `onAPIError.onError` route everything through `redactLogText`, and objects are dropped (`log.ts:18-67`).
- better-call's raw `# SERVER_ERROR` print is unreachable: `onAuthApiError` always rethrows an `APIError`, and the router converts it to a response (`better-call/dist/router.mjs:84-92`).
- `guarded()` logs only the action name and SQLSTATE (`account-guard.ts:14-21`).
- Brevo failures log only the kind and status, and the response body is never read (`email.ts:274-313`).
- No token travels in any URL.

**14. SQL injection.** Every `` sql`` `` interpolation is a bound parameter or a module constant (`account-store.ts:96,111,263,300`, `email-cooldown.ts:33,40,57,73,79`, `account-erasure.ts:18,36-37`, `import-store.ts:121`). There is no `sql.raw`.

**15. Misconfiguration.** A missing secret, or a missing or non-http(s) base URL, gives a 500 with no detail (`server.ts:390-406`, `handler.ts:39-44`). The file email transport is refused on Vercel (`email.ts:244-253`).

## Disagreements with the earlier review (`docs/ops/security-review-accounts.md`)

1. **"Unknown-address sign-in email volume … accepted" (Accepted risks).** I rate this Important (I1), not an accepted Low. It is a free, scriptable, daily outage of sign-in and sign-up on a live service. The bounce-driven risk to the Brevo account would also take out the deletion reserve, which the "bounded by the deletion reserve (20/250)" reasoning does not cover. The earlier review also does not mention that Better Auth's limiter is off for **every** endpoint (not just email), or the unthrottled verification-row writes on `/sign-in/social`.
2. **F1 resolution ("oversize/non-string/malformed address → 400 before any claim").** This is true for what `looksLikeEmail` rejects. But the cooldown and daily claim still run before the endpoint's `formCsrfMiddleware` and `z.email()`, so a request refused at those later stages has already spent budget. Minor; folded into I1.
3. **The ADR wording repeated by the earlier work** that unused deletion verification rows persist until account deletion is incorrect. Better Auth's global expired-row cleanup removes them (S8.2). This is a correction in the code's favour.
4. **The F3 residual** is described as fully handled by the landing's warning. The warning stops the import, but not the sync of data entered after "continue" (S1). This is consistent with the owner's ruling Q19, but should be recorded as a residual risk rather than closed.

Every other F1-F8 claim I tested held: the atomic daily counter, the claim-then-pending order, GET verify closed by template path, the confirm page and nonce, the lazy purge, the 1-hour delete token, the file-transport refusal on Vercel, and the server-side profile copy never being lost.

## Not covered / limits

- **No dynamic testing.** I did not run the app, the test suites or the race specs. Atomicity claims rest on reading the SQL and the library, plus the existence of the CI `db-race` job.
- **Not inspected:** Vercel project settings (preview-scope env vars, and whether preview deployments share `DATABASE_URL` or `BETTER_AUTH_SECRET` with production), Brevo configuration (SPF/DKIM/DMARC, log retention of sent links and addresses), the Neon role and network settings, and the Google OAuth client config (authorised redirect URIs).
- **Partly audited:** Better Auth's `isTrustedOrigin` relative-path parser (`auth/trusted-origins.mjs`). I relied on it for `callbackURL` / `errorCallbackURL` open-redirect safety. App-side return paths are independently constrained, so the exposure is limited to Better Auth's own redirects.
- **Strength of `BETTER_AUTH_SECRET`** (it also encrypts the OAuth tokens) cannot be checked from the repo.
- **Client stores** (`src/lib/account-sync/*`, `src/lib/account-import/*`) and the account-menu UI were read only where they touch the security boundary.
- **Arabic and French email and UI copy** were not reviewed for accuracy of the consent wording.
