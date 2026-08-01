import {
  Notice,
  PluginSettingTab,
  SettingDefinitionGroup,
  SettingDefinitionPage,
  SettingDefinitionRender,
  setIcon,
} from 'obsidian';
import { FirstLineIsTitlePlugin } from './settings-base';
import { getPath, setPath } from './settings-paths';
import { t } from '../i18n';

interface CommandConfig {
  nameKey: string;
  descKey: string;
  icon: string;
  settingKey: string;
}

interface SectionConfig {
  titleKey: string;
  descKey: string;
  enableSettingKey: string;
  commands: CommandConfig[];
}

const COMMAND_SECTIONS: SectionConfig[] = [
  {
    titleKey: 'settings.commands.file.title',
    descKey: 'settings.commands.file.desc',
    enableSettingKey: 'core.enableFileCommands',
    commands: [
      {
        nameKey: 'commands.putFirstLineInTitle',
        descKey: 'commands.descriptions.renameNoteEvenExcluded',
        icon: 'file-type',
        settingKey: 'core.commandVisibility.filePutFirstLineInTitle',
      },
      {
        nameKey: 'commands.disableRenamingForNote',
        descKey: 'commands.descriptions.excludeNote',
        icon: 'pen-off',
        settingKey: 'core.commandVisibility.fileExclude',
      },
      {
        nameKey: 'commands.enableRenamingForNote',
        descKey: 'commands.descriptions.stopExcludingNote',
        icon: 'square-check',
        settingKey: 'core.commandVisibility.fileStopExcluding',
      },
    ],
  },
  {
    titleKey: 'settings.commands.folder.title',
    descKey: 'settings.commands.folder.desc',
    enableSettingKey: 'core.enableFolderCommands',
    commands: [
      {
        nameKey: 'commands.putFirstLineInTitle',
        descKey: 'commands.descriptions.renameAllNotesInFolder',
        icon: 'folder-pen',
        settingKey: 'core.commandVisibility.folderPutFirstLineInTitle',
      },
      {
        nameKey: 'commands.disableRenamingInFolder',
        descKey: 'commands.descriptions.excludeFolder',
        icon: 'pen-off',
        settingKey: 'core.commandVisibility.folderExclude',
      },
      {
        nameKey: 'commands.enableRenamingInFolder',
        descKey: 'commands.descriptions.stopExcludingFolder',
        icon: 'square-check',
        settingKey: 'core.commandVisibility.folderStopExcluding',
      },
    ],
  },
  {
    titleKey: 'settings.commands.tag.title',
    descKey: 'settings.commands.tag.desc',
    enableSettingKey: 'core.enableTagCommands',
    commands: [
      {
        nameKey: 'commands.putFirstLineInTitle',
        descKey: 'commands.descriptions.renameAllNotesWithTag',
        icon: 'file-type',
        settingKey: 'core.commandVisibility.tagPutFirstLineInTitle',
      },
      {
        nameKey: 'commands.disableRenamingForTag',
        descKey: 'commands.descriptions.excludeTag',
        icon: 'pen-off',
        settingKey: 'core.commandVisibility.tagExclude',
      },
      {
        nameKey: 'commands.enableRenamingForTag',
        descKey: 'commands.descriptions.stopExcludingTag',
        icon: 'square-check',
        settingKey: 'core.commandVisibility.tagStopExcluding',
      },
    ],
  },
  {
    titleKey: 'settings.commands.search.title',
    descKey: 'settings.commands.search.desc',
    enableSettingKey: 'core.enableVaultSearchContextMenu',
    commands: [
      {
        nameKey: 'commands.putFirstLineInTitle',
        descKey: 'commands.descriptions.renameAllNotesInSearchResults',
        icon: 'file-type',
        settingKey: 'core.vaultSearchContextMenuVisibility.putFirstLineInTitle',
      },
      {
        nameKey: 'commands.disableRenaming',
        descKey: 'commands.descriptions.excludeAllNotesInSearchResults',
        icon: 'pen-off',
        settingKey: 'core.vaultSearchContextMenuVisibility.disable',
      },
      {
        nameKey: 'commands.enableRenaming',
        descKey: 'commands.descriptions.stopExcludingAllNotesInSearchResults',
        icon: 'square-check',
        settingKey: 'core.vaultSearchContextMenuVisibility.enable',
      },
    ],
  },
];

/**
 * Command rows use `render` rather than a declarative `control` because
 * `SettingDefinitionBase` has no `icon` field and each row shows the Lucide
 * icon of the command it governs. Render rows are still search-indexed by
 * `name`, but they do not persist automatically — hence the explicit write.
 */
function buildCommandRow(
  plugin: FirstLineIsTitlePlugin,
  section: SectionConfig,
  config: CommandConfig
): SettingDefinitionRender {
  return {
    name: t(config.nameKey),
    desc: t(config.descKey),
    visible: () =>
      getPath(
        plugin.settings as unknown as Record<string, unknown>,
        section.enableSettingKey
      ) === true,
    render: (setting) => {
      setting.addToggle((toggle) =>
        toggle
          .setValue(
            getPath(
              plugin.settings as unknown as Record<string, unknown>,
              config.settingKey
            ) === true
          )
          .onChange(async (value) => {
            setPath(
              plugin.settings as unknown as Record<string, unknown>,
              config.settingKey,
              value
            );
            plugin.debugLog(config.settingKey, value);
            try {
              await plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
          })
      );

      const iconEl = setting.nameEl.createDiv({
        cls: 'flit-setting-item-icon',
      });
      setIcon(iconEl, config.icon);
      setting.nameEl.insertBefore(iconEl, setting.nameEl.firstChild);
    },
  };
}

function buildCommandSection(
  plugin: FirstLineIsTitlePlugin,
  section: SectionConfig
): SettingDefinitionGroup {
  return {
    type: 'group',
    heading: t(section.titleKey),
    items: [
      {
        // The heading already names the section, so the master row is labelled
        // generically; its description carries the specifics.
        name: t('settings.commands.enable'),
        desc: t(section.descKey),
        control: {
          type: 'toggle',
          key: section.enableSettingKey,
        },
      },
      ...section.commands.map((config) =>
        buildCommandRow(plugin, section, config)
      ),
    ],
  };
}

export function buildCommandsPage(
  plugin: FirstLineIsTitlePlugin,
  tab: PluginSettingTab
): SettingDefinitionPage {
  return {
    type: 'page',
    name: t('settings.tabs.commands'),
    desc: t('settings.commands.desc'),
    items: COMMAND_SECTIONS.map((section) =>
      buildCommandSection(plugin, section)
    ),
  };
}
