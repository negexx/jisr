---
paths:
  - "src/lib/auth/**/*.ts"
  - "src/app/api/auth/**/*.ts"
  - "src/proxy.ts"
---

# Better Auth (phase 2 — after the guest journey works)

- Guest-first: the whole core journey works without an account, with the profile in localStorage. Accounts add cross-device saves; on signup, import the local profile once and don't silently overwrite existing server data.
- One server instance in `src/lib/auth/server.ts`: `betterAuth({ database: drizzleAdapter(db, { provider: "pg", schema }), … })` with `drizzleAdapter` imported from `@better-auth/drizzle-adapter` (the dedicated package supersedes `better-auth/adapters/drizzle`; ctx7-verified 2026-10-14) and the `nextCookies()` plugin last in `plugins`. The browser client is a separate file, `src/lib/auth/client.ts`.
- Route handler is `src/app/api/auth/[...all]/route.ts` exporting `toNextJsHandler(auth)` — nothing else lives there.
- Read the session on the server with `auth.api.getSession({ headers: await headers() })` in every page, Server Action and route handler that touches user data. The proxy cookie check is optimistic UX, not authorization.
- Sign-in methods: Google and email magic link (avoids password-reset email volume). Adding a method or plugin means regenerating the auth schema and writing a migration. `user.role` defaults to `student`; there is no admin UI.
- Secrets (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, Google client id/secret, email provider key) come from env only; add new ones to `.env.example` with empty values. Never log tokens, cookies or personal data.
- Users must be able to delete their account and export their data as JSON (GDPR/CNDP); keep those flows working when auth changes.
- Accounts launch only after the CNDP declaration and en/fr/ar privacy notice (ADR 0004). Signup needs an unticked consent checkbox and an age ≥ 16 confirmation; store `consent_version` and `consented_at` on the user row. Under-16 visitors stay in guest mode.
- Verify current Better Auth APIs with `ctx7` before writing code — the library moves fast.
