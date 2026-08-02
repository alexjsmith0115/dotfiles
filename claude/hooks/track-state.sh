#!/bin/sh
# Writes agent state (working/waiting/done) for this session, read by statusline-command.sh.
state="$1"
mkdir -p ~/.claude/state
sid=$(cat | jq -r '.session_id // "unknown"')
echo "$state" > ~/.claude/state/"$sid".state
