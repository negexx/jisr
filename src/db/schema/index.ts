// Drizzle schema barrel. Todo 4 generates the Better Auth tables into `auth.ts` and the
// user-data tables into `app.ts`, then re-exports both namespaces here so `src/db/index.ts`
// can hand the whole schema to `drizzle(..., { schema })` and to `drizzleAdapter`.
// It exports nothing yet: this todo only stands up the client and the auth instances, and
// defining any table here (or a migration) is todo 4's job.
export {};
