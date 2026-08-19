import { normalizePath, Notice, Plugin, TFile, TFolder } from 'obsidian';
import { around } from 'monkey-around';
import { PluginSettings } from './src/types';
import { CURRENT_DATA_SCHEMA_VERSION, DEFAULT_SETTINGS } from './src/constants';
import { initI18n, t } from './src/i18n';
import {
  verboseLog,
  detectOS,
  hasDisablePropertyInFile,
  deepMerge,
  normalizeExclusionLists,
} from './src/utils';
import { FirstLineIsTitleSettings } from './src/settings/settings-main';
import { RenameEngine } from './src/core/rename-engine';
import { ContextMenuManager } from './src/ui/context-menus';
import { FolderOperations } from './src/operations/folder-operations';
import { TagOperations } from './src/operations/tag-operations';
import { AliasManager } from './src/core/alias-manager';
import { FileOperations } from './src/operations/file-operations';
import { PropertyVisibility } from './src/ui/property-visibility';
import { setDisableRenamingProperty } from './src/utils/property-value';

// High-performance cache system replaces all global variables
import { CacheManager } from './src/core/cache-manager';
import { EditorLifecycleManager } from './src/core/editor-lifecycle';
import { WorkspaceIntegration } from './src/core/workspace-integration';
import { PropertyManager } from './src/core/property-manager';
import { PluginInitializer } from './src/core/plugin-initializer';
import { CommandRegistrar } from './src/core/command-registrar';
import { LinkManager } from './src/core/link-manager';
import { EventHandlerManager } from './src/core/event-handler-manager';
import { FileStateManager } from './src/core/file-state-manager';
import { NotebookNavigatorIntegration } from './src/core/notebook-navigator-integration';

// Build-time constant injected by esbuild
declare const BUILD_GIT_HASH: string;

export default class FirstLineIsTitle extends Plugin {
  settings: PluginSettings;
  isFullyLoaded: boolean = false;
  pluginLoadTime: number = 0;
  recentlyRenamedPaths: Set<string> = new Set();

  // Set by `loadSettings` when it discards a pre-4.0.0 file, read once by the
  // notice below. Transient by design: the schema stamp makes the reset a
  // one-time event, so no persisted "already shown" flag is needed.
  private settingsWereReset = false;

  cacheManager: CacheManager;
  fileStateManager: FileStateManager;

  renameEngine: RenameEngine;
  contextMenuManager: ContextMenuManager;
  notebookNavigatorIntegration: NotebookNavigatorIntegration;
  aliasManager: AliasManager;
  fileOperations: FileOperations;
  commandRegistrar: CommandRegistrar;
  editorLifecycle: EditorLifecycleManager;
  workspaceIntegration: WorkspaceIntegration;
  propertyManager: PropertyManager;
  eventHandlerManager: EventHandlerManager;

  private _folderOperations?: FolderOperations;
  private _tagOperations?: TagOperations;
  private _propertyVisibility?: PropertyVisibility;
  private _linkManager?: LinkManager;

  private settingTab?: FirstLineIsTitleSettings;

  private _debugPatchCleanup?: () => void;
  private _createdDebugNamespace: boolean = false;

  /**
   * Rebuilds the settings tab's definition tree.
   *
   * Exclusion lists render one row per array entry, and those rows are computed
   * when `getSettingDefinitions()` runs — which happens only at tab
   * registration and on `update()`. Mutating an exclusion array from a context
   * menu would otherwise leave the settings UI showing a stale list until the
   * plugin reloads.
   */
  private refreshSettingsTab(): void {
    this.settingTab?.update();
  }

  get folderOperations(): FolderOperations {
    if (!this._folderOperations) {
      this._folderOperations = new FolderOperations(
        this.app,
        this.settings,
        this.renameEngine,
        () => this.saveSettings(),
        (settingName: string, value: unknown) =>
          this.debugLog(settingName, value),
        (files: TFile[], action: 'rename') =>
          this.processMultipleFiles(files, action)
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
        () => this.saveSettings(),
        (settingName: string, value: unknown) =>
          this.debugLog(settingName, value)
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
    await this.folderOperations.toggleFolderExclusion(folderPath);
    this.refreshSettingsTab();
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
    await this.tagOperations.toggleTagExclusion(tagName);
    this.refreshSettingsTab();
  }

  // Debug logging helper for setting changes
  debugLog(settingName: string, value: unknown): void {
    if (this.settings.core.debug) {
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
      !this.settings.core.debug ||
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
    if (!this.settings.core.debug) {
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
    await this.folderOperations.processMultipleFolders(folders, action);
    // Bulk exclusion changes mutate the same arrays, but only once at the end.
    if (action !== 'rename') this.refreshSettingsTab();
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
        await this.app.fileManager.processFrontMatter(
          activeFile,
          (frontmatter: Record<string, unknown>) => {
            setDisableRenamingProperty(frontmatter, this.settings, false);
          }
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
        await this.app.fileManager.processFrontMatter(
          activeFile,
          (frontmatter: Record<string, unknown>) => {
            setDisableRenamingProperty(frontmatter, this.settings, true);
          }
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

  addSafeInternalLinkWithDisplayText(): void {
    this.linkManager.addSafeInternalLinkWithDisplayText();
  }

  addInternalLinkWithDisplayTextAndCustomTarget(): void {
    this.linkManager.addInternalLinkWithDisplayTextAndCustomTarget();
  }

  updatePropertyVisibility(): void {
    this.propertyVisibility.updatePropertyVisibility();
  }

  private checkAndShowNotices(): void {
    const today = this.getTodayDateString();

    // Update last usage date
    this.updateLastUsageDate(today);

    // Upgraders whose settings were just discarded get one persistent notice.
    if (this.settingsWereReset) {
      this.showSettingsResetNotice();
      return;
    }

    // Check for long inactivity (30+ days) - only if automatic renaming is enabled
    if (
      this.settings.core.lastUsageDate &&
      this.isInactive(this.settings.core.lastUsageDate, today) &&
      this.settings.core.renameAutomatically
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

  private showSettingsResetNotice(): void {
    // Duration 0 keeps it up until dismissed: a timed notice is easy to miss,
    // and this is the only place a user is told their settings were replaced.
    new Notice(t('notifications.settingsReset'), 0);
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
    if (this.settings.core.debug && this.settings.core.debugEnabledTimestamp) {
      const enabledTime = new Date(
        this.settings.core.debugEnabledTimestamp
      ).getTime();
      const currentTime = new Date().getTime();
      const hoursPassed = (currentTime - enabledTime) / (1000 * 60 * 60);

      if (hoursPassed >= 24) {
        this.settings.core.debug = false;
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
    this.notebookNavigatorIntegration = new NotebookNavigatorIntegration(this);

    // Initialize file operations (required by workspace integration)
    this.fileOperations = new FileOperations(this);

    // Initialize editor lifecycle manager
    this.editorLifecycle = new EditorLifecycleManager(this);

    // Initialize workspace integration manager
    this.workspaceIntegration = new WorkspaceIntegration(this);

    // Initialize property manager
    this.propertyManager = new PropertyManager(this);

    // Initialize event handler manager
    this.eventHandlerManager = new EventHandlerManager(this);

    // Note: folderOperations, tagOperations, linkManager, and propertyVisibility
    // are now lazy-loaded on first access for faster plugin load time

    // Auto-detect OS every time plugin loads
    this.settings.characterReplacements.osPreset = detectOS();
    await this.saveSettings();

    if (this.settings.core.debug) {
      console.debug(`Plugin loaded - build ${BUILD_GIT_HASH}`);
    }
    verboseLog(
      this,
      `Detected OS: \`${this.settings.characterReplacements.osPreset}\``
    );

    // Initialize first-enable logic and exclusions setup
    const pluginInitializer = new PluginInitializer(this);
    await pluginInitializer.initializeFirstEnableLogic();
    await pluginInitializer.checkFirstTimeExclusionsSetup();

    this.settingTab = new FirstLineIsTitleSettings(this.app, this);
    this.addSettingTab(this.settingTab);

    // Register command palette commands
    this.commandRegistrar = new CommandRegistrar(this);
    this.commandRegistrar.registerCommands();

    // Defer ribbon icon registration until workspace layout is ready
    this.app.workspace.onLayoutReady(() => {
      this.workspaceIntegration.registerRibbonIcons();
      this.notebookNavigatorIntegration.register();
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
      this.settings.core.debug = true;
      this.settings.core.debugEnabledTimestamp = this.getCurrentTimestamp();
      await this.saveSettings();
      console.debug('🐛 Debug mode enabled (will auto-disable after 24 hours)');
      this.outputAllSettings();
    };

    const disableDebug = async () => {
      this.settings.core.debug = false;
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
    const loadedData = ((await this.loadData()) ||
      {}) as Partial<PluginSettings>;

    // 4.0.0 replaced every per-key migration with a one-time reset. Stored data from
    // an older schema is discarded wholesale rather than merged: the pre-nesting
    // layout left dozens of flat top-level keys and whole dead subsystems in
    // data.json that nothing reads any more, and deepMerge copies stored keys the
    // defaults lack, so every one of them would be written back forever.
    //
    // Resetting is deliberately not special-cased anywhere else. Defaults carry
    // `hasSetupExclusions: false`, so the Excalidraw and template-folder
    // auto-detection runs again, and the reset itself raises a persistent
    // notice pointing at the backup.
    const isCurrentSchema =
      loadedData.dataSchemaVersion === CURRENT_DATA_SCHEMA_VERSION;

    // Copy the old file aside before discarding it. Guarded on there being
    // something to lose, so a genuinely new install writes no backup and gets
    // the first-run notice rather than the reset one.
    if (!isCurrentSchema && Object.keys(loadedData).length > 0) {
      this.settingsWereReset = true;
      await this.backUpPriorSettings();
    }

    // deepMerge deep-copies its defaults, so an empty source yields a fresh clone.
    // DEFAULT_SETTINGS itself must never be handed out: settings are mutated in place.
    this.settings = deepMerge(
      DEFAULT_SETTINGS,
      isCurrentSchema ? loadedData : {}
    );

    // Stored lists can predate the current normalization rules, so clean them on load
    const hasChanges = normalizeExclusionLists(this.settings);
    if (hasChanges) {
      await this.saveSettings();
    }
  }

  /**
   * Copies `data.json` to `data_backup.json` beside it before the schema reset
   * discards the original. The 4.0.0 release notes tell users where to find it;
   * nothing in the UI mentions it, so this reports nothing back.
   *
   * Uses the adapter rather than the Vault API because the plugin's own folder
   * lives under `.obsidian/`, which is outside the vault's file index. Failure is
   * deliberately non-fatal: a missing backup must not stop the plugin loading.
   */
  private async backUpPriorSettings(): Promise<void> {
    const pluginDir = this.manifest?.dir;
    if (!pluginDir) return;

    const source = normalizePath(`${pluginDir}/data.json`);
    const backup = normalizePath(`${pluginDir}/data_backup.json`);
    try {
      const raw = await this.app.vault.adapter.read(source);
      await this.app.vault.adapter.write(backup, raw);
    } catch {
      // Nothing to do: the reset proceeds either way.
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
