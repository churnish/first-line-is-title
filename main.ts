import { Notice, Plugin, TFile, TFolder } from 'obsidian';
import { around } from 'monkey-around';
import { PluginSettings } from './src/types';
import { DEFAULT_SETTINGS } from './src/constants';
import { initI18n, t, getCurrentLocale } from './src/i18n';
import {
  verboseLog,
  detectOS,
  hasDisablePropertyInFile,
  deepMerge,
  deduplicateExclusions,
} from './src/utils';
import { FirstLineIsTitleSettings } from './src/settings/settings-main';
import { RenameEngine } from './src/core/rename-engine';
import { ContextMenuManager } from './src/ui/context-menus';
import { FolderOperations } from './src/operations/folder-operations';
import { TagOperations } from './src/operations/tag-operations';
import { AliasManager } from './src/core/alias-manager';
import { FileOperations } from './src/operations/file-operations';
import { PropertyVisibility } from './src/ui/property-visibility';

// High-performance cache system replaces all global variables
import { CacheManager } from './src/core/cache-manager';
import { EditorLifecycleManager } from './src/core/editor-lifecycle';
import { WorkspaceIntegration } from './src/core/workspace-integration';
import { PropertyManager } from './src/core/property-manager';
import { PluginInitializer } from './src/core/plugin-initializer';
import { CommandRegistrar } from './src/core/command-registrar';
import { TitleInsertion } from './src/core/title-insertion';
import { LinkManager } from './src/core/link-manager';
import { EventHandlerManager } from './src/core/event-handler-manager';
import { FileStateManager } from './src/core/file-state-manager';

// Build-time constant injected by esbuild
declare const BUILD_GIT_HASH: string;

export default class FirstLineIsTitle extends Plugin {
  settings: PluginSettings;
  isFullyLoaded: boolean = false;
  pluginLoadTime: number = 0;
  recentlyRenamedPaths: Set<string> = new Set();

  cacheManager: CacheManager;
  fileStateManager: FileStateManager;

  renameEngine: RenameEngine;
  contextMenuManager: ContextMenuManager;
  aliasManager: AliasManager;
  fileOperations: FileOperations;
  commandRegistrar: CommandRegistrar;
  editorLifecycle: EditorLifecycleManager;
  workspaceIntegration: WorkspaceIntegration;
  propertyManager: PropertyManager;
  titleInsertion: TitleInsertion;
  eventHandlerManager: EventHandlerManager;

  private _folderOperations?: FolderOperations;
  private _tagOperations?: TagOperations;
  private _propertyVisibility?: PropertyVisibility;
  private _linkManager?: LinkManager;

  private _debugPatchCleanup?: () => void;
  private _createdDebugNamespace: boolean = false;

  get folderOperations(): FolderOperations {
    if (!this._folderOperations) {
      this._folderOperations = new FolderOperations(
        this.app,
        this.settings,
        this.renameEngine,
        this.saveSettings.bind(this),
        this.debugLog.bind(this),
        this.processMultipleFiles.bind(this)
      );
    }
    return this._folderOperations;
  }

  get tagOperations(): TagOperations {
    if (!this._tagOperations) {
      this._tagOperations = new TagOperations(
        this.app,
        this.settings,
        this.renameEngine,
        this.saveSettings.bind(this),
        this.debugLog.bind(this)
      );
    }
    return this._tagOperations;
  }

  get propertyVisibility(): PropertyVisibility {
    if (!this._propertyVisibility) {
      this._propertyVisibility = new PropertyVisibility(this);
    }
    return this._propertyVisibility;
  }

  get linkManager(): LinkManager {
    if (!this._linkManager) {
      this._linkManager = new LinkManager(this);
    }
    return this._linkManager;
  }

  // Track files with pending metadata cache updates (for alias manager sync)
  pendingMetadataUpdates: Set<TFile> = new Set();

  isTagWranglerEnabled(): boolean {
    return this.app.plugins.enabledPlugins.has('tag-wrangler');
  }

  async putFirstLineInTitleForFolder(folder: TFolder): Promise<void> {
    return this.folderOperations.putFirstLineInTitleForFolder(folder);
  }

  async toggleFolderExclusion(folderPath: string): Promise<void> {
    return this.folderOperations.toggleFolderExclusion(folderPath);
  }

  async putFirstLineInTitleForTag(
    tagName: string,
    omitBodyTags: boolean = false,
    omitNestedTags: boolean = false
  ): Promise<void> {
    return this.tagOperations.putFirstLineInTitleForTag(
      tagName,
      omitBodyTags,
      omitNestedTags
    );
  }

  async toggleTagExclusion(tagName: string): Promise<void> {
    return this.tagOperations.toggleTagExclusion(tagName);
  }

  // Debug logging helper for setting changes
  debugLog(settingName: string, value: unknown): void {
    if (this.settings.core.verboseLogging) {
      console.debug(
        `Setting changed: ${settingName} = ${JSON.stringify(value)}`
      );
    }
  }

  // Debug file content output
  outputDebugFileContent(
    file: TFile,
    action: string,
    editorContent?: string
  ): void {
    if (
      !this.settings.core.verboseLogging ||
      !this.settings.core.debugOutputFullContent
    ) {
      return;
    }

    try {
      const content = editorContent ?? 'N/A (no editor content available)';

      console.debug(`CONTENT [${action}] ${file.path}:`);
      console.debug('--- FILE CONTENT START ---');
      console.debug(content);
      console.debug('--- FILE CONTENT END ---');
    } catch (error) {
      console.debug(
        `CONTENT [${action}] ${file.path}: Failed to read file:`,
        error
      );
    }
  }

  // Output structured settings when debug mode is enabled - only non-default values
  outputAllSettings(): void {
    if (!this.settings.core.verboseLogging) {
      return;
    }

    console.debug('🔧 Settings (non-default values only):');

    const nonDefaults: Record<string, unknown> = {};

    // Helper to check deep equality for arrays and objects
    const isEqual = (a: unknown, b: unknown): boolean => {
      if (a === b) return true;
      if (a == null || b == null) return false;
      if (typeof a !== typeof b) return false;

      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((val, idx) => isEqual(val, b[idx]));
      }

      if (typeof a === 'object' && typeof b === 'object') {
        const objA = a as Record<string, unknown>;
        const objB = b as Record<string, unknown>;
        const keysA = Object.keys(objA);
        const keysB = Object.keys(objB);
        if (keysA.length !== keysB.length) return false;
        return keysA.every((key) => isEqual(objA[key], objB[key]));
      }

      return false;
    };

    // Compare each setting against defaults
    for (const key in this.settings) {
      if (!Object.prototype.hasOwnProperty.call(this.settings, key)) continue;
      const settingsKey = key as keyof PluginSettings;
      const currentValue = this.settings[settingsKey];
      const defaultValue = DEFAULT_SETTINGS[settingsKey];

      if (!isEqual(currentValue, defaultValue)) {
        nonDefaults[key] = currentValue;
      }
    }

    if (Object.keys(nonDefaults).length === 0) {
      console.debug('  All settings are at default values');
      return;
    }

    // Output non-default settings in organized groups
    for (const key in nonDefaults) {
      const value = nonDefaults[key];

      // Format the output based on type
      if (Array.isArray(value)) {
        if (value.length > 0) {
          console.debug(`  ${key}:`, value);
        }
      } else if (typeof value === 'object' && value !== null) {
        console.debug(`  ${key}:`, value);
      } else {
        console.debug(`  ${key}:`, value);
      }
    }
  }

  async insertTitleOnCreation(file: TFile): Promise<void> {
    return this.titleInsertion.insertTitleOnCreation(file);
  }

  getSelectedFolders(): TFolder[] {
    return this.folderOperations.getSelectedFolders();
  }

  getAllMarkdownFilesInFolder(folder: TFolder): TFile[] {
    return this.folderOperations.getAllMarkdownFilesInFolder(folder);
  }

  async processMultipleFolders(
    folders: TFolder[],
    action: 'rename' | 'disable' | 'enable'
  ): Promise<void> {
    return this.folderOperations.processMultipleFolders(folders, action);
  }

  async processMultipleFiles(files: TFile[], action: 'rename'): Promise<void> {
    if (files.length === 0) return;

    let processed = 0;
    let errors = 0;

    new Notice(
      t('notifications.renamingNNotes').replace(
        '{{count}}',
        String(files.length)
      )
    );

    const exclusionOverrides = {
      ignoreFolder: true,
      ignoreTag: true,
      ignoreProperty: true,
    };

    // Process sequentially for safety (prevents race conditions with file operations)
    // Batch operations bypass global rate limiting to avoid blocking legitimate bulk operations
    for (const file of files) {
      try {
        if (action === 'rename') {
          const result = await this.renameEngine.processFile(
            file,
            true,
            true,
            undefined,
            false,
            exclusionOverrides
          );
          if (result.success) {
            processed++;
          }
        }
      } catch (error) {
        console.error(`Error processing file ${file.path}:`, error);
        errors++;
      }
    }

    // Show completion notice
    if (errors > 0) {
      const errorMsg = t('notifications.renamedNotesWithErrors')
        .replace('{{renamed}}', String(processed))
        .replace('{{total}}', String(files.length))
        .replace('{{errors}}', String(errors));
      new Notice(errorMsg, 0);
    } else {
      const successMsg = t('notifications.renamedNotes')
        .replace('{{renamed}}', String(processed))
        .replace('{{total}}', String(files.length));
      new Notice(successMsg, 0);
    }
  }

  public parsePropertyValue(value: string): string | number | boolean {
    // Try to parse as boolean
    const lowerValue = value.toLowerCase().trim();
    if (lowerValue === 'true') return true;
    if (lowerValue === 'false') return false;

    // Try to parse as number
    if (!isNaN(Number(value)) && value.trim() !== '') {
      return Number(value);
    }

    // Return as string
    return value;
  }

  async disableRenamingForNote(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile || activeFile.extension !== 'md') {
      new Notice(t('notifications.errorNoActiveNote'));
      return;
    }

    // Ensure property type is set to checkbox before adding property
    await this.propertyManager.ensurePropertyTypeIsCheckbox();

    // Check if property already exists
    const hasProperty = hasDisablePropertyInFile(
      activeFile,
      this.app,
      this.settings.exclusions.disableRenamingKey,
      this.settings.exclusions.disableRenamingValue
    );

    try {
      if (!hasProperty) {
        const originalMtime = this.settings.core.preserveModificationDate
          ? activeFile.stat.mtime
          : undefined;
        await this.app.fileManager.processFrontMatter(
          activeFile,
          (frontmatter) => {
            frontmatter[this.settings.exclusions.disableRenamingKey] =
              this.parsePropertyValue(
                this.settings.exclusions.disableRenamingValue
              );
          },
          originalMtime !== undefined ? { mtime: originalMtime } : undefined
        );
      }

      new Notice(
        t('notifications.disabledRenamingFor', {
          filename: activeFile.basename,
        })
      );
    } catch (error) {
      console.error('Failed to disable renaming:', error);
      new Notice(t('notifications.failedToDisable'));
    }
  }

  async enableRenamingForNote(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile || activeFile.extension !== 'md') {
      new Notice(t('notifications.errorNoActiveNote'));
      return;
    }

    // Check if property exists
    const hasProperty = hasDisablePropertyInFile(
      activeFile,
      this.app,
      this.settings.exclusions.disableRenamingKey,
      this.settings.exclusions.disableRenamingValue
    );

    try {
      if (hasProperty) {
        const originalMtime = this.settings.core.preserveModificationDate
          ? activeFile.stat.mtime
          : undefined;
        await this.app.fileManager.processFrontMatter(
          activeFile,
          (frontmatter) => {
            delete frontmatter[this.settings.exclusions.disableRenamingKey];
          },
          originalMtime !== undefined ? { mtime: originalMtime } : undefined
        );
      }

      new Notice(
        t('notifications.enabledRenamingFor', {
          filename: activeFile.basename,
        })
      );
    } catch (error) {
      console.error('Failed to enable renaming:', error);
      new Notice(t('notifications.failedToEnable'));
    }
  }

  addSafeInternalLink(): void {
    this.linkManager.addSafeInternalLink();
  }

  addSafeInternalLinkWithCaption(): void {
    this.linkManager.addSafeInternalLinkWithCaption();
  }

  addInternalLinkWithCaptionAndCustomTarget(): void {
    this.linkManager.addInternalLinkWithCaptionAndCustomTarget();
  }

  updatePropertyVisibility(): void {
    this.propertyVisibility.updatePropertyVisibility();
  }

  private checkAndShowNotices(): void {
    const today = this.getTodayDateString();

    // Update last usage date
    this.updateLastUsageDate(today);

    // Check for first-time setup
    if (!this.settings.core.hasShownFirstTimeNotice) {
      this.showFirstTimeNotice();
      return;
    }

    // Check for long inactivity (30+ days) - only if automatic renaming is enabled
    if (
      this.settings.core.lastUsageDate &&
      this.isInactive(this.settings.core.lastUsageDate, today) &&
      this.settings.core.renameNotes === 'automatically'
    ) {
      this.showInactivityNotice();
    }
  }

  getTodayDateString(): string {
    // Returns YYYY-MM-DD format using standard API
    return new Date().toISOString().split('T')[0];
  }

  getCurrentTimestamp(): string {
    // Returns ISO format for unambiguous parsing: YYYY-MM-DDTHH:mm:ssZ
    return new Date().toISOString();
  }

  private isInactive(lastUsageDate: string, todayDate: string): boolean {
    const lastDate = new Date(lastUsageDate);
    const today = new Date(todayDate);
    const daysDiff = Math.floor(
      (today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysDiff > 30;
  }

  private showFirstTimeNotice(): void {
    new Notice(t('notifications.firstTimeNotice'), 10000);
    this.settings.core.hasShownFirstTimeNotice = true;
    void this.saveSettings();
  }

  private showInactivityNotice(): void {
    new Notice(t('notifications.inactivityNotice'), 10000);
  }

  private updateLastUsageDate(today: string): void {
    if (this.settings.core.lastUsageDate !== today) {
      this.settings.core.lastUsageDate = today;
      void this.saveSettings();
    }
  }

  // Call this method at the start of any significant plugin operation
  trackUsage(): void {
    const today = this.getTodayDateString();
    this.updateLastUsageDate(today);
  }

  async onload(): Promise<void> {
    this.pluginLoadTime = Date.now();

    // Initialize i18n system
    initI18n();

    await this.loadSettings();

    // Reset Debug mode if more than 24 hours have passed since it was enabled
    if (
      this.settings.core.verboseLogging &&
      this.settings.core.debugEnabledTimestamp
    ) {
      const enabledTime = new Date(
        this.settings.core.debugEnabledTimestamp
      ).getTime();
      const currentTime = new Date().getTime();
      const hoursPassed = (currentTime - enabledTime) / (1000 * 60 * 60);

      if (hoursPassed >= 24) {
        this.settings.core.verboseLogging = false;
        this.settings.core.debugEnabledTimestamp = ''; // Clear stale timestamp
        await this.saveSettings();
      }
    }

    // Initialize high-performance cache system
    this.cacheManager = new CacheManager(this);

    // Initialize file state manager
    this.fileStateManager = new FileStateManager(this);

    // Schedule periodic maintenance to clean up stale state (every 10 minutes)
    this.registerInterval(
      window.setInterval(
        () => {
          this.fileStateManager.runMaintenance();
        },
        10 * 60 * 1000
      )
    );

    // Check for first-time setup or long inactivity
    this.checkAndShowNotices();

    // Initialize the rename engine
    this.renameEngine = new RenameEngine(this);

    // Initialize the alias manager
    this.aliasManager = new AliasManager(this);

    this.contextMenuManager = new ContextMenuManager(this);

    // Initialize file operations (required by workspace integration)
    this.fileOperations = new FileOperations(this);

    // Initialize editor lifecycle manager
    this.editorLifecycle = new EditorLifecycleManager(this);

    // Initialize workspace integration manager
    this.workspaceIntegration = new WorkspaceIntegration(this);

    // Initialize property manager
    this.propertyManager = new PropertyManager(this);

    // Initialize title insertion manager
    this.titleInsertion = new TitleInsertion(this);

    // Initialize event handler manager
    this.eventHandlerManager = new EventHandlerManager(this);

    // Note: folderOperations, tagOperations, linkManager, and propertyVisibility
    // are now lazy-loaded on first access for faster plugin load time

    // Auto-detect OS every time plugin loads
    this.settings.replaceCharacters.osPreset = detectOS();
    await this.saveSettings();

    if (this.settings.core.verboseLogging) {
      console.debug(`Plugin loaded - build ${BUILD_GIT_HASH}`);
    }
    verboseLog(
      this,
      `Detected OS: \`${this.settings.replaceCharacters.osPreset}\``
    );

    // Initialize first-enable logic and exclusions setup
    const pluginInitializer = new PluginInitializer(this);
    await pluginInitializer.initializeFirstEnableLogic();
    await pluginInitializer.checkFirstTimeExclusionsSetup();

    this.addSettingTab(new FirstLineIsTitleSettings(this.app, this));

    // Register command palette commands
    this.commandRegistrar = new CommandRegistrar(this);
    this.commandRegistrar.registerCommands();

    // Defer ribbon icon registration until workspace layout is ready
    this.app.workspace.onLayoutReady(() => {
      this.workspaceIntegration.registerRibbonIcons();
    });

    // Register all event handlers
    this.eventHandlerManager.registerAllHandlers();

    // Setup cursor positioning for new notes
    this.workspaceIntegration.setupCursorPositioning();

    // Setup save event hook for rename on save
    this.workspaceIntegration.setupSaveEventHook();

    // Initialize property visibility
    this.updatePropertyVisibility();

    // Mark plugin as fully loaded after layout is ready to prevent processing existing files on startup
    this.app.workspace.onLayoutReady(() => {
      this.isFullyLoaded = true;
      this.editorLifecycle.initializeCheckingSystem();
      verboseLog(
        this,
        'Checking system initialized based on checkInterval setting'
      );
    });

    // Setup window.DEBUG for console access
    this.setupDebugConsoleAPI();
  }

  private setupDebugConsoleAPI(): void {
    const enableDebug = async () => {
      this.settings.core.verboseLogging = true;
      this.settings.core.debugEnabledTimestamp = this.getCurrentTimestamp();
      await this.saveSettings();
      console.debug('🐛 Debug mode enabled (will auto-disable after 24 hours)');
      this.outputAllSettings();
    };

    const disableDebug = async () => {
      this.settings.core.verboseLogging = false;
      this.settings.core.debugEnabledTimestamp = ''; // Clear timestamp
      await this.saveSettings();
      console.debug('Debug mode disabled');
    };

    // Setup window.FLIT namespace
    window.FLIT = {
      debug: {
        enable: enableDebug,
        disable: disableDebug,
      },
    };

    // Setup window.DEBUG namespace (shared with other plugins)
    if (!window.DEBUG) {
      this._createdDebugNamespace = true;
      window.DEBUG = {
        enable: async (namespace?: string) => {
          if (namespace === 'first-line-is-title' || namespace === 'FLIT') {
            await enableDebug();
          }
        },
        disable: async (namespace?: string) => {
          if (namespace === 'first-line-is-title' || namespace === 'FLIT') {
            await disableDebug();
          }
        },
      };
    } else {
      // window.DEBUG already exists - use monkey-around for safe patching
      this._debugPatchCleanup = around(window.DEBUG, {
        enable(original) {
          return async function (namespace?: string) {
            if (namespace === 'first-line-is-title' || namespace === 'FLIT') {
              await enableDebug();
            } else if (typeof original === 'function') {
              await original.call(this, namespace);
            }
          };
        },
        disable(original) {
          return async function (namespace?: string) {
            if (namespace === 'first-line-is-title' || namespace === 'FLIT') {
              await disableDebug();
            } else if (typeof original === 'function') {
              await original.call(this, namespace);
            }
          };
        },
      });
    }
  }

  onunload() {
    if (this.cacheManager) {
      this.cacheManager.dispose();
    }

    if (this.fileStateManager) {
      this.fileStateManager.dispose();
    }

    if (this.editorLifecycle) {
      this.editorLifecycle.clearCheckingSystems();
    }

    if (this.workspaceIntegration) {
      this.workspaceIntegration.cleanup();
    }

    // Cleanup lazy-loaded managers only if they were instantiated
    if (this._propertyVisibility) {
      this._propertyVisibility.cleanup();
    }

    if (this.fileOperations) {
      this.fileOperations.cleanup();
    }

    // Cleanup console API
    delete window.FLIT;

    // Restore or cleanup window.DEBUG
    if (this._createdDebugNamespace) {
      delete window.DEBUG;
    } else if (this._debugPatchCleanup) {
      this._debugPatchCleanup();
    }

    verboseLog(this, 'Plugin unloaded');
  }

  async loadSettings(): Promise<void> {
    const loadedData = (await this.loadData()) || {};

    // Use deep merge to preserve nested properties
    this.settings = deepMerge(DEFAULT_SETTINGS, loadedData);

    if (this.settings.exclusions.excludedFolders.length === 0) {
      this.settings.exclusions.excludedFolders.push('');
    }
    if (this.settings.exclusions.excludedTags.length === 0) {
      this.settings.exclusions.excludedTags.push('');
    }

    // Localize default safeword example (only if user hasn't enabled safewords yet)
    if (
      !this.settings.core.hasEnabledSafewords &&
      this.settings.safewords.safewords.length > 0
    ) {
      const locale = getCurrentLocale();
      if (locale === 'ru') {
        this.settings.safewords.safewords[0].text = 'Задачи';
      } else {
        this.settings.safewords.safewords[0].text = 'To do';
      }
    }

    // Deduplicate exclusion lists on load
    const hasChanges = deduplicateExclusions(this.settings);
    if (hasChanges) {
      await this.saveSettings();
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
