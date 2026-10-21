# Auth request throttling (I1) and review suggestions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** restore request-level throttling on every auth path without storing or logging a raw IP, and fix the cheap review suggestions (S2, S3, S4, S5, S6, S7, S8) of `docs/ops/security-review-accounts-opus-2026-10.md`.

**Architecture:** one Postgres table `request_throttles` holds fixed-window counters keyed by HMAC-SHA256(`BETTER_AUTH_SECRET`, `<UTC day>|<bucket>|<raw key>`); the raw key (IP + path) never leaves process memory. Better Auth's own limiter is switched back on with this table as its `customStorage`; the `requestSignInLink` Server Action (which calls `auth.api` and so skips the limiter) takes its own per-address slots from the same store. Direct `POST /sign-in/magic-link` without the Server Action's signup intent is refused, and a domain with no mail route is refused before any budget is claimed.

**Tech Stack:** Better Auth 1.7.7 (`rateLimit.customStorage.consume`, `advanced.ipAddress`), Drizzle + drizzle-kit, Postgres (Neon), `node:crypto`, `node:dns/promises`, Vitest (+ `tests/db-race` real-Postgres specs).

**Spec:** `docs/ops/security-review-accounts-opus-2026-10.md` (I1 and S1-S8). Owner decisions 2026-10-21: option A (Postgres-backed hashed counters plus a privacy-notice line); S1 and an absolute session cap stay with the owner.

## Global Constraints

- Never store or log a raw IP, user agent, address or token. Only the HMAC key reaches the database; logs name the bucket and SQLSTATE only.
- `session.ipAddress` and `session.userAgent` stay `null` (ruling Q3), even with IP tracking on.
- Throttle rows are deleted once older than 24 h (longest window is 1 day).
- Atomic check-and-increment in one SQL statement on the database clock, same shape as `src/lib/server/email-cooldown.ts`; tests may inject `now`.
- Migrations only via `pnpm db:generate`; never `drizzle-kit push`; never hand-edit applied migrations.
- No Zod in client code; `server-only` in every new server module.
- Arabic copy is `draft`; nothing is marked `reviewed`; the CNDP is not marked filed. `CURRENT_CONSENT_VERSION` is **not** bumped (the throttle is legitimate interest, not consent; flag it to the owner in the PR).
- Every `next` command needs `SWC_NATIVE_BINDING_CACHE='C:\Users\dagda\.swc-cache'`.

## Review Focus

1. No trusted client IP (header absent or multi-valued): Better Auth falls back to one shared `no-trusted-ip` bucket per path; the action must do the same (shared `unknown` key), never throw. Test in Task 3.
2. A refused request spends nothing: a throttle refusal returns `cooldown` before the email cooldown or the daily counter is claimed. Test in Task 3.
3. Window boundary: a request exactly `window` seconds after `window_start` opens a new window (count 1). Test in Task 1.
4. DNS failure or timeout must not block a real sign-in (fail open); only NXDOMAIN, no MX and no A/AAAA, or a null MX (`.`) refuses. Test in Task 3.
5. The same raw key on two UTC days hashes to different keys (no cross-day linking). Test in Task 1.

---

### Task 1: Throttle store (`request_throttles`)

**Files:**
- Modify: `src/db/schema/app.ts` (new table next to `emailCooldowns`)
- Create: `drizzle/0003_*.sql` + meta via `pnpm db:generate`
- Create: `src/lib/server/request-throttle.ts`
- Modify: `src/lib/server/email-cooldown.ts` (`purgeExpiredAuthRows` also deletes old throttle rows)
- Test: `tests/lib/server/request-throttle.test.ts` (pure parts), `tests/db-race/request-throttle.test.ts` (concurrency, same harness as `tests/db-race/email-cooldown.test.ts`), `tests/db-race/migrations.test.ts` if it lists tables

**Interfaces — Produces:**
- Table `request_throttles`: `key text primary key`, `window_start timestamptz not null`, `count integer not null check (count >= 1)`, index on `window_start`.
- `throttleKey(bucket: string, rawKey: string, now?: Date): string` — base64url HMAC-SHA256 with `BETTER_AUTH_SECRET` (throw `AuthMisconfiguredError`-style error naming the variable, never its value, if missing) over `` `${utcDay}|${bucket}|${rawKey}` ``.
- `type ThrottleRule = { window: number /* s */; max: number }`
- `consumeThrottle(key: string, rule: ThrottleRule, now?: Date): Promise<{ allowed: boolean; retryAfter: number | null }>` — one `INSERT … ON CONFLICT (key) DO UPDATE SET count = CASE WHEN expired THEN 1 ELSE count + 1 END, window_start = CASE WHEN expired THEN now ELSE window_start END WHERE expired OR count < max RETURNING …` (`expired` = `window_start <= now - window`). Refused → `retryAfter` = seconds until `window_start + window` (ceil, ≥ 1) from one follow-up read.
- `THROTTLE_RETENTION_S = 24 * 60 * 60`; `purgeExpiredThrottles(now?: Date): Promise<void>` (best effort, logs SQLSTATE only), called from `purgeExpiredAuthRows`.

- [ ] **Step 1: Failing unit tests** — `throttleKey`: deterministic for same inputs; differs for another bucket, another raw key, and another UTC day (`2026-10-21T23:59Z` vs `2026-10-22T00:00Z`); output contains neither the raw key nor any of its digits-with-dots substring (`expect(key).not.toContain("203.0.113.7")`); matches `/^[A-Za-z0-9_-]{43}$/`.
- [ ] **Step 2: Failing race spec** — 20 simultaneous `consumeThrottle(k, {window: 60, max: 3}, T0)` → exactly 3 allowed; at `T0 + 59 s` → refused with `retryAfter === 1`; at `T0 + 60 s` → allowed and count restarts (3 more allowed, 4th refused); `purgeExpiredThrottles(T0 + 24 h + 1 s)` removes the row.
- [ ] **Step 3: Schema + `pnpm db:generate`**, then implement `request-throttle.ts`. Run unit tests and `pnpm test` → PASS. Race specs run in CI's `db-race` job (they skip locally without Postgres; say so in the report).
- [ ] **Step 4: Commit** `feat(auth): hashed fixed-window request throttle store`.

### Task 2: Better Auth limiter back on

**Files:**
- Modify: `src/lib/auth/server.ts:257-267` (the `advanced` block and comment), add `rateLimit`
- Test: `tests/lib/auth/config.test.ts` (replace the `disableIpTracking` test), `tests/db/*` session test that asserts `ip_address`/`user_agent` are null after a magic-link confirm (extend the existing confirm test in `tests/db/magic-link-confirm.test.ts` if it creates a session)

**Interfaces — Consumes:** `throttleKey`, `consumeThrottle` (Task 1). **Produces:** exported `AUTH_RATE_LIMIT_RULES` constant (for tests).

Config: `advanced.ipAddress = { ipAddressHeaders: ["x-forwarded-for"], ipv6Subnet: 64 }` (Vercel overwrites `x-forwarded-for` with the single client address); `rateLimit = { enabled: true, window: 60, max: 100, customRules: AUTH_RATE_LIMIT_RULES, customStorage: { consume: (key, rule) => consumeThrottle(throttleKey("better-auth", key), rule) } }` with
`AUTH_RATE_LIMIT_RULES = { "/sign-in/magic-link": {window: 60, max: 3}, "/sign-in/social": {window: 60, max: 5}, "/magic-link/confirm": {window: 60, max: 5}, "/delete-user": {window: 3600, max: 5} }`.
A throttle store failure must not leak details: let it throw into Better Auth (500 via `onAuthApiError`), logged by the existing scrubbed logger.

- [ ] **Step 1: Failing tests** — config: `disableIpTracking` is not `true`; `rateLimit.enabled === true`; `customStorage.consume` is a function; rules equal `AUTH_RATE_LIMIT_RULES`. Handler test (in `tests/app/api/auth-handler.test.ts` style, store mocked): the 6th `POST /api/auth/sign-in/social` within 60 s from one `x-forwarded-for` gets 429 and the key passed to the store is not the IP. Session test: a created session row has `ipAddress === null` and `userAgent === null` with a request carrying `x-forwarded-for` and `user-agent`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `pnpm test` → PASS.
- [ ] **Step 5: Commit** `fix(auth): re-enable Better Auth rate limiting on hashed keys (I1)`.

### Task 3: Sign-in link path — action throttle, direct POST refused, mail-route check

**Files:**
- Create: `src/lib/server/email-domain.ts`
- Create: `src/lib/server/client-address.ts`
- Modify: `src/lib/server/signup.ts` (`requestSignInLink`)
- Modify: `src/lib/auth/server.ts` (`beforeAuthEndpoint`, magic-link branch)
- Test: `tests/lib/server/signup.test.ts` (or the file that covers `requestSignInLink`; find it), `tests/lib/server/email-domain.test.ts`, update direct-POST tests in `tests/app/api/auth-handler.test.ts`, `tests/app/api/auth-lazy.test.ts`, `tests/db/auth-email.test.ts`, `tests/db/magic-link-confirm.test.ts`, `tests/db/pending-signup.test.ts`, `tests/lib/auth/accounts-gate.test.ts` to go through the signup intent (`runAsSignup`) where they meant the form path

**Interfaces — Produces:**
- `clientAddressKey(headers: Headers): string` — the single trusted address Better Auth would use (prefer importing `getIP` from `@better-auth/core/utils/ip` with the Task 2 `ipAddress` options if the package exports it; otherwise single-value `x-forwarded-for`, IPv6 collapsed to /64), or `"unknown"`.
- `SIGN_IN_LINK_RULES = { hour: {window: 3600, max: 5}, day: {window: 86400, max: 10} }`.
- `type MailRouteResolver = { mx(domain): Promise<{exchange: string; priority: number}[]>; a(domain): Promise<string[]>; aaaa(domain): Promise<string[]> }`; `hasMailRoute(email: string, resolver?: MailRouteResolver, timeoutMs = 2000): Promise<boolean>` — false only for NXDOMAIN/ENODATA on MX **and** no A/AAAA, or a null MX (single record with exchange `""` or `"."`); true on any other error or timeout.

Order inside `requestSignInLink`, after the confirmation check and before `getAuth()` work: (1) both throttle buckets on `throttleKey("sign-in-link:hour"|"sign-in-link:day", clientAddressKey(headers))` → refused returns `{ ok: false, error: "cooldown" }`; (2) `hasMailRoute(email)` false → `invalid_email`; (3) existing send. In `beforeAuthEndpoint`, after `looksLikeEmail`, `if (!isSignupFor(email)) throw notFoundError();` before `claimSendSlot`.

- [ ] **Step 1: Failing tests** — 6th action call in an hour from one address → `cooldown`, and `claimAuthEmailSend` is not called for it; 11th in a day → `cooldown`; a call with no `x-forwarded-for` uses key `unknown` and does not throw; `hasMailRoute` cases: MX present → true, null MX → false, ENOTFOUND on MX + A + AAAA → false, ENODATA on MX but an A record → true, resolver rejecting with `ETIMEOUT` or never settling (timeout) → true; unroutable domain → action returns `invalid_email` with no claim; direct `POST /sign-in/magic-link` without intent → 404 and no `email_cooldowns` row, no verification row, no email.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement, update the listed tests. **Step 4:** `pnpm test`, `pnpm test:e2e` sign-in specs if they post directly → PASS.
- [ ] **Step 5: Commit** `fix(auth): throttle sign-in link requests per address and refuse unroutable domains (I1)`.

### Task 4: Cheap suggestions (S2, S3, S4, S6, S7)

**Files:**
- Modify: `src/components/analytics-loader.tsx` (S2) — test `tests/components/analytics-loader.test.ts*` (find or create)
- Modify: `src/lib/auth/server.ts` (S3 `session`, S7 hooks)
- Modify: `src/lib/server/account-export-store.ts` (S4) — test `tests/app/api/export.test.ts`
- Modify: `src/lib/server/{account-store,import-store,account-export-store,rows}.ts` (S6)

- S2: replace `https://gc.zgo.at/count.js` with the newest versioned file listed at `https://www.goatcounter.com/help/countjs-versions` and set `s.integrity` to its published `sha384-…` (download it and confirm the hash with `openssl dgst -sha384 -binary | openssl base64 -A` before using it) and `s.crossOrigin="anonymous"`. Test: loader script contains the versioned URL, `integrity="sha384-` value and `anonymous`. Update `content/*/privacy.mdx` only if it names the file path (it names the host, which is unchanged).
- S3: `session: { expiresIn: SESSION_EXPIRES_IN_S /* 7 * 24 * 3600 */, updateAge: SESSION_UPDATE_AGE_S /* 24 * 3600 */ }`, exported constants; config test asserts them.
- S4: export gains `sessions: { createdAt, expiresAt }[]` (ISO strings, no token/IP/UA), `accountId` on each sign-in method, and `user.role`. Test asserts the three and that no `token` key appears anywhere in the JSON.
- S6: `import "server-only";` first line of the four modules; if the `db-race` Vitest project lacks the `server-only` alias the unit project uses, add the same alias there.
- S7: in `databaseHooks.user.create.before` return `name: ""` and `image: null`; add `databaseHooks.user.update.before` that replaces `name` with `""` and `image` with `null` when present in the update. Test: creating via the hook with Google-like `{name: "Real Name", image: "https://…"}` stores `""` / `null`; `POST /update-user {name: "x".repeat(10000)}` stores `""`.

- [ ] Steps per item: failing test → implement → `pnpm test` PASS. **Commit** `fix(auth): pin session lifetime, SRI on GoatCounter, fuller export, server-only stores, no stored profile name (S2-S7)`.

### Task 5: Docs (privacy notice, ADR 0013, runbook, review report)

**Files:**
- Modify: `content/en/privacy.mdx`, `content/fr/privacy.mdx`, `content/ar/privacy.mdx` ("What we never do" IP bullet; keep the frontmatter provenance; Arabic stays draft)
- Modify: `.claude/docs/decisions/0013-accounts.md` (I1 decision; S5 "not atomic, failure-safe ordering" in decision 9; S8.1 decision 2 wording; S8.2 decision 3 expired-row sweep)
- Modify: `docs/ops/limits-runbook.md` (alert at `auth_email_days.sent` ≥ 200 and Brevo bounce rate; owner sets them up)
- Modify: `docs/ops/security-review-accounts-opus-2026-10.md` (short "Resolution (2026-10-21)" section: what was fixed, what remains with the owner)

Exact notice sentence (appended to the IP bullet):
- en: "To slow down abuse of sign-in, we keep a one-way fingerprint of your network address, computed with a secret key; it changes every day, is deleted within 24 hours and cannot be turned back into the address."
- fr: "Pour freiner les abus de la connexion, nous gardons une empreinte à sens unique de votre adresse réseau, calculée avec une clé secrète ; elle change chaque jour, est supprimée sous 24 heures et ne permet pas de retrouver l'adresse."
- ar: "للحدّ من إساءة استخدام تسجيل الدخول، نحتفظ ببصمة أحادية الاتجاه لعنوان شبكتك، تُحسب بمفتاح سري، وتتغيّر كل يوم، وتُحذف خلال 24 ساعة، ولا يمكن استرجاع العنوان منها."

- [ ] Edit, run `pnpm test` (content/i18n tests) and `pnpm lint`. **Commit** `docs: privacy notice, ADR 0013 and runbook for auth throttling`.

### Task 6: Verify and whole-branch review

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm data:check && pnpm build` → all green (paste summaries).
- [ ] `reviewer-complex` whole-branch review; fix Critical/Important; push; PR green on CI including `db-race`.

## Left for the owner (not built)

- S1: read-only sync after "continue" on another browser (UX change to ruling Q19).
- An absolute session cap (product trade-off for shared computers).
- Vercel WAF rule or Turnstile against a many-address botnet; the Brevo bounce alert itself.
- Whether the notice change needs a consent-version bump (this plan says no).
