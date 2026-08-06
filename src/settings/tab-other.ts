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
    frag.appendText(t('settings.other.grabCardLink.desc.part1'));
    frag.createEl('a', {
      href: 'https://obsidian.md/plugins?id=auto-card-link',
      text: PLUGIN_AUTO_CARD_LINK,
    });
    frag.appendText(t('settings.other.grabCardLink.desc.part2'));
    frag.createEl('a', {
      href: 'https://obsidian.md/plugins?id=obsidian-link-embed',
      text: PLUGIN_LINK_EMBED,
    });
    frag.appendText(t('settings.other.grabCardLink.desc.part3'));
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
        let importedJson: Record<string, unknown> | undefined;
        const content = readerEvent.target?.result;
        if (typeof content === 'string') {
          try {
            importedJson = JSON.parse(content) as Record<string, unknown>;
          } catch {
            const notice = new Notice(t('notifications.invalidImportFile'));
            notice.containerEl.addClass('mod-warning');
            console.error(t('notifications.invalidImportFile'));
            input.remove();
            return;
          }
        } else {
          const notice = new Notice(
            t('settings.errors.importFailed') ?? 'Invalid file format'
          );
          notice.containerEl.addClass('mod-warning');
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
    name: t('settings.tabs.other'),
    desc: t('settings.other.desc'),
    items: [
      {
        name: t('settings.other.charCount.name'),
        desc: descriptionWithDefault(
          'settings.other.charCount.desc',
          'settings.other.charCount.default'
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
        name: t('settings.other.grabCardLink.name'),
        desc: buildCardLinkDescription(),
        control: {
          type: 'toggle',
          key: 'markupStripping.grabTitleFromCardLink',
        },
      },
      {
        name: t('settings.other.newNoteDelay.name'),
        desc: descriptionWithDefault(
          'settings.other.newNoteDelay.desc',
          'settings.other.newNoteDelay.default'
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
        name: t('settings.other.contentReadMethod.name'),
        desc: descriptionWithDefault(
          'settings.other.contentReadMethod.desc',
          'settings.other.contentReadMethod.default'
        ),
        control: {
          type: 'dropdown',
          key: 'core.fileReadMethod',
          options: {
            Editor: t('settings.other.contentReadMethod.editor'),
            Cache: t('settings.other.contentReadMethod.cache'),
            File: t('settings.other.contentReadMethod.file'),
          },
        },
      },
      {
        name: t('settings.other.checkInterval.name'),
        desc: descriptionWithDefault(
          'settings.other.checkInterval.desc',
          'settings.other.checkInterval.default'
        ),
        visible: () =>
          plugin.settings.core.renameAutomatically &&
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
        name: t('settings.other.debug.name'),
        desc: t('settings.other.debug.desc'),
        control: {
          type: 'toggle',
          key: 'core.verboseLogging',
        },
      },
      {
        name: t('settings.other.debugOutputContent.name'),
        desc: t('settings.other.debugOutputContent.desc'),
        visible: () => plugin.settings.core.verboseLogging,
        control: {
          type: 'toggle',
          key: 'core.debugOutputFullContent',
        },
      },
      {
        type: 'group',
        heading: t('settings.other.configuration.title'),
        items: [
          {
            name: t('settings.other.manageSettings.name'),
            desc: t('settings.other.manageSettings.desc'),
            render: (setting) => {
              setting
                .addButton((button) =>
                  button
                    .setButtonText(t('settings.other.manageSettings.import'))
                    .onClick(() => importSettingsFromFile(plugin, tab))
                )
                .addButton((button) =>
                  button
                    .setButtonText(t('settings.other.manageSettings.export'))
                    .onClick(() => exportSettingsToFile(plugin))
                );
            },
          },
          {
            // `render` rather than `action` so the row carries a labelled
            // button, matching "Rename all notes" and "Send feedback".
            name: t('settings.other.clearSettings.name'),
            desc: t('settings.other.clearSettings.desc'),
            render: (setting) => {
              setting.addButton((button) =>
                button
                  .setButtonText(t('settings.other.clearSettings.button'))
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
