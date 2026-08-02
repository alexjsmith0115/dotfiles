#!/bin/sh
input=$(cat)
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // ""')
model=$(echo "$input" | jq -r '.model.display_name // ""')
effort=$(echo "$input" | jq -r '.effort.level // empty')
used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
total_tokens=$(echo "$input" | jq -r '((.context_window.total_input_tokens // 0) + (.context_window.total_output_tokens // 0))')
window_size=$(echo "$input" | jq -r '.context_window.context_window_size // empty')

branch=$(git --no-optional-locks -C "$cwd" branch --show-current 2>/dev/null)

fmt_tokens() {
  n=$1
  if [ "$n" -ge 1000 ]; then
    awk -v n="$n" 'BEGIN { printf "%.1fk", n/1000 }'
  else
    printf "%s" "$n"
  fi
}

out=""
[ -n "$branch" ] && out="\033[32m$branch\033[0m  "
out="$out\033[33m$model\033[0m"
[ -n "$effort" ] && out="$out \033[36m($effort)\033[0m"

if [ -n "$used_pct" ] && [ -n "$window_size" ]; then
  tok_fmt=$(fmt_tokens "$total_tokens")
  win_fmt=$(fmt_tokens "$window_size")
  out="$out  ctx: $used_pct% ($tok_fmt/$win_fmt)"
fi

printf "%b" "$out"
