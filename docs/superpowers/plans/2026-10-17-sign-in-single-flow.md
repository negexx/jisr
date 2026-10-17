# Sign-in single flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-mode sign-in form ("Create an account" / "I already have an account") with one passwordless flow that resolves new-vs-existing itself, add the Google mark and the "Continue with" label to the buttons, and make a refused magic-link send diagnosable from the server log without leaking internals.

**Architecture:** The client always collects consent + age (≥16) and sends one request shape without a mode; the Server Action always carries the signup intent (`runAsSignup`) so the pending-signup row is the consent evidence the admission gate needs; a direct POST can still never claim it. The auth instance derives the email wording (`isSignupFor`), the confirm page keeps one neutral wording, and the emailed link no longer carries a mode. Separately, `failureOf` logs the failing layer (class name + SQLSTATE + variable-naming reasons only) by walking the error cause chain that `onAuthApiError` now preserves.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, next-intl (fr/en/ar RTL), Better Auth (magic link), Drizzle/Postgres (PGlite in tests), Vitest + Playwright, Biome, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-17-sign-in-single-flow-design.md` — every task argues from it; read it before starting.

## Global Constraints

- Run every pnpm/next/vitest/playwright command THROUGH Windows from this worktree:
  `cmd.exe /c "cd /d C:\Users\dagda\Downloads\nex\UniWay\.worktrees\sign-in-single-flow && set SWC_NATIVE_BINDING_CACHE=C:\Users\dagda\.swc-cache&& pnpm <cmd>"`
- This worktree's `node_modules` are installed. Never edit the owner's main checkout.
- TypeScript strict: no `any`, no `@ts-ignore`/`@ts-expect-error`, no non-null `!`. Biome style (lint is `pnpm lint`).
- All user-facing strings go through next-intl in fr/en/ar; never `ml-`/`pr-`/`left-` — logical utilities only. All `ar` copy is a machine draft.
- Client-reachable code imports no Zod and no runtime `@/data-schema`.
- No new dependencies. No `.env` values are written by agents. Stage commits by explicit path; conventional commits (`fix:`, `feat:`, `test:`, `docs:`).
- Owner-approved decisions (do not revisit): remove `signup.errors.noAccount` + the UI special case; reword the sign-up email template for both cases; one neutral confirm-page wording; failure log only (no boot log); one PR.
- Per-task gate: `pnpm test` (through Windows) + `pnpm typecheck` + `pnpm lint` green before the review, and each task ends with its own commit.

## Review Focus

1. **An existing user through the form** — the pending row is written and never consumed, their stored consent/age fields stay untouched, and the link signs them in.
2. **A direct POST link (no signup intent) for an unknown address** — plain sign-in email wording, `AGE_NOT_CONFIRMED` at confirm, the sign-in page shows `errors.linkFailed` (never `errors.noAccount`, which no longer exists).
3. **A legacy emailed link whose fragment still carries `mode=`** — confirms normally (extra fragment param ignored).
4. **A claim failure (missing table / DB down)** — UI keeps the generic message while the log names the error class + SQLSTATE and never the address, token or any value.
5. **RTL + phone layout with the Google mark and the "Continue with" label** — 48 px targets, mark not mirrored, no clipping, in fr and ar.

---

### Task 1: Diagnosable sign-in link failures

**Files:**
- Modify: `src/lib/auth/log.ts` (`onAuthApiError`)
- Modify: `src/lib/server/signup.ts` (`failureOf`; update its comment)
- Modify: `tests/lib/auth/log.test.ts`
- Create: `tests/db/signup-failure-logging.test.ts`

**Interfaces:**
- Consumes: `sqlState(error): string | null` from `@/lib/server/account-store`; `AuthMisconfiguredError` from `@/lib/auth/server`; `AuthEmailAccountsDisabled`, `AuthEmailTransportNotConfigured` from `@/lib/server/email`.
- Produces: the log contract (pinned by tests): for the three whitelisted classes
  `console.error("sign-in link request failed", { code, reason })` where `reason` is the class's own message; otherwise
  `console.error("sign-in link request failed", { code, error: <deepest cause name>, sqlState: <SQLSTATE or null> })`.
  The first argument `"sign-in link request failed"` must stay byte-identical (`tests/lib/privacy/no-pii.test.ts:317` asserts it).
- Produces: `onAuthApiError` keeps the original error as `cause` on the `INTERNAL_SERVER_ERROR` wrapper it throws.

- [ ] **Step 1: Extend the failing test for the preserved cause** in `tests/lib/auth/log.test.ts` (the existing "turns any other error into a 500 whose body is only its code, after one scrubbed line" test): after capturing the thrown wrapper, add `expect((thrown as Error).cause).toBe(<the original Error the test passed in>)`.
- [ ] **Step 2: Run it to verify it fails.** `pnpm test -- tests/lib/auth/log.test.ts` — FAIL (`cause` undefined).
- [ ] **Step 3: Implement in `src/lib/auth/log.ts`.** In `onAuthApiError`, build the wrapper first and keep the cause before throwing:
  ```ts
  const wrapped = new APIError("INTERNAL_SERVER_ERROR", { code: "INTERNAL_SERVER_ERROR" });
  if (error instanceof Error) wrapped.cause = error; // if TS rejects the assignment: Object.defineProperty(wrapped, "cause", { value: error, configurable: true })
  throw wrapped;
  ```
- [ ] **Step 4: Run it to verify it passes** (`pnpm test -- tests/lib/auth/log.test.ts`).
- [ ] **Step 5: Write the failing regression tests** in `tests/db/signup-failure-logging.test.ts`. Copy the harness pattern from `tests/db/pending-signup.test.ts` (start PGlite first, set `process.env.DATABASE_URL`, then dynamic-import `requestSignInLink`; mock `next/headers`; stub `ACCOUNTS_ENABLED` to `"1"`; capture `console.error` with `vi.spyOn`). Do NOT mock `@/lib/server/email` (the real module is needed). Two tests, run in this order:
  1. transport: `vi.stubEnv("VERCEL_ENV", "production")` and `vi.stubEnv("BREVO_API_KEY", "")`; call `requestSignInLink({ email, consent: true, ageConfirmed: true, locale: "fr", returnPath: null })` → expect `{ ok: false, error: "failed" }`; find the captured call whose first argument is `"sign-in link request failed"` and expect its second argument to match `{ code: "INTERNAL_SERVER_ERROR", reason: expect.stringContaining("BREVO_API_KEY") }`;
  2. database: drop a table first — `await db.execute(sql\`drop table email_cooldowns\`)` (import `db` from `@/db`, `sql` from `drizzle-orm`) — then call the action again with a different address → expect `{ ok: false, error: "failed" }` and a captured call matching `{ code: "INTERNAL_SERVER_ERROR", sqlState: "42P01" }`.
  Both tests assert that `JSON.stringify` of every captured `console.error` call never contains the address.
- [ ] **Step 6: Run them to verify they fail** (`pnpm test -- tests/db/signup-failure-logging.test.ts`).
- [ ] **Step 7: Implement `failureOf` in `src/lib/server/signup.ts`.** Walk the cause chain twice: once for the whitelisted classes (return the first matching `message` as `reason`), once for the deepest `Error` (its `name`). Keep the existing cooldown / accounts-disabled early returns and the `"failed"` return. Replace the current `AuthMisconfiguredError`-only branch with the two-shape contract above, and update the comment above `failureOf` to state: whitelisted messages only (they name variables, never values); unknown errors log name + SQLSTATE only, never a message.
- [ ] **Step 8: Run them to verify they pass**, then run the full `pnpm test`, `pnpm typecheck`, `pnpm lint` (Windows wrapper). The privacy suite (`tests/lib/privacy/no-pii.test.ts`) and the cooldown/disabled mappings must stay green — if `no-pii` pins call shapes beyond line 317, update it deliberately to the new safe shape.
- [ ] **Step 9: Commit** — `git add src/lib/auth/log.ts src/lib/server/signup.ts tests/lib/auth/log.test.ts tests/db/signup-failure-logging.test.ts` → `fix(auth): name the failing layer when a sign-in link cannot be sent`.

---

### Task 2: One passwordless flow

**Files:**
- Modify: `src/lib/server/signup.ts`, `src/lib/auth/server.ts`, `src/lib/auth/callback-urls.ts`, `src/lib/server/email.ts`, `src/components/auth/sign-in-form.tsx`, `src/components/auth/sign-in-confirm.tsx`, `src/lib/auth/signup-intent.ts` (comment only)
- Modify: `messages/fr.json`, `messages/en.json`, `messages/ar.json`
- Modify tests: `tests/components/signup-consent.test.tsx`, `tests/db/pending-signup.test.ts`, `tests/db/magic-link-confirm.test.ts`, `tests/lib/auth/callback-urls.test.ts`, `tests/lib/auth/sign-in-confirm.test.tsx`, `tests/lib/server/email.test.ts`, plus every test helper that builds a `SignInLinkRequest` with a `mode` (grep `mode: "signup"` under `tests/` — at least `tests/lib/server/account-actions.test.ts`, `tests/app/api/export.test.ts`).

**Interfaces:**
- `SignInLinkRequest = { email: string; consent: boolean; ageConfirmed: boolean; locale: (typeof LOCALES)[number]; returnPath: string | null }` — no `mode`.
- `signInConfirmPath(locale: Locale, token: string, returnPath: string | null): string` — `SIGN_IN_MODE_PARAM` deleted.
- `SignInLink = { token: string | null; returnPath: string | null }`; `readSignInLink(hash, locale)` returns it; a legacy `mode=` fragment param is ignored.
- `SignInLinkMode` (in `callback-urls.ts`) stays as the server-side wording type; `src/lib/server/signup.ts` no longer exports it.
- Messages: delete `signup.modes.*` and `signup.errors.noAccount`; add `signInConfirm.body` / `signInConfirm.confirm` (replace `signInConfirm.signin.*` and `signInConfirm.signup.*`). Exact values in the spec §3.5 table.
- Email template `magic-link-signup` (fr/en/ar) re-worded per spec §3.6 (sign-in-or-create; consent sentence conditioned on creation).

- [ ] **Step 1: Update the tests to the new contract (they will fail at runtime first; vitest does not typecheck).**
  - `tests/components/signup-consent.test.tsx`: delete the mode-radio tests (`"asks a returning user for the address only…"`, `"starts a Google sign-in without confirmations in signin mode"`, the `radio { name: t("modes.signin") }` interactions) and the `noAccount` test; keep/adjust: confirmations always visible unticked, both "blocks …" tests for email and Google, send payload without `mode`, Google always sends `additionalData: { ageConfirmed: true, consentVersion: CURRENT_CONSENT_VERSION }`, cooldown → `errors.cooldown`, unknown error → `errors.failed`.
  - `tests/db/pending-signup.test.ts`: drop `mode` from every input; rewrite the signin-mode tests: an existing user's form request writes the pending row and still signs in with consent untouched; the sign-up wording applies to every action request; the direct-POST wording test stays; the unknown-address `AGE_NOT_CONFIRMED` test now obtains its link through a direct `auth.api.signInMagicLink` call (the action always writes a pending row).
  - `tests/db/magic-link-confirm.test.ts`: link fragment no longer carries `mode`; keep the direct-POST refusal + token lifecycle assertions.
  - `tests/lib/auth/callback-urls.test.ts`: new signatures; add a case asserting a legacy fragment containing `mode=signup` still returns the token + return path.
  - `tests/lib/auth/sign-in-confirm.test.tsx`: neutral wording keys (`signInConfirm.body` / `signInConfirm.confirm`); no mode-dependent expectations.
  - `tests/lib/server/email.test.ts`: wording assertions updated to spec §3.6.
  - Update every `mode: "signup"`/`"signin"` in other test helpers (grep under `tests/`).
- [ ] **Step 2: Run the affected suites to verify they fail** (`pnpm test -- tests/components/signup-consent.test.tsx tests/db/pending-signup.test.ts tests/db/magic-link-confirm.test.ts tests/lib/auth/callback-urls.test.ts tests/lib/auth/sign-in-confirm.test.tsx tests/lib/server/email.test.ts`).
- [ ] **Step 3: Server contract.**
  - `src/lib/server/signup.ts`: remove `mode` from the type and `RequestSchema`; always require `consent && ageConfirmed` (`confirmation_required`); always `await runAsSignup(email, send)`; plugin `metadata: { locale }`; delete the `SignInLinkMode` export (it moves out of the client contract).
  - `src/lib/auth/server.ts`: in `sendMagicLink`, `const mode = isSignupFor(email) ? "signup" : "signin";` (delete the `metadata?.mode` input); `signInLinkUrl(baseURL, verifyUrl, metadata)` drops its `mode` parameter and builds the confirm URL without it; the email request metadata keeps `{ ...metadata, locale, mode }`.
  - `src/lib/auth/callback-urls.ts`: delete `SIGN_IN_MODE_PARAM`; `signInConfirmPath(locale, token, returnPath)`; `SignInLink`/`readSignInLink` without mode; update the `SignInLinkMode` doc comment (server-side wording only).
  - `src/lib/server/email.ts`: reword `magic-link-signup` for fr/en/ar per spec §3.6; leave `templateOf` and the plain `magic-link` template untouched.
  - `src/lib/auth/signup-intent.ts`: update the comment — every form request is a signup intent; a direct POST never is.
- [ ] **Step 4: Client.**
  - `src/components/auth/sign-in-form.tsx`: delete the fieldset, `mode` state, `switchMode`, `creating`; always render both `ConfirmationCheckbox`es; `confirmationErrors()` always applies; payload `{ email, consent, ageConfirmed, locale, returnPath }`; Google always sends `additionalData` once both boxes are ticked; the landing-error notice shows `t("errors.linkFailed")` for any non-empty error (delete `NO_ACCOUNT_ERROR`).
  - `src/components/auth/sign-in-confirm.tsx`: `Ready = { token: string; returnPath: string | null }`; body `t("body")`, button `t("confirm")`, `working}/t("working")` unchanged.
- [ ] **Step 5: Messages (all three locales, same commit).** Delete `signup.modes` and `signup.errors.noAccount`; replace `signInConfirm.signin.*` + `signInConfirm.signup.*` with `signInConfirm.body` + `signInConfirm.confirm`; values exactly as in spec §3.5. Do not touch `signup.submit` yet (Task 3).
- [ ] **Step 6: Run the affected suites to green**, then the full `pnpm test` (i18n parity `tests/i18n/messages.test.ts` and vocabulary must pass; `tests/fixtures/i18n/guest-copy-golden.json` must NOT change), then `pnpm typecheck` and `pnpm lint`.
- [ ] **Step 7: Commit** — stage `src/`, `messages/`, and the test files above by explicit path → `feat(auth): one passwordless flow for new and returning students`.

---

### Task 3: Google mark and button labels

**Files:**
- Create: `src/components/auth/google-mark.tsx`
- Modify: `src/components/auth/sign-in-form.tsx` (Google button content only)
- Modify: `messages/fr.json`, `messages/en.json`, `messages/ar.json` (`signup.submit`)
- Modify: `tests/components/signup-consent.test.tsx` (Google button assertions)

**Interfaces:**
- Produces: `export function GoogleMark(): JSX.Element` — a decorative inline SVG, no props.
- `signup.submit`: fr `Continuer avec`, en `Continue with`, ar `متابعة`. (Divider `signup.orEmail`, email label/hint and all other copy unchanged.)

- [ ] **Step 1: Failing test** — in `tests/components/signup-consent.test.tsx`: the Google button's accessible name is still `t("google")`, and it contains `svg[aria-hidden="true"]`; the email submit shows the new `signup.submit` value.
- [ ] **Step 2: Create `src/components/auth/google-mark.tsx`** — the official four-colour mark, exact markup:
  ```tsx
  export function GoogleMark() {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" className="size-5">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    );
  }
  ```
  Never mirror or recolour it; the button keeps its label as the accessible name.
- [ ] **Step 3: Wire it** — `sign-in-form.tsx` Google button children become `<GoogleMark />{t("google")}` (the `Button` already supplies `gap-2` and `[&_svg]` sizing); update `signup.submit` in the three catalogues.
- [ ] **Step 4: Run the suite + gate** (`pnpm test -- tests/components/signup-consent.test.tsx`, then `pnpm test`, `pnpm typecheck`, `pnpm lint`).
- [ ] **Step 5: Commit** — `feat(auth): add the Google mark and the Continue-with label to the sign-in form`.

---

### Task 4: e2e accounts, ops docs, full gate

**Files:**
- Modify: `tests/e2e-accounts/support.ts`, `tests/e2e-accounts/account-journey.spec.ts`, `tests/e2e-accounts/header-layout.spec.ts`
- Modify: `docs/ops/deploy.md` (section 9 Troubleshooting)

**Interfaces:**
- `requestLink(page, t, email)` — no mode; always ticks both checkboxes; clicks `t("signup.submit")`; asserts `t("signup.sent.title")`.
- `confirmSignInLink(page, t, link)` — button `t("signInConfirm.confirm")`.
- `signInOnDevice(device, t, locale, email, returnPath)` — signature unchanged, internals use the single flow.

- [ ] **Step 1: Update `support.ts` and the two specs.** Remove every radio interaction and mode parameter/argument (`signInOnDevice` passes no mode; `account-journey.spec.ts` IS-1 keeps its "unticked boxes show errors and no request is sent" assertion on the single flow; IS-6/IS-2/IS-3 call sites updated; `header-layout.spec.ts` call sites updated).
- [ ] **Step 2: Run the accounts suite** (`pnpm test:e2e:accounts`, Windows wrapper; cold build can take up to 10 min) — must be green. This is the local reproduction of the full journey (accounts on, file transport, harness DB).
- [ ] **Step 3: Visual QA (fr + ar, phone + desktop).** The accounts build has the sign-in page; render checks need no database — start the already-built app (`cmd.exe /c "cd /d …\sign-in-single-flow && set ACCOUNTS_ENABLED=1&& pnpm exec next start -p 3501"`) and run a throwaway Playwright script (worktree root, deleted afterwards, not committed) that captures `/{fr,ar}/sign-in` at 390×844 and 1280×800, and asserts: Google mark visible, not mirrored in ar, both checkboxes visible unticked, submit label reads "Continuer avec"/"متابعة", no horizontal clipping. Record the verdicts for the PR/report.
- [ ] **Step 4: Docs** — add a "Sign-in emails fail while accounts are on" subsection to `docs/ops/deploy.md` section 9 covering: where to look (Vercel → deployment → Runtime Logs, grep `sign-in link request failed` / `[better-auth] unexpected error`; Hobby keeps 1 h), the cause table (transport not configured → check `BREVO_API_KEY`/`BREVO_SENDER`, then redeploy; `AuthMisconfiguredError` → check `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL`; SQLSTATE errors → check `DATABASE_URL` and that `pnpm db:migrate` ran on the production Neon branch, prelaunch D8 — no CI or deploy job runs migrations), the exact Production-scope variable list (prelaunch D6) and "env changes need a redeploy".
- [ ] **Step 5: Commit** the e2e changes → `test(e2e): drive the single sign-in flow`; commit the docs separately → `docs(ops): diagnosing a refused sign-in email`.
- [ ] **Step 6: Full gate** — `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build` + `pnpm perf:js`, `pnpm test:e2e` (guest) then `pnpm test:e2e:accounts`; run `pnpm data:build` afterwards (the accounts build replaces `.next`/`public/snapshots`). All green, or report exactly what is red and why.

**After Task 4:** whole-branch review (repo workflow), then PR (`gh pr create`, draft unless the owner asks otherwise), then the final report (status, commits, PR URL, tests, concerns).

---

## Self-review notes

- Spec coverage: §3.1→T2/T3, §3.2→T2, §3.3→T2, §3.4→T2 (kept paths) + T1 (AGE branch logged), §3.5→T2/T3, §3.6→T2, §4→T3, §5.1→T1, §5.2→T1, §5.3→T4, verification→T4.
- Known consequential edits not mentioned elsewhere: `tests/lib/server/account-actions.test.ts` and `tests/app/api/export.test.ts` `signUp()` helpers (T2 Step 1); `tests/i18n/signup-messages.test.ts` only if a rule pinned a deleted key (T2 Step 6).
- Ordering: T1 → T2 → T3 → T4 (each depends on the previous task's files); e2e runtime breakage exists between T2 and T4 and is fixed by T4 by design (typecheck stays green because the e2e translator takes untyped keys).
