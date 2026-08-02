#!/usr/bin/env bash
# macOS system preferences, captured from the source machine on 2026-08-02.
# Only settings that deviate from Apple's stock values are listed, so this stays
# readable and a stock setting never gets silently re-asserted.
# Run standalone (`~/dotfiles/macos/defaults.sh`) or via install.sh.
set -euo pipefail

echo "==> keyboard"
# Key repeat, faster than the System Settings slider minimum.
# Stock: KeyRepeat 6, InitialKeyRepeat 68. Lower is faster.
defaults write NSGlobalDomain KeyRepeat -int 2           # repeat rate once repeating
defaults write NSGlobalDomain InitialKeyRepeat -int 15   # delay before repeat starts
defaults write NSGlobalDomain "com.apple.keyboard.fnState" -bool true  # F-keys act as F1-F12

echo "==> text input"
defaults write NSGlobalDomain NSAutomaticCapitalizationEnabled -bool true
defaults write NSGlobalDomain NSAutomaticPeriodSubstitutionEnabled -bool true

echo "==> finder"
defaults write NSGlobalDomain AppleShowAllExtensions -bool true
defaults write com.apple.finder FXPreferredViewStyle -string "Nlsv"   # list view
defaults write com.apple.finder ShowPathbar -bool true
defaults write com.apple.finder FXDefaultSearchScope -string "SCev"   # search this Mac
defaults write com.apple.finder NewWindowTarget -string "PfAF"        # open in All My Files

echo "==> dock"
defaults write com.apple.dock autohide -bool true
defaults write com.apple.dock tilesize -int 72

echo "==> screenshots"
defaults write com.apple.screencapture target -string "file"

echo "==> restarting affected apps"
killall Finder Dock SystemUIServer 2>/dev/null || true

cat <<'MSG'

Applied. Keyboard repeat changes need a logout/login to take effect everywhere.
MSG
