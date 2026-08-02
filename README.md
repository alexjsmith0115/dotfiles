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
| (cloned) | `~/.config/nvim` | own fork of kickstart.nvim, `install.sh` clones it |
| `config/ranger` | `~/.config/ranger` | |
| `claude/` | `~/.claude/{settings.json,CLAUDE.md,hooks,scripts,skills,statusline-command.sh}` | authored config only; sessions, projects, and caches stay machine-local |
| `iterm2/com.googlecode.iterm2.plist` | read directly by iTerm2 | `install.sh` sets `LoadPrefsFromCustomFolder`, so iTerm2 saves changes back into this repo |
| `Brewfile` | | `brew bundle` restores formulae and casks |

## Not in here (on purpose)

- `~/.ssh` keys, `~/.aws`, gcloud and gh credentials - copy or re-auth per machine.
- Custom CLIs installed outside brew: `treehouse`, `no-mistakes`, `claude` live in
  `~/.local/bin`; `gh-axi`, `chrome-devtools-axi`, `lavish-axi` are project-local.
  Install those from their own sources.
- Everything under `~/.claude` that is state: `projects/`, `sessions/`, `history.jsonl`,
  `plugins/`, caches.

## Caveats

- `claude/settings.json` has one absolute path (`/Users/alex/.claude/hooks/herdr-agent-state.sh`)
  in the `SessionStart` hook. Fix it if the username differs on the new machine.
- Claude Code writes to `settings.json`; if a future version replaces the file instead of
  editing in place the symlink is broken and you get an untracked real file. Check
  `ls -l ~/.claude/settings.json` if changes stop showing up in `git status`.

## Keeping it current

Files are symlinks, so edits land in the repo directly. After a `brew install`, refresh
the manifest:

```sh
brew bundle dump --file=~/dotfiles/Brewfile --force
```
