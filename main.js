/*
 * Hover Terminal
 *
 * Works with two other community plugins:
 *   - Terminal (polyipseity/obsidian-terminal): view type "terminal:terminal". Its tab title follows the
 *     window title the shell sets (OSC 0). Claude Code, for example, shows a spinner while working and ✳ when idle.
 *     Terminal 3.29+ answers Claude Code's OSC 7501 probe; Claude Code then drops the glyph from the title and reports
 *     its state over OSC 7501, which Terminal puts on the tab header as data-terminal-status (see STATUS_MAP).
 *   - Hover Editor (nothingislost/obsidian-hover-editor): floating popovers that can be minimized.
 *
 * Features
 *   1. Title sync: copies each terminal's live title into its popover title bar, so a minimized popover still shows it.
 *   2. Background: the "Open terminal in popover" command (also a ribbon button) opens a Terminal session straight into
 *      a Hover Editor popover, using a profile with its own background colour. The Terminal plugin draws its background
 *      on a WebGL canvas from the theme, so CSS can't recolour an existing terminal; a profile with followTheme off can.
 *   3. Status bar: counts Claude Code sessions that are running, idle or waiting for a reply. Click it to jump to one.
 *   4. API for scripts (e.g. a Claude Code hook): wake(token, event) expands the minimized popover whose
 *      terminal title contains `token`. Keyboard focus stays where it was.
 *   5. Health check: on load, and the first time each popover appears, checks that Hover Editor's DOM
 *      still looks as expected. If it does not, shows a notice once. The "Diagnose" command reports details.
 *
 * Everything that depends on Hover Editor's or Terminal's internals is in HE / TERMINAL_VIEW below, and only there.
 */
const { Plugin, PluginSettingTab, Setting, Notice, Menu, setIcon } = require("obsidian");

const TERMINAL_VIEW = "terminal:terminal";
const HE = {
  pluginId: "obsidian-hover-editor",
  popover: ".hover-popover",
  title: ".popover-title",
  minimizedClass: "is-minimized",
  minimizeButton: ".popover-action.mod-minimize",
  activeTypeAttr: "data-active-view-type",
};

const DEFAULTS = {
  syncTitle: true,
  tintEnabled: true, // use tintColor as the background of terminals opened by this plugin
  tintColor: "#1e1a33",
  statusBar: true,
  ribbonIcon: "picture-in-picture-2",
  // Pin each terminal tab once when it first appears. When the active tab is a terminal, Obsidian opens files
  // (e.g. `obsidian open`, clicking a link) in the most recent unpinned tab, which replaces the terminal and
  // kills its shell. Every terminal has to be pinned, not just the active one: with only the active one pinned,
  // Obsidian picks another unpinned terminal instead.
  protectTerminals: true,
};
// Ribbon icon choices (Lucide icon ids bundled with Obsidian)
const RIBBON_ICONS = {
  "picture-in-picture-2": "Picture in picture (floating window)",
  "app-window": "App window",
  bot: "Bot",
  "bot-message-square": "Bot in a message bubble",
  sparkles: "Sparkles",
  "message-square-code": "Code in a message bubble",
  layers: "Layers",
  "square-terminal": "Terminal (same as the Terminal plugin)",
};
const PROFILE_NAME = "Hover Terminal"; // marks terminals opened by this plugin

const IDLE = "✳";
// Claude Code's title spinner glyphs (observed: ◐◓◑◒) plus braille spinners used by other CLIs.
const RUNNING_RE = /^[◐◓◑◒·✢✶✻✽⠀-⣿]/;
// Any status glyph at the start of a title (running or idle), with the space after it.
const GLYPH_PREFIX_RE = /^[◐◓◑◒·✢✶✻✽⠀-⣿✳]\s*/;
const SPINNER = ["◐", "◓", "◑", "◒"];
// Terminal 3.29+ supports the OSC 7501 "program status" protocol. When it does, Claude Code drops the glyph from the
// window title and reports its state there instead; Terminal shows it on the tab header as `data-terminal-status`.
// Hover Editor popovers have no visible tab header, so we read the attribute and draw our own glyph in the popover title.
const STATUS_ATTR = "data-terminal-status";
// "seen" = "done" after the user has looked at the tab.
const STATUS_MAP = { working: "running", blocked: "waiting", idle: "idle", done: "idle", seen: "idle", error: "idle" };

module.exports = class HoverTerminal extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.waiting = new WeakSet(); // leaves that sent a "needs reply" notification
    this.checkedPopovers = new WeakSet();
    this.pinnedOnce = new WeakSet(); // terminals already auto-pinned (so a manual unpin sticks)
    this.warned = false;

    this.addSettingTab(new HoverTerminalSettingTab(this.app, this));

    this.addCommand({
      id: "open-terminal-in-popover",
      name: "Open terminal in popover",
      callback: () => this.openTerminalPopover(),
    });
    this.ribbonEl = this.addRibbonIcon(this.settings.ribbonIcon, "Open terminal in popover (Hover Terminal)", () => this.openTerminalPopover());

    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass("hover-terminal-status", "mod-clickable");
    this.registerDomEvent(this.statusEl, "click", (evt) => this.openSessionMenu(evt));

    this.addCommand({
      id: "diagnose",
      name: "Diagnose (check Hover Editor / Terminal compatibility)",
      callback: () => {
        const report = this.diagnose();
        console.log("[hover-terminal]", report);
        new Notice(report.text, 15000);
      },
    });

    this.app.workspace.onLayoutReady(() => {
      this.healthCheck();
      this.registerInterval(window.setInterval(() => this.tick(), 500));
    });
  }

  onunload() {
    for (const leaf of this.terminals()) {
      leaf.containerEl.removeClass("hover-terminal-bg");
      leaf.containerEl.style.removeProperty("--hover-terminal-bg");
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    if (this.ribbonEl) setIcon(this.ribbonEl, this.settings.ribbonIcon);
    this.tick();
  }

  /** A copy of the Terminal plugin's default integrated profile for this OS, with our own background. */
  buildProfile() {
    const term = this.app.plugins.plugins["terminal"];
    const profiles = term?.settings?.value?.profiles;
    if (!profiles) throw new Error("Terminal plugin settings not found");
    const platform = process.platform;
    const base =
      profiles[`${platform}IntegratedDefault`] ||
      Object.values(profiles).find((p) => p.type === "integrated" && p.platforms?.[platform]);
    if (!base) throw new Error(`No integrated Terminal profile for ${platform}`);
    const profile = JSON.parse(JSON.stringify(base));
    profile.name = PROFILE_NAME;
    if (this.settings.tintEnabled) {
      const cs = getComputedStyle(document.body);
      profile.followTheme = false;
      profile.terminalOptions = Object.assign({}, profile.terminalOptions, {
        theme: {
          background: this.settings.tintColor,
          foreground: cs.getPropertyValue("--text-normal").trim(),
          cursor: cs.getPropertyValue("--interactive-accent").trim(),
          selectionBackground: cs.getPropertyValue("--text-selection").trim() || undefined,
        },
      });
    }
    return profile;
  }

  async openTerminalPopover() {
    try {
      const he = this.app.plugins.plugins[HE.pluginId];
      if (!he?.spawnPopover) throw new Error("Hover Editor isn't enabled (or spawnPopover is gone)");
      const profile = this.buildProfile();
      const leaf = he.spawnPopover();
      await leaf.setViewState({
        type: TERMINAL_VIEW,
        active: true,
        state: { [TERMINAL_VIEW]: { cwd: this.app.vault.adapter.basePath, focus: true, profile, serial: null } },
      });
      if (this.settings.protectTerminals) {
        leaf.setPinned(true);
        this.pinnedOnce.add(leaf);
      }
      this.tick();
    } catch (e) {
      console.error("[hover-terminal]", e);
      new Notice(`Hover Terminal: couldn't open a terminal popover.\n${e.message}\nRun "Hover Terminal: Diagnose" for details.`, 10000);
    }
  }

  /** Background of a terminal opened by this plugin (from its saved profile), or null. */
  backgroundOf(leaf) {
    try {
      const profile = leaf.view.getState()?.[TERMINAL_VIEW]?.profile;
      if (profile?.name !== PROFILE_NAME || profile.followTheme) return null;
      return profile.terminalOptions?.theme?.background || null;
    } catch (e) {
      return null;
    }
  }

  // ---------- helpers ----------
  terminals() {
    return this.app.workspace.getLeavesOfType(TERMINAL_VIEW);
  }
  popoverOf(leaf) {
    return leaf.containerEl.closest(HE.popover);
  }
  /** Title without the "Terminal: " prefix. */
  rawTitle(leaf) {
    const t = leaf.getDisplayText();
    // Terminal 3.29+ can hide the prefix; then a ":" belongs to the title itself
    if (this.app.plugins.plugins["terminal"]?.settings?.value?.showTerminalTabPrefix === false) return t;
    return t.replace(/^[^:]*:\s*/, "");
  }
  /** Title without the "Terminal: " prefix and without a leading status glyph. */
  bareTitle(leaf) {
    return this.rawTitle(leaf).replace(GLYPH_PREFIX_RE, "");
  }
  stateOf(leaf) {
    // Terminal 3.29+: program status reported over OSC 7501
    const status = leaf.tabHeaderEl?.getAttribute(STATUS_ATTR);
    if (status && STATUS_MAP[status]) {
      const state = STATUS_MAP[status];
      if (state === "running") this.waiting.delete(leaf);
      if (state === "idle" && this.waiting.has(leaf)) return "waiting";
      return state;
    }
    // Older Terminal: Claude Code puts a spinner / ✳ at the start of the window title
    const t = this.rawTitle(leaf);
    if (RUNNING_RE.test(t)) {
      this.waiting.delete(leaf);
      return "running";
    }
    if (t.startsWith(IDLE)) return this.waiting.has(leaf) ? "waiting" : "idle";
    return null; // not a Claude Code session
  }

  // ---------- periodic work ----------
  tick() {
    const counts = { running: 0, waiting: 0, idle: 0 };
    this.frame = ((this.frame || 0) + 1) % SPINNER.length;
    for (const leaf of this.terminals()) {
      const state = this.stateOf(leaf);
      if (state) counts[state]++;

      if (this.settings.protectTerminals && !this.pinnedOnce.has(leaf)) {
        this.pinnedOnce.add(leaf);
        if (!leaf.pinned) leaf.setPinned(true);
      }

      // Give the padding around the terminal the same background as the terminal itself
      const bg = this.backgroundOf(leaf);
      leaf.containerEl.toggleClass("hover-terminal-bg", !!bg);
      if (bg && leaf.containerEl.style.getPropertyValue("--hover-terminal-bg") !== bg)
        leaf.containerEl.style.setProperty("--hover-terminal-bg", bg);

      const pop = this.popoverOf(leaf);
      if (!pop) continue;
      if (!this.checkedPopovers.has(pop)) {
        this.checkedPopovers.add(pop);
        this.healthCheck(pop);
      }
      if (this.settings.syncTitle) {
        const activeType = pop.getAttribute(HE.activeTypeAttr);
        const titleEl = pop.querySelector(HE.title);
        if (titleEl && (!activeType || activeType === TERMINAL_VIEW)) {
          const text = this.popoverTitle(leaf, state);
          if (titleEl.textContent !== text) titleEl.textContent = text;
        }
      }
    }
    this.renderStatus(counts);
  }

  /** Popover title: the terminal title with a glyph for the session state (spinning while running). */
  popoverTitle(leaf, state) {
    // Without OSC 7501 the title already carries Claude Code's own glyph; keep it as is.
    if (!leaf.tabHeaderEl?.getAttribute(STATUS_ATTR)) return leaf.getDisplayText();
    const glyph = { running: SPINNER[this.frame], waiting: "❓", idle: IDLE }[state];
    const title = this.bareTitle(leaf);
    return glyph ? `${glyph} ${title}` : title;
  }

  renderStatus(c) {
    const total = c.running + c.waiting + c.idle;
    if (!this.settings.statusBar || total === 0) {
      this.statusEl.hide();
      return;
    }
    const parts = [];
    if (c.running) parts.push(`⏳ ${c.running}`);
    if (c.waiting) parts.push(`❓ ${c.waiting}`);
    if (c.idle) parts.push(`✅ ${c.idle}`);
    this.statusEl.setText(`Claude ${parts.join("  ")}`);
    this.statusEl.setAttr("aria-label", `執行中 ${c.running}｜等你回覆 ${c.waiting}｜待命 ${c.idle}\n點一下切換 session`);
    this.statusEl.show();
  }

  openSessionMenu(evt) {
    const menu = new Menu();
    const icon = { running: "⏳", waiting: "❓", idle: "✅" };
    for (const leaf of this.terminals()) {
      const state = this.stateOf(leaf);
      if (!state) continue;
      menu.addItem((item) =>
        item.setTitle(`${icon[state]} ${this.bareTitle(leaf)}`).onClick(() => this.reveal(leaf, true))
      );
    }
    menu.showAtMouseEvent(evt);
  }

  // ---------- expand / reveal ----------
  /** Expand the leaf's popover if minimized. With focus=false, keyboard focus is put back where it was. */
  reveal(leaf, focus) {
    const pop = this.popoverOf(leaf);
    if (!pop) {
      if (focus) this.app.workspace.setActiveLeaf(leaf, { focus: true });
      return "not-popover";
    }
    let result = "already-open";
    const prevLeaf = this.app.workspace.activeLeaf;
    const prevEl = pop.ownerDocument.activeElement;
    if (pop.hasClass(HE.minimizedClass)) {
      const btn = pop.querySelector(HE.minimizeButton);
      if (!btn) return "no-button";
      btn.click();
      result = pop.hasClass(HE.minimizedClass) ? "click-failed" : "expanded";
    }
    window.setTimeout(() => {
      if (focus) {
        this.app.workspace.setActiveLeaf(leaf, { focus: true });
      } else if (result === "expanded") {
        if (prevLeaf && prevLeaf !== leaf) this.app.workspace.setActiveLeaf(prevLeaf, { focus: true });
        if (prevEl && prevEl.focus && !pop.contains(prevEl)) prevEl.focus();
      }
    }, 80);
    return result;
  }

  /**
   * Public API for scripts (e.g. a Claude Code hook):
   *   app.plugins.plugins["hover-terminal"].wake(token, event)
   * Finds the terminal whose title contains `token` and expands its popover if minimized.
   * event "Notification" also marks the session as waiting for a reply (shown in the status bar).
   * Returns: expanded | already-open | not-popover | no-leaf | no-button | click-failed
   */
  wake(token, event) {
    const leaf = this.terminals().find((l) => l.getDisplayText().includes(token));
    if (!leaf) return "no-leaf";
    if (event === "Notification") this.waiting.add(leaf);
    else this.waiting.delete(leaf);
    return this.reveal(leaf, false);
  }

  // ---------- health check ----------
  diagnose() {
    const lines = [];
    let ok = true;
    const he = this.app.plugins.plugins[HE.pluginId];
    if (!he) {
      ok = false;
      lines.push("✗ Hover Editor isn't installed or enabled");
    } else {
      lines.push(`✓ Hover Editor ${he.manifest.version}`);
      if (typeof he.spawnPopover !== "function") {
        ok = false;
        lines.push("✗ Hover Editor no longer has spawnPopover(), so \"Open terminal in popover\" won't work");
      }
    }
    const term = this.app.plugins.plugins["terminal"];
    if (!term) {
      ok = false;
      lines.push("✗ Terminal plugin isn't installed or enabled");
    } else {
      lines.push(`✓ Terminal ${term.manifest.version}`);
      if (!term.settings?.value?.profiles) {
        ok = false;
        lines.push("✗ Can't read the Terminal plugin's profiles, so \"Open terminal in popover\" won't work");
      }
    }

    const leaves = this.terminals();
    lines.push(`Terminals: ${leaves.length} (in popovers: ${leaves.filter((l) => this.popoverOf(l)).length})`);
    for (const l of leaves) {
      const status = l.tabHeaderEl?.getAttribute(STATUS_ATTR);
      const how = status ? `${STATUS_ATTR}="${status}" (OSC 7501)` : "title glyph";
      lines.push(`  · ${this.bareTitle(l)}: ${this.stateOf(l) ?? "not Claude Code"} via ${how}`);
    }
    const pops = Array.from(document.querySelectorAll(HE.popover)).filter((p) =>
      leaves.some((l) => p.contains(l.containerEl))
    );
    for (const p of pops) {
      const missing = [];
      if (!p.querySelector(HE.title)) missing.push(HE.title);
      if (!p.querySelector(HE.minimizeButton)) missing.push(HE.minimizeButton);
      if (missing.length) {
        ok = false;
        lines.push(`✗ Popover is missing ${missing.join(", ")} (Hover Editor's DOM may have changed)`);
      } else lines.push("✓ Popover title bar and minimize button found");
    }
    if (!pops.length) lines.push("(No terminal popover open, so the popover DOM couldn't be checked)");
    return { ok, text: `Hover Terminal diagnosis\n${lines.join("\n")}` };
  }

  healthCheck(pop) {
    const report = this.diagnose();
    if (!report.ok && !this.warned) {
      this.warned = true;
      console.warn("[hover-terminal]", report.text);
      new Notice(`⚠️ Hover Terminal: a compatibility check failed. Some features may not work.\nRun the "Hover Terminal: Diagnose" command for details.`, 0);
    }
  }
};

class HoverTerminalSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Sync popover titles")
      .setDesc("Show each terminal's live title (e.g. Claude Code's status) in the popover title bar, even while minimized.")
      .addToggle((t) => t.setValue(s.syncTitle).onChange(async (v) => { s.syncTitle = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("Custom background")
      .setDesc('For terminals opened with "Open terminal in popover" (command or ribbon button). Off: follow the Obsidian theme.')
      .addToggle((t) => t.setValue(s.tintEnabled).onChange(async (v) => { s.tintEnabled = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("Background colour")
      .setDesc("Applies to terminals opened from now on. A terminal that's already open keeps its colour, because changing it would restart its shell. Some ideas: #1e1a33 deep purple, #14213d deep blue, #13261f deep green, #2a1218 deep red.")
      .addColorPicker((c) => c.setValue(s.tintColor).onChange(async (v) => { s.tintColor = v; await this.plugin.saveSettings(); }))
      .addExtraButton((b) => b.setIcon("rotate-ccw").setTooltip("Reset to default").onClick(async () => { s.tintColor = DEFAULTS.tintColor; await this.plugin.saveSettings(); this.display(); }));

    new Setting(containerEl)
      .setName("Ribbon icon")
      .setDesc('Icon for the "Open terminal in popover" ribbon button.')
      .addDropdown((d) => {
        for (const [id, label] of Object.entries(RIBBON_ICONS)) d.addOption(id, label);
        d.setValue(s.ribbonIcon).onChange(async (v) => { s.ribbonIcon = v; await this.plugin.saveSettings(); });
      });

    new Setting(containerEl)
      .setName("Protect terminals from being replaced")
      .setDesc("Pin every terminal tab once when it opens, so opening a note while a terminal is focused (a link, a command or `obsidian open`) uses another tab instead of replacing the terminal and ending its session. If you unpin a terminal yourself, it stays unpinned.")
      .addToggle((t) => t.setValue(s.protectTerminals).onChange(async (v) => { s.protectTerminals = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("Status bar summary")
      .setDesc("Show how many Claude Code sessions are running ⏳, waiting for a reply ❓ or idle ✅. Click it to jump to a session.")
      .addToggle((t) => t.setValue(s.statusBar).onChange(async (v) => { s.statusBar = v; await this.plugin.saveSettings(); }));
  }
}
