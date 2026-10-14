# tests/db — in-process test database

DB-backed specs (schema, Server Actions, export/deletion, signed-in e2e) run against an
**in-process Postgres** so `pnpm test`, Playwright and manual QA need no external service
and no secrets. `harness.ts` boots [PGlite](https://pglite.dev) behind a local TCP socket
(`@electric-sql/pglite-socket`) and exposes an ordinary `postgres://…` connection string;
migration SQL that works here applies unchanged to Neon in production.

## Version pin (M-13)

PGlite is pinned to the Neon project's Postgres major so the two never drift:

| | Version | Postgres major |
|---|---|---|
| PGlite (`@electric-sql/pglite`) | 0.5.9 | **18** (reports `PostgreSQL 18.6`) |
| Neon (project target) | — | **18** (18.6; new projects default to Postgres 18) |

Both are major 18. Sources: `SELECT version()` on PGlite 0.5.9 → `PostgreSQL 18.6 (PGlite 0.5.9)`;
Neon changelog 2026-06-05 ("Postgres 18 is now the default for newly created Neon projects")
and Neon's Postgres version support page (latest minors 18.6 / 17.11 / …). If Neon is ever
moved to another major, bump `@electric-sql/pglite` to a build on that major in the same change.

## Usage

```ts
import { startTestDatabase } from "./harness";

const db = await startTestDatabase(); // PGlite + socket + migrate
try {
  // db.databaseUrl -> postgres://postgres@127.0.0.1:<port>/postgres?sslmode=disable
  // hand it to pg, drizzle-kit or the app
} finally {
  await db.stop(); // releases the port
}
```

- `startTestDatabase({ port })` — a fixed default port fails loudly (named
  `TestDatabasePortInUseError`) when a second harness is running; pass `port: 0` in specs
  that run in parallel.
- `migrate()` — applies `drizzle/` migrations (`{ applied: true }`); a missing migrations
  directory is a tolerated no-op (`{ applied: false }`), because `drizzle-kit migrate` exits
  non-zero on it.
- Specs that import `@/db` must set `process.env.DATABASE_URL` to `databaseUrl` before a
  dynamic `import()` (the pool is built at import time) and end the pool in `afterAll`
  (`db.$client.end()`); see `admission.test.ts`.
- `stop()` — stops the socket and closes the database; the port is free immediately.

`pnpm db:harness [--port N] [--exec "<command>"]` boots the harness as a standalone process
for manual QA and Playwright's `webServer` chain (used with `--exec "pnpm exec next start …"`).
