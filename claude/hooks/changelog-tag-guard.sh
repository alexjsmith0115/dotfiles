#!/usr/bin/env bash
# PreToolUse hook: blocks git tag if CHANGELOG.md doesn't have a matching version section.
# Also blocks if there are uncommitted CHANGELOG.md changes.
# Reads tool input JSON from stdin.

set -euo pipefail

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

# Only act on git tag commands
if ! echo "$CMD" | grep -q 'git tag'; then
  exit 0
fi

# Extract version from tag command (supports v1.2.3 or 1.2.3)
TAG_VERSION=$(echo "$CMD" | grep -oE 'v?[0-9]+\.[0-9]+\.[0-9]+' | head -1 | sed 's/^v//')

if [ -z "$TAG_VERSION" ]; then
  # No version pattern found in tag command — not a release tag, allow
  exit 0
fi

# Check for uncommitted CHANGELOG.md changes
if git diff --name-only 2>/dev/null | grep -q '^CHANGELOG.md$'; then
  echo "{\"decision\":\"block\",\"reason\":\"CHANGELOG.md has uncommitted changes. Commit CHANGELOG.md before tagging v${TAG_VERSION}.\"}"
  exit 0
fi

if git diff --cached --name-only 2>/dev/null | grep -q '^CHANGELOG.md$'; then
  echo "{\"decision\":\"block\",\"reason\":\"CHANGELOG.md is staged but not committed. Commit it before tagging v${TAG_VERSION}.\"}"
  exit 0
fi

# Check if CHANGELOG.md contains a section for this version
if [ -f CHANGELOG.md ] && grep -qF "[${TAG_VERSION}]" CHANGELOG.md; then
  # Version section exists and is committed — allow
  exit 0
fi

echo "{\"decision\":\"block\",\"reason\":\"CHANGELOG.md does not contain a [${TAG_VERSION}] section. Before tagging: 1) Move [Unreleased] entries into a new ## [${TAG_VERSION}] - $(date +%Y-%m-%d) section. 2) Leave [Unreleased] empty. 3) Commit CHANGELOG.md. Then create the tag.\"}"
