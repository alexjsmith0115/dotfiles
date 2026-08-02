#!/usr/bin/env bash
# PreToolUse hook: blocks git commit if CHANGELOG.md is not staged.
# Reads tool input JSON from stdin.

set -euo pipefail

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

# Only act on git commit commands
if ! echo "$CMD" | grep -q 'git commit'; then
  exit 0
fi

# Skip amend commits — changelog was already in a prior commit
if echo "$CMD" | grep -q '\-\-amend'; then
  exit 0
fi

# Check if CHANGELOG.md is staged
if git diff --cached --name-only 2>/dev/null | grep -q '^CHANGELOG.md$'; then
  # CHANGELOG.md is staged — allow
  exit 0
fi

# Check if CHANGELOG.md was modified but not staged
if git diff --name-only 2>/dev/null | grep -q '^CHANGELOG.md$'; then
  echo '{"decision":"block","reason":"CHANGELOG.md has been modified but is NOT staged. Stage it with `git add CHANGELOG.md` before committing."}'
  exit 0
fi

# CHANGELOG.md is neither staged nor modified — block
echo '{"decision":"block","reason":"CHANGELOG.md has not been updated. Before committing: update CHANGELOG.md with a summary of your changes under the [Unreleased] section, then stage it with `git add CHANGELOG.md`."}'
