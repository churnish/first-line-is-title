import { PluginSettingTab, SettingDefinitionItem, setIcon } from 'obsidian';
import { FirstLineIsTitlePlugin } from './settings-base';
import { RenameAllFilesModal } from '../modals';
import { t, getCurrentLocale } from '../i18n';

/**
 * Builds a description where one term is emphasized. Russian typography uses
 * guillemets instead of italics, matching the pre-migration rendering.
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
      frag.createEl('em', { text: t(emphasizedKey) });
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
      name: t('settings.general.renameNotes.name'),
      desc: t('settings.general.renameNotes.desc'),
      control: {
        type: 'dropdown',
        key: 'core.renameNotes',
        options: {
          automatically: t('settings.general.renameNotes.automatically'),
          manually: t('settings.general.renameNotes.manually'),
        },
      },
    },
    {
      name: t('settings.general.renameOnFocus.name'),
      desc: t('settings.general.renameOnFocus.desc'),
      visible: () => plugin.settings.core.renameNotes === 'automatically',
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
      name: t('settings.general.titleCase.name'),
      desc: t('settings.general.titleCase.desc'),
      control: {
        type: 'dropdown',
        key: 'core.titleCase',
        options: {
          preserve: t('settings.general.titleCase.preserve'),
          uppercase: t('settings.general.titleCase.uppercase'),
          lowercase: t('settings.general.titleCase.lowercase'),
        },
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
      visible: () => plugin.settings.core.insertTitleOnCreation,
      control: {
        type: 'toggle',
        key: 'core.convertReplacementCharactersInTitle',
        disabled: () =>
          !plugin.settings.replaceCharacters.enableForbiddenCharReplacements,
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
    {
      name: t('settings.general.renameOnSave.name'),
      desc: t('settings.general.renameOnSave.desc'),
      control: {
        type: 'toggle',
        key: 'core.renameOnSave',
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
      // Decorative call to action, not a setting — no name, so it stays out of
      // the settings search index.
      name: '',
      render: (setting) => {
        const host = setting.settingEl.createDiv({ cls: 'flit-settings-page' });
        const feedbackContainer = host.createDiv({
          cls: 'flit-feedback-container',
        });
        const button = feedbackContainer.createEl('button', {
          cls: 'mod-cta flit-leave-feedback-button flit-feedback-button',
        });
        button.addEventListener('click', () => {
          window.open(
            'https://github.com/greetclammy/first-line-is-title/issues',
            '_blank'
          );
        });
        setIcon(button.createEl('div'), 'message-square-reply');
        button.appendText(t('settings.general.leaveFeedback'));
      },
    },
  ];
}
