import { PluginSettingTab, SettingDefinitionItem } from 'obsidian';
import { FirstLineIsTitlePlugin } from './settings-base';
import { RenameAllFilesModal } from '../modals';
import { t, getCurrentLocale } from '../i18n';

const FEEDBACK_URL = 'https://github.com/churnish/first-line-is-title/issues';

/**
 * Builds a description where one term is emphasized. Russian typography uses
 * guillemets instead of bold, matching the pre-migration rendering.
 */
function buildEmphasizedDescription(
  part1Key: string,
  emphasizedKey: string,
  part2Key: string
): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(t(part1Key));
    if (getCurrentLocale() === 'ru') {
      frag.appendText('«' + t(emphasizedKey) + '»');
    } else {
      frag.createEl('strong', { text: t(emphasizedKey) });
    }
    frag.appendText(t(part2Key));
  });
}

/**
 * General settings live at the top of the settings tab as first-level items —
 * no page wrapper and no heading, per Obsidian's convention.
 */
export function buildGeneralDefinitions(
  plugin: FirstLineIsTitlePlugin,
  tab: PluginSettingTab
): SettingDefinitionItem[] {
  return [
    {
      name: t('settings.general.renameAutomatically.name'),
      desc: t('settings.general.renameAutomatically.desc'),
      control: {
        type: 'toggle',
        key: 'core.renameAutomatically',
      },
    },
    {
      name: t('settings.general.renameOnFocus.name'),
      desc: t('settings.general.renameOnFocus.desc'),
      visible: () => plugin.settings.core.renameAutomatically,
      control: {
        type: 'toggle',
        key: 'core.renameOnFocus',
      },
    },
    {
      name: t('settings.general.onlyRenameIfHeading.name'),
      desc: t('settings.general.onlyRenameIfHeading.desc'),
      control: {
        type: 'toggle',
        key: 'core.onlyRenameIfHeading',
      },
    },
    {
      name: t('settings.general.renameOnSave.name'),
      desc: t('settings.general.renameOnSave.desc'),
      control: {
        type: 'toggle',
        key: 'core.renameOnSave',
      },
    },
    {
      name: t('settings.general.moveCursorToFirstLine.name'),
      desc: t('settings.general.moveCursorToFirstLine.desc'),
      control: {
        type: 'toggle',
        key: 'core.moveCursorToFirstLine',
      },
    },
    {
      name: t('settings.general.placeCursorAtLineEnd.name'),
      desc: t('settings.general.placeCursorAtLineEnd.desc'),
      visible: () => plugin.settings.core.moveCursorToFirstLine,
      control: {
        type: 'toggle',
        key: 'core.placeCursorAtLineEnd',
      },
    },
    {
      name: t('settings.general.insertTitleOnCreation.name'),
      desc: buildEmphasizedDescription(
        'settings.general.insertTitleOnCreation.desc.part1',
        'settings.general.insertTitleOnCreation.desc.untitled',
        'settings.general.insertTitleOnCreation.desc.part2'
      ),
      control: {
        type: 'toggle',
        key: 'core.insertTitleOnCreation',
      },
    },
    {
      name: t('settings.general.convertReplacementCharactersInTitle.name'),
      desc: buildEmphasizedDescription(
        'settings.general.convertReplacementCharactersInTitle.desc.part1',
        'settings.general.convertReplacementCharactersInTitle.desc.replaceCharacters',
        'settings.general.convertReplacementCharactersInTitle.desc.part2'
      ),
      visible: () =>
        plugin.settings.core.insertTitleOnCreation &&
        plugin.settings.replaceCharacters.enableForbiddenCharReplacements,
      control: {
        type: 'toggle',
        key: 'core.convertReplacementCharactersInTitle',
      },
    },
    {
      name: t('settings.general.formatAsHeading.name'),
      desc: t('settings.general.formatAsHeading.desc'),
      visible: () => plugin.settings.core.insertTitleOnCreation,
      control: {
        type: 'toggle',
        key: 'markupStripping.addHeadingToTitle',
      },
    },
  ];
}

/**
 * Actions that belong below every settings section rather than inside one.
 * Appended after the sub-page links so they read as page-level footers.
 */
export function buildFooterDefinitions(
  plugin: FirstLineIsTitlePlugin
): SettingDefinitionItem[] {
  return [
    {
      // `render` rather than `action` so the button keeps its label instead of
      // turning the whole row into a click target.
      name: t('settings.general.renameAllNotes.name'),
      desc: t('settings.general.renameAllNotes.desc'),
      render: (setting) => {
        setting.addButton((button) =>
          button
            .setButtonText(t('settings.general.renameAllNotes.button'))
            .onClick(() => {
              new RenameAllFilesModal(plugin.app, plugin).open();
            })
        );
      },
    },
    {
      name: t('settings.general.sendFeedback.name'),
      desc: t('settings.general.sendFeedback.desc'),
      render: (setting) => {
        setting.addButton((button) =>
          button
            .setButtonText(t('settings.general.sendFeedback.button'))
            .onClick(() => {
              window.open(FEEDBACK_URL, '_blank');
            })
        );
      },
    },
  ];
}
