# Jisr

> Project memory for Claude Code. Loaded automatically into every session.
> Keep this file under ~200 lines — it's always in context.

## What this project is

Jisr is a free, non-commercial web app that helps Moroccan high-school graduates (Bac holders, Bachelor's level) find realistic university options in Europe and understand how to get there. It is not a directory: it runs one journey, **student profile → realistic options → costs → scholarships → application steps**, answering: where can I study, can I apply, how much will it cost, what do I need to do.

Built and run by one developer, closed source for now, but designed to scale in traffic (spiky, near-zero marginal cost), in data (more origin countries, destinations, fields) and later in people. Release 1 scope: **France, Germany, Netherlands** × **Computer Science, Engineering, Business/Economics**; pages Home, Create Profile, My Matches, University/Program, Scholarships, Compare, My Application Plan. Spec: `docs/product/jisr_mvp.md` — read it before designing a feature. Growth happens by adding data, not code.

Trust is the product: every important fact carries an **official source URL** and a **last-verified date**, and the UI distinguishes *official requirement* vs *estimated cost* vs *general guidance*. Languages: English, French, Modern Standard Arabic (RTL). No Darija.

## Stack

- **Language:** TypeScript (strict), Node.js LTS
- **Framework:** Next.js 16 App Router + React 19 (Turbopack, `proxy.ts` not `middleware.ts`), single app, no monorepo
- **Styling/UI:** Tailwind CSS v4 + shadcn/ui (Radix); RTL-safe logical properties
- **i18n:** next-intl — `fr` (default), `en`, `ar`
- **Reference data:** YAML in `data/`, Zod-validated, published as immutable JSON snapshots (ADR 0003)
- **User data:** Neon serverless Postgres (EU) + Drizzle ORM / drizzle-kit — users only, never reference data
- **Auth:** Better Auth (Drizzle adapter, Google + magic link), phase 2 after the guest journey; users live in our DB
- **Validation:** Zod at every input boundary and for all data files (server, build and test side; client code uses hand-written validators)
- **Tests:** Vitest (jsdom per file for components) + Playwright e2e with axe (phone and desktop, fr and ar)
- **Lint/format:** Biome
- **Package manager:** pnpm
- **Hosting:** Vercel Hobby (fra1; free, non-commercial, hard caps pause the site rather than bill) + Neon; no Vercel-only services; budgets and exit trigger in ADR 0004
- **Analytics:** GoatCounter (EU, cookieless, free non-commercial) — no consent banner
- **Errors:** Sentry Developer plan, EU region, PII scrubbed, tracing off

## How to run things

| Task | Command |
|------|---------|
| Install deps | `pnpm install` |
| Dev server | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Test | `pnpm test` |
| Lint (incl. domain import boundary) | `pnpm lint` |
| Format | `pnpm format` |
| Build | `pnpm build` |
| Validate data + staleness report | `pnpm data:check` |
| Build data snapshots | `pnpm data:build` |
| French BUT calendar proposals / verify a scholarship proposal (`data/README.md`) | `pnpm data:fr-calendar [--dry-run]` / `pnpm data:scholarship verify <file> [--dry-run]` |
| E2E (builds the fixture, starts `next start` on :3100) | `pnpm test:e2e` |
| Fixture build / dev server on the synthetic e2e data | `pnpm build:e2e` / `pnpm dev:fixture` |
| First-load JS per route (gzip) + Zod marker scan, after a build | `pnpm perf:js` |
| Generate / apply DB migration | `pnpm db:generate` / `pnpm db:migrate` |

Scripts live in `package.json` (`typecheck` = `next typegen && tsc --noEmit`, `test` = `vitest run`, `lint` = `biome check .`, `format` = `biome format --write .`). Greenfield: if a script is missing, add it in the first setup task rather than substituting another command. `pnpm build` must run `data:check` and `data:build` first. `build:e2e` and `dev:fixture` overwrite `public/snapshots` and `.next` with the synthetic fixture: run `pnpm data:build` (or a real `pnpm build`) afterwards. CI (`.github/workflows/ci.yml`, GitHub Actions, Node 24, pnpm from `packageManager`) runs typecheck, lint, test, data:check, build and `perf:js` (Zod backstop) on every pull request and on pushes to `main`, plus an `e2e` job (unverified until its first run); a PR is not done until it is green.

## Architecture at a glance

```
data/                    curated YAML: institutions/programs, routes (origin→destination), costs, scholarships
content/<locale>/        long-form guides (MDX) with the same provenance frontmatter
src/data-schema/         Zod schemas shared by scripts, domain, tests
scripts/data/            check, build snapshots + manifest, source-change watcher
src/domain/              PURE TS: eligibility routes, matching (✅ ⚠️ ❌), costs, checklist — no React/Next/DB/fs/network
src/lib/snapshot/        browser client (manifest, shards, integrity, version pinning), hook, plans (incl. `shardsForPlan`), `server.ts` (server-only build-time reader)
src/lib/{profile,saved,plan,journey,i18n}/  guest profile store + form model; saved list (`jisr.saved`) and ticked steps (`jisr.plan`) on `local-store.ts`; view models (matches, plan, compare + selection rules, reasons, page facts); domain vocabulary + `pickMessages`
src/lib/format.ts clock.ts constants.ts guards.ts  Intl formatting, browser date, zod-free constants/guards
src/app/[locale]/        pages: profile/ matches/ programs/[slug]/ plan/ compare/ (built, with Save on cards and program pages); scholarships/ (M4)
src/app/global-not-found.tsx  the one trilingual 404 (ADR 0006)
src/app/api/auth/[...all]/  Better Auth handler (phase 2)
src/proxy.ts             next-intl locale routing
src/components/          ui/ (shadcn), shell, trust primitives (SourceBadge, MatchStatusBadge…), MatchCard/CostBreakdown/ReasonList, SaveProgramButton, profile/ matches/ program/ plan/ compare/
src/lib/auth/  src/db/   Better Auth instances; Drizzle schema for user data only
src/i18n/  messages/     next-intl config; en/fr/ar messages
tests/                   Vitest specs mirror src/; tests/e2e/ Playwright; tests/fixtures/ synthetic data (xx-test-*)
scripts/                 data/, e2e/ (fixture build), perf/ (first-load JS)
```

Data flow: YAML → `data:check` → `data:build` → snapshots on the CDN → the browser runs `src/domain` on the snapshot → results. Guest profile, saved list and ticked steps live in localStorage (`jisr.profile`, `jisr.saved`, `jisr.plan`; Clear my data empties them all); accounts (phase 2) persist profile, saved programs, checklist progress and feedback in Postgres, referencing program slug + snapshot version. Eligibility is origin-agnostic: `(origin credential country, type) → (destination, level)` routes first, program rules second; Morocco/Bac is only the first origin.

Resolved in ADR 0004: analytics, error reporting, staleness thresholds, translation storage, privacy/CNDP plan, Vercel limits. What remains is the ADR's "Before launch" checklist (verify Vercel/Sentry limits, CNDP declaration before accounts, privacy notice).

Deeper notes: `.claude/docs/architecture.md` (data access boundary, no-Zod rule, JS size). Decisions: `.claude/docs/decisions/` (0002 stack, 0003 scalable solo architecture, 0004 operations/privacy/freshness, 0005 domain semantics and data rules, 0006 static program pages and 404 routing, 0007 client JS budget, superseded by 0008: exceeding 150 KB is accepted, the ratchet in `tests/e2e/support/js-budget.ts` is the regression guard; 0009 recurring deadlines).

## Conventions

- Match existing patterns before introducing new ones. Latest stable packages, no pinning unless required.
- Named exports over default exports (Next.js file conventions like `page.tsx` excepted).
- No `any`, no `@ts-ignore`, no non-null `!` — fix the type.
- Server Components by default; `"use client"` only for state/effects/browser APIs.
- `src/domain` imports nothing from React, Next, `src/db`, `src/lib`, `fs` or the network (Biome `noRestrictedImports` override); time is passed in as an argument.
- Zod-validate every Server Action, route handler, form input and data file; re-check the session inside each action.
- Migrations only via drizzle-kit; never `drizzle-kit push` against a shared database.
- Money = integer minor units + ISO currency code; estimates are `{min, max}` ranges, never a single promised number.
- Every fact in `data/` has `source_url`, `info_kind` (`official | estimate | guidance`) and `last_verified_at`; the build fails without them.
- Staleness (ADR 0004; constants in `src/data-schema/staleness.ts`): volatile facts (deadlines, fees, scholarship amounts) are aging at 120 days, stale at 270; stable facts (requirements, routes, cost estimates, descriptions) aging 270, stale 545. Stale data never yields ✅ or ❌, only ⚠️.
- Short text is a `LocalizedText` map (`fr` required, `en`/`ar` optional, per-locale `draft|reviewed` status); long-form guides are MDX in `content/<locale>/`.
- A scholarship may name `institutions` (absent/empty = no restriction). Matching: nationality, explicit program link, then destination, fields, institutions, in `src/domain/scholarships.ts`; the static program page (`src/lib/snapshot/server.ts`) shares its `appliesToProgram` predicate. Scholarships are Bachelor-level, verified-only (`data:scholarship`) and always 100% audited (never waivable).
- Match status: ✅ only if every published requirement was evaluated and passed; ❌ only for a definite published-requirement failure; missing/ambiguous data → ⚠️.
- All user-facing strings go through next-intl in all three locales; Tailwind logical utilities (`ms-`, `pe-`, `text-start`) — never `ml-`/`pr-`/`left-`.
- Dates: ISO 8601 in code/data, DD/MM/YYYY in UI. Currency: EUR primary, MAD secondary display.
- GDPR (and Moroccan Law 09-08): minimise personal data, never log grades/nationality, support account deletion + export.
- Displayed ICU arguments are preformatted strings (`formatNumber`, `formatMoney`); numbers are only plural/select selectors, so `ar` keeps Latin digits.
- Client-reachable code imports no Zod and nothing from `@/data-schema` except types and `dates`/`staleness`; use the hand-written validators (differential tests) in `src/lib`. `tests/lib/client-imports.test.ts` enforces it; details in architecture.md.
- Route wording comes from `routeKeyOf`; `MatchStatusBadge` is the only place a match group maps to icon, colour and text. Stale estimate/guidance wording never says "official".
- Program pages import `server-only` and keep `dynamicParams = false` (inherited from the `[locale]` layout). Anything that depends on the clock or the profile is a client leaf with a neutral server placeholder.
- A deadline a source states without a year is stored as `recurringDeadline` (month, day) and shown as "usually" guidance, never as an upcoming date or a guessed year; any new deadline needs an accepted quote that says it applies to international applicants (ADR 0009).
- Arabic: الإجازة for the Bachelor's degree, العلامة for a grade. All `ar` copy is a machine draft until the native review.
- Agents never amend another agent's commit (check `git log -1` before `--amend`); stage by explicit path.
- Conventional commits: `feat: fix: chore: refactor: docs: test:`.

Path-scoped rules in `.claude/rules/` load when you read matching files. Full list: `.claude/docs/conventions.md`.

## Model dispatch

Pick the tier that matches the task's complexity, not the biggest model available.

| Task | Model | Effort |
|------|-------|--------|
| Trivial — search, read, copy, simple lookups | Haiku 4.5 | — |
| Implementation — basic to medium complexity (DEFAULT) | Sonnet 5.5 | high |
| In-depth planning, architecture, highly complex implementation | Opus 5.5 | medium |
| Review — every completed task, before it's marked done | Opus 5.5 (mandatory, not an escalation) | medium |

**Escalate** Sonnet 5.5 → Opus 5.5 when: the task is architectural, security-critical, the approach is genuinely unclear, or a wrong call here is expensive to undo.

**Downgrade** back to Sonnet 5.5 once the approach is settled and the remaining work is mechanical.

**Review is not optional.** Every task — regardless of which model implemented it — goes through an Opus 5.5 review (the `reviewer` subagent) at medium effort before it's marked done.

Never drive a main session on Haiku 4.5. Never skip the Opus 5.5 review step to save time.

## Available agents

- **`researcher`** (Haiku 4.5): "where does X happen?" / "how does library Y work?" — fast lookups before planning
- **`planner`** (Opus 5.5, medium): implementation plans with strategy, trade-offs, risks — complex features, architecture, multi-file coordination
- **`implementer`** (Sonnet 5.5, high): executes a written plan once strategy is settled
- **`reviewer`** (Opus 5.5, medium): reviews changes for correctness, security, conventions before shipping

## Skills — when to invoke

Invoke the skill BEFORE acting. A ≥1% chance it applies means you MUST invoke it.

**Process skills — change HOW you work:**

| Situation | Skill |
|---|---|
| Bug / test failure / unexpected behavior | `superpowers:systematic-debugging` |
| New feature or creative work — before any code | `superpowers:brainstorming` |
| Multi-file task (feature, refactor, migration) | `superpowers:writing-plans` |
| Non-trivial logic (eligibility, matching, costs, checklist rules) | `superpowers:test-driven-development` |
| Plan with multiple independent tasks | `superpowers:subagent-driven-development` |
| 2+ tasks with no shared state | `superpowers:dispatching-parallel-agents` |
| Before claiming done / before commit or PR | `superpowers:verification-before-completion` |
| Feature branch implementation complete | `superpowers:finishing-a-development-branch` |

**Domain skills:**

| Situation | Skill |
|---|---|
| Any frontend component, page, form, layout or UI review (incl. RTL/`ar` and mobile) | `impeccable:impeccable` |
| Hard architectural or tradeoff decision | `llm-council` |

**Library docs:** before writing against a library API (Next 16, Drizzle, Better Auth, next-intl, shadcn, Biome), use the `ctx7` CLI, not training data: `npx ctx7@latest library "<name>" "<query>"`, then `npx ctx7@latest docs <libraryId> "<query>"`. Pin the major version in the ID when known (e.g. `/vercel/next.js/v16.2.9`). In Git Bash prefix with `MSYS_NO_PATHCONV=1` so the leading `/` in the ID isn't rewritten as a Windows path.

## Code discovery (codebase-memory)

This repo is indexed in the `codebase-memory-mcp` knowledge graph as project `jisr` (skill: `codebase-memory`; `.claude`, `.git`, `.next`, `.superpowers`, `node_modules` and `public/snapshots` are excluded). For code questions use the graph first: `search_graph(project="jisr", query|name_pattern=…)` to find symbols, `trace_path(function_name=…, direction="both")` for callers/callees (exact names: search first), `get_code_snippet` for a symbol's source, `get_architecture` for structure, `detect_changes` to map a diff to affected symbols. Use Grep/Read for text, config, YAML data, ADRs and docs (the graph indexes code, not prose). Re-index after substantial changes with `index_repository(repo_path="C:/Users/dagda/Downloads/nex/UniWay", name="jisr")`; never pass `persistence: true` (it writes an artifact into the repo). The graph can be stale between re-indexes: verify by reading the file before editing.

## What "done" means

1. `pnpm typecheck` passes
2. `pnpm test` passes
3. `pnpm lint` passes (and `pnpm data:check` if `data/` changed)
4. New behavior has a test (TDD for domain logic)
5. UI changes: verified in a browser in **both `fr` (LTR) and `ar` (RTL)**, not just type-checked
6. Reviewed by the `reviewer` subagent (Opus 5.5) — no task is marked done without this

## Don't

- Don't commit `.env*` files (except `.env.example`) or push to `main` directly — PRs only
- Don't add dependencies without justifying them in the commit message
- Don't display any fact without its source and last-verified date; don't present estimates or guidance as official requirements
- Don't invent university, tuition, deadline, route or scholarship data — every value must trace to an official URL
- Don't put reference data in Postgres, and don't put DB/network/framework code in `src/domain`
- Don't build what ADR 0003 lists as deliberately not built (admin app, worker/queue, search engine, B2B, payments, WhatsApp API, monorepo, student-facing AI, native apps) without a new ADR
- Don't add countries/fields beyond Release 1 by writing code — add data; propose a plan first if the model can't express it
- Don't set cookies, record IPs or send profile data to analytics or Sentry; Sentry stays scrubbed with tracing off
- Don't accept donations, sponsorship or ads before checking Vercel Hobby's non-commercial terms (ADR 0004)
- Don't launch accounts before the CNDP declaration and en/fr/ar privacy notice (ADR 0004)
- Don't hand-edit generated Better Auth tables, applied migrations, or built snapshots
- Don't log profile data (grades, nationality) or session tokens

## External references

- Product spec: `docs/product/jisr_mvp.md` (its "French/Darija-friendly" line is superseded: English, French and Modern Standard Arabic only)
- Next.js 16 docs: https://nextjs.org/docs · next-intl: https://next-intl.dev · Better Auth: https://better-auth.com/docs · Drizzle: https://orm.drizzle.team · Neon: https://neon.com/docs

---

*This file is the project's persistent memory. Keep it accurate. Stale instructions are worse than missing ones.*
