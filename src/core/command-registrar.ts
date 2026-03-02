import { Notice } from 'obsidian';
import { verboseLog, reverseCharacterReplacements } from '../utils';
import { RenameAllFilesModal } from '../modals';
import FirstLineIsTitle from '../../main';
import { t } from '../i18n';

/**
 * CommandRegistrar
 *
 * Handles registration of all command palette commands for the plugin.
 *
 * Responsibilities:
 * - Register rename commands (current file, unless excluded, all files)
 * - Register link commands (safe internal link, with caption)
 * - Register toggle and utility commands
 */
export class CommandRegistrar {
  constructor(private plugin: FirstLineIsTitle) {}

  get app() {
    return this.plugin.app;
  }

  get settings() {
    return this.plugin.settings;
  }

  /**
   * Register all command palette commands
   */
  registerCommands(): void {
    this.registerRenameCurrentFileCommand();
    this.registerRenameCurrentFileUnlessExcludedCommand();
    this.registerRenameAllFilesCommand();
    this.registerSafeInternalLinkCommand();
    this.registerSafeInternalLinkWithCaptionCommand();
    this.registerInternalLinkWithCaptionAndCustomTargetCommand();
    this.registerToggleAutomaticRenamingCommand();
    this.registerDisableRenamingCommand();
    this.registerEnableRenamingCommand();
    this.registerInsertFilenameCommand();
  }

  /**
   * Register command: Put first line in title
   * Note: This command ignores folder/tag/property exclusions but ALWAYS respects disable property
   */
  private registerRenameCurrentFileCommand(): void {
    this.plugin.addCommand({
      id: 'rename-current-file',
      name: t('commands.putFirstLineInTitle'),
      icon: 'file-type',
      checkCallback: (checking: boolean) => {
        const activeEditor = this.app.workspace.activeEditor;
        if (!activeEditor?.file || activeEditor.file.extension !== 'md') {
          return false;
        }

        if (checking) {
          return true;
        }

        verboseLog(
          this.plugin,
          `Manual rename command triggered for ${activeEditor.file.path} (ignoring folder/tag/property exclusions, respecting disable property)`
        );
        const exclusionOverrides = {
          ignoreFolder: true,
          ignoreTag: true,
          ignoreProperty: true,
        };
        void this.plugin.renameEngine.processFile(
          activeEditor.file,
          true,
          true,
          undefined,
          false,
          exclusionOverrides,
          true,
          activeEditor.editor
        );
        return true;
      },
    });
  }

  /**
   * Register command: Put first line in title (unless excluded)
   */
  private registerRenameCurrentFileUnlessExcludedCommand(): void {
    this.plugin.addCommand({
      id: 'rename-current-file-unless-excluded',
      name: t('commands.putFirstLineInTitleUnlessExcluded'),
      icon: 'file-type',
      checkCallback: (checking: boolean) => {
        const activeEditor = this.app.workspace.activeEditor;
        if (!activeEditor?.file || activeEditor.file.extension !== 'md') {
          return false;
        }

        if (checking) {
          return true;
        }

        verboseLog(
          this.plugin,
          `Manual rename command triggered for ${activeEditor.file.path} (unless excluded)`
        );
        void this.plugin.renameEngine.processFile(
          activeEditor.file,
          true,
          true,
          undefined,
          false,
          undefined,
          true,
          activeEditor.editor
        );
        return true;
      },
    });
  }

  /**
   * Register command: Put first line in title in all notes
   */
  private registerRenameAllFilesCommand(): void {
    this.plugin.addCommand({
      id: 'rename-all-files',
      name: t('commands.putFirstLineInTitleAllNotes'),
      icon: 'file-stack',
      callback: () => {
        verboseLog(this.plugin, 'Bulk rename command triggered');
        new RenameAllFilesModal(this.app, this.plugin).open();
      },
    });
  }

  /**
   * Register command: Add safe internal link
   */
  private registerSafeInternalLinkCommand(): void {
    this.plugin.addCommand({
      id: 'add-safe-internal-link',
      name: t('commands.addSafeInternalLink'),
      icon: 'link',
      editorCallback: (_editor, _view) => {
        this.plugin.addSafeInternalLink();
      },
    });
  }

  /**
   * Register command: Add safe internal link with selection as caption
   */
  private registerSafeInternalLinkWithCaptionCommand(): void {
    this.plugin.addCommand({
      id: 'add-safe-internal-link-with-caption',
      name: t('commands.addSafeInternalLinkWithCaption'),
      icon: 'link',
      editorCallback: (_editor, _view) => {
        this.plugin.addSafeInternalLinkWithCaption();
      },
    });
  }

  /**
   * Register command: Add internal link with caption and custom target
   */
  private registerInternalLinkWithCaptionAndCustomTargetCommand(): void {
    this.plugin.addCommand({
      id: 'add-internal-link-with-caption-and-custom-target',
      name: t('commands.addInternalLinkWithCaptionAndCustomTarget'),
      icon: 'link',
      editorCallback: (_editor, _view) => {
        this.plugin.addInternalLinkWithCaptionAndCustomTarget();
      },
    });
  }

  /**
   * Register command: Toggle automatic renaming
   */
  private registerToggleAutomaticRenamingCommand(): void {
    this.plugin.addCommand({
      id: 'toggle-automatic-renaming',
      name: t('commands.toggleAutomaticRenaming'),
      icon: 'file-cog',
      callback: async () => {
        const newValue =
          this.settings.core.renameNotes === 'automatically'
            ? 'manually'
            : 'automatically';
        this.settings.core.renameNotes = newValue;
        await this.plugin.saveSettings();
        const notificationKey =
          newValue === 'automatically'
            ? 'notifications.automaticRenamingEnabled'
            : 'notifications.automaticRenamingDisabled';
        new Notice(t(notificationKey));
      },
    });
  }

  /**
   * Execute rename current file command (public method for ribbon/external use)
   */
  async executeRenameCurrentFile(): Promise<void> {
    const activeEditor = this.app.workspace.activeEditor;
    if (!activeEditor?.file || activeEditor.file.extension !== 'md') {
      verboseLog(
        this.plugin,
        `Showing notice: ${t('notifications.errorNoActiveNote')}`
      );
      new Notice(t('notifications.errorNoActiveNote'));
      return;
    }
    verboseLog(
      this.plugin,
      `Manual rename command triggered for ${activeEditor.file.path} (ignoring folder/tag/property exclusions, respecting disable property)`
    );
    const exclusionOverrides = {
      ignoreFolder: true,
      ignoreTag: true,
      ignoreProperty: true,
    };
    await this.plugin.renameEngine.processFile(
      activeEditor.file,
      true,
      true,
      undefined,
      false,
      exclusionOverrides,
      true,
      activeEditor.editor
    );
  }

  /**
   * Execute rename unless excluded command (public method for ribbon/external use)
   */
  async executeRenameUnlessExcluded(): Promise<void> {
    const activeEditor = this.app.workspace.activeEditor;
    if (!activeEditor?.file || activeEditor.file.extension !== 'md') {
      verboseLog(
        this.plugin,
        `Showing notice: ${t('notifications.errorNoActiveNote')}`
      );
      new Notice(t('notifications.errorNoActiveNote'));
      return;
    }
    verboseLog(
      this.plugin,
      `Manual rename command triggered for ${activeEditor.file.path} (unless excluded)`
    );
    await this.plugin.renameEngine.processFile(
      activeEditor.file,
      true,
      true,
      undefined,
      false,
      undefined,
      true,
      activeEditor.editor
    );
  }

  /**
   * Execute toggle automatic renaming command (public method for ribbon/external use)
   */
  async executeToggleAutomaticRenaming(): Promise<void> {
    const newValue =
      this.settings.core.renameNotes === 'automatically'
        ? 'manually'
        : 'automatically';
    this.settings.core.renameNotes = newValue;
    await this.plugin.saveSettings();
    const notificationKey =
      newValue === 'automatically'
        ? 'notifications.automaticRenamingEnabled'
        : 'notifications.automaticRenamingDisabled';
    new Notice(t(notificationKey));
  }

  /**
   * Register command: Disable renaming for current note
   * Uses checkCallback to only show when disable property doesn't exist
   */
  private registerDisableRenamingCommand(): void {
    this.plugin.addCommand({
      id: 'disable-renaming-for-note',
      name: t('commands.disableRenamingForNote'),
      icon: 'square-x',
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') {
          return false;
        }

        // Check if property exists (synchronously using cache)
        const fileCache = this.app.metadataCache.getFileCache(activeFile);
        const hasProperty =
          fileCache?.frontmatter?.[
            this.settings.exclusions.disableRenamingKey
          ] !== undefined;

        if (checking) {
          // Only show command if property doesn't exist
          return !hasProperty;
        }

        // Execute command
        this.plugin.disableRenamingForNote().catch((error) => {
          console.error('Failed to disable renaming:', error);
        });
        return true;
      },
    });
  }

  /**
   * Register command: Enable renaming for current note
   * Uses checkCallback to only show when disable property exists
   */
  private registerEnableRenamingCommand(): void {
    this.plugin.addCommand({
      id: 'enable-renaming-for-note',
      name: t('commands.enableRenamingForNote'),
      icon: 'square-check',
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') {
          return false;
        }

        // Check if property exists (synchronously using cache)
        const fileCache = this.app.metadataCache.getFileCache(activeFile);
        const hasProperty =
          fileCache?.frontmatter?.[
            this.settings.exclusions.disableRenamingKey
          ] !== undefined;

        if (checking) {
          // Only show command if property exists
          return hasProperty;
        }

        // Execute command
        this.plugin.enableRenamingForNote().catch((error) => {
          console.error('Failed to enable renaming:', error);
        });
        return true;
      },
    });
  }

  /**
   * Register command: Insert filename at cursor position
   * Inserts current filename at cursor position with character reversal
   */
  private registerInsertFilenameCommand(): void {
    this.plugin.addCommand({
      id: 'insert-filename',
      name: t('commands.insertFilename'),
      icon: 'clipboard-type',
      editorCheckCallback: (checking: boolean, editor, view) => {
        const file = view.file;
        if (!file || file.extension !== 'md') {
          return false;
        }

        if (checking) {
          return true;
        }

        // Get filename with optional character reversal
        const filename = reverseCharacterReplacements(
          file.basename,
          this.settings
        );

        // Insert filename at cursor
        editor.replaceSelection(filename);
        return true;
      },
    });
  }
}
