# Accounts (phase 2): design

Date: 2026-10-14. Status: approved by the owner on 2026-10-13 (Q1-Q3), revised 2026-10-14 after review.
Plan: `docs/superpowers/plans/2026-10-14-accounts-phase-2.md`. Decision record: ADR 0013 (written in todo 23).

## Goal

A student can create a Jisr account (Google or an email magic link) after ticking an unticked consent box and confirming they are 16 or older. Their profile, saved programmes and ticked plan steps then follow them across devices. They can report an outdated fact, download everything held about them as JSON, and delete their account completely. Signed-out visitors get exactly today's guest journey: same pages, same `jisr.*` localStorage keys, and no new server calls.

## Fixed decisions

- **Methods:** Google and magic link only, with no passwords (`.claude/rules/auth.md`). Better Auth 1.7 runs on Drizzle and `pg` against Neon Postgres in Frankfurt. Postgres holds user data only, never reference data.
- **Kill switch:** `ACCOUNTS_ENABLED` is read on every request; when it is unset, blank or a falsy token, accounts are off. While it is off, no sign-up surface renders, the auth handler and signup action refuse to create anything, and no `pending_signups` row is written or email sent. The owner flips it only after the CNDP declaration, the controller name and contact, and a verified sending domain are in place. Dark merges are therefore safe.
- **Admission (B1/B2):** the gate is `databaseHooks.user.create.before`. A missing age confirmation rejects the create, so no row is written. Missing consent, or consent to an older version, still creates the user with null consent fields. The **finish-signup gate** then blocks every account feature until the student consents to `CURRENT_CONSENT_VERSION`.
- **Consent versioning (revised):** a single zod-free constant, `CURRENT_CONSENT_VERSION`, lives in `src/lib/auth/consent.ts`. The finish-signup gate checks `user.consentVersion === CURRENT_CONSENT_VERSION`, not merely non-null, so a privacy-notice change re-prompts every existing user. The create hook only stamps consent evidence that names the current version. Every privacy-notice change bumps the constant in the same commit, and a test ties the constant to the privacy notice's version.
- **Sync model (Q1, revised):** when signed in, Postgres is the source of truth and localStorage is only a cache.
  - The server stores **operations, not whole documents**. Saved programmes are rows keyed `(user_id, slug)`, changed by `saveProgram(item)` and `unsaveProgram(slug)`. Plan ticks are rows keyed `(user_id, slug, step_id)`, changed by `setStepDone(slug, step, done)` and `forgetProgress(slug)`. Each operation is idempotent, so a phone and a laptop editing different items never overwrite each other.
  - The profile is one document and keeps a `revision` integer. `saveProfile(profile, expectedRevision)` does a compare-and-set. On a mismatch it returns `{ ok: false, error: "conflict", current }`, and the profile UI keeps the student's form values while offering "use the other device's version" or "keep mine", which resubmits against the new revision. It never silently overwrites.
  - The 12-programme cap (`MAX_SAVED_PROGRAMS`) is enforced inside a transaction that first locks the user's rows (`SELECT … FOR UPDATE` on the user row). Two concurrent saves at 11 items therefore cannot both succeed.
  - Every mutation follows the same cycle: an optimistic local update, then the Server Action, then a reconcile. A failure rolls back and shows a visible notice, so nothing is dropped silently. Hydration at sign-in takes the server's values.
- **Guest import:** import happens once per device's unclaimed guest data. It is gated on a signed-in session with the finish-signup gate clear. Before any import, the welcome landing asks the student to confirm, naming the signed-in account (masked email). This revises the earlier "automatic when the account is empty": a magic link signs in whoever opens it, so a silent import would let an attacker's link upload a guest's profile to the attacker's account (security review, owner decision 2026-10-15). If the account is empty, confirming imports it. Otherwise the student gets an explicit choice between keeping the server's data and replacing it with this device's. Each import runs in one transaction conditioned on an `imported_at` marker. After an import, only `jisr.profile`, `jisr.saved` and `jisr.plan` are cleared, never `clearAllLocalData()`. Sign-out wipes only data the account has claimed.
- **Session on static pages:** a `jisr.auth` localStorage hint. Guests make zero auth requests and get no prefetch to auth routes. A single post-auth landing route, `/[locale]/welcome?return=…`, is where every redirect-based sign-in completes.
- **Email (Q2):** Brevo, called over `fetch` with no SDK, through one wrapper. When `BREVO_API_KEY` is empty, tests and e2e use a local file transport instead. Sending a link is limited to one per address every 60 s. **Brevo needs a verified sender domain (SPF/DKIM).** The owner holds `jisrr.org`: verifying it in Brevo is a launch blocker (prelaunch checklist row). Serving the site from `jisrr.org` too, so links and sender match, is recommended.
- **Feedback (Q3):** a per-fact "report outdated info" button on journey fact surfaces only, for signed-in users. It writes a FactRef-shaped row, with a cap of 20 per user per day.
- **Rights:** a JSON export route and account deletion. Deletion uses `deleteUser` with emailed verification, sweeps `verification` rows, removes user-owned rows by cascade and clears local data.
- **Slug aliases:** `formerSlugs` in the data, an alias map in the manifest, a single `resolveProgramSlug`, and static alias pages that redirect. Nothing goes in `vercel.json` or `next.config` redirects.

## Testing

- PGlite behind a TCP socket backs fast local and CI specs (schema, actions, export, deletion, e2e), as it does today.
- **Race and transaction tests run against a real Postgres.** PGlite has a single connection, and pglite-socket only multiplexes it, so a test of concurrent behaviour proves nothing there. These specs live in `tests/db-race/` and need `TEST_POSTGRES_URL`. CI runs them in a `postgres:18` service container, matching Neon's major version. Locally they report as **skipped, with a reason**, when the variable is unset, and are never counted as passed. Concurrent double import, the cap race and the profile compare-and-set race all live there.
- Guest regression: the four guest e2e specs (`journey`, `plan`, `compare`, `privacy`) run unmodified.

## Security

Accounts cannot be switched on until two reviews have passed over the auth hooks, consent admission, import, deletion and export: a `security-review` skill pass and an Opus `reviewer` pass. Their findings must be resolved and the result recorded as a prelaunch checklist row.

## Out of scope

Passwords and extra providers, admin UI or roles beyond `student`, reference data in Postgres, websocket or queue sync, CNDP filing, legal advice in the copy, and any change for signed-out visitors.
