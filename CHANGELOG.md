# Changelog

## 0.1.4 (2026-11-10)
- **Fixed: no spinning ball and wrong status bar with Terminal 3.29+.** Terminal 3.29 supports a new status protocol (OSC 7501). When it is available, Claude Code stops putting ◐/✳ in the window title, and Terminal shows the status only on the tab header, which Hover Editor popovers don't have. Hover Terminal now reads that status and draws the spinning ◐◓◑◒ in the popover title itself. The status bar counts running / waiting / idle sessions correctly again. Older Terminal versions work as before.
- Fixed: with Terminal's tab prefix turned off, a title containing ":" lost everything before the colon.
- Fixed: the session menu no longer drops the first word of titles that have no status glyph.
- "Diagnose" now lists how each terminal's state is detected.

## 0.1.3 (2026-11-10)
- **New: terminal protection.** Every terminal tab is pinned once when it opens. Without this, opening a note while a terminal is focused (a link, a command or `obsidian open`) replaced the terminal and ended its session.
- Every terminal has to be pinned, not just the focused one: with only the focused one pinned, Obsidian replaced a different, unpinned terminal instead. This really happened during testing.
- New setting: "Protect terminals from being replaced" (on by default). A terminal you unpin yourself stays unpinned.

## 0.1.2 (2026-11-10)
- New setting: "Ribbon icon". The default is now `picture-in-picture-2`, because the old icon was identical to the Terminal plugin's own ribbon button.

## 0.1.1 (2026-11-10)
- **New: "Open terminal in popover" command and ribbon button.** Opens a terminal straight into a Hover Editor popover.
- **Changed: custom background via a dedicated Terminal profile.** 0.1.0 used a CSS `mix-blend-mode: lighten` overlay, but the Terminal plugin paints an opaque theme background on its WebGL canvas, so the overlay could only make colours *brighter* than the theme. Darker colours came out grey with a coloured ring. Terminals are now opened with a copy of the default profile with "follow theme" off and their own background. The colour applies to newly opened terminals.
- The padding around these terminals matches their background.

## 0.1.0 (2026-11-10)
First release. It merges two earlier prototypes that were written straight into the Skills vault (a title-sync plugin and a CSS snippet), so they aren't in git.
- Live popover titles: Hover Editor only refreshes a popover's title on click, so the terminal's live title is copied in every 0.5 s.
- Background tint (CSS overlay, replaced in 0.1.1).
- Status bar summary of Claude Code sessions (running, waiting, idle).
- `wake(token, event)` API and the Claude Code hook (`hooks/claude-code-wake.sh`). The hook writes a unique window title to its own tty and the plugin finds the terminal with that title. The hook waits 1 s first, because Claude Code rewrites the title right when it stops.
- Health check and "Diagnose" command.
