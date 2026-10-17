# .claude/ — AI Workspace

This directory is the operating manual for AI coding agents (Claude Code, Cursor, Copilot) working on **Jisrr**. Humans can read it too, but it's optimized for agent consumption.

## Layout

| Path | Purpose | Committed? |
|------|---------|------------|
| `CLAUDE.md` | Project memory loaded into every session | yes |
| `settings.json` | Permissions, model defaults, hooks, env | yes |
| `settings.local.json` | Personal per-developer overrides | **no** (gitignored) |
| `commands/` | Project slash commands (`/plan`, `/verify`, `/ship`) | yes |
| `agents/` | Subagent definitions for parallel work | yes |
| `rules/` | Path-scoped instructions, loaded when matching files are read | yes |
| `skills/` | Project-specific skills not worth promoting global | yes |
| `memory/` | Cross-session agent memory | **no** (gitignored, per-developer) |
| `docs/` | Architecture, conventions, ADRs for agents | yes |

The product brief is at `docs/product/jisr_mvp.md` (repo root, not in `.claude/`).

## How to use this workspace

### As a human
- Edit `CLAUDE.md` whenever a project rule changes — that's how Claude learns
- Drop personal preferences (verbose logging, experimental flags) in `settings.local.json`
- Write new ADRs in `docs/decisions/` for non-obvious choices

### As Claude
- Read `CLAUDE.md` first (it's auto-loaded anyway)
- Consult `docs/conventions.md` before introducing new patterns
- Use `/plan` for any change touching 3+ files
- Use `/verify` before claiming a task is done — then get a review (`reviewer`, Sonnet 5.5 high; `reviewer-complex`, Opus 5.5, for high-complexity work) before calling it done
- `settings.json`'s `hooks` key enforces things instructions can't guarantee (e.g. auto-format on save) — check it before assuming a step is optional
- Drop session learnings into `memory/` as memory files

## Conventions for editing this folder

- Keep `CLAUDE.md` under 200 lines — it's always in context
- ADRs are immutable once committed (write a new one to supersede)
- Slash command files use frontmatter: `name`, `description`, `argument-hint`
- Subagents are scoped — one job, clear deliverable, narrow tool allowlist
- Rule globs in `rules/*.md` must be quoted; rules trigger when Claude *reads* a matching file, not when it creates one

## Updating

To re-scaffold or fold in newer template versions, run the `bootstrap-claude-workspace` skill again — it diffs against existing files and asks before overwriting.
