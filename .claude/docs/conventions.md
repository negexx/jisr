# Conventions — Jisrr

> The rules an agent should match before introducing new patterns. If something here is wrong or outdated, fix the doc — don't quietly diverge in code.

## Code style

- Match the linter/formatter (Biome). It's the source of truth for style.
- Files end with a newline. No trailing whitespace.
- One concept per file. If a file does two unrelated things, split it.

## Naming

- Files: `kebab-case.ts` / `kebab-case.tsx` (Next.js file conventions like `page.tsx`, `layout.tsx`, `route.ts` as required)
- React components: `PascalCase`; component files stay kebab-case (`source-badge.tsx` exports `SourceBadge`)
- Functions/variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE` only for true constants (not config you might tweak)
- Types: `PascalCase`, prefer `type` over `interface` for data shapes
- DB: tables and columns `snake_case` (plural table names); Drizzle exports use `camelCase` fields mapped to those columns
- i18n keys: dot-namespaced, lower camelCase segments (`matches.card.status.satisfied`)

## TypeScript

- `strict: true` is the floor, not the ceiling
- No `any`. No `@ts-ignore`. No non-null `!`. If the type is wrong, fix the type.
- Prefer `unknown` + a type guard (or a Zod parse) over `any`
- Derive types from Zod schemas (`z.infer`) and Drizzle tables (`$inferSelect`) instead of re-declaring them
- Discriminated unions for state machines (e.g. match status)

## Imports

- Group: builtins → external → internal (`@/…`) → relative — separated by blank lines
- Use the `@/*` alias for anything under `src/`; no deep relative imports (`../../../`)
- Locale-aware navigation only from `@/i18n/navigation`

## Errors

- Throw `Error` subclasses, not strings
- Catch narrowly. `try` blocks should wrap the smallest unit that can actually fail
- Never swallow errors silently — log (without personal data) or rethrow
- Server Actions return typed results (`{ ok: true, … } | { ok: false, error }`) for expected failures; throw only for bugs

## Domain vocabulary

- **info kind:** `official` (published requirement), `estimate` (our cost range), `guidance` (general advice)
- **match status:** `satisfied` ✅, `check` ⚠️, `not_satisfied` ❌ — see `rules/matching-domain.md`
- **program:** a specific Bachelor's degree at a university; **university** is the institution
- **saved program:** a program a student saved; owns a checklist

## Tests

- One assertion idea per test (multiple `expect()` calls are fine if they test the same idea)
- Test names describe behavior, not implementation: `it("marks Bac Sciences Maths as satisfied for CS")` not `it("checks bac")`
- Matching/cost/checklist logic: table-driven tests written first
- Use real dependencies where cheap; mock only at the boundary (network, clock)
- Playwright e2e covers the core journey: profile → matches → program → save → plan, in `fr` and `ar`

## Commits

Conventional Commits:
- `feat:` new user-visible behavior
- `fix:` bug fix
- `chore:` housekeeping (deps, config)
- `refactor:` no behavior change
- `docs:` documentation only
- `test:` test-only changes

Subject ≤72 chars, imperative ("add" not "added"), no trailing period.

## Comments

Default: no comments. Names and types should carry the meaning.

Write a comment when:
- There's a non-obvious *why* (constraint, workaround, surprising invariant)
- The code does something that would look like a bug to a careful reader

Don't write a comment for:
- What the code does (the code does it)
- Who added it or why (`git blame` does that)
- Future plans ("TODO: refactor this later")
