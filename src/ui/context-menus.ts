import { Menu, TFile, TFolder, setIcon } from 'obsidian';
import { verboseLog } from '../utils';
import { ProcessTagModal, RenameMultipleFoldersModal } from '../modals';
import FirstLineIsTitlePlugin from '../../main';
import { t, tp } from '../i18n';
import { MenuRenderer } from './menu-config';
import { MenuDefinitions } from './menu-definitions';
import { TIMING } from '../constants/timing';

/**
 * Manages all context menu operations for the First Line is Title plugin.
 * Handles folder/tag menu creation, bulk operations, and menu text generation.
 * Uses declarative menu configuration for clean, maintainable menu definitions.
 */
export class ContextMenuManager {
  private plugin: FirstLineIsTitlePlugin;
  private menuRenderer: MenuRenderer;
  private menuDefinitions: MenuDefinitions;

  constructor(plugin: FirstLineIsTitlePlugin) {
    this.plugin = plugin;
    this.menuRenderer = new MenuRenderer(plugin);
    this.menuDefinitions = new MenuDefinitions(plugin);
  }

  /**
   * Creates or retrieves a context menu for the given mouse event.
   * Uses Tag Wrangler's menuForEvent pattern.
   */
  menuForEvent(evt: MouseEvent): Menu {
    let menu = evt.obsidian_contextmenu;
    if (!menu) {
      menu = evt.obsidian_contextmenu = new Menu();
      setTimeout(
        () => menu!.showAtPosition({ x: evt.pageX, y: evt.pageY }),
        TIMING.NEXT_TICK_MS
      );
    }
    return menu;
  }

  /**
   * Determines whether to show disable menu option for a folder based on scope strategy.
   */
  shouldShowDisableMenuForFolder(folderPath: string): boolean {
    const isInList =
      this.plugin.settings.exclusions.excludedFolders.includes(folderPath);

    let result: boolean;
    if (
      this.plugin.settings.exclusions.folderScopeStrategy === 'Only exclude...'
    ) {
      // Only exclude strategy: list contains DISABLED folders
      // folder in list (disabled) → show "enable" → return false
      // folder not in list (enabled) → show "disable" → return true
      result = !isInList;
    } else {
      // Exclude all except strategy: list contains ENABLED folders
      // folder in list (enabled) → show "disable" → return true
      // folder not in list (disabled) → show "enable" → return false
      result = isInList;
    }

    verboseLog(this.plugin, `shouldShowDisableMenuForFolder(${folderPath})`, {
      folderScopeStrategy: this.plugin.settings.exclusions.folderScopeStrategy,
      isInList,
      result,
      willShow: result ? 'DISABLE menu' : 'ENABLE menu',
    });

    return result;
  }

  /**
   * Determines whether to show disable menu option for a tag based on scope strategy.
   */
  shouldShowDisableMenuForTag(tagName: string): boolean {
    const tagToFind = tagName.startsWith('#') ? tagName : `#${tagName}`;
    const isInList =
      this.plugin.settings.exclusions.excludedTags.includes(tagToFind);

    let result: boolean;
    if (
      this.plugin.settings.exclusions.tagScopeStrategy === 'Only exclude...'
    ) {
      // Only exclude strategy: list contains DISABLED tags
      // tag in list (disabled) → show "enable" → return false
      // tag not in list (enabled) → show "disable" → return true
      result = !isInList;
    } else {
      // Exclude all except strategy: list contains ENABLED tags
      // tag in list (enabled) → show "disable" → return true
      // tag not in list (disabled) → show "enable" → return false
      result = isInList;
    }

    verboseLog(this.plugin, `shouldShowDisableMenuForTag(${tagName})`, {
      folderScopeStrategy: this.plugin.settings.exclusions.folderScopeStrategy,
      tagToFind,
      isInList,
      result,
      willShow: result ? 'DISABLE menu' : 'ENABLE menu',
    });

    return result;
  }

  /**
   * Gets the appropriate menu text for folder operations based on scope strategy.
   */
  getFolderMenuText(_folderPath: string): { disable: string; enable: string } {
    if (
      this.plugin.settings.exclusions.folderScopeStrategy === 'Only exclude...'
    ) {
      // Only exclude strategy: list contains DISABLED folders
      return {
        disable: t('commands.disableRenamingInFolder'),
        enable: t('commands.enableRenamingInFolder'),
      };
    } else {
      // Exclude all except strategy: list contains ENABLED folders
      return {
        disable: t('commands.disableRenamingInFolder'),
        enable: t('commands.enableRenamingInFolder'),
      };
    }
  }

  /**
   * Gets the appropriate menu text for tag operations based on scope strategy.
   */
  getTagMenuText(_tagName: string): { disable: string; enable: string } {
    if (
      this.plugin.settings.exclusions.tagScopeStrategy === 'Only exclude...'
    ) {
      // Only exclude strategy: list contains DISABLED tags
      return {
        disable: t('commands.disableRenamingForTag'),
        enable: t('commands.enableRenamingForTag'),
      };
    } else {
      // Exclude all except strategy: list contains ENABLED tags
      return {
        disable: t('commands.disableRenamingForTag'),
        enable: t('commands.enableRenamingForTag'),
      };
    }
  }

  /**
   * Adds tag-related menu items to a context menu.
   * Uses declarative menu configuration for clean, maintainable code.
   */
  addTagMenuItems(menu: Menu, tagName: string): void {
    const config = this.menuDefinitions.getTagMenuConfig();
    const context = { tagName };
    this.menuRenderer.render(menu, config, context);
  }

  /**
   * Adds folder-related menu items to a context menu.
   * Uses declarative menu configuration for clean, maintainable code.
   */
  addFolderMenuItems(menu: Menu, folder: TFolder): void {
    const config = this.menuDefinitions.getFolderMenuConfig();
    const context = { folder };
    this.menuRenderer.render(menu, config, context);
  }

  /**
   * Adds file-related menu items to a context menu.
   * Uses declarative menu configuration for clean, maintainable code.
   */
  addFileMenuItems(menu: Menu, file: TFile): void {
    const config = this.menuDefinitions.getFileMenuConfig();
    const context = { file };
    this.menuRenderer.render(menu, config, context);
  }

  /**
   * Adds tag-related menu items directly to a DOM element.
   * Used for custom menu implementations.
   */
  addTagMenuItemsToDOM(menuEl: HTMLElement, tagName: string): void {
    if (!this.plugin.settings.core.enableTagCommands) return;

    const shouldShowDisable = this.shouldShowDisableMenuForTag(tagName);
    const menuText = this.getTagMenuText(tagName);

    if (this.plugin.settings.core.commandVisibility.tagPutFirstLineInTitle) {
      const menuItem = menuEl.createEl('div', { cls: 'menu-item' });
      const iconEl = menuItem.createEl('div', { cls: 'menu-item-icon' });
      setIcon(iconEl, 'file-type');
      menuItem.createEl('div', {
        cls: 'menu-item-title',
        text: t('commands.putFirstLineInTitle'),
      });

      menuItem.addEventListener('click', () => {
        new ProcessTagModal(this.plugin.app, this.plugin, tagName).open();
        menuEl.remove();
      });
    }

    if (
      shouldShowDisable &&
      this.plugin.settings.core.commandVisibility.tagExclude
    ) {
      const menuItem = menuEl.createEl('div', { cls: 'menu-item' });
      const iconEl = menuItem.createEl('div', { cls: 'menu-item-icon' });
      setIcon(iconEl, 'square-x');
      menuItem.createEl('div', {
        cls: 'menu-item-title',
        text: menuText.disable,
      });

      menuItem.addEventListener('click', () => {
        void this.plugin.toggleTagExclusion(tagName);
        menuEl.remove();
      });
    }

    if (
      !shouldShowDisable &&
      this.plugin.settings.core.commandVisibility.tagStopExcluding
    ) {
      const menuItem = menuEl.createEl('div', { cls: 'menu-item' });
      const iconEl = menuItem.createEl('div', { cls: 'menu-item-icon' });
      setIcon(iconEl, 'square-check');
      menuItem.createEl('div', {
        cls: 'menu-item-title',
        text: menuText.enable,
      });

      menuItem.addEventListener('click', () => {
        void this.plugin.toggleTagExclusion(tagName);
        menuEl.remove();
      });
    }
  }

  /**
   * Adds menu items for bulk operations on multiple folders.
   */
  addMultiFolderMenuItems(menu: Menu, folders: TFolder[]): void {
    if (!this.plugin.settings.core.enableFolderCommands) return;

    let totalFiles = 0;
    folders.forEach((folder) => {
      const files = this.plugin.getAllMarkdownFilesInFolder(folder);
      totalFiles += files.length;
    });

    const hasRenameCommand =
      this.plugin.settings.core.commandVisibility.folderPutFirstLineInTitle &&
      totalFiles > 0;
    const hasDisableCommand =
      this.plugin.settings.core.commandVisibility.folderExclude;
    const hasEnableCommand =
      this.plugin.settings.core.commandVisibility.folderStopExcluding;

    if (!hasRenameCommand && !hasDisableCommand && !hasEnableCommand) return;

    menu.addSeparator();

    if (hasRenameCommand) {
      menu.addItem((item) => {
        item
          .setTitle(tp('commands.putFirstLineInTitleNFolders', folders.length))
          .setIcon('folder-pen')
          .onClick(() => {
            new RenameMultipleFoldersModal(
              this.plugin.app,
              this.plugin,
              folders
            ).open();
          });
      });
    }

    if (hasDisableCommand) {
      menu.addItem((item) => {
        item
          .setTitle(tp('commands.disableRenamingNFolders', folders.length))
          .setIcon('square-x')
          .onClick(async () => {
            await this.plugin.processMultipleFolders(folders, 'disable');
          });
      });
    }

    if (hasEnableCommand) {
      menu.addItem((item) => {
        item
          .setTitle(tp('commands.enableRenamingNFolders', folders.length))
          .setIcon('square-check')
          .onClick(async () => {
            await this.plugin.processMultipleFolders(folders, 'enable');
          });
      });
    }
  }
}
