import {
  Setting,
  SettingGroup,
  setIcon,
  ToggleComponent,
  Notice,
} from 'obsidian';
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';
import { detectOS } from '../utils';
import { DEFAULT_SETTINGS } from '../constants';
import { t, getCurrentLocale } from '../i18n';
import { CharReplacements } from '../types/char-replacement';

// Module-level constants for tab index values
const TAB_INDEX_FOCUSABLE = 0;
const TAB_INDEX_NOT_FOCUSABLE = -1;

interface CharSettingDef {
  key: keyof CharReplacements;
  name: string;
  char: string;
  description?: string;
}

interface CharTableConfig {
  wrapper: HTMLElement;
  chars: CharSettingDef[];
  isEnabled: () => boolean;
  isWindowsAndroid?: boolean;
}

export class ForbiddenCharsTab extends SettingsTabBase {
  constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
    super(plugin, containerEl);
  }

  private renderCharacterRows(config: CharTableConfig): void {
    config.chars.forEach((setting) => {
      const key = setting.key;
      const rowEl = config.wrapper.createEl('div', {
        cls: 'flit-char-replacement-setting',
      });

      const toggleContainer = rowEl.createDiv({ cls: 'flit-enable-column' });
      const toggleSetting = new Setting(document.createElement('div'));
      toggleSetting.addToggle((toggle) => {
        toggle
          .setValue(
            config.isEnabled()
              ? this.plugin.settings.replaceCharacters.charReplacements[key]
                  .enabled
              : false
          )
          .onChange(async (value) => {
            this.plugin.settings.replaceCharacters.charReplacements[
              key
            ].enabled = value;
            this.plugin.debugLog(
              `charReplacements.${String(key)}.enabled`,
              value
            );
            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
            updateRowAppearance();
          });
        toggle.toggleEl.classList.add('flit-margin-0');
        toggleContainer.appendChild(toggle.toggleEl);
      });

      const updateRowAppearance = () => {
        if (
          this.plugin.settings.replaceCharacters.charReplacements[key].enabled
        ) {
          rowEl.classList.remove('flit-row-disabled');
        } else {
          rowEl.classList.add('flit-row-disabled');
        }
      };

      const nameContainer = rowEl.createEl('div', {
        cls: 'flit-char-name-column',
      });
      nameContainer.createEl('div', {
        text: setting.name,
        cls: 'setting-item-name',
      });
      if (setting.description) {
        const descEl = nameContainer.createEl('div', {
          cls: 'setting-item-description',
        });
        descEl.textContent = setting.description;
      }

      const inputContainer = rowEl.createDiv({
        cls: 'flit-char-text-input-container',
      });

      const restoreButton = inputContainer.createEl('div', {
        cls: 'clickable-icon extra-setting-button',
        attr: {
          'aria-label': t('settings.replaceCharacters.restoreDefault'),
        },
      });
      setIcon(restoreButton, 'rotate-ccw');
      restoreButton.addEventListener('click', () => {
        void (async () => {
          this.plugin.settings.replaceCharacters.charReplacements[
            key
          ].replacement =
            DEFAULT_SETTINGS.replaceCharacters.charReplacements[
              key
            ].replacement;
          textInput.value =
            DEFAULT_SETTINGS.replaceCharacters.charReplacements[
              key
            ].replacement;
          try {
            await this.plugin.saveSettings();
          } catch {
            new Notice(t('settings.errors.saveFailed'));
          }
        })();
      });

      const textInput = inputContainer.createEl('input', {
        type: 'text',
        cls: 'flit-char-text-input flit-width-120',
      });
      textInput.placeholder = t('settings.replaceCharacters.emptyPlaceholder');
      textInput.value =
        this.plugin.settings.replaceCharacters.charReplacements[
          key
        ].replacement;
      textInput.addEventListener('input', (e) => {
        void (async () => {
          this.plugin.settings.replaceCharacters.charReplacements[
            key
          ].replacement = (e.target as HTMLInputElement).value;
          this.plugin.debugLog(
            `charReplacements.${String(key)}.replacement`,
            this.plugin.settings.replaceCharacters.charReplacements[key]
              .replacement
          );
          try {
            await this.plugin.saveSettings();
          } catch {
            new Notice(t('settings.errors.saveFailed'));
          }
        })();
      });

      this.addForbiddenCharProtection(
        textInput,
        config.isWindowsAndroid ?? false
      );

      const trimLeftContainer = rowEl.createDiv({
        cls: 'flit-toggle-column center',
      });
      const trimLeftSetting = new Setting(document.createElement('div'));
      trimLeftSetting.addToggle((toggle) => {
        toggle
          .setValue(
            config.isEnabled()
              ? this.plugin.settings.replaceCharacters.charReplacements[key]
                  .trimLeft
              : false
          )
          .onChange(async (value) => {
            this.plugin.settings.replaceCharacters.charReplacements[
              key
            ].trimLeft = value;
            this.plugin.debugLog(
              `charReplacements.${String(key)}.trimLeft`,
              value
            );
            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
          });
        toggle.toggleEl.classList.add('flit-margin-0');
        trimLeftContainer.appendChild(toggle.toggleEl);
      });

      const trimRightContainer = rowEl.createDiv({
        cls: 'flit-toggle-column center',
      });
      const trimRightSetting = new Setting(document.createElement('div'));
      trimRightSetting.addToggle((toggle) => {
        toggle
          .setValue(
            config.isEnabled()
              ? this.plugin.settings.replaceCharacters.charReplacements[key]
                  .trimRight
              : false
          )
          .onChange(async (value) => {
            this.plugin.settings.replaceCharacters.charReplacements[
              key
            ].trimRight = value;
            this.plugin.debugLog(
              `charReplacements.${String(key)}.trimRight`,
              value
            );
            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
          });
        toggle.toggleEl.classList.add('flit-margin-0');
        trimRightContainer.appendChild(toggle.toggleEl);
      });

      updateRowAppearance();
    });
  }

  private renderTableHeader(wrapper: HTMLElement): void {
    const headerRow = wrapper.createEl('div', {
      cls: 'flit-char-replacement-header',
    });

    const enableHeader = headerRow.createDiv({ cls: 'flit-enable-column' });
    enableHeader.textContent = t('settings.replaceCharacters.headers.enable');

    const charNameHeader = headerRow.createDiv({
      cls: 'flit-char-name-column',
    });
    charNameHeader.textContent = t(
      'settings.replaceCharacters.headers.character'
    );

    const inputHeader = headerRow.createDiv({
      cls: 'flit-char-text-input-container',
    });
    inputHeader.textContent = t(
      'settings.replaceCharacters.headers.replaceWith'
    );

    const trimLeftHeader = headerRow.createDiv({
      cls: 'flit-toggle-column center',
    });
    const trimLeftLine1 = trimLeftHeader.createDiv();
    trimLeftLine1.textContent = t(
      'settings.replaceCharacters.headers.trimLeft'
    );

    const trimRightHeader = headerRow.createDiv({
      cls: 'flit-toggle-column center',
    });
    const trimRightLine1 = trimRightHeader.createDiv();
    trimRightLine1.textContent = t(
      'settings.replaceCharacters.headers.trimRight'
    );
  }

  render(): void {
    new Setting(this.containerEl)
      .setName(t('settings.replaceCharacters.name'))
      .setDesc(t('settings.replaceCharacters.desc'))
      .setHeading()
      .addToggle((toggle) => {
        toggle
          .setValue(
            this.plugin.settings.replaceCharacters
              .enableForbiddenCharReplacements
          )
          .onChange(async (value) => {
            this.plugin.settings.replaceCharacters.enableForbiddenCharReplacements =
              value;
            this.plugin.debugLog('enableForbiddenCharReplacements', value);

            // Auto-toggle OFF dependent settings when disabling
            if (!value) {
              if (
                this.plugin.settings.core.convertReplacementCharactersInTitle
              ) {
                this.plugin.settings.core.convertReplacementCharactersInTitle = false;
              }
            }

            // On first enable, turn on all 'All OSes' options
            if (value && !this.plugin.settings.core.hasEnabledForbiddenChars) {
              const allOSesKeys = primaryCharSettings.map((s) => s.key);
              allOSesKeys.forEach((key) => {
                this.plugin.settings.replaceCharacters.charReplacements[
                  key
                ].enabled = true;
              });
              this.plugin.settings.core.hasEnabledForbiddenChars = true;

              // If OS is Windows, also enable 'Windows/Android' section
              const currentOS = detectOS();
              if (
                currentOS === 'Windows' &&
                !this.plugin.settings.core.hasEnabledWindowsAndroid
              ) {
                this.plugin.settings.replaceCharacters.windowsAndroidEnabled = true;
                const windowsAndroidKeys = windowsAndroidChars.map(
                  (s) => s.key
                );
                windowsAndroidKeys.forEach((key) => {
                  this.plugin.settings.replaceCharacters.charReplacements[
                    key
                  ].enabled = true;
                });
                this.plugin.settings.core.hasEnabledWindowsAndroid = true;
              }
            }

            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
            updateCharacterSettings(); // Rebuilds everything including UI state
            if (windowsAndroidToggleComponent !== undefined) {
              windowsAndroidToggleComponent.setDisabled(!value);
              if (value) {
                windowsAndroidToggleComponent.toggleEl.classList.remove(
                  'flit-state-disabled'
                );
                windowsAndroidToggleComponent.toggleEl.classList.add(
                  'flit-state-enabled'
                );
                windowsAndroidToggleComponent.toggleEl.tabIndex =
                  TAB_INDEX_FOCUSABLE;
                windowsAndroidToggleComponent.toggleEl.removeAttribute(
                  'aria-disabled'
                );
              } else {
                windowsAndroidToggleComponent.toggleEl.classList.remove(
                  'flit-state-enabled'
                );
                windowsAndroidToggleComponent.toggleEl.classList.add(
                  'flit-state-disabled'
                );
                windowsAndroidToggleComponent.toggleEl.tabIndex =
                  TAB_INDEX_NOT_FOCUSABLE;
                windowsAndroidToggleComponent.toggleEl.setAttribute(
                  'aria-disabled',
                  'true'
                );
              }
            }
            void (
              this.plugin as typeof this.plugin & {
                updateGeneralConditionalSettings?: () => Promise<void>;
              }
            ).updateGeneralConditionalSettings?.();
          });
      });

    const charSettingsContainer = this.containerEl.createDiv({
      cls: 'flit-char-settings-container',
    });

    let windowsAndroidToggleComponent: ToggleComponent | undefined;

    const updateCharacterReplacementUI = () => {
      this.updateInteractiveState(
        charSettingsContainer,
        this.plugin.settings.replaceCharacters.enableForbiddenCharReplacements
      );
      this.updateDisabledRowsAccessibility(charSettingsContainer);
      const allTableContainers = charSettingsContainer.querySelectorAll(
        '.flit-table-container'
      );
      allTableContainers.forEach((container: HTMLElement) => {
        if (
          this.plugin.settings.replaceCharacters.enableForbiddenCharReplacements
        ) {
          container.classList.remove('flit-master-disabled');
        } else {
          container.classList.add('flit-master-disabled');
        }
      });
    };

    const primaryCharSettings: CharSettingDef[] = [
      {
        key: 'leftBracket',
        name: t('settings.replaceCharacters.characters.leftBracket'),
        char: '[',
      },
      {
        key: 'rightBracket',
        name: t('settings.replaceCharacters.characters.rightBracket'),
        char: ']',
      },
      {
        key: 'hash',
        name: t('settings.replaceCharacters.characters.hash'),
        char: '#',
      },
      {
        key: 'caret',
        name: t('settings.replaceCharacters.characters.caret'),
        char: '^',
      },
      {
        key: 'pipe',
        name: t('settings.replaceCharacters.characters.pipe'),
        char: '|',
      },
      {
        key: 'backslash',
        name: t('settings.replaceCharacters.characters.backslash'),
        char: String.fromCharCode(92),
      },
      {
        key: 'slash',
        name: t('settings.replaceCharacters.characters.forwardSlash'),
        char: '/',
      },
      {
        key: 'colon',
        name: t('settings.replaceCharacters.characters.colon'),
        char: ':',
      },
      {
        key: 'dot',
        name: t('settings.replaceCharacters.characters.dot'),
        char: '.',
        description: t('settings.replaceCharacters.characters.dotNote'),
      },
    ];

    const windowsAndroidChars: CharSettingDef[] = [
      {
        key: 'asterisk',
        name: t('settings.replaceCharacters.characters.asterisk'),
        char: '*',
      },
      {
        key: 'quote',
        name: t('settings.replaceCharacters.characters.quote'),
        char: '"',
      },
      {
        key: 'lessThan',
        name: t('settings.replaceCharacters.characters.lessThan'),
        char: '<',
      },
      {
        key: 'greaterThan',
        name: t('settings.replaceCharacters.characters.greaterThan'),
        char: '>',
      },
      {
        key: 'question',
        name: t('settings.replaceCharacters.characters.questionMark'),
        char: '?',
      },
    ];

    const updateCharacterSettings = () => {
      charSettingsContainer.empty();

      const allOSesHeading = new Setting(charSettingsContainer)
        .setName(t('settings.replaceCharacters.allOSes.title'))
        .setDesc(t('settings.replaceCharacters.allOSes.desc'))
        .setHeading();
      allOSesHeading.settingEl.addClass('flit-heading-with-desc');

      const allOSesNoteEl = charSettingsContainer.createEl('div', {
        cls: 'setting-item-description flit-margin-top-15 flit-margin-bottom-15',
      });
      const locale = getCurrentLocale();
      allOSesNoteEl.appendText(
        t('settings.replaceCharacters.allOSes.note.part1')
      );
      if (locale === 'ru') {
        allOSesNoteEl.appendText(
          '«' + t('settings.replaceCharacters.allOSes.note.trimLeft') + '»'
        );
      } else {
        allOSesNoteEl.createEl('em', {
          text: t('settings.replaceCharacters.allOSes.note.trimLeft'),
        });
      }
      allOSesNoteEl.appendText(
        t('settings.replaceCharacters.allOSes.note.part2')
      );
      if (locale === 'ru') {
        allOSesNoteEl.appendText(
          '«' + t('settings.replaceCharacters.allOSes.note.trimRight') + '»'
        );
      } else {
        allOSesNoteEl.createEl('em', {
          text: t('settings.replaceCharacters.allOSes.note.trimRight'),
        });
      }
      allOSesNoteEl.appendText(
        t('settings.replaceCharacters.allOSes.note.part3')
      );

      new SettingGroup(charSettingsContainer).addClass('flit-all-oses-group');
      const allOSesGroupContainer =
        charSettingsContainer.querySelector<HTMLElement>(
          '.flit-all-oses-group .setting-items'
        );
      if (!allOSesGroupContainer) {
        console.error('FLIT: Failed to find all-oses-group settings container');
        return;
      }

      const allOSesTableContainer = allOSesGroupContainer.createEl('div', {
        cls: 'flit-table-container',
      });
      const allOSesTableWrapper = allOSesTableContainer.createEl('div', {
        cls: 'flit-table-wrapper',
      });

      this.renderTableHeader(allOSesTableWrapper);
      // Event listeners are recreated each time the table is rebuilt via charSettingsContainer.empty()
      this.renderCharacterRows({
        wrapper: allOSesTableWrapper,
        chars: primaryCharSettings,
        isEnabled: () => this.plugin.settings.core.hasEnabledForbiddenChars,
      });

      new Setting(charSettingsContainer)
        .setName(t('settings.replaceCharacters.windowsAndroid.title'))
        .setDesc(t('settings.replaceCharacters.windowsAndroid.desc'))
        .setHeading()
        .addToggle((toggle) => {
          windowsAndroidToggleComponent = toggle;
          toggle
            .setValue(
              this.plugin.settings.replaceCharacters.windowsAndroidEnabled
            )
            .setDisabled(
              !this.plugin.settings.replaceCharacters
                .enableForbiddenCharReplacements
            )
            .onChange(async (value) => {
              this.plugin.settings.replaceCharacters.windowsAndroidEnabled =
                value;
              this.plugin.debugLog('windowsAndroidEnabled', value);

              // On first enable, turn on all 'Windows/Android' options
              if (
                value &&
                !this.plugin.settings.core.hasEnabledWindowsAndroid
              ) {
                windowsAndroidChars.forEach((setting) => {
                  this.plugin.settings.replaceCharacters.charReplacements[
                    setting.key
                  ].enabled = true;
                });
                this.plugin.settings.core.hasEnabledWindowsAndroid = true;
                try {
                  await this.plugin.saveSettings();
                } catch {
                  new Notice(t('settings.errors.saveFailed'));
                }
                updateCharacterSettings();
                updateWindowsAndroidUI();
                return;
              }

              try {
                await this.plugin.saveSettings();
              } catch {
                new Notice(t('settings.errors.saveFailed'));
              }
              updateWindowsAndroidUI();
            });

          // Make toggle completely non-interactive when disabled to prevent opacity stacking
          if (
            !this.plugin.settings.replaceCharacters
              .enableForbiddenCharReplacements
          ) {
            toggle.toggleEl.classList.add('flit-state-disabled');
            toggle.toggleEl.tabIndex = TAB_INDEX_NOT_FOCUSABLE;
            toggle.toggleEl.setAttribute('aria-disabled', 'true');
          }
        });

      new SettingGroup(charSettingsContainer).addClass(
        'flit-windows-android-group'
      );
      const windowsAndroidGroupContainer =
        charSettingsContainer.querySelector<HTMLElement>(
          '.flit-windows-android-group .setting-items'
        );
      if (!windowsAndroidGroupContainer) {
        console.error(
          'FLIT: Failed to find windows-android-group settings container'
        );
        return;
      }

      const windowsAndroidTableContainer =
        windowsAndroidGroupContainer.createEl('div', {
          cls: 'flit-table-container flit-windows-android-table',
        });
      const windowsAndroidTableWrapper = windowsAndroidTableContainer.createEl(
        'div',
        { cls: 'flit-table-wrapper' }
      );

      this.renderTableHeader(windowsAndroidTableWrapper);
      this.renderCharacterRows({
        wrapper: windowsAndroidTableWrapper,
        chars: windowsAndroidChars,
        isEnabled: () =>
          this.plugin.settings.core.hasEnabledForbiddenChars &&
          this.plugin.settings.core.hasEnabledWindowsAndroid,
        isWindowsAndroid: true,
      });
    };

    const updateWindowsAndroidUI = () => {
      const windowsAndroidGroup =
        charSettingsContainer.querySelector<HTMLElement>(
          '.flit-windows-android-group'
        );
      if (windowsAndroidGroup) {
        if (this.plugin.settings.replaceCharacters.windowsAndroidEnabled) {
          windowsAndroidGroup.classList.remove('flit-hidden');
        } else {
          windowsAndroidGroup.classList.add('flit-hidden');
        }
      }
    };

    updateCharacterSettings();
    updateCharacterReplacementUI();
    updateWindowsAndroidUI();
  }
}
