import {
  Setting,
  SettingGroup,
  setIcon,
  ExtraButtonComponent,
  Notice,
} from 'obsidian';
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';
import {
  ExclusionStrategy,
  TagPropertyExclusionStrategy,
  TagMatchingMode,
} from '../types';
import { FolderSuggest, TagSuggest } from '../suggests';
import { DEFAULT_SETTINGS } from '../constants';
import { t, getCurrentLocale } from '../i18n';
import { TIMING } from '../constants/timing';

interface StringExclusionListConfig {
  container: HTMLElement;
  getItems: () => string[];
  setItems: (items: string[]) => void;
  placeholder: string;
  addButtonText: string;
  debugLabel: string;
  createSuggest?: (
    input: HTMLInputElement,
    onSelect: (value: string) => void,
    otherItems: string[]
  ) => void;
}

export class IncludeExcludeTab extends SettingsTabBase {
  constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
    super(plugin, containerEl);
  }

  private renderStringExclusionList(config: StringExclusionListConfig): void {
    const renderList = () => {
      config.container.empty();
      const items = config.getItems();

      // Ensure at least one entry exists (matches properties section behavior)
      if (items.length === 0) {
        items.push('');
        config.setItems(items);
      }

      items.forEach((item, index) => {
        const setting = new Setting(config.container);
        let removeButton: ExtraButtonComponent | undefined;

        const updateButtonState = () => {
          const currentItems = config.getItems();
          const isLastEmptyEntry =
            currentItems.length === 1 && currentItems[0].trim() === '';

          if (removeButton) {
            if (isLastEmptyEntry) {
              removeButton.setDisabled(true);
              removeButton.extraSettingsEl.classList.add('flit-state-disabled');
              removeButton.extraSettingsEl.removeAttribute('aria-label');
            } else {
              removeButton.setDisabled(false);
              removeButton.extraSettingsEl.classList.remove(
                'flit-state-disabled'
              );
              removeButton.extraSettingsEl.classList.add('flit-state-enabled');
              removeButton.setTooltip(t('ariaLabels.remove'));
            }
          }
        };

        setting
          .addText((text) => {
            text
              .setPlaceholder(config.placeholder)
              .setValue(item)
              .onChange(async (value) => {
                const currentItems = config.getItems();
                currentItems[index] = value;
                config.setItems(currentItems);
                this.plugin.debugLog(config.debugLabel, currentItems);
                try {
                  await this.plugin.saveSettings();
                } catch {
                  new Notice(t('settings.errors.saveFailed'));
                }
                updateButtonState();
              });
            text.inputEl.classList.add('flit-width-100');

            if (config.createSuggest) {
              try {
                // Use fresh data for exclusion list
                const otherItems = config
                  .getItems()
                  .filter((_, i) => i !== index);
                config.createSuggest(
                  text.inputEl,
                  (selectedValue: string) => {
                    void (async () => {
                      const currentItems = config.getItems();
                      currentItems[index] = selectedValue;
                      config.setItems(currentItems);
                      this.plugin.debugLog(config.debugLabel, currentItems);
                      try {
                        await this.plugin.saveSettings();
                      } catch {
                        new Notice(t('settings.errors.saveFailed'));
                      }
                      updateButtonState();
                    })();
                  },
                  otherItems
                );
              } catch (error) {
                console.error('Failed to create suggest:', error);
              }
            }
          })
          .addExtraButton((button) => {
            removeButton = button;
            button.setIcon('x');

            button.onClick(async () => {
              const currentItems = config.getItems();
              const isLastEmptyEntry =
                currentItems.length === 1 && currentItems[0].trim() === '';

              if (!isLastEmptyEntry) {
                currentItems.splice(index, 1);
                if (currentItems.length === 0) {
                  currentItems.push('');
                }
                config.setItems(currentItems);
                try {
                  await this.plugin.saveSettings();
                } catch {
                  new Notice(t('settings.errors.saveFailed'));
                }
                renderList();
              }
            });

            updateButtonState();
          });

        setting.settingEl.addClass('flit-exclusion-item-setting');
      });

      const addButtonSetting = new Setting(config.container).addButton(
        (button) => {
          button.setButtonText(config.addButtonText).onClick(async () => {
            const currentItems = config.getItems();
            const isBottomEntryEmpty =
              currentItems.length > 0 &&
              currentItems[currentItems.length - 1].trim() === '';

            if (isBottomEntryEmpty) {
              const textInputs =
                config.container.querySelectorAll('input[type="text"]');
              if (textInputs.length > 0) {
                const lastInput = textInputs[
                  textInputs.length - 1
                ] as HTMLInputElement;
                lastInput.focus();
              }
            } else {
              currentItems.push('');
              config.setItems(currentItems);
              try {
                await this.plugin.saveSettings();
              } catch {
                new Notice(t('settings.errors.saveFailed'));
              }
              renderList();
              setTimeout(() => {
                const textInputs =
                  config.container.querySelectorAll('input[type="text"]');
                if (textInputs.length > 0) {
                  const lastInput = textInputs[
                    textInputs.length - 1
                  ] as HTMLInputElement;
                  lastInput.focus();
                }
              }, TIMING.NEXT_TICK_MS);
            }
          });
        }
      );
      addButtonSetting.settingEl.addClass('flit-add-folder-button');
    };

    renderList();
  }

  render(): void {
    const tabDesc = this.containerEl.createEl('div', {
      cls: 'setting-item-description',
    });
    tabDesc.createEl('strong', { text: t('settings.exclusions.desc') });
    tabDesc.classList.add('flit-margin-bottom-15');

    const importantNote = this.containerEl.createEl('p', {
      cls: 'setting-item-description',
    });
    importantNote.appendText(t('settings.exclusions.note'));

    const foldersHeading = new Setting(this.containerEl)
      .setName(t('settings.exclusions.folders.title'))
      .setDesc(t('settings.exclusions.folders.desc'))
      .setHeading();
    foldersHeading.settingEl.addClass('flit-heading-with-desc');
    foldersHeading.settingEl.addClass('flit-first-section-heading');

    this.containerEl.createEl('p', {
      cls: 'setting-item-description flit-margin-top-15 flit-margin-bottom-15',
      text: t('settings.exclusions.folders.renamedWarning'),
    });

    new SettingGroup(this.containerEl).addClass('flit-folders-group');
    const foldersContainer = this.containerEl.querySelector<HTMLElement>(
      '.flit-folders-group .setting-items'
    );
    if (!foldersContainer) {
      console.error('FLIT: Failed to find folders-group settings container');
      return;
    }

    new Setting(foldersContainer)
      .setName(t('settings.exclusions.folders.matchSubfolders.name'))
      .setDesc(t('settings.exclusions.folders.matchSubfolders.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.exclusions.excludeSubfolders)
          .onChange(async (value) => {
            this.plugin.settings.exclusions.excludeSubfolders = value;
            this.plugin.debugLog('excludeSubfolders', value);
            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
          })
      );

    new Setting(foldersContainer)
      .setName(t('settings.exclusions.folders.exclusionMode.name'))
      .setDesc(t('settings.exclusions.folders.exclusionMode.desc'))
      .addDropdown((dropdown) =>
        dropdown
          .addOption(
            'Only exclude...',
            t('settings.exclusions.folders.exclusionMode.onlyExclude')
          )
          .addOption(
            'Exclude all except...',
            t('settings.exclusions.folders.exclusionMode.excludeAllExcept')
          )
          .setValue(this.plugin.settings.exclusions.folderScopeStrategy)
          .onChange(async (value: ExclusionStrategy) => {
            this.plugin.settings.exclusions.folderScopeStrategy = value;
            this.plugin.debugLog('folderScopeStrategy', value);
            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
          })
      );

    const folderContainer = foldersContainer.createDiv();

    this.renderStringExclusionList({
      container: folderContainer,
      getItems: () => this.plugin.settings.exclusions.excludedFolders,
      setItems: (items) => {
        this.plugin.settings.exclusions.excludedFolders = items;
      },
      placeholder: t('settings.exclusions.folders.placeholder'),
      addButtonText: t('settings.exclusions.folders.addButton'),
      debugLabel: 'excludedFolders',
      createSuggest: (input, onSelect, otherItems) => {
        new FolderSuggest(this.plugin.app, input, onSelect, otherItems);
      },
    });

    const tagsHeading = new Setting(this.containerEl)
      .setName(t('settings.exclusions.tags.title'))
      .setDesc(t('settings.exclusions.tags.desc'))
      .setHeading();
    tagsHeading.settingEl.addClass('flit-heading-with-desc');

    const tagNotes = this.containerEl.createEl('div', {
      cls: 'setting-item-description flit-margin-top-15 flit-margin-bottom-15',
    });

    const tagUl = tagNotes.createEl('ul', {
      cls: 'flit-margin-0 flit-padding-left-20',
    });

    const tagLi1 = tagUl.createEl('li');
    tagLi1.appendText(t('settings.exclusions.tags.excludeAllNote.part1'));
    if (getCurrentLocale() === 'ru') {
      tagLi1.appendText(
        '«' +
          t('settings.exclusions.tags.excludeAllNote.excludeAllExcept') +
          '»'
      );
    } else {
      tagLi1.createEl('em', {
        text: t('settings.exclusions.tags.excludeAllNote.excludeAllExcept'),
      });
    }
    tagLi1.appendText(t('settings.exclusions.tags.excludeAllNote.part2'));

    const tagLi2 = tagUl.createEl('li');
    tagLi2.appendText(t('settings.exclusions.tags.tagWranglerWarning'));

    new SettingGroup(this.containerEl).addClass('flit-tags-group');
    const tagsContainer = this.containerEl.querySelector<HTMLElement>(
      '.flit-tags-group .setting-items'
    );
    if (!tagsContainer) {
      console.error('FLIT: Failed to find tags-group settings container');
      return;
    }

    new Setting(tagsContainer)
      .setName(t('settings.exclusions.tags.matchTags.name'))
      .setDesc(t('settings.exclusions.tags.matchTags.desc'))
      .addDropdown((dropdown) =>
        dropdown
          .addOption(
            'In Properties and note body',
            t('settings.exclusions.tags.matchTags.inPropertiesAndBody')
          )
          .addOption(
            'In Properties only',
            t('settings.exclusions.tags.matchTags.inPropertiesOnly')
          )
          .addOption(
            'In note body only',
            t('settings.exclusions.tags.matchTags.inBodyOnly')
          )
          .setValue(this.plugin.settings.exclusions.tagMatchingMode)
          .onChange(async (value: TagMatchingMode) => {
            this.plugin.settings.exclusions.tagMatchingMode = value;
            this.plugin.debugLog('tagMatchingMode', value);
            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
          })
      );

    new Setting(tagsContainer)
      .setName(t('settings.exclusions.tags.matchChildTags.name'))
      .setDesc(t('settings.exclusions.tags.matchChildTags.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.exclusions.excludeChildTags)
          .onChange(async (value) => {
            this.plugin.settings.exclusions.excludeChildTags = value;
            this.plugin.debugLog('excludeChildTags', value);
            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
          })
      );

    new Setting(tagsContainer)
      .setName(t('settings.exclusions.tags.exclusionMode.name'))
      .setDesc(t('settings.exclusions.tags.exclusionMode.desc'))
      .addDropdown((dropdown) =>
        dropdown
          .addOption(
            'Only exclude...',
            t('settings.exclusions.folders.exclusionMode.onlyExclude')
          )
          .addOption(
            'Exclude all except...',
            t('settings.exclusions.folders.exclusionMode.excludeAllExcept')
          )
          .setValue(this.plugin.settings.exclusions.tagScopeStrategy)
          .onChange(async (value: TagPropertyExclusionStrategy) => {
            this.plugin.settings.exclusions.tagScopeStrategy = value;
            this.plugin.debugLog('tagScopeStrategy', value);
            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
          })
      );

    const tagContainer = tagsContainer.createDiv();

    this.renderStringExclusionList({
      container: tagContainer,
      getItems: () => this.plugin.settings.exclusions.excludedTags,
      setItems: (items) => {
        this.plugin.settings.exclusions.excludedTags = items;
      },
      placeholder: t('settings.exclusions.tags.placeholder'),
      addButtonText: t('settings.exclusions.tags.addButton'),
      debugLabel: 'excludedTags',
      createSuggest: (input, onSelect, otherItems) => {
        new TagSuggest(this.plugin.app, input, onSelect, otherItems);
      },
    });

    const propertiesHeading = new Setting(this.containerEl)
      .setName(t('settings.exclusions.properties.title'))
      .setDesc(t('settings.exclusions.properties.desc'))
      .setHeading();
    propertiesHeading.settingEl.addClass('flit-heading-with-desc');

    const propertyNotes = this.containerEl.createEl('div', {
      cls: 'setting-item-description flit-margin-top-15 flit-margin-bottom-15',
    });

    const ul = propertyNotes.createEl('ul', {
      cls: 'flit-margin-0 flit-padding-left-20',
    });

    const propLi1 = ul.createEl('li');
    propLi1.appendText(t('settings.exclusions.properties.leaveBlank.part1'));
    if (getCurrentLocale() === 'ru') {
      propLi1.appendText(
        '«' + t('settings.exclusions.properties.leaveBlank.value') + '»'
      );
    } else {
      propLi1.createEl('em', {
        text: t('settings.exclusions.properties.leaveBlank.value'),
      });
    }
    propLi1.appendText(t('settings.exclusions.properties.leaveBlank.part2'));

    ul.createEl('li', {
      text: t('settings.exclusions.properties.caseInsensitive'),
    });

    const propLi3 = ul.createEl('li');
    propLi3.appendText(
      t('settings.exclusions.properties.excludeAllNote.part1')
    );
    if (getCurrentLocale() === 'ru') {
      propLi3.appendText(
        '«' +
          t('settings.exclusions.properties.excludeAllNote.excludeAllExcept') +
          '»'
      );
    } else {
      propLi3.createEl('em', {
        text: t(
          'settings.exclusions.properties.excludeAllNote.excludeAllExcept'
        ),
      });
    }
    propLi3.appendText(
      t('settings.exclusions.properties.excludeAllNote.part2')
    );

    ul.createEl('li', {
      text: t('settings.exclusions.properties.renamedWarning'),
    });

    new SettingGroup(this.containerEl).addClass('flit-properties-group');
    const propertiesContainer = this.containerEl.querySelector<HTMLElement>(
      '.flit-properties-group .setting-items'
    );
    if (!propertiesContainer) {
      console.error('FLIT: Failed to find properties-group settings container');
      return;
    }

    new Setting(propertiesContainer)
      .setName(t('settings.exclusions.properties.exclusionMode.name'))
      .setDesc(t('settings.exclusions.properties.exclusionMode.desc'))
      .addDropdown((dropdown) =>
        dropdown
          .addOption(
            'Only exclude...',
            t('settings.exclusions.folders.exclusionMode.onlyExclude')
          )
          .addOption(
            'Exclude all except...',
            t('settings.exclusions.folders.exclusionMode.excludeAllExcept')
          )
          .setValue(this.plugin.settings.exclusions.propertyScopeStrategy)
          .onChange(async (value: TagPropertyExclusionStrategy) => {
            this.plugin.settings.exclusions.propertyScopeStrategy = value;
            this.plugin.debugLog('propertyScopeStrategy', value);
            try {
              await this.plugin.saveSettings();
            } catch {
              new Notice(t('settings.errors.saveFailed'));
            }
          })
      );

    const propertyContainer = propertiesContainer.createDiv();

    const renderExcludedProperties = () => {
      propertyContainer.empty();
      if (this.plugin.settings.exclusions.excludedProperties.length === 0) {
        this.plugin.settings.exclusions.excludedProperties.push({
          key: '',
          value: '',
        });
      }
      this.plugin.settings.exclusions.excludedProperties.forEach(
        (property, index) => {
          const propertySetting = new Setting(propertyContainer);
          let keyInput: HTMLInputElement;
          let valueInput: HTMLInputElement;
          let removeButton: ExtraButtonComponent | undefined;

          const updateButtonState = () => {
            const isLastEmptyEntry =
              this.plugin.settings.exclusions.excludedProperties.length === 1 &&
              this.plugin.settings.exclusions.excludedProperties[0].key.trim() ===
                '' &&
              this.plugin.settings.exclusions.excludedProperties[0].value.trim() ===
                '';

            if (removeButton) {
              if (isLastEmptyEntry) {
                removeButton.setDisabled(true);
                removeButton.extraSettingsEl.classList.add(
                  'flit-state-disabled'
                );
                removeButton.extraSettingsEl.removeAttribute('aria-label');
              } else {
                removeButton.setDisabled(false);
                removeButton.extraSettingsEl.classList.remove(
                  'flit-state-disabled'
                );
                removeButton.extraSettingsEl.classList.add(
                  'flit-state-enabled'
                );
                removeButton.setTooltip(t('ariaLabels.remove'));
              }
            }
          };
          const propertyInputContainer = propertySetting.controlEl.createDiv({
            cls: 'flit-property-container flit-display-flex flit-gap-10 flit-align-items-center',
          });

          keyInput = propertyInputContainer.createEl('input', {
            type: 'text',
            cls: 'flit-property-key-input',
          });
          keyInput.placeholder = t(
            'settings.exclusions.properties.keyPlaceholder'
          );
          keyInput.value = property.key;
          keyInput.tabIndex = 0;

          propertyInputContainer.createEl('span', {
            text: t('settings.exclusions.properties.separator'),
            cls: 'flit-colon-separator',
          });
          valueInput = propertyInputContainer.createEl('input', {
            type: 'text',
            cls: 'flit-property-value-input',
          });
          valueInput.placeholder = t(
            'settings.exclusions.properties.valuePlaceholder'
          );
          valueInput.value = property.value;
          valueInput.tabIndex = 0;
          keyInput.addEventListener(
            'keydown',
            (e: KeyboardEvent) => {
              if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                setTimeout(() => {
                  valueInput.focus();
                }, TIMING.NEXT_TICK_MS);
              }
            },
            true
          );

          valueInput.addEventListener(
            'keydown',
            (e: KeyboardEvent) => {
              if (e.key === 'Tab' && e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                setTimeout(() => {
                  keyInput.focus();
                }, TIMING.NEXT_TICK_MS);
              }
            },
            true
          );
          keyInput.addEventListener('input', (e: Event) => {
            void (async () => {
              this.plugin.settings.exclusions.excludedProperties[index].key = (
                e.target as HTMLInputElement
              ).value;
              this.plugin.debugLog(
                'excludedProperties',
                this.plugin.settings.exclusions.excludedProperties
              );
              try {
                await this.plugin.saveSettings();
              } catch {
                new Notice(t('settings.errors.saveFailed'));
              }
              updateButtonState();
            })();
          });

          valueInput.addEventListener('input', (e: Event) => {
            void (async () => {
              this.plugin.settings.exclusions.excludedProperties[index].value =
                (e.target as HTMLInputElement).value;
              this.plugin.debugLog(
                'excludedProperties',
                this.plugin.settings.exclusions.excludedProperties
              );
              try {
                await this.plugin.saveSettings();
              } catch {
                new Notice(t('settings.errors.saveFailed'));
              }
              updateButtonState();
            })();
          });

          propertySetting.addExtraButton((button) => {
            removeButton = button;
            button.setIcon('x');

            button.onClick(async () => {
              if (
                this.plugin.settings.exclusions.excludedProperties.length === 1
              ) {
                this.plugin.settings.exclusions.excludedProperties[0] = {
                  key: '',
                  value: '',
                };
              } else {
                this.plugin.settings.exclusions.excludedProperties.splice(
                  index,
                  1
                );
              }

              try {
                await this.plugin.saveSettings();
              } catch {
                new Notice(t('settings.errors.saveFailed'));
              }
              renderExcludedProperties();
            });

            updateButtonState();
          });

          propertySetting.settingEl.addClass('flit-exclusion-item-setting');
        }
      );

      const addPropertyButtonSetting = new Setting(propertyContainer).addButton(
        (button) => {
          button
            .setButtonText(t('settings.exclusions.properties.addButton'))
            .onClick(async () => {
              const lastProperty =
                this.plugin.settings.exclusions.excludedProperties[
                  this.plugin.settings.exclusions.excludedProperties.length - 1
                ];
              const isBottomEntryEmpty =
                this.plugin.settings.exclusions.excludedProperties.length > 0 &&
                lastProperty.key.trim() === '' &&
                lastProperty.value.trim() === '';

              if (isBottomEntryEmpty) {
                const keyInputs = propertyContainer.querySelectorAll(
                  '.flit-property-key-input'
                );
                if (keyInputs.length > 0) {
                  const lastInput = keyInputs[
                    keyInputs.length - 1
                  ] as HTMLInputElement;
                  lastInput.focus();
                }
              } else {
                this.plugin.settings.exclusions.excludedProperties.push({
                  key: '',
                  value: '',
                });
                try {
                  await this.plugin.saveSettings();
                } catch {
                  new Notice(t('settings.errors.saveFailed'));
                }
                renderExcludedProperties();
                setTimeout(() => {
                  const keyInputs = propertyContainer.querySelectorAll(
                    '.flit-property-key-input'
                  );
                  if (keyInputs.length > 0) {
                    const lastInput = keyInputs[
                      keyInputs.length - 1
                    ] as HTMLInputElement;
                    lastInput.focus();
                  }
                }, TIMING.NEXT_TICK_MS);
              }
            });
        }
      );
      addPropertyButtonSetting.settingEl.addClass('flit-add-folder-button');
    };

    renderExcludedProperties();

    const propertyDisableSetting = new Setting(this.containerEl)
      .setName(t('settings.exclusions.disableProperty.title'))
      .setDesc('')
      .setHeading();
    propertyDisableSetting.settingEl.addClass('flit-heading-with-desc');

    const propertyDesc = propertyDisableSetting.descEl;
    propertyDesc.appendText(t('settings.exclusions.disableProperty.desc'));

    const propertyDisableNotes = this.containerEl.createEl('div', {
      cls: 'setting-item-description flit-margin-top-15 flit-margin-bottom-15',
    });

    const disableUl = propertyDisableNotes.createEl('ul', {
      cls: 'flit-margin-0 flit-padding-left-20',
    });

    disableUl.createEl('li', {
      text: t('settings.exclusions.disableProperty.alwaysRespected'),
    });
    disableUl.createEl('li', {
      text: t('settings.exclusions.disableProperty.caseInsensitive'),
    });

    disableUl.createEl('li', {
      text: t('settings.exclusions.disableProperty.updateWarning'),
    });

    new SettingGroup(this.containerEl).addClass('flit-disable-property-group');
    const disablePropertyContainer =
      this.containerEl.querySelector<HTMLElement>(
        '.flit-disable-property-group .setting-items'
      );
    if (!disablePropertyContainer) {
      console.error(
        'FLIT: Failed to find disable-property-group settings container'
      );
      return;
    }

    const propertyInputSetting = new Setting(disablePropertyContainer);
    propertyInputSetting.settingEl.addClass('flit-exclusion-item-setting');

    const propertyControlWrapper = propertyInputSetting.controlEl.createDiv({
      cls: 'flit-property-control-wrapper',
    });

    const propertyRestoreButtonContainer = propertyControlWrapper.createDiv({
      cls: 'flit-restore-button-container',
    });
    const propertyRestoreButton = propertyRestoreButtonContainer.createEl(
      'div',
      {
        cls: 'clickable-icon extra-setting-button',
        attr: { 'aria-label': t('settings.replaceCharacters.restoreDefault') },
      }
    );
    setIcon(propertyRestoreButton, 'rotate-ccw');

    const propertyInputContainer = propertyControlWrapper.createDiv({
      cls: 'flit-property-container flit-display-flex flit-gap-10 flit-align-items-center',
    });
    const keyInput = propertyInputContainer.createEl('input', {
      type: 'text',
      cls: 'flit-property-key-input',
    });
    keyInput.placeholder = t('settings.exclusions.properties.keyPlaceholder');
    keyInput.value = this.plugin.settings.exclusions.disableRenamingKey;
    keyInput.tabIndex = 0;

    propertyInputContainer.createEl('span', {
      text: t('settings.exclusions.properties.separator'),
      cls: 'flit-colon-separator',
    });
    const valueInput = propertyInputContainer.createEl('input', {
      type: 'text',
      cls: 'flit-property-value-input',
    });
    valueInput.placeholder = t(
      'settings.exclusions.properties.valuePlaceholder'
    );
    valueInput.value = this.plugin.settings.exclusions.disableRenamingValue;
    valueInput.tabIndex = 0;
    keyInput.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (e.key === 'Tab' && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => {
            valueInput.focus();
          }, TIMING.NEXT_TICK_MS);
        }
      },
      true
    );

    valueInput.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (e.key === 'Tab' && e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => {
            keyInput.focus();
          }, TIMING.NEXT_TICK_MS);
        }
      },
      true
    );
    keyInput.addEventListener('input', (e) => {
      void (async () => {
        this.plugin.settings.exclusions.disableRenamingKey = (
          e.target as HTMLInputElement
        ).value;
        try {
          await this.plugin.saveSettings();
        } catch {
          new Notice(t('settings.errors.saveFailed'));
        }
      })();
    });

    valueInput.addEventListener('input', (e) => {
      void (async () => {
        this.plugin.settings.exclusions.disableRenamingValue = (
          e.target as HTMLInputElement
        ).value;
        try {
          await this.plugin.saveSettings();
        } catch {
          new Notice(t('settings.errors.saveFailed'));
        }
      })();
    });

    propertyRestoreButton.addEventListener('click', () => {
      void (async () => {
        this.plugin.settings.exclusions.disableRenamingKey =
          DEFAULT_SETTINGS.exclusions.disableRenamingKey;
        this.plugin.settings.exclusions.disableRenamingValue =
          DEFAULT_SETTINGS.exclusions.disableRenamingValue;
        keyInput.value = this.plugin.settings.exclusions.disableRenamingKey;
        valueInput.value = this.plugin.settings.exclusions.disableRenamingValue;
        try {
          await this.plugin.saveSettings();
        } catch {
          new Notice(t('settings.errors.saveFailed'));
        }
      })();
    });
    const defaultTextContainer = disablePropertyContainer.createEl('div', {
      cls: 'setting-item-description flit-margin-top-5',
    });
    defaultTextContainer.createEl('small').createEl('strong', {
      text: t('settings.exclusions.disableProperty.default'),
    });
  }
}
