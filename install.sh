#!/usr/bin/env bash
# Bootstrap this machine from the dotfiles repo. Idempotent - safe to rerun.
set -euo pipefail

DOTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

link() {
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$dst")"
  if [[ -L "$dst" ]]; then
    rm "$dst"
  elif [[ -e "$dst" ]]; then
    mv "$dst" "$dst.bak.$(date +%Y%m%d%H%M%S)"
    echo "backed up existing $dst"
  fi
  ln -s "$src" "$dst"
  echo "linked $dst -> $src"
}

# 1. Homebrew
if ! command -v brew >/dev/null 2>&1; then
  echo "==> installing Homebrew"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
eval "$(/opt/homebrew/bin/brew shellenv)"

echo "==> brew bundle"
brew bundle --file="$DOTS/Brewfile"

# 2. oh-my-zsh (zplug and the pure prompt are installed by .zshrc on first shell)
if [[ ! -d "$HOME/.oh-my-zsh" ]]; then
  echo "==> installing oh-my-zsh"
  RUNZSH=no KEEP_ZSHRC=yes sh -c \
    "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
fi

# 3. shell + git dotfiles
for f in .zshrc .zprofile .bash_profile .gitconfig; do
  link "$DOTS/home/$f" "$HOME/$f"
done
link "$DOTS/home/bin/nm-dashboard.mjs" "$HOME/bin/nm-dashboard.mjs"

# 4. XDG config
if [[ ! -e "$HOME/.config/nvim" ]]; then
  echo "==> cloning nvim config"
  git clone https://github.com/alexjsmith0115/kickstart.nvim.git "$HOME/.config/nvim"
fi
link "$DOTS/config/ranger" "$HOME/.config/ranger"

# 5. iTerm2 reads its prefs straight out of the repo, so changes are captured
defaults write com.googlecode.iterm2 PrefsCustomFolder -string "$DOTS/iterm2"
defaults write com.googlecode.iterm2 LoadPrefsFromCustomFolder -bool true
echo "==> iTerm2 pointed at $DOTS/iterm2 (restart iTerm2 to pick it up)"

# 6. global npm packages
echo "==> npm globals"
npm install -g pnpm@9.15.9 corepack @mariozechner/pi-coding-agent

cat <<'MSG'

Done. Remaining manual steps:
  - open a new zsh; zplug will offer to install the pure prompt, answer y
  - authenticate: gh auth login, gcloud auth login, claude (login), codex
  - ssh keys are NOT in this repo - copy ~/.ssh yourself or generate new ones
MSG
