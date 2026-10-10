# Jisr — opencode agent manual

This is the opencode entry point for **Jisr**. The full operating manual is `.claude/CLAUDE.md`, loaded as an opencode instruction together with `.claude/docs/conventions.md` (see `opencode.json`). Read this file for the opencode-specific policy; read `.claude/CLAUDE.md` for the workflow itself.

## Model policy

**Every agent and every tier runs on `opencode-go/deepseek-v4.1-flash`** — the four workflow agents, the oh-my-openagent orchestration agents, the built-ins, and the title/summary/compaction helpers. Where `.claude/CLAUDE.md`'s "Model dispatch" table names Claude models (Haiku / Sonnet / Opus), substitute `opencode-go/deepseek-v4.1-flash`. The pins live in three places:

- `opencode.json` (this project): the default `model` / `small_model`, plus the `agent` block for `researcher`, `planner`, `implementer`, `reviewer`.
- `~/.omo/omo.jsonc` (the oh-my-openagent plugin): every orchestration agent (`sisyphus`, `prometheus`, `atlas`, `hephaestus`, `oracle`, `explore`, `librarian`, `metis`, `momus`, `multimodal-looker`, `sisyphus-junior`, `build`, `plan`) and every task category (`quick`, `deep-low`, `deep-high`, `ultrabrain`, `unspecified-low`, `unspecified-high`, `visual-engineering`, `artistry`, `writing`).
- Subagents that name no model inherit the primary agent's model, which is also deepseek-v4.1-flash.

## Agents

Four workflow agents, defined by `.claude/agents/*.md` and model-pinned in `opencode.json`:

| Agent | Role |
|---|---|
| `researcher` | Focused lookups ("where does X live", "how does library Y work") before planning. |
| `planner` | Implementation plans: strategy, trade-offs, risks, steps — no code. |
| `implementer` | Executes a written plan; no re-planning, no scope creep. |
| `reviewer` | Reviews a diff for correctness, trust/data integrity, security, conventions. |

The `oh-my-openagent` plugin provides the orchestration agents (`oracle`, `explore`, `librarian`, `metis`, `momus`, `multimodal-looker`, `sisyphus`, `prometheus`, `atlas`, …); they are all model-pinned to deepseek-v4.1-flash in `~/.omo/omo.jsonc`, not re-modelled here.

## What Jisr is

A free, non-commercial, trilingual (fr/en/ar RTL) web app that turns a Moroccan Bac graduate's profile into realistic, costed European Bachelor's options. One journey: profile → matches → costs → scholarships → application plan. Trust is the product: every fact carries an official source and a last-verified date. Release 1: France, Germany, the Netherlands, Hungary, Italy × Computer Science / Engineering / Business-Economics.

## Stack and commands

TypeScript (strict), Next.js 16 App Router + React 19, Tailwind v4, next-intl, Zod (server/build only), Vitest + Playwright, Biome, pnpm.

| Task | Command |
|---|---|
| Dev server | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Test | `pnpm test` |
| Lint (incl. domain import boundary) | `pnpm lint` |
| Build (runs data:check + data:build first) | `pnpm build` |
| Validate data | `pnpm data:check` |
| E2E (fixture build, `next start` on :3100) | `pnpm test:e2e` |
| First-load JS + Zod backstop | `pnpm perf:js` |

## Conventions, done, and don'ts

Full detail in `.claude/docs/conventions.md` and `.claude/CLAUDE.md`. The load-bearing rules:

- `src/domain` is pure TypeScript (no React/Next/DB/fs/network; time passed in). Match status ✅/⚠️/❌ never rounds an unknown up.
- Client-reachable code imports no Zod and nothing from `@/data-schema` except types and `dates`/`staleness` (`tests/lib/client-imports.test.ts` enforces it).
- Every fact in `data/` has `source_url`, `info_kind` and `last_verified_at`; never invent data; missing/stale → ⚠️.
- All user-facing strings go through next-intl in all three locales; Tailwind logical utilities only.
- "Done" = `pnpm typecheck`, `pnpm test`, `pnpm lint` green (and `pnpm data:check` if `data/` changed); UI verified in fr and ar.
- Don't commit `.env*`, don't push to `main` directly, don't add dependencies without justifying them, don't build what ADR 0003 lists as deliberately not built.

## Workflow (mirrors `.claude/CLAUDE.md` 1:1)

The CLAUDE.md workflow is loaded verbatim through `instructions`; run it as written, with one substitution — every model is `opencode-go/deepseek-v4.1-flash`.

- Tiers: trivial → implementation → planning → review all use deepseek-v4.1-flash (no model escalation, never drive the session on a smaller model).
- Delegation order: `researcher` → `planner` → `implementer` → `reviewer` (all deepseek-v4.1-flash).
- Process skills: **Superpowers is installed** (plugin `superpowers@git+https://github.com/obra/superpowers.git`, registered in `~/.config/opencode/opencode.jsonc`). Its skills load under their bare names: `brainstorming`, `writing-plans`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `subagent-driven-development`, `executing-plans`, `dispatching-parallel-agents`, `requesting-code-review`, `receiving-code-review`, `using-git-worktrees`, `finishing-a-development-branch`, `writing-skills`, `using-superpowers`, `diagnosing-superpowers`. Where `.claude/CLAUDE.md` writes `superpowers:<name>`, load the opencode skill `<name>`. The plugin also injects the `using-superpowers` bootstrap into every top-level session.

## Skills

opencode auto-loads the project skill `.claude/skills/impeccable/` (frontend/UI work) and, through the Superpowers plugin, the 15 superpowers process skills listed above. Other skills available here: `debugging`, `frontend`, `git-master`, `review-work`, `visual-qa`, `remove-ai-slops`, `security-research`, `playwright`.
