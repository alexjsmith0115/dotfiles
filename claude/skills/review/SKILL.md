---
name: review
description: Structured code review producing prioritized [P0]-[P3] findings. Trigger on requests to review branch diffs, uncommitted changes, PRs, or specific commits.
---

# Code Review

Produce a structured, prioritized code review with actionable findings.

## Arguments

Free-text describing what to review:
- `changes on feature-branch against main`
- `uncommitted changes`
- `last 3 commits`
- `PR #42`

## Workflow

1. **Gather the diff.** Parse the argument to determine the appropriate git command(s). Run them. If ambiguous, ask for clarification.
2. **Read context.** For each changed file, read surrounding code and related files (tests, callers, types) to understand intent and detect regressions.
3. **Review.** Evaluate every hunk against criteria in `references/review-criteria.md`. List ALL qualifying findings — do not stop at the first.
4. **Output.** Format per `references/output-format.md` and print to the TUI.

## Core rules

- Role: reviewer for code written by another engineer.
- Flag only issues the author would fix if made aware.
- Zero findings is valid — do not invent issues.
- Review only — do not generate fixes, open PRs, or push code.
- Ignore trivial style unless it obscures meaning or violates documented standards.
- One finding per distinct issue. Body: one paragraph max.
- `suggestion` blocks: concrete replacement code only, ≤3 lines, preserve exact whitespace.
- Line ranges: shortest span that pinpoints the problem (≤10 lines), must overlap the diff.
