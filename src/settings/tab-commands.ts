import { SettingDefinitionPage } from 'obsidian';
import { FirstLineIsTitlePlugin } from './settings-base';
import { t } from '../i18n';

export function buildCommandsPage(
  plugin: FirstLineIsTitlePlugin
): SettingDefinitionPage {
  return {
    type: 'page',
    name: t('settings.tabs.commands'),
    desc: t('settings.commands.desc'),
    items: [
      {
        name: t('settings.commands.file.name'),
        desc: t('settings.commands.file.desc'),
        control: { type: 'toggle', key: 'core.enableFileCommands' },
      },
      {
        name: t('settings.commands.folder.name'),
        desc: t('settings.commands.folder.desc'),
        control: { type: 'toggle', key: 'core.enableFolderCommands' },
      },
      {
        name: t('settings.commands.tag.name'),
        desc: t('settings.commands.tag.desc'),
        control: { type: 'toggle', key: 'core.enableTagCommands' },
      },
      {
        name: t('settings.commands.search.name'),
        desc: t('settings.commands.search.desc'),
        control: {
          type: 'toggle',
          key: 'core.enableVaultSearchContextMenu',
        },
      },
    ],
  };
}
