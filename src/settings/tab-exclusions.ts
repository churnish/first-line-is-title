import {
  Notice,
  PluginSettingTab,
  Setting,
  SettingDefinitionItem,
  SettingDefinitionPage,
  SettingDefinitionRender,
} from 'obsidian';
import {
  updateDisabledRowsAccessibility,
  addForbiddenCharProtection,
  FirstLineIsTitlePlugin,
  mountLegacyHost,
} from './settings-base';
import { ExcludedProperty, FileNameExclusion } from '../types';
import { FolderSuggest, TagSuggest } from '../suggests';
import { t, getCurrentLocale } from '../i18n';
import { TIMING } from '../constants/timing';

async function persistSettings(plugin: FirstLineIsTitlePlugin): Promise<void> {
  try {
    await plugin.saveSettings();
  } catch {
    const notice = new Notice(t('settings.errors.saveFailed'));
    notice.containerEl.addClass('mod-warning');
  }
}

/**
 * Appends a locale-aware emphasised fragment. Russian uses guillemets rather
 * than bold.
 */
function appendEmphasis(
  parent: HTMLElement | DocumentFragment,
  localeKey: string
): void {
  if (getCurrentLocale() === 'ru') {
    parent.appendText('«' + t(localeKey) + '»');
  } else {
    parent.createEl('strong', { text: t(localeKey) });
  }
}

function createBulletList(frag: DocumentFragment): HTMLElement {
  return frag.createEl('ul', { cls: 'flit-margin-0 flit-padding-left-20' });
}

/** Page-level summary plus the "rules can't override rules" caveat. */
function buildPageIntro(): DocumentFragment {
  return createFragment((frag) => {
    frag.createEl('strong', { text: t('settings.exclusions.desc') });
    frag.createEl('p', { text: t('settings.exclusions.note') });
  });
}

function buildFoldersIntro(): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(t('settings.exclusions.folders.desc'));
    createBulletList(frag).createEl('li', {
      text: t('settings.exclusions.folders.renamedWarning'),
    });
  });
}

function buildTagsIntro(): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(t('settings.exclusions.tags.desc'));
    const ul = createBulletList(frag);

    const excludeAllItem = ul.createEl('li');
    excludeAllItem.appendText(
      t('settings.exclusions.tags.excludeAllNote.part1')
    );
    appendEmphasis(
      excludeAllItem,
      'settings.exclusions.tags.excludeAllNote.excludeAllExcept'
    );
    excludeAllItem.appendText(
      t('settings.exclusions.tags.excludeAllNote.part2')
    );

    ul.createEl('li', {
      text: t('settings.exclusions.tags.tagWranglerWarning'),
    });
  });
}

function buildPropertiesIntro(): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(t('settings.exclusions.properties.desc'));
    const ul = createBulletList(frag);

    const leaveBlankItem = ul.createEl('li');
    leaveBlankItem.appendText(
      t('settings.exclusions.properties.leaveBlank.part1')
    );
    appendEmphasis(
      leaveBlankItem,
      'settings.exclusions.properties.leaveBlank.value'
    );
    leaveBlankItem.appendText(
      t('settings.exclusions.properties.leaveBlank.part2')
    );

    ul.createEl('li', {
      text: t('settings.exclusions.properties.caseInsensitive'),
    });

    const excludeAllItem = ul.createEl('li');
    excludeAllItem.appendText(
      t('settings.exclusions.properties.excludeAllNote.part1')
    );
    appendEmphasis(
      excludeAllItem,
      'settings.exclusions.properties.excludeAllNote.excludeAllExcept'
    );
    excludeAllItem.appendText(
      t('settings.exclusions.properties.excludeAllNote.part2')
    );

    ul.createEl('li', {
      text: t('settings.exclusions.properties.renamedWarning'),
    });
  });
}

function buildDisablePropertyIntro(): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(t('settings.exclusions.disableProperty.desc'));
    const ul = createBulletList(frag);

    ul.createEl('li', {
      text: t('settings.exclusions.disableProperty.alwaysRespected'),
    });
    ul.createEl('li', {
      text: t('settings.exclusions.disableProperty.caseInsensitive'),
    });
    ul.createEl('li', {
      text: t('settings.exclusions.disableProperty.updateWarning'),
    });

    frag.createEl('small').createEl('strong', {
      text: t('settings.exclusions.disableProperty.default'),
    });
  });
}

type SuggestFactory = (
  input: HTMLInputElement,
  onSelect: (value: string) => void,
  otherItems: string[]
) => void;

interface StringExclusionListOptions {
  plugin: FirstLineIsTitlePlugin;
  getItems: () => string[];
  placeholder: string;
  debugLabel: string;
  createSuggest: SuggestFactory;
}

/**
 * Builds one folder/tag row. Entries are plain strings with no stable
 * identity, so handlers address them by index — safe because these lists have
 * no reordering and every deletion triggers `tab.update()`.
 */
function buildStringExclusionRow(
  options: StringExclusionListOptions,
  index: number
): SettingDefinitionRender {
  const { plugin, getItems, placeholder, debugLabel, createSuggest } = options;

  const writeValue = async (value: string): Promise<void> => {
    const items = getItems();
    items[index] = value;
    plugin.debugLog(debugLabel, items);
    await persistSettings(plugin);
  };

  return {
    // The row label is user data, so it is excluded from the settings search
    // index; the section heading carries the searchable name.
    name: getItems()[index] || placeholder,
    searchable: false,
    render: (setting) => {
      setting.settingEl.addClass('flit-exclusion-item-setting');
      setting.addText((text) => {
        text
          .setPlaceholder(placeholder)
          .setValue(getItems()[index] ?? '')
          .onChange(async (value) => {
            await writeValue(value);
          });
        text.inputEl.classList.add('flit-width-100');

        try {
          const otherItems = getItems().filter((_, i) => i !== index);
          createSuggest(
            text.inputEl,
            (selectedValue: string) => {
              void writeValue(selectedValue);
            },
            otherItems
          );
        } catch (error) {
          console.error('FLIT: Failed to create suggest:', error);
        }
      });
    },
  };
}

/**
 * Builds one excluded-property row. Handlers close over the property object
 * rather than its index so they cannot write to the wrong entry after a
 * deletion.
 */
function buildPropertyRow(
  plugin: FirstLineIsTitlePlugin,
  property: ExcludedProperty
): SettingDefinitionRender {
  const properties = () => plugin.settings.exclusions.excludedProperties;

  return {
    name: property.key || t('settings.exclusions.properties.keyPlaceholder'),
    searchable: false,
    render: (setting) => {
      setting.settingEl.addClass('flit-exclusion-item-setting');

      const inputContainer = setting.controlEl.createDiv({
        cls: 'flit-property-container flit-display-flex flit-gap-10 flit-align-items-center',
      });

      const keyInput = inputContainer.createEl('input', {
        type: 'text',
        cls: 'flit-property-key-input',
      });
      keyInput.placeholder = t('settings.exclusions.properties.keyPlaceholder');
      keyInput.value = property.key;
      keyInput.tabIndex = 0;

      inputContainer.createSpan({
        text: t('settings.exclusions.properties.separator'),
        cls: 'flit-colon-separator',
      });

      const valueInput = inputContainer.createEl('input', {
        type: 'text',
        cls: 'flit-property-value-input',
      });
      valueInput.placeholder = t(
        'settings.exclusions.properties.valuePlaceholder'
      );
      valueInput.value = property.value;
      valueInput.tabIndex = 0;

      // Tab moves between the key and value halves of the same pair rather
      // than jumping to the next row's control.
      keyInput.addEventListener(
        'keydown',
        (e: KeyboardEvent) => {
          if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            window.setTimeout(() => {
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
            window.setTimeout(() => {
              keyInput.focus();
            }, TIMING.NEXT_TICK_MS);
          }
        },
        true
      );

      keyInput.addEventListener('input', (e: Event) => {
        void (async () => {
          property.key = (e.target as HTMLInputElement).value;
          plugin.debugLog('excludedProperties', properties());
          await persistSettings(plugin);
        })();
      });

      valueInput.addEventListener('input', (e: Event) => {
        void (async () => {
          property.value = (e.target as HTMLInputElement).value;
          plugin.debugLog('excludedProperties', properties());
          await persistSettings(plugin);
        })();
      });
    },
  };
}

/**
 * Builds one file-name exclusion row. Handlers close over the exclusion object
 * rather than its index so drag-reordering (which mutates the array without
 * re-rendering) cannot make them write to the wrong entry.
 */
function buildFileNameExclusionRow(
  plugin: FirstLineIsTitlePlugin,
  tab: PluginSettingTab,
  exclusion: FileNameExclusion
): SettingDefinitionRender {
  const exclusionIndex = () =>
    plugin.settings.exclusions.fileNameExclusions.indexOf(exclusion);

  return {
    name: exclusion.text || t('settings.replaceCharacters.emptyPlaceholder'),
    searchable: false,
    render: (setting) => {
      const host = mountLegacyHost(setting.settingEl);

      const enableSetting = new Setting(host).setName(
        t('settings.exclusions.fileNames.headers.enable')
      );
      const textSetting = new Setting(host).setName(
        t('settings.exclusions.fileNames.headers.text')
      );
      const onlyAtStartSetting = new Setting(host).setName(
        t('settings.exclusions.fileNames.headers.onlyMatchStart')
      );
      const onlyWholeLineSetting = new Setting(host).setName(
        t('settings.exclusions.fileNames.headers.onlyMatchWhole')
      );
      const caseSensitiveSetting = new Setting(host).setName(
        t('settings.exclusions.fileNames.headers.caseSensitive')
      );

      /** The per-entry enable toggle gates the entry's own fields, not itself. */
      const applyRowEnabledState = () => {
        [
          textSetting,
          onlyAtStartSetting,
          onlyWholeLineSetting,
          caseSensitiveSetting,
        ].forEach((dependent) => {
          dependent.setDisabled(!exclusion.enabled);
          dependent.settingEl.classList.toggle(
            'flit-row-disabled',
            !exclusion.enabled
          );
        });
        updateDisabledRowsAccessibility(host);
      };

      enableSetting.addToggle((toggle) => {
        toggle.setValue(exclusion.enabled).onChange(async (value) => {
          exclusion.enabled = value;
          plugin.debugLog(
            `fileNameExclusions[${exclusionIndex()}].enabled`,
            value
          );
          await persistSettings(plugin);
          applyRowEnabledState();
        });
      });

      textSetting.addText((text) => {
        text
          .setPlaceholder(t('settings.replaceCharacters.emptyPlaceholder'))
          .setValue(exclusion.text)
          .onChange(async (value) => {
            exclusion.text = value;
            plugin.debugLog(
              `fileNameExclusions[${exclusionIndex()}].text`,
              value
            );
            await persistSettings(plugin);
          });
        addForbiddenCharProtection(text.inputEl);
      });

      onlyAtStartSetting.addToggle((toggle) => {
        toggle.setValue(exclusion.onlyAtStart).onChange(async (value) => {
          exclusion.onlyAtStart = value;
          plugin.debugLog(
            `fileNameExclusions[${exclusionIndex()}].onlyAtStart`,
            value
          );
          // The two match modes are mutually exclusive.
          if (value) exclusion.onlyWholeLine = false;
          await persistSettings(plugin);
          tab.update();
        });
      });

      onlyWholeLineSetting.addToggle((toggle) => {
        toggle.setValue(exclusion.onlyWholeLine).onChange(async (value) => {
          exclusion.onlyWholeLine = value;
          plugin.debugLog(
            `fileNameExclusions[${exclusionIndex()}].onlyWholeLine`,
            value
          );
          // The two match modes are mutually exclusive.
          if (value) exclusion.onlyAtStart = false;
          await persistSettings(plugin);
          tab.update();
        });
      });

      caseSensitiveSetting.addToggle((toggle) => {
        toggle.setValue(exclusion.caseSensitive).onChange(async (value) => {
          exclusion.caseSensitive = value;
          plugin.debugLog(
            `fileNameExclusions[${exclusionIndex()}].caseSensitive`,
            value
          );
          await persistSettings(plugin);
        });
      });

      applyRowEnabledState();
    },
  };
}

/** Folder and tag lists share every affordance except their suggester. */
function buildStringExclusionList(
  options: StringExclusionListOptions,
  tab: PluginSettingTab,
  addButtonText: string,
  emptyState: string
): SettingDefinitionItem {
  const { plugin, getItems } = options;

  return {
    type: 'list',
    emptyState,
    items: getItems().map((_, index) =>
      buildStringExclusionRow(options, index)
    ),
    onDelete: (index) => {
      void (async () => {
        getItems().splice(index, 1);
        await persistSettings(plugin);
        tab.update();
      })();
    },
    addItem: {
      name: addButtonText,
      action: () => {
        void (async () => {
          getItems().push('');
          await persistSettings(plugin);
          tab.update();
        })();
      },
    },
  };
}

/**
 * Exclusions sub-page.
 *
 * Four collections use the native list type, so add / delete / reorder
 * affordances come from the framework. List `items` are captured when the
 * definitions are built, so every mutation that changes the row set calls
 * `tab.update()`.
 */
export function buildExclusionsPage(
  plugin: FirstLineIsTitlePlugin,
  tab: PluginSettingTab
): SettingDefinitionPage {
  const exclusions = () => plugin.settings.exclusions;
  const exclusionModeOptions = {
    'Only exclude...': t(
      'settings.exclusions.folders.exclusionMode.onlyExclude'
    ),
    'Exclude all except...': t(
      'settings.exclusions.folders.exclusionMode.excludeAllExcept'
    ),
  };

  return {
    type: 'page',
    name: t('settings.tabs.exclusions'),
    desc: t('settings.exclusions.desc'),
    items: [
      {
        name: '',
        desc: buildPageIntro(),
      },

      {
        type: 'group',
        heading: t('settings.exclusions.folders.title'),
        items: [
          { name: '', desc: buildFoldersIntro() },
          {
            name: t('settings.exclusions.folders.matchSubfolders.name'),
            desc: t('settings.exclusions.folders.matchSubfolders.desc'),
            control: {
              type: 'toggle',
              key: 'exclusions.excludeSubfolders',
            },
          },
          {
            name: t('settings.exclusions.folders.exclusionMode.name'),
            desc: t('settings.exclusions.folders.exclusionMode.desc'),
            control: {
              type: 'dropdown',
              key: 'exclusions.folderScopeStrategy',
              options: exclusionModeOptions,
            },
          },
        ],
      },
      buildStringExclusionList(
        {
          plugin,
          getItems: () => exclusions().excludedFolders,
          placeholder: t('settings.exclusions.folders.placeholder'),
          debugLabel: 'excludedFolders',
          createSuggest: (input, onSelect, otherItems) => {
            new FolderSuggest(plugin.app, input, onSelect, otherItems);
          },
        },
        tab,
        t('settings.exclusions.folders.addButton'),
        t('settings.exclusions.folders.emptyState')
      ),

      {
        type: 'group',
        heading: t('settings.exclusions.tags.title'),
        items: [
          { name: '', desc: buildTagsIntro() },
          {
            name: t('settings.exclusions.tags.matchTags.name'),
            desc: t('settings.exclusions.tags.matchTags.desc'),
            control: {
              type: 'dropdown',
              key: 'exclusions.tagMatchingMode',
              options: {
                'In Properties and note body': t(
                  'settings.exclusions.tags.matchTags.inPropertiesAndBody'
                ),
                'In Properties only': t(
                  'settings.exclusions.tags.matchTags.inPropertiesOnly'
                ),
                'In note body only': t(
                  'settings.exclusions.tags.matchTags.inBodyOnly'
                ),
              },
            },
          },
          {
            name: t('settings.exclusions.tags.matchChildTags.name'),
            desc: t('settings.exclusions.tags.matchChildTags.desc'),
            control: {
              type: 'toggle',
              key: 'exclusions.excludeChildTags',
            },
          },
          {
            name: t('settings.exclusions.tags.exclusionMode.name'),
            desc: t('settings.exclusions.tags.exclusionMode.desc'),
            control: {
              type: 'dropdown',
              key: 'exclusions.tagScopeStrategy',
              options: exclusionModeOptions,
            },
          },
        ],
      },
      buildStringExclusionList(
        {
          plugin,
          getItems: () => exclusions().excludedTags,
          placeholder: t('settings.exclusions.tags.placeholder'),
          debugLabel: 'excludedTags',
          createSuggest: (input, onSelect, otherItems) => {
            new TagSuggest(plugin.app, input, onSelect, otherItems);
          },
        },
        tab,
        t('settings.exclusions.tags.addButton'),
        t('settings.exclusions.tags.emptyState')
      ),

      {
        type: 'group',
        heading: t('settings.exclusions.properties.title'),
        items: [
          { name: '', desc: buildPropertiesIntro() },
          {
            name: t('settings.exclusions.properties.exclusionMode.name'),
            desc: t('settings.exclusions.properties.exclusionMode.desc'),
            control: {
              type: 'dropdown',
              key: 'exclusions.propertyScopeStrategy',
              options: exclusionModeOptions,
            },
          },
        ],
      },
      {
        type: 'list',
        emptyState: t('settings.exclusions.properties.emptyState'),
        items: exclusions().excludedProperties.map((property) =>
          buildPropertyRow(plugin, property)
        ),
        onDelete: (index) => {
          void (async () => {
            exclusions().excludedProperties.splice(index, 1);
            await persistSettings(plugin);
            tab.update();
          })();
        },
        addItem: {
          name: t('settings.exclusions.properties.addButton'),
          action: () => {
            void (async () => {
              exclusions().excludedProperties.push({ key: '', value: '' });
              await persistSettings(plugin);
              tab.update();
            })();
          },
        },
      },

      {
        type: 'group',
        heading: t('settings.exclusions.fileNames.title'),
        items: [{ name: '', desc: t('settings.exclusions.fileNames.desc') }],
      },
      {
        type: 'list',
        emptyState: t('settings.exclusions.fileNames.emptyState'),
        items: exclusions().fileNameExclusions.map((exclusion) =>
          buildFileNameExclusionRow(plugin, tab, exclusion)
        ),
        onDelete: (index) => {
          void (async () => {
            exclusions().fileNameExclusions.splice(index, 1);
            await persistSettings(plugin);
            tab.update();
          })();
        },
        onReorder: (oldIndex, newIndex) => {
          void (async () => {
            const [moved] = exclusions().fileNameExclusions.splice(oldIndex, 1);
            exclusions().fileNameExclusions.splice(newIndex, 0, moved);
            await persistSettings(plugin);
          })();
        },
        addItem: {
          name: t('settings.exclusions.fileNames.addButton'),
          action: () => {
            void (async () => {
              exclusions().fileNameExclusions.push({
                text: '',
                onlyAtStart: false,
                onlyWholeLine: false,
                enabled: true,
                caseSensitive: false,
              });
              await persistSettings(plugin);
              tab.update();
            })();
          },
        },
      },

      {
        type: 'group',
        heading: t('settings.exclusions.disableProperty.title'),
        items: [
          { name: '', desc: buildDisablePropertyIntro() },
          {
            name: t('settings.exclusions.properties.keyPlaceholder'),
            aliases: [t('settings.exclusions.disableProperty.title')],
            control: {
              type: 'text',
              key: 'exclusions.disableRenamingKey',
              placeholder: t('settings.exclusions.properties.keyPlaceholder'),
            },
          },
          {
            name: t('settings.exclusions.properties.valuePlaceholder'),
            aliases: [t('settings.exclusions.disableProperty.title')],
            control: {
              type: 'text',
              key: 'exclusions.disableRenamingValue',
              placeholder: t('settings.exclusions.properties.valuePlaceholder'),
            },
          },
        ],
      },
    ],
  };
}
