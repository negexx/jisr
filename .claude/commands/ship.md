---
name: ship
description: Open a PR for the current branch after running verification. Drafts a clean conventional-commit-style PR title and body.
argument-hint: "[--draft]"
---

# /ship — Open a pull request

Ship the current branch as a PR. The user expects this command to do the boring parts (verify, push, draft PR body) so they can review and hit merge.

## Steps

1. **Sanity check** — confirm we're not on `main` and there are commits ahead of `origin/main`. If on `main`, refuse and tell the user to branch first.

2. **Run /verify** — typecheck + tests + lint must all pass. If anything fails, stop and report.

3. **Review** — dispatch the `reviewer` subagent (Opus 5.5 at medium effort) against the full diff. Resolve or explicitly accept every `Critical`/`Important` finding before continuing — a `REQUEST_CHANGES` verdict blocks shipping until addressed.

4. **Push** — `git push -u origin HEAD` (only if branch isn't already tracking remote).

5. **Draft PR title and body** based on the commits between `main` and `HEAD`:
   - Title: conventional-commit style, ≤70 chars
   - Body: Summary (bullets), Test plan (checklist), any flagged risks

6. **Create PR** with `gh pr create` — pass `--draft` if the flag is set.

7. **Report the URL.**

## PR body template

```markdown
## Summary
- <what changed, 1-3 bullets>
- <why>

## Test plan
- [ ] <how to verify>
- [ ] <edge case to check>
- [ ] Checked in `fr` and `ar` (RTL) if UI changed

## Notes
<anything reviewers should pay attention to — schema migrations, env var changes, new/changed reference data and its sources, etc.>
```

## Rules

- Never push directly to `main`.
- Never force-push unless the user asked.
- If verification fails, do NOT push or open the PR — fix first.
- Never skip the Opus 5.5 review step (at medium effort), even under time pressure — it's the mandatory gate, not an optional nicety.
- Include any schema migrations, env var changes, or breaking changes in the Notes section explicitly.
