# T2 PoC engineer A

- **Audited commit:** `f0cc00efed2f74e7e8a816ea59585d7462f4eebe` (branch `audit/scratch-security`, worktree `.worktrees/audit-security`).
- **Environment:** local only. In-process Postgres (PGlite 0.5.9 / PG 18.6) via `scripts/db/harness.ts`; Better Auth 1.7.7 / better-call 1.4.0 from the installed `node_modules`; the Google code-for-token exchange stubbed by a spy on the provider (same pattern as `tests/lib/auth/google.test.ts`); the mail transport mocked to a no-op. No network, no production requests, reserved `@example.org` addresses only. Ran through Windows: `cmd.exe /c "cd /d C:\Users\dagda\Downloads\Nex\UniWay\.worktrees\audit-security && set SWC_NATIVE_BINDING_CACHE=C:\Users\dagda\.swc-cache&& pnpm exec vitest run tests/audit-repro"`.
- **PoC files:** `tests/audit-repro/t2poc-a-c1-consent.test.ts` (4 tests), `tests/audit-repro/t2poc-a-c2-ratelimit.test.ts` (4 tests).
- **Commands run (verbatim, trimmed):**

```
 RUN  v5.0.2 C:/Users/dagda/Downloads/nex/UniWay/.worktrees/audit-security

stderr | tests/audit-repro/t2poc-a-c1-consent.test.ts > C1 — Google: … > is self-inflicted only: …
[better-auth] Failed to parse state [ 'BetterAuthError state_security_mismatch' ]

 ✓ tests/audit-repro/t2poc-a-c1-consent.test.ts (4 tests) 7535ms
stdout | tests/audit-repro/t2poc-a-c2-ratelimit.test.ts > C2 — … read amplification > answers 50 junk-token confirms …
[C2] app-pool statements over 50 junk confirms: 200 (4/request)

 ✓ tests/audit-repro/t2poc-a-c2-ratelimit.test.ts (4 tests) 8247ms
   ✓ C2 — no rate limiting on /sign-in/social (write amplification) (1)
     ✓ answers 50 unauthenticated google starts with 200 and writes 50 verification rows, no 429 334ms
   ✓ C2 — no rate limiting on /magic-link/confirm (read amplification) (1)
     ✓ answers 50 junk-token confirms with 400 each and never 429 435ms

 Test Files  2 passed (2)
      Tests  8 passed (8)
   Duration  8.63s
```

Also ran `pnpm exec tsc --noEmit` (Windows) and grepped its output for `audit-repro`: no matches, so the two PoC files carry no TypeScript errors.

## C1 — verdict: Reproduced (mechanism), Low / by-design-as-documented

**What was proven (all locally, reserved addresses):**

1. **Google path — the crafted request is the consent record.** `POST /api/auth/sign-in/social` with `additionalData: { ageConfirmed: true, consentVersion: "2026-10-16" }` writes a single `verification` row whose `identifier = auth-state:<32>` and whose `value` JSON has the crafted flags **at its top level** (`stored.ageConfirmed === true`, `stored.consentVersion === CURRENT_CONSENT_VERSION`). Completing the callback (Google exchange stubbed) creates the user and the row reads `email = self-asserted@example.org`, `consent_version = CURRENT_CONSENT_VERSION`, `consented_at is not null`. No form, no privacy notice and no checkbox were ever rendered or submitted: the whole flow is a raw JSON POST plus the callback GET.
2. **Self-inflicted only.** Replaying the same callback **without the initiator's state cookie** is refused (`location.searchParams.error != null`, `better-auth` logs `state_security_mismatch`) and creates no user. The encryption/cookie binding the hunter described holds, so this cannot be aimed at a third party's identity.
3. **Magic-link twin — the hardcoded values come from the caller's booleans.** Calling the exported Server Action `requestSignInLink({ email, consent: true, ageConfirmed: true, locale: "fr", … })` writes `pending_signups` with `age_confirmed = true`, `consent_version = CURRENT_CONSENT_VERSION` and a non-null `consented_at`; the same call with `consent: false` writes nothing (`confirmation_required`). The boolean in the request is the whole gate.

**Static confirmation of the quoted internals (re-read in the installed sources):** `sign-in.mjs:222-223` (`generateState(c, { additionalData: c.body.additionalData, … })`) → `oauth2/state.mjs:24` (`...options?.additionalData ? options.additionalData : {}` spread into `stateData`) → `state.mjs:79-86` (row written as `auth-state:<state>`) → `state.mjs:123` (`parseGenericState` reads it back) → `admission.ts:64-69` (`confirmationFromOAuthState` reads the top-level booleans) → `evaluateAdmission` stamps `{consentVersion: currentVersion, consentedAt: now}` (`admission.ts:49-52`). `pending-signup.ts:20-31` hardcodes `ageConfirmed: true` and `CURRENT_CONSENT_VERSION`.

**Severity recommendation:** **Low** — keep the hunter's rating, no downgrade needed, and it is arguably **not a code defect at all**. Rationale:

- The mechanism is deliberate and documented in the code (`admission.ts` header: "A pending row is typed by whoever submitted the signup form"; `server.ts:68-75`: the Google evidence "is self-declared"). The only server-side check on the Google path that can be enforced is `user.emailVerified === true` (`server.ts:84`), which holds.
- It is **self-only and mail-verified**: Google proves the mailbox, the OAuth state is cookie-bound (proved), and the magic-link variant still needs the emailed token. No third party's row can be stamped.
- Impact is re-labelled honestly as **record integrity / audit value**, not a bypass: the DB can hold a `consent_version`/`consented_at` pair asserting an act that did not happen in a UI. It only matters if the CNDP file treats those columns as *probative* proof of a displayed-and-accepted notice. If they mean "the student asserted this at sign-in", the design is correct and this is informational.
- No exploitable confidentiality/integrity/availability path was found or implied.

## C2 — verdict: Reproduced, Low (operational / availability)

**What was proven (all locally):**

1. **Write amplification, no limiter.** 50 unauthenticated `POST /api/auth/sign-in/social {"provider":"google"}` calls all returned **200** (each carrying a Google authorize URL) and `select count(*) from verification where identifier like 'auth-state:%'` grew by exactly **50** (0 → 50). **No 429** was observed in any of the 50 responses nor in the 50 junk-confirm responses.
2. **The app's lazy purge never touches `verification`.** After 50 state rows were seeded and then expired (`expires_at = now() - interval '1 hour'`), calling the granted-send path (`claimAuthEmailSend("magic-link", …)`, which runs `purgeExpiredAuthRows`) deleted an expired `pending_signups` control row (count 1 → 0) yet left **all 50** `auth-state:` rows in place. Unused attacker-driven state rows are therefore never swept by the app; `parseGenericState` deletes one only when its callback is actually completed (`state.mjs:142`), and account erasure only sweeps rows naming a user.
3. **Read amplification, no limiter.** 50 `POST /api/auth/magic-link/confirm` calls with random 32-char tokens all answered **400** (`INVALID_TOKEN`), none **429**, creating no user. A best-effort counter wrapping the app pool's `query` (drizzle's node-postgres session calls `client.query`) measured **200 statements over 50 requests = 4 statements/request** — slightly above the hunter's "~2–3" estimate, still tiny per request and entirely unbounded in aggregate.

**Static confirmation of the quoted internals (re-read in the installed sources):** `server.ts:267` sets `advanced: { ipAddress: { disableIpTracking: true } }`. `@better-auth/core/.../ip.mjs:204` — `if (options.advanced?.ipAddress?.disableIpTracking) return null;` — so `getIP` returns `null`; `better-auth/.../rate-limiter/index.mjs:243` — `if (!ip && ctx.options.advanced?.ipAddress?.disableIpTracking) return null;` — so `resolveRateLimitConfig` returns `null`, and `onRequestRateLimit` (`:292-295`) returns before any check/increment. The configured instance matches: the PoC asserts `auth.options.advanced.ipAddress.disableIpTracking === true`. `signInSocial` (`sign-in.mjs:118-…`) still has no `use:` middleware, and `email-cooldown.ts:75-81` deletes only `pending_signups`, `email_cooldowns`, `auth_email_days`.

**Severity recommendation:** **Low**, matching the hunter; no downgrade, and no upgrade. Rationale:

- The impact is availability/operational and cost-driven, not data access: nothing is read or written on a victim's behalf, no account is affected, tokens are unguessable (62³²). The self-limiting platform (Vercel Hobby caps, Neon Free 1 GB) means the realistic harm is the site pausing/down and unbounded storage growth of orphan `auth-state:` rows — the harm *is* the cap, not a bill.
- The email-send throttles (`email_cooldowns` + `AUTH_EMAILS_PER_DAY`) are real and were not bypassed, but they only cover `/sign-in/magic-link`; `/sign-in/social` and `/magic-link/confirm` are uncovered exactly as the hunter said. A sustained flood to reach Medium operationally is conceivable but nothing is exfiltrated.

## Limitations

- **No production, no network** was used by design; all evidence is from the local PGlite harness and the installed library sources. Platform effects (Neon 1 GB exhaustion, Vercel function caps) are reasoned from ADR/pricing, not exercised.
- C1 drove the endpoint through `auth.handler` (the route handler's `POST` simply forwards to it); C2 drove the real `/api/auth/[...all]` route handler. Both are the same endpoint surface.
- C2's statement count is a proxy: it counts `appPool.query` calls, so it measures how many statements the auth endpoints issue, not their exact SQL or index work. It captured non-zero work (4/request), so the vector is confirmed as unbounded DB work, but the number should be read as "≈4 per junk confirm in this harness", not a certified statement count.
- C1 cannot be shown to be exploitable against a third party, and the PoC deliberately proves the opposite (state-cookie binding). Whether the stamped columns count as legal consent evidence is a product/legal judgement, not something a PoC can settle.
- `lsp_diagnostics` on the new files timed out (shared LSP daemon busy, twice); a full `tsc --noEmit` was run instead and reported **no** `audit-repro` errors.
