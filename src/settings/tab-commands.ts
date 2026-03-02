import { Setting, SettingGroup, setIcon, Notice } from 'obsidian';
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';
import { t } from '../i18n';

interface CommandConfig {
  nameKey: string;
  descKey: string;
  icon: string;
  settingPath: string[];
}

interface SectionConfig {
  titleKey: string;
  descKey: string;
  groupClass: string;
  enableSettingPath: string[];
  commands: CommandConfig[];
}

export class CommandsTab extends SettingsTabBase {
  constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
    super(plugin, containerEl);
  }

  private async saveSettings(): Promise<void> {
    try {
      await this.plugin.saveSettings();
    } catch {
      new Notice(t('settings.errors.saveFailed'));
    }
  }

  private getNestedValue(obj: unknown, path: string[]): unknown {
    let current = obj;
    for (const key of path) {
      if (current && typeof current === 'object' && key in current) {
        current = (current as Record<string, unknown>)[key];
      } else {
        console.warn(`[FLIT] Missing setting path: ${path.join('.')}`);
        return undefined;
      }
    }
    return current;
  }

  private setNestedValue(obj: unknown, path: string[], value: unknown): void {
    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (current && typeof current === 'object' && key in current) {
        current = (current as Record<string, unknown>)[key];
      } else {
        console.warn(
          `[FLIT] Cannot set value, missing path: ${path.join('.')}`
        );
        return;
      }
    }
    if (current && typeof current === 'object') {
      (current as Record<string, unknown>)[path[path.length - 1]] = value;
    }
  }

  private createCommandSetting(
    container: HTMLElement,
    config: CommandConfig
  ): void {
    const currentValue = this.getNestedValue(
      this.plugin.settings,
      config.settingPath
    ) as boolean;

    const setting = new Setting(container)
      .setName(t(config.nameKey))
      .setDesc(t(config.descKey))
      .addToggle((toggle) =>
        toggle.setValue(currentValue).onChange(async (value) => {
          this.setNestedValue(this.plugin.settings, config.settingPath, value);
          this.plugin.debugLog(config.settingPath.join('.'), value);
          await this.saveSettings();
        })
      );

    const iconEl = setting.nameEl.createDiv({ cls: 'setting-item-icon' });
    setIcon(iconEl, config.icon);
    setting.nameEl.insertBefore(iconEl, setting.nameEl.firstChild);
  }

  private createSection(config: SectionConfig): void {
    const enableValue = this.getNestedValue(
      this.plugin.settings,
      config.enableSettingPath
    ) as boolean;

    const toggle = new Setting(this.containerEl)
      .setName(t(config.titleKey))
      .setDesc(t(config.descKey))
      .setHeading()
      .addToggle((toggle) => {
        toggle.setValue(enableValue).onChange(async (value) => {
          this.setNestedValue(
            this.plugin.settings,
            config.enableSettingPath,
            value
          );
          this.plugin.debugLog(config.enableSettingPath.join('.'), value);
          await this.saveSettings();
          updateUI();
        });
      });
    toggle.settingEl.addClass('flit-master-toggle');

    new SettingGroup(this.containerEl).addClass(config.groupClass);
    const container = this.containerEl.querySelector<HTMLElement>(
      `.${config.groupClass} .setting-items`
    );

    if (!container) {
      console.warn(`Container not found for ${config.groupClass}`);
      return;
    }

    const updateUI = () => {
      const isEnabled = this.getNestedValue(
        this.plugin.settings,
        config.enableSettingPath
      ) as boolean;
      if (isEnabled) {
        container.show();
      } else {
        container.hide();
      }
    };

    for (const cmd of config.commands) {
      this.createCommandSetting(container, cmd);
    }

    updateUI();
  }

  render(): void {
    // File commands section
    this.createSection({
      titleKey: 'settings.commands.file.title',
      descKey: 'settings.commands.file.desc',
      groupClass: 'flit-file-group',
      enableSettingPath: ['core', 'enableFileCommands'],
      commands: [
        {
          nameKey: 'commands.putFirstLineInTitle',
          descKey: 'commands.descriptions.renameNoteEvenExcluded',
          icon: 'file-type',
          settingPath: ['core', 'commandVisibility', 'filePutFirstLineInTitle'],
        },
        {
          nameKey: 'commands.disableRenamingForNote',
          descKey: 'commands.descriptions.excludeNote',
          icon: 'square-x',
          settingPath: ['core', 'commandVisibility', 'fileExclude'],
        },
        {
          nameKey: 'commands.enableRenamingForNote',
          descKey: 'commands.descriptions.stopExcludingNote',
          icon: 'square-check',
          settingPath: ['core', 'commandVisibility', 'fileStopExcluding'],
        },
      ],
    });

    // Folder commands section
    this.createSection({
      titleKey: 'settings.commands.folder.title',
      descKey: 'settings.commands.folder.desc',
      groupClass: 'flit-folder-group',
      enableSettingPath: ['core', 'enableFolderCommands'],
      commands: [
        {
          nameKey: 'commands.putFirstLineInTitle',
          descKey: 'commands.descriptions.renameAllNotesInFolder',
          icon: 'folder-pen',
          settingPath: [
            'core',
            'commandVisibility',
            'folderPutFirstLineInTitle',
          ],
        },
        {
          nameKey: 'commands.disableRenamingInFolder',
          descKey: 'commands.descriptions.excludeFolder',
          icon: 'square-x',
          settingPath: ['core', 'commandVisibility', 'folderExclude'],
        },
        {
          nameKey: 'commands.enableRenamingInFolder',
          descKey: 'commands.descriptions.stopExcludingFolder',
          icon: 'square-check',
          settingPath: ['core', 'commandVisibility', 'folderStopExcluding'],
        },
      ],
    });

    // Tag commands section
    this.createSection({
      titleKey: 'settings.commands.tag.title',
      descKey: 'settings.commands.tag.desc',
      groupClass: 'flit-tag-group',
      enableSettingPath: ['core', 'enableTagCommands'],
      commands: [
        {
          nameKey: 'commands.putFirstLineInTitle',
          descKey: 'commands.descriptions.renameAllNotesWithTag',
          icon: 'file-type',
          settingPath: ['core', 'commandVisibility', 'tagPutFirstLineInTitle'],
        },
        {
          nameKey: 'commands.disableRenamingForTag',
          descKey: 'commands.descriptions.excludeTag',
          icon: 'square-x',
          settingPath: ['core', 'commandVisibility', 'tagExclude'],
        },
        {
          nameKey: 'commands.enableRenamingForTag',
          descKey: 'commands.descriptions.stopExcludingTag',
          icon: 'square-check',
          settingPath: ['core', 'commandVisibility', 'tagStopExcluding'],
        },
      ],
    });

    // Search commands section
    this.createSection({
      titleKey: 'settings.commands.search.title',
      descKey: 'settings.commands.search.desc',
      groupClass: 'flit-search-group',
      enableSettingPath: ['core', 'enableVaultSearchContextMenu'],
      commands: [
        {
          nameKey: 'commands.putFirstLineInTitle',
          descKey: 'commands.descriptions.renameAllNotesInSearchResults',
          icon: 'file-type',
          settingPath: [
            'core',
            'vaultSearchContextMenuVisibility',
            'putFirstLineInTitle',
          ],
        },
        {
          nameKey: 'commands.disableRenaming',
          descKey: 'commands.descriptions.excludeAllNotesInSearchResults',
          icon: 'square-x',
          settingPath: ['core', 'vaultSearchContextMenuVisibility', 'disable'],
        },
        {
          nameKey: 'commands.enableRenaming',
          descKey: 'commands.descriptions.stopExcludingAllNotesInSearchResults',
          icon: 'square-check',
          settingPath: ['core', 'vaultSearchContextMenuVisibility', 'enable'],
        },
      ],
    });
  }
}
