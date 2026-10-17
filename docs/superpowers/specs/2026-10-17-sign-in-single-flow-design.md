# Sign-in single flow + diagnosable send failures — design

Date: 2026-10-17
Branch: `feat/sign-in-single-flow` (off `origin/main` @ 184d7a5b, PR #58)
Status: proposed

Supersedes, where it conflicts, the two-mode parts of the accounts design
(`docs/superpowers/specs/2026-10-14-accounts-phase-2-design.md`): the sign-in form no longer asks
the student whether they are new or returning.

## 1. Problem

1. The sign-in page (`src/components/auth/sign-in-form.tsx`) opens with "What do you want to do?"
   and two radio choices ("Create an account" / "I already have an account") driving
   `SignInLinkMode = "signup" | "signin"`. The student should not have to classify themselves; the
   system should resolve new-vs-existing itself. The owner asked for the fieldset to be removed
   entirely.
2. The owner cannot reproduce a working sign-in: submitting the form showed the generic
   `signup.errors.failed` ("The link could not be sent. Try again in a moment."). Nothing in the
   UI or the server log lets anyone tell *why* the send failed.

## 2. Task 3 diagnosis record (done before this design)

Systematic-debugging phases 1–3 were completed against production before writing any code.
Evidence, all against the then-live production deployment (`jisr-otttzatx3`, unchanged since the
owner's attempt):

| Probe | Result |
|---|---|
| `POST /api/auth/sign-in/magic-link` (direct, `@example.org` reserved address) | 200 `{status:true}` — claim + verification row + nonce + Brevo all ran |
| Same request within 60 s | 429 `EMAIL_COOLDOWN` — DB counters work |
| `POST /api/auth/magic-link/confirm` with a bogus token | 400 `INVALID_TOKEN` — `verification` reachable |
| `GET /api/auth/get-session`, `/api/account/export` | 200 `null` / 401 — auth env initialised |
| Full UI form submit (signup mode, both boxes ticked; Playwright) | Sent — "Consultez votre boîte de réception" |
| "J'ai déjà un compte" path | Sent |
| Google button | Valid OAuth redirect with the production client_id |

Production env was also audited read-only: `vercel env ls` shows every required variable in the
Production scope; `vercel pull` cannot read the sensitive ones (by design), so `DATABASE_URL`,
`BETTER_AUTH_SECRET`, `BREVO_API_KEY` and `GOOGLE_CLIENT_SECRET` were verified by behaviour only.
Three diagnostic emails went to a reserved `@example.org` address (RFC 2606, no deliverable
mailbox); no real inbox was touched.

**Finding.** The failure is not reproducible as a code defect — the pipeline is healthy on the
same build, including the exact UI flow. The failure classes that produce `errors.failed` are all
dependency-state problems (transport not configured, auth misconfigured, database layer, network),
and the two candidate states of the failing window were the production DB migration step (D8) and
the Brevo/env setup (D4/D6) — both now completed, or a transient infra failure. The **real defect
is diagnosability**: `failureOf` in `src/lib/server/signup.ts` logs only `{code:"unexpected"}` and
`onAuthApiError` (`src/lib/auth/log.ts`) wraps non-API errors into `INTERNAL_SERVER_ERROR` without
keeping the original, so no log line names the failing layer.

**Fix (this design, section 5).** Log the failure class safely; keep the UI generic; document the
exact Vercel variables, the migration prerequisite and the redeploy rule; pin it all with tests.

## 3. Task 1 — one passwordless flow

The system resolves new-vs-existing without ever asking, and without an "does this email exist?"
endpoint (account-enumeration leak). Every form request carries the signup intent (consent
evidence); account creation remains gated by the existing admission gate reading the pending row;
an existing address simply signs in and its pending row is never consumed.

### 3.1 Client — `src/components/auth/sign-in-form.tsx`

- Delete the mode fieldset entirely (legend, both radios, `mode` state, `switchMode`, `creating`).
- Both confirmations (consent + age ≥ 16) are **always rendered**, unticked, and required for the
  email submit **and** the Google button. Unticked blocks both.
- Request payload drops `mode`: `{ email, consent, ageConfirmed, locale, returnPath }`.
- Google always sends `additionalData: { ageConfirmed: true, consentVersion: CURRENT_CONSENT_VERSION }`
  once both boxes are ticked.
- Remove the `AGE_NOT_CONFIRMED` → `errors.noAccount` special case: any landing error code now
  shows `errors.linkFailed`. (`AGE_NOT_CONFIRMED` keeps existing server-side as the admission
  gate's refusal — see 3.4.)
- Everything else stays: required markers, hints, `role="alert"`, focus behaviour, logical
  utilities, 48 px targets, the sent view, `age.hintSignedIn` for signed-in visitors.

### 3.2 Server Action — `src/lib/server/signup.ts`

- `SignInLinkRequest` / `RequestSchema`: drop `mode`; keep `email`, `consent`, `ageConfirmed`,
  `locale`, `returnPath`.
- Always require `consent && ageConfirmed`, else `confirmation_required` (defence in depth; the
  client checks too).
- Always run the send inside `runAsSignup(email, send)` — the pending row + consent wording are
  recorded by the same AsyncLocalStorage intent mechanism as today, now for every form request.
  A direct `POST /api/auth/sign-in/magic-link` still cannot set the intent (unchanged).
- Plugin `metadata` sent by the action drops `mode` (it was never trusted; the server derives it).

### 3.3 Auth instance — `src/lib/auth/server.ts`, `callback-urls.ts`

- `sendMagicLink`: `const mode = isSignupFor(email) ? "signup" : "signin"` (no metadata input).
  Action requests get the account wording + pending row; direct POSTs keep the plain sign-in
  wording and cannot create an account.
- Email wording (template choice) stays keyed on this server-derived `mode`; `templateOf` in
  `email.ts` is unchanged mechanically.
- `callback-urls.ts`: `signInConfirmPath(locale, token, returnPath)` — `SIGN_IN_MODE_PARAM` and the
  mode in the fragment are removed. `readSignInLink` returns `{ token, returnPath }`; a legacy
  fragment still carrying `mode=` parses fine (extra param ignored). `SignInLinkMode` stays as the
  server-side wording type.
- Confirm page `src/components/auth/sign-in-confirm.tsx`: one neutral copy — `t("body")` /
  `t("confirm")` instead of `${link.mode}.body/.confirm`.

### 3.4 Safety paths kept

- `admission.ts` (age gate, consent stamping, OAuth evidence) — unchanged.
- `pending-signup.ts` — unchanged (recorded for every form request now; still consumed only when
  an account is created; TTL keeps rows short-lived).
- `AGE_NOT_CONFIRMED` — still thrown by the create-before hook when a link has no evidence
  (direct-POST links, or a scripted bypass). The UI no longer distinguishes it (falls to
  `errors.linkFailed`): with one flow, retrying from the form always succeeds, so a dedicated "no
  account yet" message can only confuse.
- Cooldown / accounts-disabled keep their own user-visible messages (unchanged mapping).

### 3.5 Copy (fr / en / ar)

Deleted keys: `signup.modes.*`, `signup.errors.noAccount` all three locales.

| Key | fr | en | ar |
|---|---|---|---|
| `signup.submit` | Continuer avec | Continue with | متابعة |
| `signInConfirm.body` (new, neutral) | Appuyez sur le bouton pour vous connecter. Si vous n'avez pas encore de compte, il sera créé. | Press the button to sign in. If there is no account yet, it will be created. | اضغط على الزر لتسجيل الدخول. إذا لم يكن لديك حساب بعد فسيُنشأ. |
| `signInConfirm.confirm` (new, neutral) | Continuer | Continue | متابعة |

Removed keys replaced by the two above: `signInConfirm.signin.body`, `signInConfirm.signin.confirm`,
`signInConfirm.signup.body`, `signInConfirm.signup.confirm`. Everything else in `signInConfirm.*`,
`signup.*`, `welcome.*`, `account.*` is unchanged. All `ar` copy is a machine draft until the
native review.

No golden change: `tests/fixtures/i18n/guest-copy-golden.json` contains no `signup.*` keys; the
copy-audit `DEVICE_CLAIMS` entries (`signup.lead`, `signup.age.hint` + signed-in variants) keep
their keys and values.

### 3.6 Email template (server-side, `src/lib/server/email.ts`)

`magic-link-signup` (sent for every form request; the plain sign-in wording stays for direct
POSTs):

- fr — subject "Confirmez votre connexion à Jisr":
  "Bonjour," / "Quelqu'un a demandé à se connecter à Jisr avec cette adresse email. En ouvrant ce
  lien, vous vous connectez — et s'il n'existe pas encore de compte Jisr avec cette adresse, il est
  créé :" / url / "Si un compte est créé, cela vaut confirmation que vous avez 16 ans ou plus et que
  vous acceptez la politique de confidentialité de Jisr, version X : <privacy>" / "Ce lien est
  valable 15 minutes et ne peut être utilisé qu'une seule fois." / "Si vous n'avez pas fait cette
  demande, ignorez ce message : rien n'est créé." / "Jisr"
- en — subject "Confirm your sign-in to Jisr": equivalent ("Opening this link signs you in — and if
  there is no Jisr account for this address yet, it creates one:" / "If an account is created, it
  confirms that you are 16 or older and accept the Jisr privacy notice, version X: <privacy>").
- ar — subject "تأكيد تسجيل الدخول إلى جسر": equivalent machine draft.

## 4. Task 2 — buttons

- Google button stays first/full-width; add the official Google "G" as an inline SVG
  (`src/components/auth/google-mark.tsx`, new component, four brand-colour paths, `aria-hidden`,
  `focusable="false"`, ~20 px, not mirrored in RTL). Label (`signup.google`) unchanged.
- Email submit label becomes `signup.submit` above ("Continuer avec" / "Continue with" /
  "متابعة"). The "or" divider, the email field, label and hint are untouched.
- No other layout or accessibility change; verified in fr and ar, phone + desktop.

## 5. Task 3 — diagnosable failures (design)

### 5.1 Server logging (`src/lib/server/signup.ts`, `src/lib/auth/log.ts`)

- `onAuthApiError` keeps the original error as `cause` of the `INTERNAL_SERVER_ERROR` wrapper, so
  the chain survives to the action (verify APIError allows a `cause` assignment during
  implementation; if not, fall back to logging the full class/SQLSTATE at this point in `log.ts`).
- `failureOf` describes the deepest error in the cause chain:
  - `sqlState(error)` reused from `src/lib/server/account-store.ts`;
  - error class name (`error.constructor.name` of the innermost error, or `typeof` for non-Errors);
  - a `reason` **only** for the three whitelisted classes whose messages name variables and never
    values: `AuthMisconfiguredError` (existing behaviour, keeps its full message), and now
    `AuthEmailTransportNotConfigured` / `AuthEmailAccountsDisabled`.
  - Never an arbitrary `error.message` (driver errors can carry parameters).
- Result: one line in one of two shapes: `sign-in link request failed { code: "INTERNAL_SERVER_ERROR",
  reason: "Auth email transport is not configured: BREVO_API_KEY is empty on Vercel..." }` for a
  whitelisted class, or `{ code: "INTERNAL_SERVER_ERROR", error: "DatabaseError", sqlState: "42P01" }`
  otherwise, where `error` is the innermost error's constructor name.
- The UI keeps its generic `errors.failed`; cooldown and disabled keep their messages.

### 5.2 Regression tests

- `tests/db/signup-failure-logging.test.ts` (new, own PGlite harness): drop a table
  (`email_cooldowns`) then call `requestSignInLink` → `{ ok:false, error:"failed" }` and the
  captured `console.error` contains `sqlState: "42P01"` and never the address; second case with
  `VERCEL_ENV=production` and no `BREVO_API_KEY` → `reason` names the variable, log carries no
  address/token.
- `tests/lib/auth/log.test.ts`: the wrapper keeps the cause (or the fallback logging assertion).
- `tests/components/signup-consent.test.tsx`: unknown failure still maps to `errors.failed`
  (existing test adjusted to the single flow).
- `tests/lib/privacy/no-pii.test.ts`: must stay green (the new fields are name/SQLSTATE/variable
  names only).

### 5.3 Ops documentation (`docs/ops/deploy.md`, new troubleshooting section)

- Symptoms + where to look: Vercel → deployment → Runtime Logs (Hobby retains 1 h — read soon);
  grep for `sign-in link request failed` and `[better-auth] unexpected error`.
- Cause table: transport-not-configured (check `BREVO_API_KEY`/`BREVO_SENDER` in Production, then
  **redeploy**); `AuthMisconfiguredError` (check `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL`);
  DB errors with SQLSTATE (check `DATABASE_URL` and that `pnpm db:migrate` ran on the production
  Neon branch — prelaunch D8; no CI or deploy job runs migrations).
- The exact required Production-scope variables (cross-reference prelaunch D6/D8) and the rule
  that env changes need a redeploy to take effect.

## 6. Out of scope

- No change to Google OAuth, sessions, account deletion/export, the welcome landing import, the
  finish-signup gate, cooldown/cap constants or the admission evidence rules.
- No boot-time transport log (owner decision 2026-10-17).
- No new dependencies. No `.env` values are set by agents.

## 7. Test plan (files touched)

| File | Change |
|---|---|
| `tests/components/signup-consent.test.tsx` | Drop mode tests; always-on confirmations; payload without `mode`; Google always sends `additionalData`; remove noAccount test; keep cooldown/disabled/failed mapping |
| `tests/app/sign-in-page.test.tsx` | Still exactly 2 unticked checkboxes; verify no mode copy in the prerendered HTML |
| `tests/db/pending-signup.test.ts` | No `mode` in inputs; rewrite the signin-mode tests to single-flow semantics (existing user + written pending row = still signs in, consent untouched); wording test rewritten |
| `tests/db/magic-link-confirm.test.ts` | Fragment without `mode`; direct-POST refusal unchanged (`AGE_NOT_CONFIRMED`) |
| `tests/lib/auth/callback-urls.test.ts` | `signInConfirmPath`/`readSignInLink` without mode; legacy fragment tolerated |
| `tests/lib/auth/sign-in-confirm.test.tsx` | Neutral confirm copy keys |
| `tests/lib/server/email.test.ts` | New `magic-link-signup` wording (fr/en/ar) |
| `tests/i18n/signup-messages.test.ts` | Still green (wording rules); adjust if a rule pinned removed keys |
| `tests/e2e-accounts/support.ts`, `account-journey.spec.ts`, `header-layout.spec.ts` | Single-flow request link (no radio), confirm button label, wording assertions |
| `tests/db/signup-failure-logging.test.ts` | New regression (5.2) |
| `tests/lib/auth/log.test.ts` | Cause preserved (5.2) |

## 8. Verification gates

`pnpm typecheck`, `pnpm test`, `pnpm lint` in the worktree (Windows pnpm wrapper); then
`pnpm build` + `pnpm perf:js`; the accounts e2e suite (file transport + harness DB) as the local
reproduction of the full journey; UI checked in a browser in **fr and ar**, phone + desktop
(including RTL for the Google mark); `reviewer` pass; PR only, never push to `main`.

## 9. Risks

- **Legacy links in inboxes** (≤ 15 min old at deploy): their fragments may carry `mode=signup`;
  `readSignInLink` ignores it — accepted inline above.
- **Existing users now tick both boxes** on every sign-in — deliberate: it is the price of the
  server never asking whether an address exists (owner-approved).
- **Wording drift**: `orEmail` ("Or continue with email") and the new submit ("Continue with")
  co-exist; the owner asked to keep the divider as-is.
- **Log volume**: one extra line per refused send; no PII, bounded length (name + SQLSTATE +
  whitelisted reason only).
