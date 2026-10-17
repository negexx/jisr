---
name: plan
description: Produce an implementation plan before touching code. Required for any change spanning 3+ files or introducing new architecture.
argument-hint: "<feature or task description>"
model: claude-opus-5-5
effort: medium
---

# /plan — Implementation planning

You are about to plan work on **Jisrr**. The user's intent: `$ARGUMENTS`

Produce a plan, not code. The plan should be the kind of thing a competent teammate could pick up and execute without re-asking the same questions.

## Output format

```markdown
## Goal
<one sentence — what changes after this is done>

## Context I checked
- <files/folders you read, with a one-line takeaway>
- <relevant existing patterns to follow>
- <the relevant part of docs/product/jisr_mvp.md>
- <related ADRs in .claude/docs/decisions/>

## Approach
<2-3 paragraphs explaining the strategy and why this over alternatives>

## Steps
1. <concrete step, file paths included>
2. <next step>
...

## Tests
- <what to assert, and where the test lives>

## Risks / Open questions
- <anything you're unsure about — flag for the user>
```

## Rules

- Read before planning. Don't propose changes to files you haven't read.
- Match existing patterns. If a similar feature already exists, copy its shape.
- No yak shaving — only touch what the task requires. Check the plan stays inside MVP scope (FR/DE/NL × CS/Engineering/Business; see "Don't" in CLAUDE.md).
- For DB schema changes, auth, or anything touching personal data (profile grades, nationality) — call out review needed and the GDPR angle.
- For anything that shows university/scholarship facts, state where `source_url`, `info_kind` and `last_verified_at` come from.
- For UI, state how it behaves in `ar` (RTL) as well as `fr`/`en`.
- End with a one-line "ready to execute?" and stop. Don't start coding.

## When to use this model

This command runs on Opus 5.5 at medium effort — it's the right tier for planning and architecture work, handling both straightforward and complex scenarios with consistent quality.

If the plan additionally involves:
- Architectural decisions (new layer, new service, schema rewrite)
- Security-sensitive paths (auth, personal data)
- Ambiguity the user hasn't resolved

…flag that explicitly in the "Risks / Open questions" section so the user knows this plan involved significant reasoning at the architectural tier.
