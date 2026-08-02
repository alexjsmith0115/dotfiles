# If you come from bash you might have to change your $PATH.
# export PATH=$HOME/bin:$HOME/.local/bin:/usr/local/bin:$PATH

# Path to your Oh My Zsh installation.
export ZSH=~/.oh-my-zsh
# disable oh-my-zsh themes for pure prompt
ZSH_THEME=""
source $ZSH/oh-my-zsh.sh
export ZPLUG_HOME=$(brew --prefix)/opt/zplug
source $ZPLUG_HOME/init.zsh
zplug "mafredri/zsh-async", from:github
zplug "sindresorhus/pure", use:pure.zsh, from:github, as:theme
zplug load
# Install plugins if there are plugins that have not been installed
if ! zplug check --verbose; then
    printf "Install? [y/N]: "
    if read -q; then
        echo; zplug install
    fi
fi


# Created by `pipx` on 2026-02-21 13:52:18
export PATH="$PATH:/Users/alex/.local/bin"
eval "$(zoxide init zsh)"

alias cc="claude --dangerously-skip-permissions"
alias th="treehouse"
alias nm-dash="PORT=4599 node ~/bin/nm-dashboard.mjs"
export PATH=$PATH:$HOME/.maestro/bin

# Tear down the current worktree's dev environment, return it to the treehouse
# pool, then exit the shell. Extra args pass through to `treehouse return`
# (e.g. `thout --force`). Aborts without returning if teardown fails, since a
# returned-but-not-torn-down worktree leaves its databases and buckets behind.
thout() {
  local root
  root=$(git rev-parse --show-toplevel 2>/dev/null) || {
    print -u2 "thout: not inside a git worktree"
    return 1
  }
  (cd "$root" && pnpm worktree:teardown) || {
    print -u2 "thout: worktree:teardown failed - worktree NOT returned"
    return 1
  }
  cd "$HOME" || return 1
  treehouse return "$root" "$@" || {
    print -u2 "thout: treehouse return failed - still leased at $root"
    return 1
  }
  exit
}
