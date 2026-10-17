# Security review: accounts (phase 2, PR 3 — todo 28)

Scope: the whole accounts surface on `feat/accounts-phase-2-part3` — auth hooks and admission
(`src/lib/auth/`), email sending and the pre-account tables (`src/lib/server/email*.ts`), import, export,
deletion (`src/lib/server/account-*.ts`), and the Drizzle schema. Method: a `security-review` skill pass,
then an independent Opus threat-list review over the full surface (PR 1-3), then fix rounds with a
regression test each, each in its own commit.

Result: **no Critical or High finding.** Every Medium and Low item is either fixed with a test or accepted
in writing below.

## Timeline (commits on the branch)

- Security-review skill pass over `main..6d27f6f3`: no finding scored ≥ 8/10. Low notes carried into the
  threat review: a denylist log scrubber; relative `?token=` and `%40`-encoded addresses escaping it;
  `console.error` outside better-call; the magic-link token in request logs (ruling Q11).
- Opus threat-list review over `d210e4de..HEAD`: 0 Critical/High. Medium F1-F4, Low F5-F8 (below).
- Fix wave `f71155c4..1a458910` (F1, F2, F4, F5, F6, F7 + queued minors: log scrubber relative `?token=`
  and `%40`, no-PII positive assertions, perf markers, accounts reporter folder + `retries: 0`, CLAUDE.md
  Q5 exception, report-button accessible names, landing-test exact target, `log.ts` comment).
- F3 as the confirm page `7736dd32` + docs `397a4e8a` (ruling Q16), then modified by the soft nonce
  (ruling Q19, this PR).
- Fix round 1 `a34eb0d9..bb249b9d` (deletion-email reserve of the daily budget, "try again later" copy,
  "creates or opens" sign-up wording, log anchor, edge-runtime guard test, same-tab hash re-read).

## Findings and resolutions

| # | Sev | Finding | Resolution |
|---|---|---|---|
| F1 | Medium | Mail bombing / Brevo quota: no global cap, no per-mailbox normalisation, oversize addresses skipped the claim. | `AUTH_EMAILS_PER_DAY` 250 counter (`auth_email_days`, migration 0002), `cooldownKey` per mailbox, oversize/non-string/malformed address → 400 before any claim; race spec `tests/db-race/email-daily-cap.test.ts`. |
| F2 | Medium | Third-party consent/age via a sign-up email that did not say "create account, 16+, notice version"; pending row written before the cooldown claim. | Sign-up template + AsyncLocalStorage sign-up intent (`signup-intent.ts`); pending row written only after the claim and only under the intent; order claim → pending → verification → email. |
| F3 | Medium | Magic-link login CSRF + mail-scanner prefetch; opening the link signed the visitor in. | Confirm page (ruling Q16): the emailed link opens `/<locale>/sign-in/confirm#token=…`, sign-in only on the button, GET verify closed. Hardened by the soft browser-bound nonce (ruling Q19): a browser that did not ask still signs in but the landing withholds the guest import and warns. |
| F4 | Medium | Expired pre-account rows (`pending_signups`, `email_cooldowns`, `auth_email_days`) never purged. | Lazy purge on every granted auth send, best effort, no worker; privacy wording softened to "deleted the next time Jisrr sends … email" (ruling Q18). |
| F5 | Low | Delete token lifetime 24 h. | `DELETE_TOKEN_EXPIRY_S` = 1 h. |
| F6 | Low | A deletion whose response was lost left the device's `jisr.*` keys in place. | The confirm island treats a signed-out answer to a submitted token as "probably deleted" and offers "Erase this device". |
| F7 | Low | The file email transport could be enabled outside dev/test via `JISR_EMAIL_FILE_TRANSPORT`. | `selectTransport` also refuses whenever `VERCEL_ENV` is set and no Brevo key is present. |
| F8 | Low | A held profile-edit conflict is lost on reload. | Accepted for launch (ruling Q17): the server copy is never lost; a held edit is retyped. Recorded below. |

## Accepted risks

- **Magic-link token in host request logs (ruling Q11) — retired.** Since F3 the token rides the confirm
  page's URL fragment and a POST body, never a query string, so it reaches no request log or `Referer`.
- **F7 escape hatch outside Vercel (Low).** The file transport can still be enabled by an explicit env
  var on a non-Vercel host. Accepted by the owner on 2026-10-16.
- **F8 held profile edit lost on reload (ruling Q17).** Accepted for launch; the server copy is never lost.
- **Unknown-address sign-in email volume, no IP-based limit.** With IPs unrecorded (minimisation), the F1
  caps bound volume; the residual (an attacker spending the sign-in share of the daily budget with made-up
  addresses) is bounded by the deletion reserve (20/250) and accepted by the owner on 2026-10-16.
- **A browser that still holds `jisr.auth` after the flag goes off** shows its cached data until the hint
  is cleared (prelaunch D11 known behaviour).

## Tests backing the review

`tests/lib/privacy/no-pii.test.ts` (every console sink, plus the nonce cookie's value), the fix-wave and
confirm/nonce specs (`tests/db/magic-link-confirm.test.ts`, `tests/db/email-cooldown.test.ts`,
`tests/db/auth-email.test.ts`, `tests/db/pending-signup.test.ts`, `tests/lib/auth/*`), the race specs in
`tests/db-race/`, and the accounts e2e (`pnpm test:e2e:accounts`, 16/16).
