import { PluginSettingTab, App, Plugin } from "obsidian";
import { FirstLineIsTitlePlugin } from "./settings-base";
import { t, getCurrentLocale } from "../i18n";
import { TIMING } from "../constants/timing";
import { deduplicateExclusions } from "../utils";

// Import all tab classes
import { GeneralTab } from "./tab-general";
import { IncludeExcludeTab } from "./tab-exclusions";
import { PropertiesTab } from "./tab-alias";
import { ForbiddenCharsTab } from "./tab-replace-characters";
import { StripMarkupTab } from "./tab-strip-markup";
import { CustomReplacementsTab } from "./tab-custom-rules";
import { SafewordsTab } from "./tab-safewords";
import { CommandsTab } from "./tab-commands";
import { OtherTab } from "./tab-other";

export class FirstLineIsTitleSettings extends PluginSettingTab {
  plugin: FirstLineIsTitlePlugin;
  private settingsPage: HTMLDivElement | null = null;
  private previousTabId: string | null = null;

  private get TABS() {
    return {
      GENERAL: {
        id: "general",
        name: t("settings.tabs.general"),
        class: GeneralTab,
      },
      INCLUDE_EXCLUDE: {
        id: "include-exclude",
        name: t("settings.tabs.exclusions"),
        class: IncludeExcludeTab,
      },
      FORBIDDEN_CHARS: {
        id: "forbidden-chars",
        name: t("settings.tabs.replaceCharacters"),
        class: ForbiddenCharsTab,
      },
      CUSTOM_REPLACEMENTS: {
        id: "custom-replacements",
        name: t("settings.tabs.customRules"),
        class: CustomReplacementsTab,
      },
      SAFEWORDS: {
        id: "safewords",
        name: t("settings.tabs.safewords"),
        class: SafewordsTab,
      },
      STRIP_MARKUP: {
        id: "strip-markup",
        name: t("settings.tabs.stripMarkup"),
        class: StripMarkupTab,
      },
      PROPERTIES: {
        id: "properties",
        name: t("settings.tabs.alias"),
        class: PropertiesTab,
      },
      COMMANDS: {
        id: "commands",
        name: t("settings.tabs.commands"),
        class: CommandsTab,
      },
      OTHER: { id: "other", name: t("settings.tabs.other"), class: OtherTab },
    };
  }

  constructor(app: App, plugin: FirstLineIsTitlePlugin) {
    // PluginSettingTab expects Plugin, but we use minimal interface for flexibility
    super(app, plugin as unknown as Plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();

    // Initialize previousTabId to current tab
    this.previousTabId = this.plugin.settings.core.currentSettingsTab;

    const tabBar = this.containerEl.createEl("nav", {
      cls: "flit-settings-tab-bar",
    });
    tabBar.setAttribute("role", "tablist");

    // Add locale class for locale-specific styling (e.g., wider tabs for Russian)
    const locale = getCurrentLocale();
    if (locale === "ru") {
      tabBar.addClass("flit-locale-ru");
    }

    const tabElements: HTMLElement[] = [];

    const activateTab = async (
      tabEl: HTMLElement,
      tabInfo: (typeof this.TABS)[keyof typeof this.TABS],
    ) => {
      // If leaving the Exclusions tab, deduplicate
      if (this.previousTabId === "include-exclude") {
        const hasChanges = deduplicateExclusions(this.plugin.settings);
        if (hasChanges) {
          await this.plugin.saveSettings();
        }
      }

      // Remove active class from all tabs
      for (const child of Array.from(tabBar.children)) {
        child.removeClass("flit-settings-tab-active");
        child.setAttribute("aria-selected", "false");
        child.setAttribute("tabindex", "-1");
      }

      tabEl.addClass("flit-settings-tab-active");
      tabEl.setAttribute("aria-selected", "true");
      tabEl.setAttribute("tabindex", "0");

      this.previousTabId = tabInfo.id;
      this.plugin.settings.core.currentSettingsTab = tabInfo.id;
      void this.plugin.saveSettings();
      void this.renderActiveSubTab(tabInfo.id);
    };

    for (const tabInfo of Object.values(this.TABS)) {
      const tabEl = tabBar.createEl("div", { cls: "flit-settings-tab" });
      tabEl.setAttribute("data-tab-id", tabInfo.id);
      tabEl.setAttribute("role", "tab");

      const isActive =
        this.plugin.settings.core.currentSettingsTab === tabInfo.id;
      tabEl.setAttribute("tabindex", isActive ? "0" : "-1");
      tabEl.setAttribute("aria-selected", isActive ? "true" : "false");

      tabEl.createEl("div", {
        cls: "flit-settings-tab-name",
        text: tabInfo.name,
      });

      if (isActive) {
        tabEl.addClass("flit-settings-tab-active");
      }

      // Click handler
      tabEl.addEventListener("click", () => {
        void activateTab(tabEl, tabInfo);
      });

      // Keyboard handler
      tabEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void activateTab(tabEl, tabInfo);
        } else if (
          e.key === "ArrowRight" ||
          e.key === "ArrowLeft" ||
          e.key === "ArrowUp" ||
          e.key === "ArrowDown"
        ) {
          e.preventDefault();

          // Build grid structure by detecting rows based on vertical position
          const rows: HTMLElement[][] = [];
          let currentRow: HTMLElement[] = [];
          let lastTop = -1;

          tabElements.forEach((tab) => {
            const rect = tab.getBoundingClientRect();
            if (lastTop === -1 || Math.abs(rect.top - lastTop) < 5) {
              // Same row (within 5px tolerance)
              currentRow.push(tab);
              lastTop = rect.top;
            } else {
              // New row
              if (currentRow.length > 0) {
                rows.push(currentRow);
              }
              currentRow = [tab];
              lastTop = rect.top;
            }
          });
          if (currentRow.length > 0) {
            rows.push(currentRow);
          }

          // Find current position in grid
          let currentRowIndex = 0;
          let currentColIndex = 0;
          for (let r = 0; r < rows.length; r++) {
            const colIndex = rows[r].indexOf(tabEl);
            if (colIndex !== -1) {
              currentRowIndex = r;
              currentColIndex = colIndex;
              break;
            }
          }

          let nextTab: HTMLElement | null = null;

          if (e.key === "ArrowRight") {
            const nextCol = currentColIndex + 1;
            if (nextCol < rows[currentRowIndex].length) {
              nextTab = rows[currentRowIndex][nextCol];
            } else {
              // Wrap to next row, first column
              const nextRow = (currentRowIndex + 1) % rows.length;
              nextTab = rows[nextRow][0];
            }
          } else if (e.key === "ArrowLeft") {
            const prevCol = currentColIndex - 1;
            if (prevCol >= 0) {
              nextTab = rows[currentRowIndex][prevCol];
            } else {
              // Wrap to previous row, last column
              const prevRow = (currentRowIndex - 1 + rows.length) % rows.length;
              nextTab = rows[prevRow][rows[prevRow].length - 1];
            }
          } else if (e.key === "ArrowDown") {
            const nextRow = currentRowIndex + 1;
            if (nextRow < rows.length) {
              // Stay in same column if possible, otherwise go to last column of next row
              const targetCol = Math.min(
                currentColIndex,
                rows[nextRow].length - 1,
              );
              nextTab = rows[nextRow][targetCol];
            } else {
              // Wrap to first row
              const targetCol = Math.min(currentColIndex, rows[0].length - 1);
              nextTab = rows[0][targetCol];
            }
          } else if (e.key === "ArrowUp") {
            const prevRow = currentRowIndex - 1;
            if (prevRow >= 0) {
              // Stay in same column if possible, otherwise go to last column of previous row
              const targetCol = Math.min(
                currentColIndex,
                rows[prevRow].length - 1,
              );
              nextTab = rows[prevRow][targetCol];
            } else {
              // Wrap to last row
              const lastRow = rows.length - 1;
              const targetCol = Math.min(
                currentColIndex,
                rows[lastRow].length - 1,
              );
              nextTab = rows[lastRow][targetCol];
            }
          }

          if (nextTab) {
            nextTab.focus();
          }
        } else if (e.key === "Home") {
          e.preventDefault();
          tabElements[0].focus();
        } else if (e.key === "End") {
          e.preventDefault();
          tabElements[tabElements.length - 1].focus();
        }
      });

      tabElements.push(tabEl);
    }

    this.settingsPage = this.containerEl.createDiv({
      cls: "flit-settings-page",
    });

    void this.renderActiveSubTab(this.plugin.settings.core.currentSettingsTab);

    // Remove focus from active tab to prevent outline on initial display
    setTimeout(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }, TIMING.NEXT_TICK_MS);

    // Handle first Tab press to focus active tab
    let hasHandledFirstTab = false;
    const handleFirstTab = (e: KeyboardEvent) => {
      if (e.key === "Tab" && !hasHandledFirstTab) {
        const focusedElement = document.activeElement;
        const isOnTab =
          focusedElement &&
          focusedElement.classList.contains("flit-settings-tab");

        if (!isOnTab) {
          hasHandledFirstTab = true;
          const activeTab = tabBar.querySelector(
            ".flit-settings-tab-active",
          ) as HTMLElement;
          if (activeTab) {
            e.preventDefault();
            activeTab.focus();
          }
        }
      }
    };
    this.containerEl.addEventListener("keydown", handleFirstTab);
  }

  // Must not be named `renderTab`: that shadows PluginSettingTab.prototype.renderTab(), which Obsidian's Settings modal calls to reach display(). The obsidian typings don't declare it, so the collision is invisible to the compiler.
  private renderActiveSubTab(tabId: string): void {
    if (!this.settingsPage) return;

    this.settingsPage.empty();

    const tabConfig = Object.values(this.TABS).find((tab) => tab.id === tabId);

    if (tabConfig) {
      const tabInstance = new tabConfig.class(this.plugin, this.settingsPage);
      tabInstance.render();
    } else {
      const generalTab = new GeneralTab(this.plugin, this.settingsPage);
      generalTab.render();
    }
  }

  hide(): void {
    // If closing settings while on Exclusions tab, deduplicate
    if (this.previousTabId === "include-exclude") {
      const hasChanges = deduplicateExclusions(this.plugin.settings);
      if (hasChanges) {
        // Save settings synchronously (hide is not async)
        void this.plugin.saveSettings();
      }
    }
    super.hide();
  }
}
