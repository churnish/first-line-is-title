import { Setting, SettingGroup, setIcon, Notice } from 'obsidian';
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';
import { NotificationMode, FileReadMethod } from '../types';
import { DEFAULT_SETTINGS } from '../constants';
import { ClearSettingsModal } from '../modals';
import { verboseLog } from '../utils';
import { t, getCurrentLocale } from '../i18n';
import { PluginInitializer } from '../core/plugin-initializer';

// Plugin names (proper nouns, not subject to sentence case)
const PLUGIN_AUTO_CARD_LINK = 'Auto Card Link';
const PLUGIN_LINK_EMBED = 'Link Embed';

export class OtherTab extends SettingsTabBase {
  private conditionalSettings: Setting[] = [];

  constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
    super(plugin, containerEl);
    // Register visibility update function on plugin
    (
      this.plugin as typeof this.plugin & {
        updateAutomaticRenameVisibility?: () => void;
      }
    ).updateAutomaticRenameVisibility =
      this.updateAutomaticRenameVisibility.bind(this);
  }

  render(): void {
    // Declare variables for settings that need references
    let charCountSetting: Setting;
    let cardLinkSetting: Setting;
    let newNoteDelaySetting: Setting;
    let contentReadMethodSetting: Setting;
    let debugSetting: Setting;

    // Slider containers for restore button handlers
    let sliderDiv: HTMLDivElement;
    let newNoteDelaySliderDiv: HTMLDivElement;
    let checkIntervalSliderDiv: HTMLDivElement;

    // Sub-settings containers
    let contentReadSubSettingsContainer: HTMLElement;
    let debugSubSettingsContainer: HTMLElement;

    // Other settings using SettingGroup
    new SettingGroup(this.containerEl)
      .addClass('flit-other-group')
      // 1. Character count
      .addSetting((s) => {
        charCountSetting = s;
        s.setName(t('settings.other.charCount.name'));
      })
      // 2. Notification mode
      .addSetting((s) => {
        s.setName(t('settings.other.notificationMode.name'))
          .setDesc(t('settings.other.notificationMode.desc'))
          .addDropdown((dropdown) =>
            dropdown
              .addOption('Always', t('settings.other.notificationMode.always'))
              .addOption(
                'On title change',
                t('settings.other.notificationMode.onTitleChange')
              )
              .addOption('Never', t('settings.other.notificationMode.never'))
              .setValue(this.plugin.settings.core.manualNotificationMode)
              .onChange((value: NotificationMode) => {
                void (async () => {
                  this.plugin.settings.core.manualNotificationMode = value;
                  this.plugin.debugLog('manualNotificationMode', value);
                  try {
                    await this.plugin.saveSettings();
                  } catch {
                    new Notice(t('settings.errors.saveFailed'));
                  }
                })();
              })
          );
      })
      // 3. Preserve modification date
      .addSetting((s) => {
        s.setName(t('settings.other.preserveModificationDate.name'))
          .setDesc(t('settings.other.preserveModificationDate.desc'))
          .addToggle((toggle) =>
            toggle
              .setValue(this.plugin.settings.core.preserveModificationDate)
              .onChange((value) => {
                void (async () => {
                  this.plugin.settings.core.preserveModificationDate = value;
                  this.plugin.debugLog('preserveModificationDate', value);
                  try {
                    await this.plugin.saveSettings();
                  } catch {
                    new Notice(t('settings.errors.saveFailed'));
                  }
                })();
              })
          );
      })
      // 4. Grab card link
      .addSetting((s) => {
        cardLinkSetting = s;
        s.setName(t('settings.other.grabCardLink.name')).addToggle((toggle) =>
          toggle
            .setValue(
              this.plugin.settings.markupStripping.grabTitleFromCardLink
            )
            .onChange((value) => {
              void (async () => {
                this.plugin.settings.markupStripping.grabTitleFromCardLink =
                  value;
                this.plugin.debugLog('grabTitleFromCardLink', value);
                try {
                  await this.plugin.saveSettings();
                } catch {
                  new Notice(t('settings.errors.saveFailed'));
                }
              })();
            })
        );
      })
      // 5. New note delay
      .addSetting((s) => {
        newNoteDelaySetting = s;
        s.setName(t('settings.other.newNoteDelay.name'));
      })
      // 6. Content read method
      .addSetting((s) => {
        contentReadMethodSetting = s;
        s.setName(t('settings.other.contentReadMethod.name'));
      })
      // 7. Debug
      .addSetting((s) => {
        debugSetting = s;
        s.setName(t('settings.other.debug.name'))
          .setDesc(t('settings.other.debug.desc'))
          .addToggle((toggle) =>
            toggle
              .setValue(this.plugin.settings.core.verboseLogging)
              .onChange((value) => {
                void (async () => {
                  this.plugin.debugLog('verboseLogging', value);
                  this.plugin.settings.core.verboseLogging = value;
                  if (value) {
                    this.plugin.settings.core.debugEnabledTimestamp =
                      this.plugin.getCurrentTimestamp?.() || '';
                  } else {
                    this.plugin.settings.core.debugEnabledTimestamp = '';
                  }
                  try {
                    await this.plugin.saveSettings();
                  } catch {
                    new Notice(t('settings.errors.saveFailed'));
                  }
                  updateDebugSubOptionVisibility();
                  if (value) {
                    this.plugin.outputAllSettings?.();
                  }
                })();
              })
          );
      });

    // Configuration section
    new SettingGroup(this.containerEl)
      .setHeading(t('settings.other.configuration.title'))
      .addSetting((s) => {
        s.setName(t('settings.other.manageSettings.name'))
          .setDesc(t('settings.other.manageSettings.desc'))
          .addButton((button) =>
            button
              .setButtonText(t('settings.other.manageSettings.import'))
              .onClick(() => {
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

                  if (selectedFile) {
                    const reader = new FileReader();
                    reader.onerror = () => {
                      console.error('FileReader error:', reader.error);
                      new Notice(
                        t('settings.errors.importFailed') ??
                          'Failed to read file'
                      );
                      input.remove();
                    };
                    reader.readAsText(selectedFile, 'UTF-8');
                    reader.onload = (readerEvent) => {
                      void (async () => {
                        let importedJson;
                        const content = readerEvent.target?.result;
                        if (typeof content === 'string') {
                          try {
                            importedJson = JSON.parse(content);
                          } catch {
                            new Notice(t('notifications.invalidImportFile'));
                            console.error(t('notifications.invalidImportFile'));
                            input.remove();
                            return;
                          }
                        } else {
                          new Notice(
                            t('settings.errors.importFailed') ??
                              'Invalid file format'
                          );
                          input.remove();
                          return;
                        }

                        if (importedJson) {
                          const newSettings = Object.assign(
                            {},
                            DEFAULT_SETTINGS
                          );
                          for (const setting in this.plugin.settings) {
                            if (setting in importedJson) {
                              const importedValue = importedJson[setting];
                              const existingValue =
                                this.plugin.settings[
                                  setting as keyof typeof this.plugin.settings
                                ];
                              // Basic type check to prevent corruption from malformed imports
                              if (
                                typeof importedValue === typeof existingValue
                              ) {
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
                          let previousSettings;
                          try {
                            previousSettings = structuredClone(
                              this.plugin.settings
                            );
                          } catch {
                            // Fallback for non-cloneable values (shouldn't happen with settings)
                            previousSettings = JSON.parse(
                              JSON.stringify(this.plugin.settings)
                            );
                          }
                          try {
                            this.plugin.settings = newSettings;
                            await this.plugin.saveSettings();
                          } catch {
                            // Rollback to previous settings on save failure
                            this.plugin.settings = previousSettings;
                            new Notice(t('settings.errors.saveFailed'));
                            input.remove();
                            return;
                          }

                          new Notice(t('notifications.settingsImported'));

                          // Refresh UI - wrap in try-finally to ensure input cleanup
                          try {
                            const settingsTab = (
                              this.plugin as typeof this.plugin & {
                                settingsTab?: { display(): void };
                              }
                            ).settingsTab;
                            if (settingsTab && settingsTab.display) {
                              settingsTab.display();
                            } else {
                              this.containerEl.empty();
                              this.render();
                            }
                          } finally {
                            input.remove();
                          }
                          return;
                        }

                        input.remove();
                      })();
                    };
                  }
                };

                input.click();
              })
          )
          .addButton((button) =>
            button
              .setButtonText(t('settings.other.manageSettings.export'))
              .onClick(() => {
                void (async () => {
                  const settingsText = JSON.stringify(
                    this.plugin.settings,
                    null,
                    2
                  );
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
              })
          );
      })
      .addSetting((s) => {
        s.setName(t('settings.other.clearSettings.name'))
          .setDesc(t('settings.other.clearSettings.desc'))
          .addButton((button) => {
            button
              .setButtonText(t('modals.buttons.clear'))
              .setWarning()
              .onClick(() => {
                new ClearSettingsModal(
                  this.plugin.app,
                  this.plugin,
                  async () => {
                    // Deep copy for rollback (reference would be unsafe if settings were modified in-place)
                    let previousSettings;
                    try {
                      previousSettings = structuredClone(this.plugin.settings);
                    } catch {
                      // Fallback for non-cloneable values (shouldn't happen with settings)
                      previousSettings = JSON.parse(
                        JSON.stringify(this.plugin.settings)
                      );
                    }
                    let newSettings;
                    try {
                      newSettings = structuredClone(DEFAULT_SETTINGS);
                    } catch {
                      // Fallback for non-cloneable values (shouldn't happen with settings)
                      newSettings = JSON.parse(
                        JSON.stringify(DEFAULT_SETTINGS)
                      );
                    }

                    const locale = getCurrentLocale();
                    if (locale === 'ru') {
                      newSettings.safewords.safewords[0].text = 'Задачи';
                    } else {
                      newSettings.safewords.safewords[0].text = 'To do';
                    }

                    newSettings.core.hasShownFirstTimeNotice = true;
                    newSettings.core.lastUsageDate =
                      this.plugin.getTodayDateString?.() || '';

                    try {
                      this.plugin.settings = newSettings;
                      await this.plugin.saveSettings();
                    } catch {
                      // Rollback to previous settings on save failure
                      this.plugin.settings = previousSettings;
                      new Notice(t('settings.errors.saveFailed'));
                      return;
                    }

                    const pluginInitializer = new PluginInitializer(
                      this.plugin
                    );
                    await pluginInitializer.initializeFirstEnableLogic();
                    await pluginInitializer.checkFirstTimeExclusionsSetup();

                    verboseLog(
                      this.plugin,
                      `Showing notice: ${t('notifications.settingsCleared')}`
                    );
                    new Notice(t('notifications.settingsCleared'));

                    const settingsTab = (
                      this.plugin as typeof this.plugin & {
                        settingsTab?: { display(): void };
                      }
                    ).settingsTab;
                    if (settingsTab && settingsTab.display) {
                      settingsTab.display();
                    } else {
                      this.containerEl.empty();
                      this.render();
                    }
                  }
                ).open();
              });
          });
      });

    // Post-process settings that need custom controls and descriptions

    // Character count setting - add styled description and slider
    const charCountDesc = charCountSetting!.descEl;
    charCountDesc.appendText(t('settings.other.charCount.desc'));
    charCountDesc.createEl('br');
    charCountDesc
      .createEl('small')
      .createEl('strong', { text: t('settings.other.charCount.default') });

    const charCountContainer = charCountSetting!.controlEl.createDiv({
      cls: 'flit-char-text-input-container',
    });

    const charCountRestoreButton = charCountContainer.createEl('div', {
      cls: 'clickable-icon extra-setting-button',
      attr: { 'aria-label': t('ariaLabels.restoreDefault') },
    });
    setIcon(charCountRestoreButton, 'rotate-ccw');

    sliderDiv = charCountContainer.createDiv();

    charCountSetting!.addSlider((slider) => {
      slider
        .setLimits(1, 252, 1)
        .setValue(this.plugin.settings.core.charCount)
        .setDynamicTooltip()
        .onChange((value) => {
          void (async () => {
            this.plugin.settings.core.charCount = value;
            this.plugin.debugLog('charCount', value);
            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
          })();
        });

      sliderDiv.appendChild(slider.sliderEl);
    });

    charCountRestoreButton.addEventListener('click', () => {
      void (async () => {
        this.plugin.settings.core.charCount = DEFAULT_SETTINGS.core.charCount;
        this.plugin.debugLog('charCount', this.plugin.settings.core.charCount);
        try {
          await this.plugin.saveSettings();
        } catch {
          new Notice(t('settings.errors.saveFailed'));
        }

        const sliderInput = sliderDiv.querySelector(
          'input[type="range"]'
        ) as HTMLInputElement;
        if (sliderInput) {
          sliderInput.value = String(DEFAULT_SETTINGS.core.charCount);
          sliderInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })();
    });

    // Card link setting - add styled description
    const cardLinkDesc = cardLinkSetting!.descEl;
    cardLinkDesc.appendText(t('settings.other.grabCardLink.desc.part1'));
    const autoCardLink = cardLinkDesc.createEl('a', {
      href: 'obsidian://show-plugin?id=auto-card-link',
    });
    autoCardLink.textContent = PLUGIN_AUTO_CARD_LINK;
    cardLinkDesc.appendText(t('settings.other.grabCardLink.desc.part2'));
    const linkEmbedLink = cardLinkDesc.createEl('a', {
      href: 'obsidian://show-plugin?id=obsidian-link-embed',
    });
    linkEmbedLink.textContent = PLUGIN_LINK_EMBED;
    cardLinkDesc.appendText(t('settings.other.grabCardLink.desc.part3'));

    // New note delay setting - add styled description and slider
    const newNoteDelayDesc = newNoteDelaySetting!.descEl;
    newNoteDelayDesc.appendText(t('settings.other.newNoteDelay.desc'));
    newNoteDelayDesc.createEl('br');
    newNoteDelayDesc
      .createEl('small')
      .createEl('strong', { text: t('settings.other.newNoteDelay.default') });

    const newNoteDelayContainer = newNoteDelaySetting!.controlEl.createDiv({
      cls: 'flit-char-text-input-container',
    });

    const newNoteDelayRestoreButton = newNoteDelayContainer.createEl('div', {
      cls: 'clickable-icon extra-setting-button',
      attr: { 'aria-label': t('ariaLabels.restoreDefault') },
    });
    setIcon(newNoteDelayRestoreButton, 'rotate-ccw');

    newNoteDelaySliderDiv = newNoteDelayContainer.createDiv();

    newNoteDelaySetting!.addSlider((slider) => {
      slider
        .setLimits(0, 5000, 50)
        .setValue(this.plugin.settings.core.newNoteDelay)
        .setDynamicTooltip()
        .onChange((value) => {
          void (async () => {
            this.plugin.settings.core.newNoteDelay = value;
            this.plugin.debugLog('newNoteDelay', value);
            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
          })();
        });

      newNoteDelaySliderDiv.appendChild(slider.sliderEl);
    });

    newNoteDelayRestoreButton.addEventListener('click', () => {
      void (async () => {
        this.plugin.settings.core.newNoteDelay =
          DEFAULT_SETTINGS.core.newNoteDelay;
        this.plugin.debugLog(
          'newNoteDelay',
          this.plugin.settings.core.newNoteDelay
        );
        try {
          await this.plugin.saveSettings();
        } catch {
          new Notice(t('settings.errors.saveFailed'));
        }

        const sliderInput = newNoteDelaySliderDiv.querySelector(
          'input[type="range"]'
        ) as HTMLInputElement;
        if (sliderInput) {
          sliderInput.value = String(DEFAULT_SETTINGS.core.newNoteDelay);
          sliderInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })();
    });

    // Content read method setting - add styled description and dropdown
    const contentReadMethodDesc = contentReadMethodSetting!.descEl;
    contentReadMethodDesc.appendText(
      t('settings.other.contentReadMethod.desc')
    );
    contentReadMethodDesc.createEl('br');
    contentReadMethodDesc.createEl('small').createEl('strong', {
      text: t('settings.other.contentReadMethod.default'),
    });

    const contentReadContainer = contentReadMethodSetting!.controlEl.createDiv({
      cls: 'flit-display-flex flit-gap-10',
    });

    const contentReadRestoreButton = contentReadContainer.createEl('div', {
      attr: { 'aria-label': t('ariaLabels.restoreDefaultContentRead') },
      cls: 'clickable-icon extra-setting-button',
    });
    setIcon(contentReadRestoreButton, 'rotate-ccw');

    const dropdown = contentReadContainer.createEl('select', {
      cls: 'dropdown',
    });
    dropdown.createEl('option', {
      value: 'Editor',
      text: t('settings.other.contentReadMethod.editor'),
    });
    dropdown.createEl('option', {
      value: 'Cache',
      text: t('settings.other.contentReadMethod.cache'),
    });
    dropdown.createEl('option', {
      value: 'File',
      text: t('settings.other.contentReadMethod.file'),
    });
    dropdown.value = this.plugin.settings.core.fileReadMethod;

    contentReadRestoreButton.addEventListener('click', () => {
      void (async () => {
        dropdown.value = DEFAULT_SETTINGS.core.fileReadMethod;
        this.plugin.settings.core.fileReadMethod =
          DEFAULT_SETTINGS.core.fileReadMethod;
        this.plugin.debugLog(
          'fileReadMethod',
          this.plugin.settings.core.fileReadMethod
        );
        try {
          await this.plugin.saveSettings();
        } catch {
          new Notice(t('settings.errors.saveFailed'));
        }
        this.updateAutomaticRenameVisibility();
      })();
    });

    dropdown.addEventListener('change', (e) => {
      void (async () => {
        const newMode = (e.target as HTMLSelectElement).value as FileReadMethod;
        this.plugin.settings.core.fileReadMethod = newMode;
        this.plugin.debugLog(
          'fileReadMethod',
          this.plugin.settings.core.fileReadMethod
        );
        try {
          await this.plugin.saveSettings();
        } catch {
          new Notice(t('settings.errors.saveFailed'));
        }
        this.updateAutomaticRenameVisibility();
      })();
    });

    // Get the setting-items container for sub-settings
    const settingItems = this.containerEl.querySelector(
      '.flit-other-group .setting-items'
    );

    // Create sub-settings containers and position them after their parent settings
    contentReadSubSettingsContainer = (
      settingItems ?? this.containerEl
    ).createDiv('flit-sub-settings');
    contentReadMethodSetting!.settingEl.after(contentReadSubSettingsContainer);

    debugSubSettingsContainer = (settingItems ?? this.containerEl).createDiv(
      'flit-sub-settings'
    );
    debugSetting!.settingEl.after(debugSubSettingsContainer);

    // Sub-setting: Check interval
    const checkIntervalSetting = new Setting(contentReadSubSettingsContainer)
      .setName(t('settings.other.checkInterval.name'))
      .setDesc('');

    const checkIntervalDesc = checkIntervalSetting.descEl;
    checkIntervalDesc.appendText(t('settings.other.checkInterval.desc'));
    checkIntervalDesc.createEl('br');
    checkIntervalDesc
      .createEl('small')
      .createEl('strong', { text: t('settings.other.checkInterval.default') });

    const checkIntervalContainer = checkIntervalSetting.controlEl.createDiv({
      cls: 'flit-char-text-input-container',
    });

    const checkIntervalRestoreButton = checkIntervalContainer.createEl('div', {
      cls: 'clickable-icon extra-setting-button',
      attr: { 'aria-label': t('ariaLabels.restoreDefault') },
    });
    setIcon(checkIntervalRestoreButton, 'rotate-ccw');

    checkIntervalSliderDiv = checkIntervalContainer.createDiv();

    checkIntervalSetting.addSlider((slider) => {
      slider
        .setLimits(0, 5000, 50)
        .setValue(this.plugin.settings.core.checkInterval)
        .setDynamicTooltip()
        .onChange((value) => {
          void (async () => {
            this.plugin.settings.core.checkInterval = value;
            this.plugin.debugLog('checkInterval', value);
            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
            this.plugin.editorLifecycle?.initializeCheckingSystem();
          })();
        });

      checkIntervalSliderDiv.appendChild(slider.sliderEl);
    });

    checkIntervalRestoreButton.addEventListener('click', () => {
      void (async () => {
        this.plugin.settings.core.checkInterval =
          DEFAULT_SETTINGS.core.checkInterval;
        this.plugin.debugLog(
          'checkInterval',
          this.plugin.settings.core.checkInterval
        );
        try {
          await this.plugin.saveSettings();
        } catch {
          new Notice(t('settings.errors.saveFailed'));
        }

        (
          this.plugin.editorLifecycle as {
            initializeCheckingSystem?: () => void;
          }
        )?.initializeCheckingSystem?.();

        const sliderInput = checkIntervalSliderDiv.querySelector(
          'input[type="range"]'
        ) as HTMLInputElement;
        if (sliderInput) {
          sliderInput.value = String(DEFAULT_SETTINGS.core.checkInterval);
          sliderInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })();
    });

    this.conditionalSettings = [checkIntervalSetting];

    // Sub-setting: Debug output content
    new Setting(debugSubSettingsContainer)
      .setName(t('settings.other.debugOutputContent.name'))
      .setDesc(t('settings.other.debugOutputContent.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.core.debugOutputFullContent)
          .onChange((value) => {
            void (async () => {
              this.plugin.settings.core.debugOutputFullContent = value;
              this.plugin.debugLog('debugOutputFullContent', value);
              try {
                await this.plugin.saveSettings();
              } catch {
                new Notice(t('settings.errors.saveFailed'));
              }
            })();
          })
      );

    // Visibility update function for debug sub-settings
    const updateDebugSubOptionVisibility = () => {
      if (this.plugin.settings.core.verboseLogging) {
        debugSubSettingsContainer.removeClass('flit-display-none');
      } else {
        debugSubSettingsContainer.addClass('flit-display-none');
      }
    };

    // Set initial visibility
    updateDebugSubOptionVisibility();
    this.updateAutomaticRenameVisibility();
  }

  private updateAutomaticRenameVisibility(): void {
    if (this.conditionalSettings.length === 0) return;

    // Check interval only applies when using Editor content read method
    const shouldShow =
      this.plugin.settings.core.renameNotes === 'automatically' &&
      this.plugin.settings.core.fileReadMethod === 'Editor';

    this.conditionalSettings.forEach((setting) => {
      if (shouldShow) {
        setting.settingEl.removeClass('flit-display-none');
      } else {
        setting.settingEl.addClass('flit-display-none');
      }
    });
  }
}
