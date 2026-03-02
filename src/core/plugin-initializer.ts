import { verboseLog } from '../utils';
import { FirstLineIsTitlePlugin } from '../settings/settings-base';

/**
 * PluginInitializer
 *
 * Handles plugin initialization logic including:
 * - First-enable logic for settings
 *
 * Responsibilities:
 * - Initialize first-enable states for custom replacements, safewords, forbidden chars
 * - Handle settings defaults
 */
export class PluginInitializer {
  constructor(private plugin: FirstLineIsTitlePlugin) {}

  get settings() {
    return this.plugin.settings;
  }

  /**
   * Initialize first-enable logic for sections
   * Ensures that when features are enabled for the first time, their items are enabled
   */
  async initializeFirstEnableLogic(): Promise<void> {
    let settingsChanged = false;

    // Custom replacements first-enable logic
    if (
      this.settings.customRules.enableCustomReplacements &&
      !this.settings.core.hasEnabledCustomReplacements
    ) {
      this.settings.customRules.customReplacements.forEach((replacement) => {
        replacement.enabled = true;
      });
      this.settings.core.hasEnabledCustomReplacements = true;
      settingsChanged = true;
      verboseLog(
        this.plugin,
        'Initialized custom replacements on first enable'
      );
    }

    // Safewords first-enable logic
    if (
      this.settings.safewords.enableSafewords &&
      !this.settings.core.hasEnabledSafewords
    ) {
      this.settings.safewords.safewords.forEach((safeword) => {
        safeword.enabled = true;
      });
      this.settings.core.hasEnabledSafewords = true;
      settingsChanged = true;
      verboseLog(this.plugin, 'Initialized safewords on first enable');
    }

    // Forbidden chars first-enable logic
    if (
      this.settings.replaceCharacters.enableForbiddenCharReplacements &&
      !this.settings.core.hasEnabledForbiddenChars
    ) {
      const allOSesKeys = [
        'leftBracket',
        'rightBracket',
        'hash',
        'caret',
        'pipe',
        'backslash',
        'slash',
        'colon',
        'dot',
      ];
      allOSesKeys.forEach((key) => {
        this.settings.replaceCharacters.charReplacements[
          key as keyof typeof this.settings.replaceCharacters.charReplacements
        ].enabled = true;
      });
      this.settings.core.hasEnabledForbiddenChars = true;
      settingsChanged = true;
      verboseLog(
        this.plugin,
        'Initialized forbidden char replacements on first enable'
      );
    }

    if (settingsChanged) {
      await this.plugin.saveSettings();
    }
  }

  /**
   * Check and setup exclusions on first plugin load
   * Auto-detects and excludes template folders and Excalidraw files
   */
  async checkFirstTimeExclusionsSetup(): Promise<void> {
    // Skip if already done
    if (this.settings.core.hasSetupExclusions) {
      return;
    }

    // Check if Excalidraw plugin is installed and enabled
    const excalidrawPlugin = this.plugin.app.plugins.getPlugin(
      'obsidian-excalidraw-plugin'
    ) as { _loaded?: boolean } | null;
    if (excalidrawPlugin && excalidrawPlugin._loaded) {
      // Check if excalidraw-plugin property already exists
      const hasExcalidrawProperty =
        this.settings.exclusions.excludedProperties.some(
          (prop) => prop.key === 'excalidraw-plugin' && prop.value === 'parsed'
        );

      if (!hasExcalidrawProperty) {
        // Add Excalidraw exclusion
        this.settings.exclusions.excludedProperties.push({
          key: 'excalidraw-plugin',
          value: 'parsed',
        });
        await this.plugin.saveSettings();
      }
    }

    // Check for Templates and Templater folders
    if (this.settings.core.verboseLogging)
      console.debug('Checking for template plugin folders to auto-exclude');
    const adapter = this.plugin.app.vault.adapter;
    const configDir = this.plugin.app.vault.configDir;
    if (this.settings.core.verboseLogging)
      console.debug('Vault config directory is:', configDir);
    let templatesFolder: string | null = null;
    let templaterFolder: string | null = null;

    // Check core Templates plugin - only if enabled
    try {
      const corePluginsPath = `${configDir}/core-plugins.json`;
      if (this.settings.core.verboseLogging)
        console.debug(
          'Reading core plugins configuration from:',
          corePluginsPath
        );
      const corePluginsData = await adapter.read(corePluginsPath);
      const corePlugins = JSON.parse(corePluginsData);
      if (this.settings.core.verboseLogging)
        console.debug(
          'Core Templates plugin enabled status:',
          corePlugins.templates
        );

      if (corePlugins.templates === true) {
        if (this.settings.core.verboseLogging)
          console.debug(
            'Core Templates plugin is enabled, checking for templates folder'
          );
        const templatesDataPath = `${configDir}/templates.json`;
        if (this.settings.core.verboseLogging)
          console.debug(
            'Reading templates configuration from:',
            templatesDataPath
          );
        const templatesData = await adapter.read(templatesDataPath);
        const templatesConfig = JSON.parse(templatesData);
        templatesFolder = templatesConfig.folder;
        if (this.settings.core.verboseLogging)
          console.debug(
            'Core Templates folder configured as:',
            templatesFolder
          );
      } else {
        if (this.settings.core.verboseLogging)
          console.debug('Core Templates plugin is disabled, skipping');
      }
    } catch (error) {
      if (this.settings.core.verboseLogging)
        console.debug(
          'Could not read core Templates plugin configuration:',
          error
        );
    }

    // Check Templater plugin
    if (this.settings.core.verboseLogging)
      console.debug('Checking for Templater community plugin');
    const templaterPlugin = this.plugin.app.plugins.getPlugin(
      'templater-obsidian'
    ) as { _loaded?: boolean } | null;
    if (this.settings.core.verboseLogging)
      console.debug(
        'Templater plugin found:',
        !!templaterPlugin,
        '| loaded:',
        templaterPlugin?._loaded
      );
    if (templaterPlugin && templaterPlugin._loaded) {
      try {
        const templaterDataPath = `${configDir}/plugins/templater-obsidian/data.json`;
        if (this.settings.core.verboseLogging)
          console.debug(
            'Reading Templater configuration from:',
            templaterDataPath
          );
        const templaterData = await adapter.read(templaterDataPath);
        const templaterConfig = JSON.parse(templaterData);
        templaterFolder = templaterConfig.templates_folder;
        if (this.settings.core.verboseLogging)
          console.debug('Templater folder configured as:', templaterFolder);
      } catch (error) {
        if (this.settings.core.verboseLogging)
          console.debug(
            'Could not read Templater plugin configuration:',
            error
          );
      }
    } else {
      if (this.settings.core.verboseLogging)
        console.debug('Templater plugin not loaded, skipping');
    }

    // Collect folders to add
    const foldersToAdd: string[] = [];

    if (templatesFolder && templatesFolder.trim() !== '') {
      foldersToAdd.push(templatesFolder);
      if (this.settings.core.verboseLogging)
        console.debug(
          'Queued core Templates folder for exclusion:',
          templatesFolder
        );
    } else {
      if (this.settings.core.verboseLogging)
        console.debug('No valid core Templates folder to add');
    }

    // Only add templater folder if it differs from templates folder
    if (templaterFolder && templaterFolder.trim() !== '') {
      if (templaterFolder !== templatesFolder) {
        foldersToAdd.push(templaterFolder);
        if (this.settings.core.verboseLogging)
          console.debug(
            'Queued Templater folder for exclusion:',
            templaterFolder
          );
      } else {
        if (this.settings.core.verboseLogging)
          console.debug(
            'Templater folder matches core Templates folder (' +
              templaterFolder +
              '), will not add duplicate'
          );
      }
    } else {
      if (this.settings.core.verboseLogging)
        console.debug('No valid Templater folder to add');
    }

    if (this.settings.core.verboseLogging)
      console.debug('Total folders to add to exclusions:', foldersToAdd);
    if (this.settings.core.verboseLogging)
      console.debug(
        'Current excluded folders before processing:',
        this.settings.exclusions.excludedFolders
      );

    // Add folders if they don't already exist
    for (const folder of foldersToAdd) {
      const hasFolderExcluded = this.settings.exclusions.excludedFolders.some(
        (existingFolder) => existingFolder === folder
      );

      if (!hasFolderExcluded) {
        // Remove empty string if it's the only entry
        if (
          this.settings.exclusions.excludedFolders.length === 1 &&
          this.settings.exclusions.excludedFolders[0].trim() === ''
        ) {
          this.settings.exclusions.excludedFolders = [];
          if (this.settings.core.verboseLogging)
            console.debug(
              'Removed default empty string entry from excluded folders'
            );
        }

        this.settings.exclusions.excludedFolders.push(folder);
        if (this.settings.core.verboseLogging)
          console.debug('Successfully added folder to exclusions:', folder);
      } else {
        if (this.settings.core.verboseLogging)
          console.debug('Folder already in exclusions list, skipping:', folder);
      }
    }

    // Save if any folders were added
    if (foldersToAdd.length > 0) {
      await this.plugin.saveSettings();
      if (this.settings.core.verboseLogging)
        console.debug(
          'Saved settings after adding template folders to exclusions'
        );
    } else {
      if (this.settings.core.verboseLogging)
        console.debug('No folders were added, skipping settings save');
    }
    if (this.settings.core.verboseLogging)
      console.debug(
        'Final excluded folders after processing:',
        this.settings.exclusions.excludedFolders
      );

    // Mark as setup complete
    this.settings.core.hasSetupExclusions = true;
    await this.plugin.saveSettings();
  }
}
