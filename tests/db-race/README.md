# tests/db-race — specs that need a real Postgres

Race and transaction specs (row locks, concurrent writers, serialisation failures) need several
real connections. The PGlite harness in `tests/db/` is single-connection, so these specs run against
the Postgres named by `TEST_POSTGRES_URL` and are **skipped** when it is unset: a plain `pnpm test`
lists them as skipped, with the reason in the suite title.

```bash
docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:18
TEST_POSTGRES_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm test:db-race
```

CI runs the same command in the `db-race` job against a `postgres:18` service container and fails
the job if any spec in this directory was skipped.

## Writing a spec

Use `describeRace` and `createRaceDatabase` from `./pg`. `createRaceDatabase()` runs
`create database race_<random>` through `TEST_POSTGRES_URL`, runs the `drizzle/` migrations into it
and hands out pools on that database. Call `race.drop()` in `afterAll`: it ends the pools, drops the
database with `(force)` and throws if a pool reported an idle-client error before teardown began (so
a terminated client fails the suite instead of crashing the worker). The `57P01` admin_shutdown the
forced drop itself can cause on a not-yet-exited backend is ignored; `pg.test.ts` pins both sides.

Isolation is per database, not per schema, because drizzle-kit writes `"public"."table"` in foreign
keys and `CREATE TYPE "public"."enum"`, which `search_path` cannot redirect (`migrations.test.ts`
runs two such migrations concurrently against `fixtures/migrations/`).

Migrations are tolerated as absent only while the `drizzle/` directory does not exist (before the
first migration). Once it exists, a missing `meta/_journal.json` or a failing migration fails the
spec, locally and in CI. Never use a shared persistent database and never put real credentials in a
spec.

`harness.test.ts` is the seed: two pool clients get different `pg_backend_pid()` values, and a
`select … for update` in one client blocks the other until the first commits.
