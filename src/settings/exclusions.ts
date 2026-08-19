import {
  Notice,
  PluginSettingTab,
  Setting,
  SettingDefinitionAddItem,
  SettingDefinitionList,
  SettingDefinitionPage,
  SettingDefinitionRender,
  setIcon,
} from 'obsidian';
import {
  updateDisabledRowsAccessibility,
  addForbiddenCharProtection,
  appendLines,
  FirstLineIsTitlePlugin,
  mountLegacyHost,
  buildDescRow,
  appendEmphasis,
} from './settings-base';
import {
  EXCLUSION_STRATEGY,
  ExcludedProperty,
  FileNameExclusion,
} from '../types';
import { FolderSuggest, TagSuggest } from '../suggests';
import { t, tp } from '../i18n';
import { DEFAULT_SETTINGS } from '../constants';
import { TIMING } from '../constants/timing';

async function persistSettings(plugin: FirstLineIsTitlePlugin): Promise<void> {
  try {
    await plugin.saveSettings();
  } catch {
    const notice = new Notice(t('settings.errors.saveFailed'));
    notice.containerEl.addClass('mod-warning');
  }
}

/** The "any rule can exclude, none can re-include" caveat. */
function buildPageIntro(): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(t('settings.exclusions.note'));
  });
}

function buildFoldersIntro(): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(t('settings.exclusions.folders.renamedWarning'));
  });
}

function buildTagsIntro(): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(t('settings.exclusions.tags.tagWranglerWarning'));
  });
}

/** Second line of the "Exclusion mode" desc, not the group intro — the note only applies to that setting's "Exclude all except..." option. */
function buildTagsExclusionModeDesc(): DocumentFragment {
  return createFragment((frag) => {
    appendLines(frag, [
      (target) =>
        target.appendText(t('settings.exclusions.tags.exclusionMode.desc')),
      (target) => {
        appendEmphasis(
          target,
          'settings.exclusions.tags.excludeAllNote.excludeAllExcept'
        );
        target.appendText(t('settings.exclusions.tags.excludeAllNote.part2'));
      },
    ]);
  });
}

/**
 * The "renamed elsewhere" warning sorts first; case-sensitivity sorts last,
 * after the other behavioural notes.
 */
function buildPropertiesIntro(): DocumentFragment {
  return createFragment((frag) => {
    appendLines(frag, [
      (target) =>
        target.appendText(t('settings.exclusions.properties.renamedWarning')),
      (target) => {
        target.appendText(t('settings.exclusions.properties.leaveBlank.part1'));
        appendEmphasis(
          target,
          'settings.exclusions.properties.leaveBlank.value'
        );
        target.appendText(t('settings.exclusions.properties.leaveBlank.part2'));
      },
      (target) =>
        target.appendText(t('settings.exclusions.properties.caseInsensitive')),
    ]);
  });
}

/** Second line of the "Exclusion mode" desc, not the group intro — the note only applies to that setting's "Exclude all except..." option. */
function buildPropertiesExclusionModeDesc(): DocumentFragment {
  return createFragment((frag) => {
    appendLines(frag, [
      (target) =>
        target.appendText(
          t('settings.exclusions.properties.exclusionMode.desc')
        ),
      (target) => {
        appendEmphasis(
          target,
          'settings.exclusions.properties.excludeAllNote.excludeAllExcept'
        );
        target.appendText(
          t('settings.exclusions.properties.excludeAllNote.part2')
        );
      },
    ]);
  });
}

/**
 * The "renamed elsewhere" warning sorts first; case-sensitivity sorts last,
 * after the other behavioural notes.
 */
function buildDisablePropertyIntro(): DocumentFragment {
  return createFragment((frag) => {
    appendLines(frag, [
      (target) =>
        target.appendText(
          t('settings.exclusions.disableProperty.updateWarning')
        ),
      (target) =>
        target.appendText(
          t('settings.exclusions.disableProperty.alwaysRespected')
        ),
      (target) =>
        target.appendText(
          t('settings.exclusions.disableProperty.caseInsensitive')
        ),
    ]);
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

interface KeyValueRowOptions {
  plugin: FirstLineIsTitlePlugin;
  name: string;
  searchable: boolean;
  aliases?: string[];
  getKey: () => string;
  setKey: (value: string) => void;
  getValue: () => string;
  setValue: (value: string) => void;
  debugLabel: string;
  /** Opts the row into a restore button; omitted for rows with no fixed default. */
  restoreDefault?: { key: string; value: string };
}

/** Renders a single key:value pair as two side-by-side text inputs. */
function buildKeyValueRow(
  options: KeyValueRowOptions
): SettingDefinitionRender {
  const {
    plugin,
    name,
    searchable,
    aliases,
    getKey,
    setKey,
    getValue,
    setValue,
    debugLabel,
    restoreDefault,
  } = options;

  return {
    name,
    searchable,
    aliases,
    render: (setting) => {
      setting.settingEl.addClass('flit-exclusion-item-setting');

      const inputContainer = setting.controlEl.createDiv({
        cls: 'flit-property-container flit-display-flex flit-gap-10 flit-align-items-center',
      });

      // Created before the inputs so it sits to their left. Obsidian builds a
      // restore control automatically for `slider` and `color` controls only,
      // so a text pair has to mount its own.
      const restoreButton = restoreDefault
        ? inputContainer.createDiv({
            cls: 'clickable-icon extra-setting-button',
            attr: { 'aria-label': t('settings.common.restoreDefault') },
          })
        : null;
      if (restoreButton) setIcon(restoreButton, 'rotate-ccw');

      const keyInput = inputContainer.createEl('input', {
        type: 'text',
        cls: 'flit-property-key-input',
      });
      keyInput.placeholder = t('settings.exclusions.properties.keyPlaceholder');
      keyInput.value = getKey();
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
      valueInput.value = getValue();
      valueInput.tabIndex = 0;

      // Matches native, which dims a restore control through `aria-disabled`
      // while the value already equals its default and leaves it clickable —
      // restoring to the current value does nothing.
      const syncRestoreState = () => {
        if (!restoreButton || !restoreDefault) return;
        restoreButton.setAttribute(
          'aria-disabled',
          String(
            getKey() === restoreDefault.key &&
              getValue() === restoreDefault.value
          )
        );
      };
      syncRestoreState();

      restoreButton?.addEventListener('click', () => {
        void (async () => {
          if (!restoreDefault) return;
          setKey(restoreDefault.key);
          setValue(restoreDefault.value);
          keyInput.value = restoreDefault.key;
          valueInput.value = restoreDefault.value;
          syncRestoreState();
          await persistSettings(plugin);
        })();
      });

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
          setKey((e.target as HTMLInputElement).value);
          syncRestoreState();
          plugin.debugLog(debugLabel, getKey());
          await persistSettings(plugin);
        })();
      });

      valueInput.addEventListener('input', (e: Event) => {
        void (async () => {
          setValue((e.target as HTMLInputElement).value);
          syncRestoreState();
          plugin.debugLog(debugLabel, getValue());
          await persistSettings(plugin);
        })();
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
  return buildKeyValueRow({
    plugin,
    name: property.key || t('settings.exclusions.properties.keyPlaceholder'),
    searchable: false,
    getKey: () => property.key,
    setKey: (value) => {
      property.key = value;
    },
    getValue: () => property.value,
    setValue: (value) => {
      property.value = value;
    },
    debugLabel: 'excludedProperties',
  });
}

/**
 * Builds the "property to disable renaming" row: a single scalar key:value
 * pair rendered the same way as an excluded-property row, not the two
 * separate full-width rows a generic `control` binding would produce.
 */
function buildDisablePropertyRow(
  plugin: FirstLineIsTitlePlugin
): SettingDefinitionRender {
  const exclusions = () => plugin.settings.exclusions;

  return buildKeyValueRow({
    plugin,
    name: t('settings.exclusions.disableProperty.title'),
    searchable: true,
    aliases: [
      t('settings.exclusions.properties.keyPlaceholder'),
      t('settings.exclusions.properties.valuePlaceholder'),
    ],
    getKey: () => exclusions().disableRenamingKey,
    setKey: (value) => {
      exclusions().disableRenamingKey = value;
    },
    getValue: () => exclusions().disableRenamingValue,
    setValue: (value) => {
      exclusions().disableRenamingValue = value;
    },
    debugLabel: 'disableRenaming',
    restoreDefault: {
      key: DEFAULT_SETTINGS.exclusions.disableRenamingKey,
      value: DEFAULT_SETTINGS.exclusions.disableRenamingValue,
    },
  });
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
    plugin.settings.exclusions.excludedFileNames.indexOf(exclusion);

  return {
    name:
      exclusion.text || t('settings.characterReplacements.emptyPlaceholder'),
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
            `excludedFileNames[${exclusionIndex()}].enabled`,
            value
          );
          await persistSettings(plugin);
          applyRowEnabledState();
        });
      });

      textSetting.addText((text) => {
        text
          .setPlaceholder(t('settings.characterReplacements.emptyPlaceholder'))
          .setValue(exclusion.text)
          .onChange(async (value) => {
            exclusion.text = value;
            plugin.debugLog(
              `excludedFileNames[${exclusionIndex()}].text`,
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
            `excludedFileNames[${exclusionIndex()}].onlyAtStart`,
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
            `excludedFileNames[${exclusionIndex()}].onlyWholeLine`,
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
            `excludedFileNames[${exclusionIndex()}].caseSensitive`,
            value
          );
          await persistSettings(plugin);
        });
      });

      applyRowEnabledState();
    },
  };
}

/**
 * Focuses the last input matching `inputSelector` inside `listGroup`. All four
 * lists share the page and the folder and tag rows share a selector, so the
 * query is scoped to one list's group rather than the whole document.
 */
function focusLastListInput(
  listGroup: Element | null,
  inputSelector: string
): void {
  if (!listGroup) return;
  const inputs = listGroup.querySelectorAll<HTMLInputElement>(inputSelector);
  if (inputs.length === 0) return;
  inputs[inputs.length - 1].focus();
}

/**
 * Builds a list's native `addItem` affordance, keeping the two behaviours the
 * hand-rolled add button carried: it refuses to stack a second blank entry, and
 * it focuses the entry it just created.
 *
 * `focusInputSelector` is null for lists whose rows have no single unambiguous
 * text field; those get the blank-entry guard without the focus follow-up.
 */
function buildAddItem(
  name: string,
  isBottomEntryEmpty: () => boolean,
  focusInputSelector: string | null,
  onAdd: () => Promise<void>
): SettingDefinitionAddItem {
  return {
    name,
    action: (affordanceEl) => {
      // The affordance is a `+` button in the list's header row on desktop but
      // a row inside the list itself on mobile, so its group is found by
      // walking up rather than assumed. Resolved before the add because the
      // framework reuses the group element across renders, so this reference
      // outlives `tab.update()` even where the affordance itself would not.
      const listGroup = affordanceEl.closest('.setting-group');

      const focusBottomEntry = () => {
        if (focusInputSelector === null) return;
        focusLastListInput(listGroup, focusInputSelector);
      };

      // A blank bottom entry is exactly what the affordance would create, so
      // hand it focus instead of stacking another empty row onto it.
      if (isBottomEntryEmpty()) {
        focusBottomEntry();
        return;
      }

      void (async () => {
        await onAdd();
        // The new row only exists once `tab.update()` has re-rendered.
        window.setTimeout(focusBottomEntry, TIMING.NEXT_TICK_MS);
      })();
    },
  };
}

/** Folder and tag lists share every affordance except their suggester. */
function buildStringExclusionList(
  options: StringExclusionListOptions,
  tab: PluginSettingTab,
  addButtonText: string,
  emptyState: string
): SettingDefinitionList {
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
    addItem: buildAddItem(
      addButtonText,
      () => {
        const items = getItems();
        return items.length > 0 && items[items.length - 1].trim() === '';
      },
      '.flit-exclusion-item-setting input[type="text"]',
      async () => {
        getItems().push('');
        await persistSettings(plugin);
        tab.update();
      }
    ),
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
    [EXCLUSION_STRATEGY.ONLY_EXCLUDE]: t(
      'settings.exclusions.folders.exclusionMode.onlyExclude'
    ),
    [EXCLUSION_STRATEGY.EXCLUDE_ALL_EXCEPT]: t(
      'settings.exclusions.folders.exclusionMode.excludeAllExcept'
    ),
  };

  return {
    type: 'page',
    name: t('settings.sections.exclusions'),
    desc: t('settings.exclusions.desc'),
    // Summed across all four lists, skipping blank rows — those are half-typed
    // entries that cannot match anything. Shows nothing at zero rather than
    // "0 rules", matching the Custom replacements row.
    displayValue: () => {
      const { exclusions } = plugin.settings;
      const count =
        exclusions.excludedFolders.filter((folder) => folder.trim()).length +
        exclusions.excludedTags.filter((tag) => tag.trim()).length +
        exclusions.excludedProperties.filter((property) => property.key.trim())
          .length +
        exclusions.excludedFileNames.filter((match) => match.text.trim())
          .length;
      return count ? tp('settings.ruleCount', count) : '';
    },
    items: [
      buildDescRow(buildPageIntro()),

      {
        type: 'group',
        heading: t('settings.exclusions.folders.title'),
        items: [
          buildDescRow(buildFoldersIntro()),
          {
            name: t('settings.exclusions.folders.matchSubfolders.name'),
            desc: t('settings.exclusions.folders.matchSubfolders.desc'),
            control: {
              type: 'toggle',
              key: 'exclusions.matchSubfolders',
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
          buildDescRow(buildTagsIntro()),
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
            name: t('settings.exclusions.tags.matchSubtags.name'),
            desc: t('settings.exclusions.tags.matchSubtags.desc'),
            control: {
              type: 'toggle',
              key: 'exclusions.matchSubtags',
            },
          },
          {
            name: t('settings.exclusions.tags.exclusionMode.name'),
            desc: buildTagsExclusionModeDesc(),
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
          buildDescRow(buildPropertiesIntro()),
          {
            name: t('settings.exclusions.properties.exclusionMode.name'),
            desc: buildPropertiesExclusionModeDesc(),
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
        addItem: buildAddItem(
          t('settings.exclusions.properties.addButton'),
          () => {
            const props = exclusions().excludedProperties;
            if (props.length === 0) return false;
            const last = props[props.length - 1];
            return last.key.trim() === '' && last.value.trim() === '';
          },
          '.flit-property-key-input',
          async () => {
            exclusions().excludedProperties.push({ key: '', value: '' });
            await persistSettings(plugin);
            tab.update();
          }
        ),
      },

      {
        type: 'group',
        heading: t('settings.exclusions.fileNames.title'),
        items: [
          {
            name: t('settings.exclusions.fileNames.exclusionMode.name'),
            desc: t('settings.exclusions.fileNames.exclusionMode.desc'),
            control: {
              type: 'dropdown',
              key: 'exclusions.fileNameScopeStrategy',
              options: exclusionModeOptions,
            },
          },
        ],
      },
      {
        type: 'list',
        emptyState: t('settings.exclusions.fileNames.emptyState'),
        items: exclusions().excludedFileNames.map((exclusion) =>
          buildFileNameExclusionRow(plugin, tab, exclusion)
        ),
        onDelete: (index) => {
          void (async () => {
            exclusions().excludedFileNames.splice(index, 1);
            await persistSettings(plugin);
            tab.update();
          })();
        },
        onReorder: (oldIndex, newIndex) => {
          void (async () => {
            const [moved] = exclusions().excludedFileNames.splice(oldIndex, 1);
            exclusions().excludedFileNames.splice(newIndex, 0, moved);
            await persistSettings(plugin);
          })();
        },
        addItem: buildAddItem(
          t('settings.exclusions.fileNames.addButton'),
          () => {
            const list = exclusions().excludedFileNames;
            return list.length > 0 && list[list.length - 1].text.trim() === '';
          },
          // Rows are multi-field cards with no single obvious text field to focus.
          null,
          async () => {
            exclusions().excludedFileNames.push({
              text: '',
              onlyAtStart: false,
              onlyWholeLine: false,
              enabled: true,
              caseSensitive: false,
            });
            await persistSettings(plugin);
            tab.update();
          }
        ),
      },

      {
        type: 'group',
        heading: t('settings.exclusions.disableProperty.title'),
        items: [
          buildDescRow(buildDisablePropertyIntro()),
          buildDisablePropertyRow(plugin),
        ],
      },
    ],
  };
}
