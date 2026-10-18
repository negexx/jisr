# T2 PoC engineer B

- **Audited commit:** `f0cc00efed2f74e7e8a816ea59585d7462f4eebe` (branch `audit/scratch-security`, worktree `.worktrees/audit-security`). Confirmed with `git rev-parse HEAD`.
- **Scope:** independent reproduction / falsification of `t2-hunter-surface.md` C1, C2, C3, plus one independent falsification check of `t2-hunter-authdata.md` H2-C2 (Better Auth rate limiter disabled). Local-only: the in-process PGlite harness, the real auth instance, reserved `@example.org` / `@example.com` / `@gmail.com` toy addresses, mocked outbound mail. No production requests, no real mailboxes, no fixes.
- **PoC specs (new, mine):** `tests/audit-repro/t2poc-b-c1-c3.test.ts`, `tests/audit-repro/t2poc-b-c2-ratelimit.test.ts`. poc-engineer-a's files were read, not touched.
- **Environment:** Windows-built `node_modules` under WSL — all commands run through `cmd.exe`.
- **Commands run (exact):**

  ```
  cmd.exe /c "cd /d C:\Users\dagda\Downloads\Nex\UniWay\.worktrees\audit-security && set SWC_NATIVE_BINDING_CACHE=C:\Users\dagda\.swc-cache&& pnpm exec vitest run tests/audit-repro/t2poc-b-c1-c3.test.ts tests/audit-repro/t2poc-b-c2-ratelimit.test.ts"
  ```

  Trimmed verbatim output:

  ```
   RUN  v5.0.2 C:/Users/dagda/Downloads/nex/UniWay/.worktrees/audit-security
  stderr | tests/audit-repro/t2poc-b-c1-c3.test.ts
  [better-auth] Social provider google is missing clientId or clientSecret
   ✓ tests/audit-repro/t2poc-b-c1-c3.test.ts (6 tests) 5769ms
   ✓ tests/audit-repro/t2poc-b-c2-ratelimit.test.ts (7 tests) 5839ms
   Test Files  2 passed (2)
        Tests  13 passed (13)
  ```

  (The google warning is incidental: these specs never drive the social provider.)

---

## C1 — third party plants `pending_signups` consent/age evidence for an address it does not own — **Reproduced, impact narrowed**

**Verdict:** Reproduced. The hunter's central claim holds: one anonymous `requestSignInLink` call writes a `pending_signups` row for an address the caller does not own, and the hunter's narrowing is also confirmed — the *account's* `consented_at` is the create clock, not the row's value.

**Evidence (PoC asserts):**
- One call to `requestSignInLink({ email: "victim@example.org", consent: true, ageConfirmed: true, … })` returns `{ ok: true }` and leaves a row with `email = victim@example.org`, `consent_version = CURRENT_CONSENT_VERSION`, `age_confirmed = true`, and `consented_at` inside `[before, after]` of the request — i.e. authored by the third-party request, with no act by the address owner.
- The account-row claim is verified, not assumed: after planting, the spec rewrites the row's `consented_at` to `2020-01-02T03:04:05Z`, then follows the emailed link. The created `user` row has `consent_version = CURRENT_CONSENT_VERSION` and `consented_at ≈ confirm time` (≥ confirm-start minus 1 s), **not** the planted 2020 value. This matches the code path: `readPendingSignup` selects only `email/ageConfirmed/consentVersion` (`src/lib/auth/pending-signup.ts:39-47`) and `evaluateAdmission` stamps `now` from the create hook (`src/lib/auth/admission.ts:52`). So the third party **cannot forge the account's consent timestamp**.
- Export disclosure is confirmed: `exportAccountDataFor(db, userId, new Date())` returns a non-null `pendingSignup` object with `consentVersion: CURRENT_CONSENT_VERSION`, `ageConfirmed: true`, and `consentedAt` equal to the third-party-authored planted value. The selection is keyed by `normalizeEmail(owner.email)` (`src/lib/server/account-export-store.ts:157-166`), so the owner sees evidence they did not author, with no field marking it unverified.

**Severity recommendation: Low** (record-integrity / audit provenance, not account consent forgery). What is real is (a) branded sign-up mail the owner never requested (already-accepted risk, ADR 0013 §3) and (b) a `pending_signups` row in the owner's export asserting third-party-authored age/consent with no provenance marker. The account's own `consent_version`/`consented_at` remain server-derived at create time. **CWE-345**. Downgrade rationale: the hunter's read already lands on Low and this PoC confirms the narrow angle rather than widening it.

## C2 — per-mailbox cooldown is attacker-holdable — **Reproduced (mechanism); "hold" claim only partially holds**

**Verdict:** Reproduced at the mechanism level; the hunter's own impact wording survives, but the "keep refusing a chosen victim's sign-in" claim is bounded and should stay Low.

**Evidence (PoC asserts):**
- Injected clock on `claimEmailSendSlot`: accepted at `t0`, refused at `t0+59s`, accepted at `t0+61s`.
- Aliases share one key: `victim+1@example.org` accepted → `victim+2@example.org` and `victim@example.org` refused; `v.i.c.t.i.m@gmail.com` accepted → `victim@gmail.com` refused (`cooldownKey` drops `+tag` and, for Gmail, dots — `src/lib/auth/normalize-email.ts:13-22`).
- Both refusal kinds are indistinguishable at the HTTP layer: a mailbox-cooldown refusal (2nd request to the same address) and a daily-ceiling refusal (fresh address with `auth_email_days.sent = 250`) are both `429` with an **identical** body `{ code: "EMAIL_COOLDOWN", … }` (`src/lib/auth/server.ts:100-106`).
- Budget coupling: with `dailyLimit = 3`, three spaced-out accepted attacker sends succeed and the fourth is refused — each accepted attacker send spends the one shared daily counter.

**Honest impact judgment:** the hold is real but self-limiting. One accepted send per ~61 s = ~1 414 accepted sends/day, while a magic-link send stops at `AUTH_EMAILS_PER_DAY − AUTH_EMAILS_RESERVED_FOR_DELETION = 250 − 20 = 230`. So a continuous hold exhausts the shared sign-in budget in about `230 × 61 s ≈ 3 h 54 m`, after which everyone (including the victim) hits the already-accepted global ceiling until UTC midnight. Short of that, the attacker's leverage is a **≤60 s delay per send** on one mailbox. The narrow per-mailbox lock is genuinely not called out in `docs/ops/security-review-accounts.md:46-48` (which only names global exhaustion), so it is worth recording — but it does not raise severity.

**Severity recommendation: Low** (CWE-770 / CWE-799). Downgrade rationale: no compromise, no data access; the targetable hold is a ≤60 s nuisance unless the attacker simultaneously burns the shared daily budget, which is the owner-accepted global-exhaustion risk.

## C3 — pre-account rows are purged only lazily — **Reproduced**

**Verdict:** Reproduced, read-only assertions, local.

**Evidence (PoC asserts):**
- An expired `pending_signups` row (`expires_at = now() - 1 s`) is ignored by `readPendingSignup(...)` (returns `null`) while the row **still exists** (`count = 1`).
- A granted auth-email claim (`claimAuthEmailSend("magic-link", …) === true`) is the purge path: the expired row is gone (`count = 0`). Matches `purgeExpiredAuthRows` called only from `claimAuthEmailSend` (`src/lib/server/email-cooldown.ts:107-115`).
- A refused claim purges nothing: with the mailbox slot occupied, the refused claim leaves the expired row in place (`count = 1`).

**Severity recommendation: Low / privacy-hygiene** (CWE-459). The only read path is the address owner's own export (see C1); retention is disclosed (ADR 0013 §11). No victim-facing read, so no classic CWE-200. The gap is that a non-owner has no direct erasure route for a row keyed to their address while signed out — a hygiene note, not an exploit.

## Falsification check — `t2-hunter-authdata.md` H2-C2 (rate limiter disabled) — **Agree with poc-engineer-a**

**Verdict:** Confirmed. Better Auth's per-IP rate limiter is switched off because `disableIpTracking` makes `getIP()` return `null`.

**Static re-read (installed 1.7.7 sources):**
- `@better-auth/core@1.7.7` `dist/utils/ip.mjs:203-204` — `function getIP(req, options) { if (options.advanced?.ipAddress?.disableIpTracking) return null; … }`.
- `better-auth@1.7.7` `dist/api/rate-limiter/index.mjs:242-243` — `const ip = getIP(req, ctx.options); if (!ip && ctx.options.advanced?.ipAddress?.disableIpTracking) return null;`.
- Same file `:292-295` — `onRequestRateLimit` returns when `resolveRateLimitConfig` is `null`, so no counter is ever consumed.

**Dynamic probe (independent of poc-engineer-a's):** I used a **different endpoint and a different reason** — 25 same-origin `POST /api/auth/sign-in/magic-link` requests for 25 *distinct* addresses. `/sign-in/*` matches Better Auth's default special rule (window 10 s, max 3), so a live limiter would answer the 4th request `429`; distinct addresses mean the app's own per-mailbox cooldown and the 230/day ceiling are not the cause. Result: **all 25 responses `200`, none `429`**, and `verification` grew by ≥25. The live instance also reports `auth.options.advanced.ipAddress.disableIpTracking === true`.

**Agreement:** I agree with poc-engineer-a's H2-C2 conclusion (their `t2poc-a-c2-ratelimit.test.ts` drives `/sign-in/social` ×50 and `/magic-link/confirm`; both are consistent with mine). Nothing disagrees. The app-level throttles (`email_cooldowns`, `auth_email_days`) are the only rate limits and cover only `magic-link`/`delete-account` **sends** — they do not cover `/sign-in/social` or `/magic-link/confirm`, which is the auth-data hunter's point.

---

## Limitations

- **Toys, not victims.** All addresses are reserved (`@example.org`, `@example.com`, `@gmail.com`); no real mailbox is contacted. The C1 "victim" confirm is simulated by following the temp-file mail link, exactly as `tests/db/pending-signup.test.ts` does.
- **PGlite, single connection.** Race behaviour of the claim under real concurrency is covered separately (`tests/db-race/email-cooldown.test.ts`, `TEST_POSTGRES_URL`); these specs run sequentially on one in-process Postgres 18.6. No claim here depends on concurrency.
- **Clock injection.** C2's 60 s window uses `claimEmailSendSlot`'s injected `now`; the HTTP-level "same error" assertions use the database clock (no injection available at the route). Both are consistent with `tests/db/email-cooldown.test.ts`.
- **No mail transport / no social provider driven.** Outbound mail is mocked; the google warning in the output is because no Google credentials are set and none were needed.
- **`purgeExpiredAuthRows` has no `verification` arm** was observed incidentally (my rate-limit probe leaves verification rows behind); that is the auth-data hunter's C2 surface, not re-adjudicated here beyond the H2-C2 falsification.
- **Severity is a recommendation**, not an accepted ruling; C1's legal weight (is the consent record treated as CNDP proof?) is a product/legal question.

**Draft path:** `docs/audits/drafts/t2-poc-b.md`.
