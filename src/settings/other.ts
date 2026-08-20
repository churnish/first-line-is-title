import {
  ConfirmationModal,
  Notice,
  PluginSettingTab,
  SettingDefinitionPage,
} from 'obsidian';
import { buildButtonRow, FirstLineIsTitlePlugin } from './settings-base';
import { PluginSettings } from '../types';
import { evaluateSettingsImport } from './import-guard';
import { DEFAULT_SETTINGS } from '../constants';
import { deepMerge, verboseLog } from '../utils';
import { t } from '../i18n';
import { PluginInitializer } from '../core/plugin-initializer';
import { createPluginLink, buildPluginLinkRouterGroup } from './plugin-links';

// Plugin names (proper nouns, not subject to sentence case)
const PLUGIN_AUTO_CARD_LINK = 'Auto Card Link';
const PLUGIN_LINK_EMBED = 'Link Embed';

/**
 * Card link description interleaves two plugin links with three text fragments.
 */
function buildCardLinkDescription(): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(t('settings.other.grabTitleFromCardLink.desc.part1'));
    createPluginLink(frag, 'auto-card-link', PLUGIN_AUTO_CARD_LINK);
    frag.appendText(t('settings.other.grabTitleFromCardLink.desc.part2'));
    createPluginLink(frag, 'obsidian-link-embed', PLUGIN_LINK_EMBED);
    frag.appendText(t('settings.other.grabTitleFromCardLink.desc.part3'));
  });
}

/**
 * Deep-clones settings for rollback. `structuredClone` fails only on
 * non-cloneable values, which plain settings never contain.
 */
function cloneSettings(source: PluginSettings): PluginSettings {
  try {
    return structuredClone(source);
  } catch {
    return JSON.parse(JSON.stringify(source)) as PluginSettings;
  }
}

/**
 * Reads a settings JSON file, merges type-compatible keys over the defaults and
 * persists the result, rolling back on save failure.
 */
function importSettingsFromFile(
  plugin: FirstLineIsTitlePlugin,
  tab: PluginSettingTab
): void {
  const input = createEl('input');
  input.setAttrs({
    type: 'file',
    accept: '.json',
  });

  // Cleanup handled by cancel event and browser GC
  input.addEventListener('cancel', () => {
    input.remove();
  });

  input.onchange = () => {
    const selectedFile = input.files?.[0];
    if (!selectedFile) return;

    const reader = new FileReader();
    reader.onerror = () => {
      console.error('FileReader error:', reader.error);
      const notice = new Notice(
        t('settings.errors.importFailed') ?? 'Failed to read file'
      );
      notice.containerEl.addClass('mod-warning');
      input.remove();
    };
    reader.readAsText(selectedFile, 'UTF-8');
    reader.onload = (readerEvent) => {
      void (async () => {
        const content = readerEvent.target?.result;
        if (typeof content !== 'string') {
          const notice = new Notice(
            t('settings.errors.importFailed') ?? 'Invalid file format'
          );
          notice.containerEl.addClass('mod-warning');
          input.remove();
          return;
        }

        const verdict = evaluateSettingsImport(content);
        if (verdict.kind === 'unreadable') {
          const notice = new Notice(t('notifications.invalidImportFile'));
          notice.containerEl.addClass('mod-warning');
          console.error(t('notifications.invalidImportFile'));
          input.remove();
          return;
        }
        if (verdict.kind === 'incompatible-schema') {
          const notice = new Notice(t('settings.errors.importIncompatible'));
          notice.containerEl.addClass('mod-warning');
          input.remove();
          return;
        }

        const importedJson = verdict.settings;

        // Pre-filter before merging: deepMerge writes a non-object source value straight over an object default, so an entry like {"exclusions": "x"} would survive and throw on every downstream read
        const compatibleOverrides: Record<string, unknown> = {};
        for (const setting in plugin.settings) {
          if (setting in importedJson) {
            const importedValue = importedJson[setting];
            const existingValue =
              plugin.settings[setting as keyof typeof plugin.settings];
            // `typeof` alone lets an array through where an object branch
            // lives (both report 'object'), and deepMerge replaces the whole
            // branch with it — so compare array-ness too.
            if (
              typeof importedValue === typeof existingValue &&
              Array.isArray(importedValue) === Array.isArray(existingValue)
            ) {
              compatibleOverrides[setting] = importedValue;
            } else {
              console.warn(
                `Import: skipping ${setting} due to type mismatch (expected ${typeof existingValue}, got ${typeof importedValue})`
              );
            }
          }
        }

        // Merge rather than assign whole branches, so keys an older export predates keep their defaults instead of going undefined
        const newSettings = deepMerge(
          DEFAULT_SETTINGS,
          compatibleOverrides as Partial<PluginSettings>
        );

        // Deep copy for rollback (reference would be unsafe if settings were modified in-place)
        const previousSettings = cloneSettings(plugin.settings);
        try {
          plugin.settings = newSettings;
          await plugin.saveSettings();
        } catch {
          // Rollback to previous settings on save failure
          plugin.settings = previousSettings;
          const notice = new Notice(t('settings.errors.saveFailed'));
          notice.containerEl.addClass('mod-warning');
          input.remove();
          return;
        }

        const notice = new Notice(t('notifications.settingsImported'));
        notice.containerEl.addClass('mod-success');

        // Refresh UI - wrap in try-finally to ensure input cleanup
        try {
          tab.update();
        } finally {
          input.remove();
        }
      })();
    };
  };

  input.click();
}

/**
 * Exports settings via the Web Share API where available (mobile), falling back
 * to a data-URI download.
 */
function exportSettingsToFile(plugin: FirstLineIsTitlePlugin): void {
  void (async () => {
    const settingsText = JSON.stringify(plugin.settings, null, 2);
    const fileName = 'first-line-is-title-settings.json';

    if (navigator.share && navigator.canShare) {
      try {
        const blob = new Blob([settingsText], {
          type: 'application/json',
        });
        const file = new File([blob], fileName, {
          type: 'application/json',
        });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'First Line is Title Settings',
          });
          return;
        }
      } catch (error) {
        console.error('Share failed:', error);
      }
    }

    const exportLink = createEl('a');
    exportLink.setAttrs({
      download: fileName,
      href: `data:application/json;charset=utf-8,${encodeURIComponent(settingsText)}`,
    });
    exportLink.click();
    exportLink.remove();
  })();
}

/**
 * Restores DEFAULT_SETTINGS wholesale and re-runs the first-enable logic so the
 * plugin ends up in the same state as a fresh install.
 */
async function resetAllSettings(
  plugin: FirstLineIsTitlePlugin,
  tab: PluginSettingTab
): Promise<void> {
  // Deep copy for rollback (reference would be unsafe if settings were modified in-place)
  const previousSettings = cloneSettings(plugin.settings);
  const newSettings = cloneSettings(DEFAULT_SETTINGS);

  newSettings.core.lastUsageDate = plugin.getTodayDateString?.() || '';

  try {
    plugin.settings = newSettings;
    await plugin.saveSettings();
  } catch {
    // Rollback to previous settings on save failure
    plugin.settings = previousSettings;
    const notice = new Notice(t('settings.errors.saveFailed'));
    notice.containerEl.addClass('mod-warning');
    return;
  }

  const pluginInitializer = new PluginInitializer(plugin);
  await pluginInitializer.initializeFirstEnableLogic();
  await pluginInitializer.checkFirstTimeExclusionsSetup();

  verboseLog(plugin, `Showing notice: ${t('notifications.settingsCleared')}`);
  new Notice(t('notifications.settingsCleared'));

  tab.update();
}

export function buildOtherPage(
  plugin: FirstLineIsTitlePlugin,
  tab: PluginSettingTab
): SettingDefinitionPage {
  return {
    type: 'page',
    name: t('settings.sections.other'),
    desc: t('settings.other.desc'),
    items: [
      {
        name: t('settings.other.charCount.name'),
        desc: t('settings.other.charCount.desc'),
        control: {
          type: 'slider',
          key: 'core.charCount',
          min: 1,
          max: 252,
          step: 1,
          defaultValue: DEFAULT_SETTINGS.core.charCount,
        },
      },
      {
        name: t('settings.other.notificationMode.name'),
        desc: t('settings.other.notificationMode.desc'),
        control: {
          type: 'dropdown',
          key: 'core.manualNotificationMode',
          options: {
            Always: t('settings.other.notificationMode.always'),
            'On title change': t(
              'settings.other.notificationMode.onTitleChange'
            ),
            Never: t('settings.other.notificationMode.never'),
          },
        },
      },
      {
        name: t('settings.other.titleCase.name'),
        desc: t('settings.other.titleCase.desc'),
        control: {
          type: 'dropdown',
          key: 'core.titleCase',
          options: {
            preserve: t('settings.other.titleCase.preserve'),
            uppercase: t('settings.other.titleCase.uppercase'),
            lowercase: t('settings.other.titleCase.lowercase'),
          },
        },
      },
      {
        name: t('settings.other.grabTitleFromCardLink.name'),
        desc: buildCardLinkDescription(),
        control: {
          type: 'toggle',
          key: 'markupStripping.grabTitleFromCardLink',
        },
      },
      {
        // Debug's dependent row travels with it: left outside the group it
        // would appear in a separate box below, detached from its parent.
        type: 'group',
        heading: t('settings.other.troubleshooting.title'),
        items: [
          {
            name: t('settings.other.newNoteDelay.name'),
            desc: t('settings.other.newNoteDelay.desc'),
            control: {
              type: 'slider',
              key: 'core.newNoteDelay',
              min: 0,
              max: 5000,
              step: 50,
              defaultValue: DEFAULT_SETTINGS.core.newNoteDelay,
            },
          },
          {
            name: t('settings.other.contentReadMethod.name'),
            desc: t('settings.other.contentReadMethod.desc'),
            control: {
              type: 'dropdown',
              key: 'core.contentReadMethod',
              options: {
                Editor: t('settings.other.contentReadMethod.editor'),
                Cache: t('settings.other.contentReadMethod.cache'),
                File: t('settings.other.contentReadMethod.file'),
              },
            },
          },
          {
            name: t('settings.other.checkInterval.name'),
            desc: t('settings.other.checkInterval.desc'),
            visible: () =>
              plugin.settings.core.renameAutomatically &&
              plugin.settings.core.contentReadMethod === 'Editor',
            control: {
              type: 'slider',
              key: 'core.checkInterval',
              min: 0,
              max: 5000,
              step: 50,
              defaultValue: DEFAULT_SETTINGS.core.checkInterval,
            },
          },
          {
            name: t('settings.other.debug.name'),
            desc: t('settings.other.debug.desc'),
            control: {
              type: 'toggle',
              key: 'core.debug',
            },
          },
          {
            name: t('settings.other.debugOutputFullContent.name'),
            desc: t('settings.other.debugOutputFullContent.desc'),
            visible: () => plugin.settings.core.debug,
            control: {
              type: 'toggle',
              key: 'core.debugOutputFullContent',
            },
          },
        ],
      },
      {
        type: 'group',
        heading: t('settings.other.configuration.title'),
        items: [
          {
            name: t('settings.other.backupSettings.name'),
            desc: t('settings.other.backupSettings.desc'),
            render: buildButtonRow([
              {
                text: t('settings.other.backupSettings.import'),
                onClick: () => importSettingsFromFile(plugin, tab),
              },
              {
                text: t('settings.other.backupSettings.export'),
                onClick: () => exportSettingsToFile(plugin),
              },
            ]),
          },
          {
            // `render` rather than `action` so the row carries a labelled
            // button, matching "Rename all notes" and "Send feedback".
            name: t('settings.other.clearSettings.name'),
            desc: t('settings.other.clearSettings.desc'),
            render: buildButtonRow({
              text: t('settings.other.clearSettings.button'),
              // Red tint without the filled-CTA treatment, since this is a
              // secondary destructive action rather than the page's primary
              // one.
              destructive: true,
              onClick: () => {
                const body = createFragment((frag) => {
                  frag.createEl('p', {
                    text: t('modals.resetAllSettings'),
                    cls: 'mod-warning',
                  });
                });

                new ConfirmationModal(plugin.app)
                  .setTitle(t('modals.caution'))
                  .setContent(body)
                  .addButton((btn) =>
                    btn
                      .setButtonText(t('modals.buttons.clear'))
                      // Non-deprecated equivalent of setWarning()
                      .setDestructive()
                      .setCta()
                      .onClick(() => {
                        void resetAllSettings(plugin, tab);
                      })
                  )
                  .addCancelButton()
                  .open();
              },
            }),
          },
        ],
      },
      buildPluginLinkRouterGroup(plugin.app),
    ],
  };
}
