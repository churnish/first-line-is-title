import {
  PluginSettingTab,
  App,
  Plugin,
  Notice,
  requireApiVersion,
} from 'obsidian';
import { FirstLineIsTitlePlugin } from './settings-base';
import { t, getCurrentLocale } from '../i18n';
import { TIMING } from '../constants/timing';
import { deduplicateExclusions } from '../utils';

// Import all tab classes
import { GeneralTab } from './tab-general';
import { IncludeExcludeTab } from './tab-exclusions';
import { PropertiesTab } from './tab-alias';
import { ForbiddenCharsTab } from './tab-replace-characters';
import { StripMarkupTab } from './tab-strip-markup';
import { CustomReplacementsTab } from './tab-custom-rules';
import { SafewordsTab } from './tab-safewords';
import { CommandsTab } from './tab-commands';
import { OtherTab } from './tab-other';

export class FirstLineIsTitleSettings extends PluginSettingTab {
  plugin: FirstLineIsTitlePlugin;
  private settingsPage: HTMLDivElement | null = null;
  private previousTabId: string | null = null;
  private abortController: AbortController | null = null;
  private cachedTabRows: HTMLElement[][] = [];
  private resizeTimeout: ReturnType<typeof setTimeout> | null = null;
  private isActivatingTab = false;
  private activationGeneration = 0;
  private isDisplayed = false;

  private get TABS() {
    return {
      GENERAL: {
        id: 'general',
        name: t('settings.tabs.general'),
        class: GeneralTab,
      },
      INCLUDE_EXCLUDE: {
        id: 'include-exclude',
        name: t('settings.tabs.exclusions'),
        class: IncludeExcludeTab,
      },
      FORBIDDEN_CHARS: {
        id: 'forbidden-chars',
        name: t('settings.tabs.replaceCharacters'),
        class: ForbiddenCharsTab,
      },
      CUSTOM_REPLACEMENTS: {
        id: 'custom-replacements',
        name: t('settings.tabs.customRules'),
        class: CustomReplacementsTab,
      },
      SAFEWORDS: {
        id: 'safewords',
        name: t('settings.tabs.safewords'),
        class: SafewordsTab,
      },
      STRIP_MARKUP: {
        id: 'strip-markup',
        name: t('settings.tabs.stripMarkup'),
        class: StripMarkupTab,
      },
      PROPERTIES: {
        id: 'properties',
        name: t('settings.tabs.alias'),
        class: PropertiesTab,
      },
      COMMANDS: {
        id: 'commands',
        name: t('settings.tabs.commands'),
        class: CommandsTab,
      },
      OTHER: { id: 'other', name: t('settings.tabs.other'), class: OtherTab },
    };
  }

  constructor(app: App, plugin: FirstLineIsTitlePlugin) {
    // PluginSettingTab expects Plugin, but we use minimal interface for flexibility
    super(app, plugin as unknown as Plugin);
    this.plugin = plugin;
    // Settings sidebar icon (Obsidian 1.11.0+)
    if (requireApiVersion('1.11.0')) {
      this.icon = 'file-type';
    }
  }

  display(): void {
    this.isDisplayed = true;

    // Increment generation before resetting activation guard to invalidate any in-flight activations
    this.activationGeneration++;
    // Reset activation guard - any in-progress activation from previous display()
    // will check generation counter and abort
    this.isActivatingTab = false;

    // Clear pending resize timeout to prevent stale DOM access
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }

    // Clear cached tab rows before abort to prevent stale DOM access
    this.cachedTabRows = [];
    // Then abort old listeners
    if (this.abortController) {
      this.abortController.abort();
    }
    // Then clean DOM
    this.containerEl.empty();
    // Then create new controller
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Initialize previousTabId to current tab
    this.previousTabId = this.plugin.settings.core.currentSettingsTab;

    const tabBar = this.containerEl.createEl('nav', {
      cls: 'flit-settings-tab-bar',
    });
    tabBar.setAttribute('role', 'tablist');

    // Add locale class for locale-specific styling (e.g., wider tabs for Russian)
    const locale = getCurrentLocale();
    if (locale === 'ru') {
      tabBar.addClass('flit-locale-ru');
    }

    const tabElements: HTMLElement[] = [];

    const activateTab = async (
      tabEl: HTMLElement,
      tabInfo: (typeof this.TABS)[keyof typeof this.TABS]
    ) => {
      // Guard against concurrent tab activations
      if (this.isActivatingTab) return;
      this.isActivatingTab = true;
      const currentGeneration = this.activationGeneration;

      try {
        // Abort if display() was called during this activation
        if (this.activationGeneration !== currentGeneration) {
          return;
        }

        // If leaving the Exclusions tab, deduplicate
        if (this.previousTabId === 'include-exclude') {
          const hasChanges = deduplicateExclusions(this.plugin.settings);
          if (hasChanges) {
            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
            // Abort if display() was called during saveSettings
            if (this.activationGeneration !== currentGeneration) {
              return;
            }
          }
        }

        // Remove active class from all tabs
        for (const child of Array.from(tabBar.children)) {
          child.removeClass('flit-settings-tab-active');
          child.setAttribute('aria-selected', 'false');
          child.setAttribute('tabindex', '-1');
        }

        tabEl.addClass('flit-settings-tab-active');
        tabEl.setAttribute('aria-selected', 'true');
        tabEl.setAttribute('tabindex', '0');

        this.previousTabId = tabInfo.id;
        this.plugin.settings.core.currentSettingsTab = tabInfo.id;
        try {
          await this.plugin.saveSettings();
        } catch {
          new Notice(t('settings.errors.saveFailed'));
        }
        // Abort if display() was called during saveSettings
        if (this.activationGeneration !== currentGeneration) {
          return;
        }
        this.renderTab(tabInfo.id);
      } finally {
        // Only reset if this is still the current generation
        if (this.activationGeneration === currentGeneration) {
          this.isActivatingTab = false;
        }
      }
    };

    for (const tabInfo of Object.values(this.TABS)) {
      const tabEl = tabBar.createEl('div', { cls: 'flit-settings-tab' });
      tabEl.setAttribute('data-tab-id', tabInfo.id);
      tabEl.setAttribute('role', 'tab');

      const isActive =
        this.plugin.settings.core.currentSettingsTab === tabInfo.id;
      tabEl.setAttribute('tabindex', isActive ? '0' : '-1');
      tabEl.setAttribute('aria-selected', isActive ? 'true' : 'false');

      tabEl.createEl('div', {
        cls: 'flit-settings-tab-name',
        text: tabInfo.name,
      });

      if (isActive) {
        tabEl.addClass('flit-settings-tab-active');
      }

      // Click handler
      tabEl.addEventListener(
        'click',
        () => {
          void activateTab(tabEl, tabInfo);
        },
        { signal }
      );

      // Keyboard handler
      tabEl.addEventListener(
        'keydown',
        (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            void activateTab(tabEl, tabInfo);
          } else if (
            e.key === 'ArrowRight' ||
            e.key === 'ArrowLeft' ||
            e.key === 'ArrowUp' ||
            e.key === 'ArrowDown'
          ) {
            e.preventDefault();

            // Use cached row structure
            const rows = this.cachedTabRows;

            // Guard: if cache not ready, fall back to linear navigation
            if (rows.length === 0) {
              const currentIndex = tabElements.indexOf(tabEl);
              let nextIndex = currentIndex;
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                nextIndex = (currentIndex + 1) % tabElements.length;
              } else {
                nextIndex =
                  (currentIndex - 1 + tabElements.length) % tabElements.length;
              }
              tabElements[nextIndex].focus();
              return;
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

            if (e.key === 'ArrowRight') {
              const nextCol = currentColIndex + 1;
              if (nextCol < rows[currentRowIndex].length) {
                nextTab = rows[currentRowIndex][nextCol];
              } else {
                // Wrap to next row, first column
                const nextRow = (currentRowIndex + 1) % rows.length;
                nextTab = rows[nextRow][0];
              }
            } else if (e.key === 'ArrowLeft') {
              const prevCol = currentColIndex - 1;
              if (prevCol >= 0) {
                nextTab = rows[currentRowIndex][prevCol];
              } else {
                // Wrap to previous row, last column
                const prevRow =
                  (currentRowIndex - 1 + rows.length) % rows.length;
                nextTab = rows[prevRow][rows[prevRow].length - 1];
              }
            } else if (e.key === 'ArrowDown') {
              const nextRow = currentRowIndex + 1;
              if (nextRow < rows.length) {
                // Stay in same column if possible, otherwise go to last column of next row
                const targetCol = Math.min(
                  currentColIndex,
                  rows[nextRow].length - 1
                );
                nextTab = rows[nextRow][targetCol];
              } else {
                // Wrap to first row
                const targetCol = Math.min(currentColIndex, rows[0].length - 1);
                nextTab = rows[0][targetCol];
              }
            } else if (e.key === 'ArrowUp') {
              const prevRow = currentRowIndex - 1;
              if (prevRow >= 0) {
                // Stay in same column if possible, otherwise go to last column of previous row
                const targetCol = Math.min(
                  currentColIndex,
                  rows[prevRow].length - 1
                );
                nextTab = rows[prevRow][targetCol];
              } else {
                // Wrap to last row
                const lastRow = rows.length - 1;
                const targetCol = Math.min(
                  currentColIndex,
                  rows[lastRow].length - 1
                );
                nextTab = rows[lastRow][targetCol];
              }
            }

            if (nextTab) {
              nextTab.focus();
            }
          } else if (e.key === 'Home') {
            e.preventDefault();
            tabElements[0].focus();
          } else if (e.key === 'End') {
            e.preventDefault();
            tabElements[tabElements.length - 1].focus();
          }
        },
        { signal }
      );

      tabElements.push(tabEl);
    }

    // Cache tab row structure after all tabs are created and rendered
    // Use requestAnimationFrame to ensure layout is complete
    requestAnimationFrame(() => {
      this.cachedTabRows = this.computeTabRows(tabElements);
    });

    // Recalculate tab rows on window resize (debounced)
    window.addEventListener(
      'resize',
      () => {
        if (this.resizeTimeout) {
          clearTimeout(this.resizeTimeout);
        }
        this.resizeTimeout = setTimeout(() => {
          this.resizeTimeout = null;
          if (!this.isDisplayed) return;
          // Verify elements are still attached to DOM
          if (tabElements.length > 0 && !document.contains(tabElements[0])) {
            return;
          }
          this.cachedTabRows = this.computeTabRows(tabElements);
        }, 150);
      },
      { signal }
    );

    this.settingsPage = this.containerEl.createDiv({
      cls: 'flit-settings-page',
    });

    this.renderTab(this.plugin.settings.core.currentSettingsTab);

    // Remove focus from active tab to prevent outline on initial display
    setTimeout(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }, TIMING.NEXT_TICK_MS);

    // Handle first Tab press to focus active tab
    let hasHandledFirstTab = false;
    const handleFirstTab = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && !hasHandledFirstTab) {
        const focusedElement = document.activeElement;
        const isOnTab =
          focusedElement &&
          focusedElement.classList.contains('flit-settings-tab');

        if (!isOnTab) {
          hasHandledFirstTab = true;
          const activeTab = tabBar.querySelector(
            '.flit-settings-tab-active'
          ) as HTMLElement;
          if (activeTab) {
            e.preventDefault();
            activeTab.focus();
          }
        }
      }
    };
    this.containerEl.addEventListener('keydown', handleFirstTab, { signal });
  }

  /**
   * Compute tab row structure based on vertical position.
   * Groups tabs into rows by detecting y-position changes.
   */
  private computeTabRows(tabElements: HTMLElement[]): HTMLElement[][] {
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

    return rows;
  }

  private renderTab(tabId: string): void {
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
    this.isDisplayed = false;

    // Increment generation to invalidate any in-flight tab activations
    this.activationGeneration++;

    // Clean up event listeners
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    // Clean up resize timeout to prevent stale DOM access
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }
    this.cachedTabRows = [];
    // Note: Don't reset isActivatingTab here - the finally block in activateTab() handles it
    // when the async operation completes, even after hide() is called

    // If closing settings while on Exclusions tab, deduplicate
    if (this.previousTabId === 'include-exclude') {
      const hasChanges = deduplicateExclusions(this.plugin.settings);
      if (hasChanges) {
        // Save settings (hide is not async, but we handle errors)
        this.plugin.saveSettings().catch(() => {
          new Notice(t('settings.errors.saveFailed'));
        });
      }
    }
    super.hide();
  }
}
