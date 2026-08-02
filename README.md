# dotfiles

My terminal setup, portable to any Mac.

## New machine

```sh
git clone git@github.com:alexjsmith0115/dotfiles.git ~/dotfiles
~/dotfiles/install.sh
```

Then restart iTerm2 and open a new shell.

## What is in here

| Path | Links to | Notes |
| --- | --- | --- |
| `home/.zshrc` | `~/.zshrc` | oh-my-zsh + zplug + pure prompt, aliases, `thout` |
| `home/.zprofile` | `~/.zprofile` | brew shellenv, PATH |
| `home/.bash_profile` | `~/.bash_profile` | maestro PATH |
| `home/.gitconfig` | `~/.gitconfig` | user + autocrlf |
| `home/bin/nm-dashboard.mjs` | `~/bin/` | no-mistakes dashboard, `nm-dash` alias |
| `config/nvim` | `~/.config/nvim` | kickstart.nvim, vendored - this repo is the source of truth |
| `config/ranger` | `~/.config/ranger` | |
| `iterm2/com.googlecode.iterm2.plist` | read directly by iTerm2 | `install.sh` sets `LoadPrefsFromCustomFolder`, so iTerm2 saves changes back into this repo |
| `macos/defaults.sh` | | `defaults write` for keyboard repeat, Finder, Dock; run standalone or via `install.sh` |
| `Brewfile` | | `brew bundle` restores formulae and casks |

## Not in here (on purpose)

- `~/.ssh` keys, `~/.aws`, gcloud and gh credentials - copy or re-auth per machine.
  Install those from their own sources.
- Anything under `~/.claude` - Claude Code config is managed separately.

## Capturing a new macOS setting

`macos/defaults.sh` only lists settings that differ from Apple's stock values. To find the
key behind a toggle you just changed in System Settings:

```sh
defaults read > /tmp/before        # before flipping the toggle
defaults read > /tmp/after         # after
diff /tmp/before /tmp/after
```

Then add the corresponding `defaults write` line, with a comment saying what it does.

## Keeping it current

Files are symlinks, so edits land in the repo directly. After a `brew install`, refresh
the manifest:

```sh
brew bundle dump --file=~/dotfiles/Brewfile --force
```
