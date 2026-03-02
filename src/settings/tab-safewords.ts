import { Setting, SettingGroup, setIcon, Notice } from 'obsidian';
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';
import { t } from '../i18n';
import { TIMING } from '../constants/timing';

export class SafewordsTab extends SettingsTabBase {
  constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
    super(plugin, containerEl);
  }

  render(): void {
    new Setting(this.containerEl)
      .setName(t('settings.safewords.enableSafewords.name'))
      .setDesc(t('settings.safewords.enableSafewords.desc'))
      .setHeading()
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.safewords.enableSafewords)
          .onChange(async (value) => {
            this.plugin.settings.safewords.enableSafewords = value;
            this.plugin.debugLog('enableSafewords', value);

            // On first enable, turn on all leftmost (enabled) toggles in safewords
            if (value && !this.plugin.settings.core.hasEnabledSafewords) {
              this.plugin.settings.safewords.safewords.forEach((safeword) => {
                safeword.enabled = true;
              });
              this.plugin.settings.core.hasEnabledSafewords = true;
            }

            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
            updateSafewordsUI();
            renderSafewords();
          });
      });

    new SettingGroup(this.containerEl).addClass('flit-safewords-group');
    const safewordsContainer = this.containerEl.querySelector<HTMLElement>(
      '.flit-safewords-group .setting-items'
    );
    if (!safewordsContainer) {
      console.error('FLIT: Failed to find safewords settings container');
      return;
    }

    const updateSafewordsUI = () => {
      // Update master disable state for entire section
      this.updateInteractiveState(
        safewordsContainer,
        this.plugin.settings.safewords.enableSafewords
      );
      // Also update any disabled rows
      this.updateDisabledRowsAccessibility(safewordsContainer);

      // Update table containers scrollbar visibility
      const tableContainers = safewordsContainer.querySelectorAll(
        '.flit-table-container'
      );
      tableContainers.forEach((container: HTMLElement) => {
        if (this.plugin.settings.safewords.enableSafewords) {
          container.classList.remove('flit-master-disabled');
        } else {
          container.classList.add('flit-master-disabled');
        }
      });
    };

    const renderSafewords = () => {
      safewordsContainer.empty();

      const existingAddButton = this.containerEl.querySelector(
        '.flit-add-safeword-button'
      );
      if (existingAddButton) existingAddButton.remove();

      const tableContainer = safewordsContainer.createEl('div', {
        cls: 'flit-table-container',
      });
      const tableWrapper = tableContainer.createEl('div', {
        cls: 'flit-table-wrapper',
      });

      const headerRow = tableWrapper.createEl('div', {
        cls: 'flit-safeword-header',
      });

      const enableHeader = headerRow.createDiv({ cls: 'flit-enable-column' });
      enableHeader.textContent = t('settings.safewords.headers.enable');

      const safewordHeader = headerRow.createDiv({
        cls: 'flit-text-column flit-safeword-input',
      });
      safewordHeader.textContent = t('settings.safewords.headers.safeword');

      const startOnlyHeader = headerRow.createDiv({
        cls: 'flit-toggle-column',
      });
      startOnlyHeader.textContent = t(
        'settings.safewords.headers.onlyMatchStart'
      );

      const wholeLineHeader = headerRow.createDiv({
        cls: 'flit-toggle-column',
      });
      wholeLineHeader.textContent = t(
        'settings.safewords.headers.onlyMatchWhole'
      );

      const caseSensitiveHeader = headerRow.createDiv({
        cls: 'flit-toggle-column',
      });
      caseSensitiveHeader.textContent = t(
        'settings.safewords.headers.caseSensitive'
      );

      const actionsHeader = headerRow.createDiv({ cls: 'flit-actions-column' });
      actionsHeader.textContent = '';

      this.plugin.settings.safewords.safewords.forEach((safeword, index) => {
        const rowEl = tableWrapper.createEl('div', {
          cls: 'flit-safeword-setting',
        });
        let deleteButton: HTMLElement;

        let updateButtonState: () => void;

        const toggleContainer = rowEl.createDiv({ cls: 'flit-enable-column' });

        const individualToggleSetting = new Setting(
          document.createElement('div')
        );
        individualToggleSetting.addToggle((toggle) => {
          toggle.setValue(safeword.enabled).onChange(async (value) => {
            this.plugin.settings.safewords.safewords[index].enabled = value;
            this.plugin.debugLog(`safewords[${index}].enabled`, value);
            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
            // Update row styling based on enabled state
            updateRowAppearance();
          });
          toggle.toggleEl.classList.add('flit-margin-0');
          toggleContainer.appendChild(toggle.toggleEl);
        });

        const updateRowAppearance = () => {
          const isEnabled =
            this.plugin.settings.safewords.safewords[index].enabled;
          const masterEnabled = this.plugin.settings.safewords.enableSafewords;
          const shouldApplyInlineOpacity = masterEnabled;

          if (isEnabled) {
            rowEl.classList.remove('flit-row-disabled');
            // Clear CSS classes to let natural styles apply
            input.classList.remove('flit-state-disabled');
            input.disabled = false;
            input.tabIndex = 0;
            input.removeAttribute('aria-disabled');
            startToggleContainer.classList.remove('flit-state-disabled');
            wholeToggleContainer.classList.remove('flit-state-disabled');
            caseToggleContainer.classList.remove('flit-state-disabled');

            // Re-enable toggles in containers
            [
              startToggleContainer,
              wholeToggleContainer,
              caseToggleContainer,
            ].forEach((container) => {
              const toggleEls = container.querySelectorAll(
                'input[type="checkbox"]'
              );
              toggleEls.forEach((el: HTMLElement) => {
                el.tabIndex = 0;
                el.removeAttribute('aria-disabled');
              });
            });
          } else {
            rowEl.classList.add('flit-row-disabled');
            if (shouldApplyInlineOpacity) {
              input.classList.add('flit-state-disabled');
            }
            input.disabled = true;
            input.tabIndex = -1;
            input.setAttribute('aria-disabled', 'true');
            if (shouldApplyInlineOpacity) {
              startToggleContainer.classList.add('flit-state-disabled');
              wholeToggleContainer.classList.add('flit-state-disabled');
              caseToggleContainer.classList.add('flit-state-disabled');
            }

            // Disable toggles in containers
            [
              startToggleContainer,
              wholeToggleContainer,
              caseToggleContainer,
            ].forEach((container) => {
              const toggleEls = container.querySelectorAll(
                'input[type="checkbox"]'
              );
              toggleEls.forEach((el: HTMLElement) => {
                el.tabIndex = -1;
                el.setAttribute('aria-disabled', 'true');
              });
            });
          }
        };

        const inputContainer = rowEl.createDiv({
          cls: 'flit-text-column flit-safeword-input',
        });
        const input = inputContainer.createEl('input', { type: 'text' });
        input.placeholder = t('settings.replaceCharacters.emptyPlaceholder');
        input.value = safeword.text;
        input.addEventListener('input', (e) => {
          void (async () => {
            this.plugin.settings.safewords.safewords[index].text = (
              e.target as HTMLInputElement
            ).value;
            this.plugin.debugLog(
              `safewords[${index}].text`,
              this.plugin.settings.safewords.safewords[index].text
            );
            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
            updateButtonState();
          })();
        });

        this.addForbiddenCharProtection(input);

        const startToggleContainer = rowEl.createDiv({
          cls: 'flit-toggle-column center',
        });
        const startToggleSetting = new Setting(document.createElement('div'));
        startToggleSetting.addToggle((toggle) => {
          toggle.setValue(safeword.onlyAtStart).onChange(async (value) => {
            this.plugin.settings.safewords.safewords[index].onlyAtStart = value;
            this.plugin.debugLog(`safewords[${index}].onlyAtStart`, value);
            if (value) {
              this.plugin.settings.safewords.safewords[index].onlyWholeLine =
                false;
            }
            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
            renderSafewords();
          });
          toggle.toggleEl.classList.add('flit-margin-0');
          // Disable if whole line is checked
          if (safeword.onlyWholeLine) {
            toggle.setDisabled(true);
            toggle.toggleEl.classList.add('flit-state-disabled');
          }
          startToggleContainer.appendChild(toggle.toggleEl);
        });

        const wholeToggleContainer = rowEl.createDiv({
          cls: 'flit-toggle-column center',
        });
        const wholeToggleSetting = new Setting(document.createElement('div'));
        wholeToggleSetting.addToggle((toggle) => {
          toggle.setValue(safeword.onlyWholeLine).onChange(async (value) => {
            this.plugin.settings.safewords.safewords[index].onlyWholeLine =
              value;
            this.plugin.debugLog(`safewords[${index}].onlyWholeLine`, value);
            if (value) {
              this.plugin.settings.safewords.safewords[index].onlyAtStart =
                false;
            }
            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
            renderSafewords();
          });
          toggle.toggleEl.classList.add('flit-margin-0');
          // Disable if start only is checked
          if (safeword.onlyAtStart) {
            toggle.setDisabled(true);
            toggle.toggleEl.classList.add('flit-state-disabled');
          }
          wholeToggleContainer.appendChild(toggle.toggleEl);
        });

        const caseToggleContainer = rowEl.createDiv({
          cls: 'flit-toggle-column center',
        });
        const caseToggleSetting = new Setting(document.createElement('div'));
        caseToggleSetting.addToggle((toggle) => {
          toggle.setValue(safeword.caseSensitive).onChange(async (value) => {
            this.plugin.settings.safewords.safewords[index].caseSensitive =
              value;
            this.plugin.debugLog(`safewords[${index}].caseSensitive`, value);
            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
          });
          toggle.toggleEl.classList.add('flit-margin-0');
          caseToggleContainer.appendChild(toggle.toggleEl);
        });

        const buttonContainer = rowEl.createDiv({
          cls: 'flit-actions-column flit-button-container',
        });

        const upButton = buttonContainer.createEl('div', {
          cls: 'clickable-icon extra-setting-button',
          attr: { 'aria-label': t('settings.customRules.moveUp') },
        });
        if (index === 0) {
          upButton.classList.add('disabled');
        }
        setIcon(upButton, 'chevron-up');

        if (index > 0) {
          upButton.addEventListener('click', () => {
            void (async () => {
              const temp = this.plugin.settings.safewords.safewords[index];
              this.plugin.settings.safewords.safewords[index] =
                this.plugin.settings.safewords.safewords[index - 1];
              this.plugin.settings.safewords.safewords[index - 1] = temp;
              try {
                await this.plugin.saveSettings();
              } catch {
                new Notice(t('settings.errors.saveFailed'));
              }
              renderSafewords();
            })();
          });
        }

        const downButton = buttonContainer.createEl('div', {
          cls: 'clickable-icon extra-setting-button',
          attr: { 'aria-label': t('settings.customRules.moveDown') },
        });
        if (index === this.plugin.settings.safewords.safewords.length - 1) {
          downButton.classList.add('disabled');
        }
        setIcon(downButton, 'chevron-down');

        if (index < this.plugin.settings.safewords.safewords.length - 1) {
          downButton.addEventListener('click', () => {
            void (async () => {
              const temp = this.plugin.settings.safewords.safewords[index];
              this.plugin.settings.safewords.safewords[index] =
                this.plugin.settings.safewords.safewords[index + 1];
              this.plugin.settings.safewords.safewords[index + 1] = temp;
              try {
                await this.plugin.saveSettings();
              } catch {
                new Notice(t('settings.errors.saveFailed'));
              }
              renderSafewords();
            })();
          });
        }

        deleteButton = buttonContainer.createEl('div', {
          cls: 'clickable-icon extra-setting-button',
          attr: { 'aria-label': t('settings.customRules.delete') },
        });
        setIcon(deleteButton, 'x');

        deleteButton.addEventListener('click', () => {
          void (async () => {
            if (this.plugin.settings.safewords.safewords.length === 1) {
              // If it's the last entry, replace with empty one instead of removing
              this.plugin.settings.safewords.safewords[0] = {
                text: '',
                enabled: true,
                onlyAtStart: false,
                onlyWholeLine: false,
                caseSensitive: false,
              };
            } else {
              this.plugin.settings.safewords.safewords.splice(index, 1);
            }
            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
            renderSafewords();
          })();
        });

        updateButtonState = () => {
          const isLastEmptyEntry =
            this.plugin.settings.safewords.safewords.length === 1 &&
            this.plugin.settings.safewords.safewords[0].text.trim() === '';

          // Update delete button state
          if (isLastEmptyEntry) {
            deleteButton.classList.add('disabled');
            deleteButton.removeAttribute('aria-label');
          } else {
            deleteButton.classList.remove('disabled');
            deleteButton.setAttribute('aria-label', t('ariaLabels.remove'));
          }

          // Update up button state
          if (index === 0 || isLastEmptyEntry) {
            upButton.classList.add('disabled');
          } else {
            upButton.classList.remove('disabled');
          }

          // Update down button state
          if (
            index === this.plugin.settings.safewords.safewords.length - 1 ||
            isLastEmptyEntry
          ) {
            downButton.classList.add('disabled');
          } else {
            downButton.classList.remove('disabled');
          }
        };

        updateButtonState();

        updateRowAppearance();
      });

      const addButtonSetting = new Setting(safewordsContainer).addButton(
        (button) =>
          button
            .setButtonText(t('settings.safewords.addButton'))
            .onClick(async () => {
              // Check if last entry is empty
              const lastIndex =
                this.plugin.settings.safewords.safewords.length - 1;
              const lastEntry =
                this.plugin.settings.safewords.safewords[lastIndex];
              if (lastEntry.text.trim() === '') {
                // Enable the last entry if it's disabled
                if (!lastEntry.enabled) {
                  this.plugin.settings.safewords.safewords[lastIndex].enabled =
                    true;
                  try {
                    await this.plugin.saveSettings();
                  } catch {
                    new Notice(t('settings.errors.saveFailed'));
                  }
                  renderSafewords();
                  // Focus after re-render
                  setTimeout(() => {
                    const textInputs =
                      safewordsContainer.querySelectorAll('input[type="text"]');
                    if (textInputs.length > 0) {
                      (
                        textInputs[textInputs.length - 1] as HTMLInputElement
                      ).focus();
                    }
                  }, TIMING.NEXT_TICK_MS);
                } else {
                  // Just focus if already enabled
                  const textInputs =
                    safewordsContainer.querySelectorAll('input[type="text"]');
                  if (textInputs.length > 0) {
                    (
                      textInputs[textInputs.length - 1] as HTMLInputElement
                    ).focus();
                  }
                }
                return;
              }

              // Add a new entry when "Add safeword" is clicked
              this.plugin.settings.safewords.safewords.push({
                text: '',
                onlyAtStart: false,
                onlyWholeLine: false,
                enabled: true,
                caseSensitive: false,
              });
              try {
                await this.plugin.saveSettings();
              } catch {
                new Notice(t('settings.errors.saveFailed'));
              }
              renderSafewords();

              // Focus the newly created safeword input after DOM updates
              setTimeout(() => {
                const textInputs =
                  safewordsContainer.querySelectorAll('input[type="text"]');
                if (textInputs.length > 0) {
                  (
                    textInputs[textInputs.length - 1] as HTMLInputElement
                  ).focus();
                }
              }, TIMING.NEXT_TICK_MS);
            })
      );
      addButtonSetting.settingEl.addClass('flit-add-safeword-button');

      updateSafewordsUI();
    };

    renderSafewords();
  }
}
