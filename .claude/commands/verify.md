---
name: verify
description: Run the project's verification gate (typecheck + tests + lint) and report results. Required before claiming work is complete.
argument-hint: "[--ui to also smoke-test the UI in a browser]"
---

# /verify — Pre-completion gate

Run the standard verification commands for **Jisrr** and report results honestly.

## Commands to run (in this order)

1. **Typecheck:** `pnpm typecheck`
2. **Tests:** `pnpm test`
3. **Lint:** `pnpm lint`

Run them sequentially — a typecheck failure usually invalidates the test results, so don't waste time running tests if step 1 fails. Report each one's exit status before moving on.

If `--ui` is passed and the project has a dev server:

4. **UI smoke:** `pnpm dev` in the background, then visit the affected route in **both `/fr` (LTR) and `/ar` (RTL)**, verify the golden path works and layout doesn't break under RTL, then kill the server. If a Playwright spec covers the route, also run `pnpm test:e2e`.

## Output format

```
✓ Typecheck — passed (12s)
✓ Tests   — 47 passed, 0 failed (8s)
✗ Lint    — 3 errors in src/foo.ts
   <paste relevant snippets>

Next: fix lint errors before claiming this task done.
```

## Rules

- Don't paper over failures. A red is a red.
- Don't claim "passed" without showing the output. Evidence before assertions.
- If a test was flaky, investigate root cause — don't retry until green.
- For UI work, type-check passing is not enough. The feature must work in a browser.

## When verification fails

Surface the actual error verbatim. Don't summarize away the useful detail. The user needs the real output to debug.

## One more gate after this passes

Passing `/verify` means the code works — it doesn't mean the task is done. Every task also needs a review before it's marked complete: the `reviewer` subagent (Sonnet 5.5, high), or `reviewer-complex` (Opus 5.5, medium) for high-complexity work; `/ship` runs that automatically, but if you're not shipping yet, dispatch it yourself.
