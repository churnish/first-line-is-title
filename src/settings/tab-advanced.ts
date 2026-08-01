import {
  ConfirmationModal,
  Notice,
  PluginSettingTab,
  SettingDefinitionPage,
} from 'obsidian';
import { FirstLineIsTitlePlugin } from './settings-base';
import { PluginSettings } from '../types';
import { DEFAULT_SETTINGS } from '../constants';
import { verboseLog } from '../utils';
import { t, getCurrentLocale } from '../i18n';
import { PluginInitializer } from '../core/plugin-initializer';

// Plugin names (proper nouns, not subject to sentence case)
const PLUGIN_AUTO_CARD_LINK = 'Auto Card Link';
const PLUGIN_LINK_EMBED = 'Link Embed';

/**
 * Description followed by a small bold "default: …" footnote, matching the
 * pre-migration rendering of the scalar settings that had restore buttons.
 */
function descriptionWithDefault(
  descKey: string,
  defaultKey: string
): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(t(descKey));
    frag.createEl('br');
    frag.createEl('small').createEl('strong', { text: t(defaultKey) });
  });
}

/**
 * Card link description interleaves two plugin links with three text fragments.
 */
function buildCardLinkDescription(): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(t('settings.advanced.grabCardLink.desc.part1'));
    frag.createEl('a', {
      href: 'obsidian://show-plugin?id=auto-card-link',
      text: PLUGIN_AUTO_CARD_LINK,
    });
    frag.appendText(t('settings.advanced.grabCardLink.desc.part2'));
    frag.createEl('a', {
      href: 'obsidian://show-plugin?id=obsidian-link-embed',
      text: PLUGIN_LINK_EMBED,
    });
    frag.appendText(t('settings.advanced.grabCardLink.desc.part3'));
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
  const input = document.createElement('input');
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
      new Notice(t('settings.errors.importFailed') ?? 'Failed to read file');
      input.remove();
    };
    reader.readAsText(selectedFile, 'UTF-8');
    reader.onload = (readerEvent) => {
      void (async () => {
        let importedJson: Record<string, unknown> | undefined;
        const content = readerEvent.target?.result;
        if (typeof content === 'string') {
          try {
            importedJson = JSON.parse(content) as Record<string, unknown>;
          } catch {
            new Notice(t('notifications.invalidImportFile'));
            console.error(t('notifications.invalidImportFile'));
            input.remove();
            return;
          }
        } else {
          new Notice(
            t('settings.errors.importFailed') ?? 'Invalid file format'
          );
          input.remove();
          return;
        }

        if (importedJson) {
          const newSettings = Object.assign({}, DEFAULT_SETTINGS);
          for (const setting in plugin.settings) {
            if (setting in importedJson) {
              const importedValue = importedJson[setting];
              const existingValue =
                plugin.settings[setting as keyof typeof plugin.settings];
              // Basic type check to prevent corruption from malformed imports
              if (typeof importedValue === typeof existingValue) {
                // @ts-ignore
                newSettings[setting] = importedValue;
              } else {
                console.warn(
                  `Import: skipping ${setting} due to type mismatch (expected ${typeof existingValue}, got ${typeof importedValue})`
                );
              }
            }
          }

          // Deep copy for rollback (reference would be unsafe if settings were modified in-place)
          const previousSettings = cloneSettings(plugin.settings);
          try {
            plugin.settings = newSettings;
            await plugin.saveSettings();
          } catch {
            // Rollback to previous settings on save failure
            plugin.settings = previousSettings;
            new Notice(t('settings.errors.saveFailed'));
            input.remove();
            return;
          }

          new Notice(t('notifications.settingsImported'));

          // Refresh UI - wrap in try-finally to ensure input cleanup
          try {
            tab.update();
          } finally {
            input.remove();
          }
          return;
        }

        input.remove();
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

    const exportLink = document.createElement('a');
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

  const locale = getCurrentLocale();
  if (locale === 'ru') {
    newSettings.exclusions.fileNameExclusions[0].text = 'Задачи';
  } else {
    newSettings.exclusions.fileNameExclusions[0].text = 'To do';
  }

  newSettings.core.hasShownFirstTimeNotice = true;
  newSettings.core.lastUsageDate = plugin.getTodayDateString?.() || '';

  try {
    plugin.settings = newSettings;
    await plugin.saveSettings();
  } catch {
    // Rollback to previous settings on save failure
    plugin.settings = previousSettings;
    new Notice(t('settings.errors.saveFailed'));
    return;
  }

  const pluginInitializer = new PluginInitializer(plugin);
  await pluginInitializer.initializeFirstEnableLogic();
  await pluginInitializer.checkFirstTimeExclusionsSetup();

  verboseLog(plugin, `Showing notice: ${t('notifications.settingsCleared')}`);
  new Notice(t('notifications.settingsCleared'));

  tab.update();
}

export function buildAdvancedPage(
  plugin: FirstLineIsTitlePlugin,
  tab: PluginSettingTab
): SettingDefinitionPage {
  return {
    type: 'page',
    name: t('settings.tabs.advanced'),
    desc: t('settings.advanced.desc'),
    items: [
      {
        name: t('settings.advanced.titleCase.name'),
        desc: t('settings.advanced.titleCase.desc'),
        control: {
          type: 'dropdown',
          key: 'core.titleCase',
          options: {
            preserve: t('settings.advanced.titleCase.preserve'),
            uppercase: t('settings.advanced.titleCase.uppercase'),
            lowercase: t('settings.advanced.titleCase.lowercase'),
          },
        },
      },
      {
        name: t('settings.advanced.charCount.name'),
        desc: descriptionWithDefault(
          'settings.advanced.charCount.desc',
          'settings.advanced.charCount.default'
        ),
        control: {
          type: 'slider',
          key: 'core.charCount',
          min: 1,
          max: 252,
          step: 1,
        },
      },
      {
        name: t('settings.advanced.notificationMode.name'),
        desc: t('settings.advanced.notificationMode.desc'),
        control: {
          type: 'dropdown',
          key: 'core.manualNotificationMode',
          options: {
            Always: t('settings.advanced.notificationMode.always'),
            'On title change': t(
              'settings.advanced.notificationMode.onTitleChange'
            ),
            Never: t('settings.advanced.notificationMode.never'),
          },
        },
      },
      {
        name: t('settings.advanced.preserveModificationDate.name'),
        desc: t('settings.advanced.preserveModificationDate.desc'),
        control: {
          type: 'toggle',
          key: 'core.preserveModificationDate',
        },
      },
      {
        name: t('settings.advanced.grabCardLink.name'),
        desc: buildCardLinkDescription(),
        control: {
          type: 'toggle',
          key: 'markupStripping.grabTitleFromCardLink',
        },
      },
      {
        name: t('settings.advanced.newNoteDelay.name'),
        desc: descriptionWithDefault(
          'settings.advanced.newNoteDelay.desc',
          'settings.advanced.newNoteDelay.default'
        ),
        control: {
          type: 'slider',
          key: 'core.newNoteDelay',
          min: 0,
          max: 5000,
          step: 50,
        },
      },
      {
        name: t('settings.advanced.contentReadMethod.name'),
        desc: descriptionWithDefault(
          'settings.advanced.contentReadMethod.desc',
          'settings.advanced.contentReadMethod.default'
        ),
        control: {
          type: 'dropdown',
          key: 'core.fileReadMethod',
          options: {
            Editor: t('settings.advanced.contentReadMethod.editor'),
            Cache: t('settings.advanced.contentReadMethod.cache'),
            File: t('settings.advanced.contentReadMethod.file'),
          },
        },
      },
      {
        name: t('settings.advanced.checkInterval.name'),
        desc: descriptionWithDefault(
          'settings.advanced.checkInterval.desc',
          'settings.advanced.checkInterval.default'
        ),
        visible: () =>
          plugin.settings.core.renameNotes === 'automatically' &&
          plugin.settings.core.fileReadMethod === 'Editor',
        control: {
          type: 'slider',
          key: 'core.checkInterval',
          min: 0,
          max: 5000,
          step: 50,
        },
      },
      {
        name: t('settings.advanced.debug.name'),
        desc: t('settings.advanced.debug.desc'),
        control: {
          type: 'toggle',
          key: 'core.verboseLogging',
        },
      },
      {
        name: t('settings.advanced.debugOutputContent.name'),
        desc: t('settings.advanced.debugOutputContent.desc'),
        visible: () => plugin.settings.core.verboseLogging,
        control: {
          type: 'toggle',
          key: 'core.debugOutputFullContent',
        },
      },
      {
        type: 'group',
        heading: t('settings.advanced.configuration.title'),
        items: [
          {
            name: t('settings.advanced.manageSettings.name'),
            desc: t('settings.advanced.manageSettings.desc'),
            render: (setting) => {
              setting
                .addButton((button) =>
                  button
                    .setButtonText(t('settings.advanced.manageSettings.import'))
                    .onClick(() => importSettingsFromFile(plugin, tab))
                )
                .addButton((button) =>
                  button
                    .setButtonText(t('settings.advanced.manageSettings.export'))
                    .onClick(() => exportSettingsToFile(plugin))
                );
            },
          },
          {
            // `render` rather than `action` so the row carries a labelled
            // button, matching "Rename all notes" and "Send feedback".
            name: t('settings.advanced.clearSettings.name'),
            desc: t('settings.advanced.clearSettings.desc'),
            render: (setting) => {
              setting.addButton((button) =>
                button
                  .setButtonText(t('settings.advanced.clearSettings.button'))
                  // Red tint without the filled-CTA treatment, since this is a
                  // secondary destructive action rather than the page's primary
                  // one.
                  .setDestructive()
                  .onClick(() => {
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
                  })
              );
            },
          },
        ],
      },
    ],
  };
}
