import { Notice, TFile, TFolder } from 'obsidian';
import { MenuConfig } from './menu-config';
import FirstLineIsTitlePlugin from '../../main';
import { ProcessTagModal, RenameFolderModal } from '../modals';
import { t } from '../i18n';
import { setDisableRenamingProperty } from '../utils/property-value';

/**
 * Declarative Menu Definitions
 *
 * All context menu configurations defined as data structures.
 * Each menu type has its own configuration with visibility rules and actions.
 */

// Context type interfaces
interface TagContext {
  tagName: string;
}

interface FolderContext {
  folder: TFolder;
}

interface FileContext {
  file: TFile;
}

export class MenuDefinitions {
  constructor(private plugin: FirstLineIsTitlePlugin) {}

  /**
   * Tag context menu configuration
   */
  getTagMenuConfig(): MenuConfig {
    return {
      items: [
        {
          id: 'tag-put-first-line-in-title',
          title: t('commands.putFirstLineInTitle'),
          icon: 'file-type-corner',
          visible: (_context) => this.plugin.settings.core.enableTagCommands,
          onClick: (context) => {
            const tagContext = context as TagContext;
            new ProcessTagModal(
              this.plugin.app,
              this.plugin,
              tagContext.tagName
            ).open();
          },
        },
        {
          id: 'tag-disable-renaming',
          title: this.plugin.contextMenuManager.getTagMenuText().disable,
          icon: 'pen-off',
          visible: (context) => {
            if (!this.plugin.settings.core.enableTagCommands) return false;
            const tagContext = context as TagContext;
            const shouldShowDisable =
              this.plugin.contextMenuManager.shouldShowDisableMenuForTag(
                tagContext.tagName
              );
            return shouldShowDisable;
          },
          onClick: async (context) => {
            const tagContext = context as TagContext;
            await this.plugin.toggleTagExclusion(tagContext.tagName);
          },
        },
        {
          id: 'tag-enable-renaming',
          title: this.plugin.contextMenuManager.getTagMenuText().enable,
          icon: 'file-pen',
          visible: (context) => {
            if (!this.plugin.settings.core.enableTagCommands) return false;
            const tagContext = context as TagContext;
            const shouldShowDisable =
              this.plugin.contextMenuManager.shouldShowDisableMenuForTag(
                tagContext.tagName
              );
            return !shouldShowDisable;
          },
          onClick: async (context) => {
            const tagContext = context as TagContext;
            await this.plugin.toggleTagExclusion(tagContext.tagName);
          },
        },
      ],
    };
  }

  /**
   * Folder context menu configuration
   */
  getFolderMenuConfig(): MenuConfig {
    return {
      items: [
        {
          id: 'folder-put-first-line-in-title',
          title: t('commands.putFirstLineInTitle'),
          icon: 'file-type-corner',
          visible: (_context) => this.plugin.settings.core.enableFolderCommands,
          onClick: (context) => {
            const folderContext = context as FolderContext;
            new RenameFolderModal(
              this.plugin.app,
              this.plugin,
              folderContext.folder
            ).open();
          },
        },
        {
          id: 'folder-disable-renaming',
          title: this.plugin.contextMenuManager.getFolderMenuText().disable,
          icon: 'pen-off',
          visible: (context) => {
            if (!this.plugin.settings.core.enableFolderCommands) return false;
            const folderContext = context as FolderContext;
            const shouldShowDisable =
              this.plugin.contextMenuManager.shouldShowDisableMenuForFolder(
                folderContext.folder.path
              );
            return shouldShowDisable;
          },
          onClick: async (context) => {
            const folderContext = context as FolderContext;
            await this.plugin.toggleFolderExclusion(folderContext.folder.path);
          },
        },
        {
          id: 'folder-enable-renaming',
          title: this.plugin.contextMenuManager.getFolderMenuText().enable,
          icon: 'file-pen',
          visible: (context) => {
            if (!this.plugin.settings.core.enableFolderCommands) return false;
            const folderContext = context as FolderContext;
            const shouldShowDisable =
              this.plugin.contextMenuManager.shouldShowDisableMenuForFolder(
                folderContext.folder.path
              );
            return !shouldShowDisable;
          },
          onClick: async (context) => {
            const folderContext = context as FolderContext;
            await this.plugin.toggleFolderExclusion(folderContext.folder.path);
          },
        },
      ],
    };
  }

  /**
   * File context menu configuration
   */
  getFileMenuConfig(): MenuConfig {
    return {
      items: [
        {
          id: 'file-put-first-line-in-title',
          title: t('commands.putFirstLineInTitle'),
          icon: 'file-type-corner',
          visible: (_context) => this.plugin.settings.core.enableFileCommands,
          onClick: async (context) => {
            const fileContext = context as FileContext;
            const exclusionOverrides = {
              ignoreFolder: true,
              ignoreTag: true,
              ignoreProperty: true,
            };
            await this.plugin.renameEngine?.processFile(
              fileContext.file,
              true,
              true,
              undefined,
              false,
              exclusionOverrides
            );
          },
        },
        {
          id: 'file-disable-renaming',
          title: t('commands.disableRenamingForNote'),
          icon: 'pen-off',
          visible: (context) => {
            if (!this.plugin.settings.core.enableFileCommands) return false;

            const fileContext = context as FileContext;
            const fileCache = this.plugin.app.metadataCache.getFileCache(
              fileContext.file
            );
            if (!fileCache || !fileCache.frontmatter) return true;

            const value = (fileCache.frontmatter as Record<string, unknown>)[
              this.plugin.settings.exclusions.disableRenamingKey
            ];
            if (value === undefined) return true;

            const valueStr = String(value as string).toLowerCase();
            const expectedValue = String(
              this.plugin.settings.exclusions.disableRenamingValue
            ).toLowerCase();
            return valueStr !== expectedValue; // Show disable if property doesn't match
          },
          onClick: async (context) => {
            const fileContext = context as FileContext;
            try {
              await this.plugin.propertyManager.ensurePropertyTypeIsCheckbox();
              await this.plugin.app.fileManager.processFrontMatter(
                fileContext.file,
                (frontmatter: Record<string, unknown>) => {
                  setDisableRenamingProperty(
                    frontmatter,
                    this.plugin.settings,
                    false
                  );
                }
              );
              new Notice(
                t('notifications.disabledRenamingFor', {
                  filename: fileContext.file.basename,
                })
              );
            } catch (error) {
              console.error('Failed to disable renaming:', error);
              const notice = new Notice(t('notifications.failedToDisable'));
              notice.containerEl.addClass('mod-warning');
            }
          },
        },
        {
          id: 'file-enable-renaming',
          title: t('commands.enableRenamingForNote'),
          icon: 'file-pen',
          visible: (context) => {
            if (!this.plugin.settings.core.enableFileCommands) return false;

            const fileContext = context as FileContext;
            const fileCache = this.plugin.app.metadataCache.getFileCache(
              fileContext.file
            );
            if (!fileCache || !fileCache.frontmatter) return false;

            const value = (fileCache.frontmatter as Record<string, unknown>)[
              this.plugin.settings.exclusions.disableRenamingKey
            ];
            if (value === undefined) return false;

            const valueStr = String(value as string).toLowerCase();
            const expectedValue = String(
              this.plugin.settings.exclusions.disableRenamingValue
            ).toLowerCase();
            return valueStr === expectedValue; // Show enable if property matches
          },
          onClick: async (context) => {
            const fileContext = context as FileContext;
            try {
              await this.plugin.app.fileManager.processFrontMatter(
                fileContext.file,
                (frontmatter: Record<string, unknown>) => {
                  setDisableRenamingProperty(
                    frontmatter,
                    this.plugin.settings,
                    true
                  );
                }
              );
              new Notice(
                t('notifications.enabledRenamingFor', {
                  filename: fileContext.file.basename,
                })
              );
            } catch (error) {
              console.error('Failed to enable renaming:', error);
              const notice = new Notice(t('notifications.failedToEnable'));
              notice.containerEl.addClass('mod-warning');
            }
          },
        },
      ],
    };
  }
}
