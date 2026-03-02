import { App, Notice, TFile, TFolder, normalizePath } from 'obsidian';
import { verboseLog } from '../utils';
import { PluginSettings } from '../types';
import { RenameEngine } from '../core/rename-engine';
import { t } from '../i18n';

export class FolderOperations {
  constructor(
    private app: App,
    public settings: PluginSettings,
    private renameEngine: RenameEngine,
    private saveSettings: () => Promise<void>,
    private debugLog: (settingName: string, value: unknown) => void,
    private processMultipleFiles: (
      files: TFile[],
      action: 'rename'
    ) => Promise<void>
  ) {}

  async putFirstLineInTitleForFolder(folder: TFolder): Promise<void> {
    const files = this.app.vault
      .getAllLoadedFiles()
      .filter(
        (file: unknown): file is TFile =>
          file instanceof TFile && file.extension === 'md'
      )
      .filter((file: TFile) => {
        return (
          file.path.startsWith(folder.path + '/') ||
          file.parent?.path === folder.path
        );
      });

    if (files.length === 0) {
      verboseLog(
        this,
        `Showing notice: No markdown files found in this folder.`
      );
      new Notice(
        t('notifications.noNotesFoundInFolder').replace(
          '{{folder}}',
          folder.name
        )
      );
      return;
    }

    verboseLog(
      this,
      `Showing notice: Renaming ${files.length} files in "${folder.path}"...`
    );
    new Notice(
      t('notifications.renamingNNotes').replace(
        '{{count}}',
        String(files.length)
      )
    );

    let processedCount = 0;
    let errorCount = 0;

    const exclusionOverrides = {
      ignoreFolder: true,
      ignoreTag: true,
      ignoreProperty: true,
    };

    for (const file of files) {
      try {
        await this.renameEngine.processFile(
          file,
          true,
          false,
          undefined,
          true,
          exclusionOverrides
        );
        processedCount++;
      } catch (error) {
        console.error(`Error processing file ${file.path}:`, error);
        errorCount++;
      }
    }

    if (errorCount > 0) {
      verboseLog(
        this,
        `Showing notice: Renamed ${processedCount}/${files.length} notes with ${errorCount} errors. Check console for details.`
      );
      new Notice(
        t('notifications.renamedNotesWithErrors')
          .replace('{{renamed}}', String(processedCount))
          .replace('{{total}}', String(files.length))
          .replace('{{errors}}', String(errorCount)),
        0
      );
    } else {
      verboseLog(
        this,
        `Showing notice: Successfully processed ${processedCount} files.`
      );
      new Notice(
        t('notifications.renamedNotes')
          .replace('{{renamed}}', String(processedCount))
          .replace('{{total}}', String(files.length)),
        0
      );
    }
  }

  async toggleFolderExclusion(
    folderPath: string,
    suppressNotice: boolean = false
  ): Promise<void> {
    // Normalize folder path to handle cross-platform differences and user typos
    folderPath = normalizePath(folderPath);

    const isInList =
      this.settings.exclusions.excludedFolders.includes(folderPath);
    const isInverted =
      this.settings.exclusions.folderScopeStrategy === 'Exclude all except...';

    if (isInList) {
      this.settings.exclusions.excludedFolders =
        this.settings.exclusions.excludedFolders.filter(
          (path) => path !== folderPath
        );
      // Ensure there's always at least one entry (even if empty)
      if (this.settings.exclusions.excludedFolders.length === 0) {
        this.settings.exclusions.excludedFolders.push('');
      }

      if (!suppressNotice) {
        if (isInverted) {
          // In inverted mode, removing from list = disabling renaming
          verboseLog(
            this,
            `Showing notice: Renaming disabled for folder: ${folderPath}`
          );
          new Notice(
            t('notifications.disabledRenamingInFolder').replace(
              '{{folder}}',
              folderPath
            )
          );
        } else {
          // In normal mode, removing from list = enabling renaming
          verboseLog(
            this,
            `Showing notice: Renaming enabled for folder: ${folderPath}`
          );
          new Notice(
            t('notifications.enabledRenamingInFolder').replace(
              '{{folder}}',
              folderPath
            )
          );
        }
      }
    } else {
      if (
        this.settings.exclusions.excludedFolders.length === 1 &&
        this.settings.exclusions.excludedFolders[0] === ''
      ) {
        this.settings.exclusions.excludedFolders[0] = folderPath;
      } else {
        this.settings.exclusions.excludedFolders.push(folderPath);
      }

      if (!suppressNotice) {
        if (isInverted) {
          // In inverted mode, adding to list = enabling renaming
          verboseLog(
            this,
            `Showing notice: Renaming enabled for folder: ${folderPath}`
          );
          new Notice(
            t('notifications.enabledRenamingInFolder').replace(
              '{{folder}}',
              folderPath
            )
          );
        } else {
          // In normal mode, adding to list = disabling renaming
          verboseLog(
            this,
            `Showing notice: Renaming disabled for folder: ${folderPath}`
          );
          new Notice(
            t('notifications.disabledRenamingInFolder').replace(
              '{{folder}}',
              folderPath
            )
          );
        }
      }
    }

    this.debugLog('excludedFolders', this.settings.exclusions.excludedFolders);
    await this.saveSettings();
    verboseLog(this, `Folder exclusion toggled for: ${folderPath}`, {
      isNowInList: !isInList,
    });
  }

  getSelectedFolders(): TFolder[] {
    const selectedFolders: TFolder[] = [];

    // Try multiple selection patterns that Obsidian might use
    const selectors = [
      '.nav-folder.is-selected',
      '.nav-folder.is-active',
      '.nav-folder-title.is-selected',
      '.nav-folder-title.is-active',
      '.tree-item.is-selected .nav-folder-title',
      '.tree-item.is-active .nav-folder-title',
    ];

    selectors.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element) => {
        let folderPath = element.getAttribute('data-path');

        if (!folderPath) {
          const parent = element.closest('.nav-folder, .tree-item');
          if (parent) {
            folderPath = parent.getAttribute('data-path');
          }
        }

        if (folderPath) {
          const folder = this.app.vault.getAbstractFileByPath(folderPath);
          if (folder instanceof TFolder && !selectedFolders.includes(folder)) {
            selectedFolders.push(folder);
          }
        }
      });
    });

    return selectedFolders;
  }

  getSelectedFiles(): TFile[] {
    const selectedFiles: TFile[] = [];

    const selectors = [
      '.nav-file.is-selected',
      '.nav-file.is-active',
      '.nav-file-title.is-selected',
      '.nav-file-title.is-active',
      '.tree-item.is-selected .nav-file-title',
      '.tree-item.is-active .nav-file-title',
    ];

    selectors.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element) => {
        let filePath = element.getAttribute('data-path');

        if (!filePath) {
          const parent = element.closest('.nav-file, .tree-item');
          if (parent) {
            filePath = parent.getAttribute('data-path');
          }
        }

        if (filePath) {
          const file = this.app.vault.getAbstractFileByPath(filePath);
          if (
            file instanceof TFile &&
            file.extension === 'md' &&
            !selectedFiles.includes(file)
          ) {
            selectedFiles.push(file);
          }
        }
      });
    });

    return selectedFiles;
  }

  getAllMarkdownFilesInFolder(folder: TFolder): TFile[] {
    const files: TFile[] = [];

    const processFolder = (currentFolder: TFolder) => {
      currentFolder.children.forEach((child) => {
        if (child instanceof TFile && child.extension === 'md') {
          files.push(child);
        } else if (
          child instanceof TFolder &&
          this.settings.exclusions.includeSubfolders
        ) {
          processFolder(child);
        }
      });
    };

    processFolder(folder);
    return files;
  }

  async processMultipleFolders(
    folders: TFolder[],
    action: 'rename' | 'disable' | 'enable'
  ): Promise<void> {
    if (folders.length === 0) return;

    if (action === 'rename') {
      const allFiles: TFile[] = [];
      folders.forEach((folder) => {
        const folderFiles = this.getAllMarkdownFilesInFolder(folder);
        allFiles.push(...folderFiles);
      });

      if (allFiles.length === 0) {
        verboseLog(
          this,
          `Showing notice: No markdown files found in selected folders.`
        );
        new Notice(t('notifications.noNotesFoundInFolders'));
        return;
      }

      verboseLog(
        this,
        `Showing notice: Renaming ${allFiles.length} files from ${folders.length} folders...`
      );
      new Notice(
        t('notifications.renamingNNotes').replace(
          '{{count}}',
          String(allFiles.length)
        )
      );

      await this.processMultipleFiles(allFiles, 'rename');
    } else {
      for (const folder of folders) {
        try {
          const normalizedFolderPath = normalizePath(folder.path);
          const isCurrentlyExcluded =
            this.settings.exclusions.excludedFolders.includes(
              normalizedFolderPath
            );

          if (action === 'disable' && !isCurrentlyExcluded) {
            await this.toggleFolderExclusion(folder.path, true);
          } else if (action === 'enable' && isCurrentlyExcluded) {
            await this.toggleFolderExclusion(folder.path, true);
          }
        } catch (error) {
          console.error(`Error processing folder ${folder.path}:`, error);
        }
      }

      verboseLog(
        this,
        `${action === 'disable' ? 'Disabled' : 'Enabled'} renaming for ${folders.length} folders.`
      );
      new Notice(
        (action === 'enable'
          ? t('notifications.enabledRenamingInNFolders')
          : t('notifications.disabledRenamingInNFolders')
        ).replace('{{count}}', String(folders.length))
      );
    }
  }
}
