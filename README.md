# Hover Terminal

Make [Terminal](https://github.com/polyipseity/obsidian-terminal) sessions inside [Hover Editor](https://github.com/nothingislost/obsidian-hover-editor) popovers easier to keep an eye on. It's built for running AI coding agents like [Claude Code](https://docs.claude.com/en/docs/claude-code) inside Obsidian.

Minimize the popover while the agent works. The title bar keeps showing its live status, and with the optional hook the popover expands again when the agent finishes or needs your reply.

> 中文說明：讓 Hover Editor 浮動視窗裡的 Terminal 外掛終端機，收合時標題列仍即時顯示狀態（例如 Claude Code 執行中 ◐◑◒◓／待命 ✳），可單獨設定底色，狀態列顯示各 session 狀態。搭配 Claude Code hook，Claude 完成或需要回覆時會自動展開收合的視窗，游標留在原處。

## Features

| Feature | What it does |
|---|---|
| **Live popover titles** | Hover Editor only refreshes a popover's title when you click it. This plugin copies the terminal's live title (set by the shell via OSC 0) into the popover title bar, so a minimized popover shows e.g. `Terminal: ◑ Refactor parser` while Claude Code works and `Terminal: ✳ Refactor parser` when idle. |
| **One-click popover terminal** | The **Open terminal in popover** command (also a ribbon button, with a choice of icon in settings) opens a terminal straight into a Hover Editor popover, so there's no separate "convert" step. |
| **Custom background** | Terminals opened that way use their own background colour (colour picker in settings). The Terminal plugin draws its background on a WebGL canvas from the theme, so CSS can't recolour it. Instead, these terminals use a copy of your default profile with "follow theme" turned off. The colour applies to newly opened terminals, because recolouring an open one would restart its shell. |
| **Status bar summary** | `Claude ⏳ 1  ❓ 1  ✅ 2`: how many sessions are running, waiting for your reply or idle. Click it to jump to a session. |
| **Expand-on-demand API** | `app.plugins.plugins["hover-terminal"].wake(token, event)` expands the minimized popover whose terminal title contains `token`, and keeps keyboard focus where it was. The Claude Code hook below uses it. |
| **Terminal protection** | When a terminal tab is focused, Obsidian opens a note (a link, a command or `obsidian open`) in the most recent unpinned tab, which replaces the terminal and ends its session. The plugin pins every terminal tab once when it opens, so notes go to a new tab instead. All terminals need this, because if only the focused one is pinned, Obsidian replaces a different terminal. You can turn it off in settings. |
| **Health check** | Hover Editor isn't actively maintained, so if its DOM changes this plugin shows a notice instead of failing silently. Run **Hover Terminal: Diagnose** for details. |

## Requirements

- Obsidian desktop with the **Terminal** and **Hover Editor** community plugins enabled
- To get a terminal into a popover, run **Hover Terminal: Open terminal in popover** (or click its ribbon button). You can also convert an existing terminal tab with **Hover Editor: Convert active pane to popover**, but that terminal keeps the theme background.

## Install

**With BRAT (recommended until it's listed in Community Plugins):**

1. Install and enable [BRAT](https://github.com/TfTHacker/obsidian42-brat) from Community Plugins.
2. Run **BRAT: Add a beta plugin for testing** and enter `frankkccgit/hover-terminal`.
3. Enable **Hover Terminal** in Settings → Community plugins.

**Manually:** copy `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/frankkccgit/hover-terminal/releases/latest) to `<vault>/.obsidian/plugins/hover-terminal/`.

## Optional: auto-expand when Claude Code finishes or needs you

`hooks/claude-code-wake.sh` is a [Claude Code hook](https://docs.claude.com/en/docs/claude-code/hooks). On the `Stop` and `Notification` events it finds this session's terminal and asks the plugin to expand its popover. On `Notification` it also marks the session as ❓ waiting in the status bar.

Requirements: macOS or Linux, `zsh`, `jq`, and the [Obsidian CLI](https://help.obsidian.md/cli) (Obsidian 1.12+).

```bash
git clone https://github.com/frankkccgit/hover-terminal ~/Projects/hover-terminal
mkdir -p ~/.claude/hooks
ln -s ~/Projects/hover-terminal/hooks/claude-code-wake.sh ~/.claude/hooks/obsidian-hover-wake.sh
```

Then add it to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop":         [{ "hooks": [{ "type": "command", "command": "~/.claude/hooks/obsidian-hover-wake.sh" }] }],
    "Notification": [{ "hooks": [{ "type": "command", "command": "~/.claude/hooks/obsidian-hover-wake.sh" }] }]
  }
}
```

How it identifies the session: the hook writes a unique window title to its own tty, the Terminal plugin shows it as the tab title, and the plugin finds the terminal with that title. Sessions that aren't running inside Obsidian are skipped. The log is at `~/.claude/hooks/obsidian-hover-wake.log`, and each entry ends in `expanded`, `already-open`, `not-popover`, `no-leaf`, `no-button` or `plugin-missing`.

## If Hover Editor or Obsidian updates and something breaks

1. Run **Hover Terminal: Diagnose**. It lists which expected element is missing.
2. Everything that depends on Hover Editor's DOM is in the `HE` object at the top of `main.js`. Updating those selectors is usually the whole fix. "Open terminal in popover" also uses Hover Editor's `spawnPopover()` and the Terminal plugin's profile settings, and Diagnose checks both.
3. Until it's fixed, you can pin Hover Editor to its previous version with BRAT's "frozen version" option.

## License

MIT
