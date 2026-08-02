#!/usr/bin/env bash
# macOS system preferences, captured from the source machine on 2026-08-02.
# Scope is deliberately narrow: key repeat, Finder, Dock. Nothing else.
# Run standalone (`~/dotfiles/macos/defaults.sh`) or via install.sh.
set -euo pipefail

echo "==> key repeat"
# Faster than the System Settings slider minimum. Lower is faster.
# Stock: KeyRepeat 6, InitialKeyRepeat 68.
defaults write NSGlobalDomain KeyRepeat -int 2           # repeat rate once repeating
defaults write NSGlobalDomain InitialKeyRepeat -int 15   # delay before repeat starts

echo "==> finder"
defaults write NSGlobalDomain AppleShowAllExtensions -bool true
defaults write com.apple.finder FXPreferredViewStyle -string "Nlsv"   # list view
defaults write com.apple.finder ShowPathbar -bool true
defaults write com.apple.finder FXDefaultSearchScope -string "SCev"   # search this Mac
defaults write com.apple.finder NewWindowTarget -string "PfAF"        # open in All My Files

echo "==> dock"
defaults write com.apple.dock autohide -bool true
defaults write com.apple.dock tilesize -int 72

echo "==> restarting Finder and Dock"
killall Finder Dock 2>/dev/null || true

cat <<'MSG'

Applied. Key repeat changes need a logout/login to take effect everywhere.
MSG
