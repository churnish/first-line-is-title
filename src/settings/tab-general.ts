import { SettingDefinitionItem, SettingDefinitionGroup } from 'obsidian';
import { FirstLineIsTitlePlugin, appendEmphasis } from './settings-base';
import { RenameAllFilesModal } from '../modals';
import { getOwnerWindow } from '../utils/owner-window';
import { t } from '../i18n';

const FEEDBACK_URL = 'https://github.com/churnish/first-line-is-title/issues';
const HELP_URL = 'https://github.com/churnish/first-line-is-title/discussions';

/**
 * Builds a description where one term is quoted as a UI label; see
 * `appendEmphasis` for the per-locale marks.
 */
function buildEmphasizedDescription(
  part1Key: string,
  emphasizedKey: string,
  part2Key: string
): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(t(part1Key));
    appendEmphasis(frag, emphasizedKey);
    frag.appendText(t(part2Key));
  });
}

/**
 * General settings live at the top of the settings tab as first-level items —
 * no page wrapper and no heading, per Obsidian's convention.
 */
export function buildGeneralDefinitions(
  plugin: FirstLineIsTitlePlugin
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
  ];
}

/**
 * Settings that only take effect the moment a note is created, grouped away from
 * the rename settings above them because nothing here fires on an existing note.
 */
export function buildNoteCreationGroup(
  plugin: FirstLineIsTitlePlugin
): SettingDefinitionGroup {
  return {
    type: 'group',
    heading: t('settings.tabs.noteCreationGroup'),
    items: [
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
    ],
  };
}

/**
 * Vault-wide action that belongs below the everyday settings rather than inside
 * one of them. Last of the everyday settings, directly above the Exclusions page row.
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
  ];
}

/**
 * Support sits below Advanced: both rows address the plugin itself rather than
 * any setting, so they get their own box at the very bottom instead of trailing
 * the everyday settings.
 *
 * Help leads because it is the self-serve option — a user who finds an existing
 * answer never needs the row below it.
 *
 * Stays in the settings search index — `searchable: false` would hide the only
 * route users have to report a bug when they search rather than scroll.
 */
export function buildSupportGroup(): SettingDefinitionGroup {
  return {
    type: 'group',
    heading: t('settings.tabs.supportGroup'),
    items: [
      {
        name: t('settings.general.help.name'),
        desc: t('settings.general.help.desc'),
        render: (setting) => {
          setting.addButton((button) =>
            button
              .setButtonText(t('settings.general.help.button'))
              .onClick(() => {
                getOwnerWindow(setting.settingEl).open(HELP_URL, '_blank');
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
                getOwnerWindow(setting.settingEl).open(FEEDBACK_URL, '_blank');
              })
          );
        },
      },
    ],
  };
}
