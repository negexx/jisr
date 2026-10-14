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

Use `describeRace` and `createRaceSchema` from `./pg`. `createRaceSchema()` creates a fresh
`race_<random>` schema, runs the `drizzle/` migrations into it (tolerating their absence until the
first migration exists) and hands out pools whose connections all have that schema as `search_path`.
Call `race.drop()` in `afterAll`. Never use a shared persistent database and never put real
credentials in a spec.

`harness.test.ts` is the seed: two pool clients get different `pg_backend_pid()` values, and a
`select … for update` in one client blocks the other until the first commits.
