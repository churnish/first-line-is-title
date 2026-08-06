import {
  Notice,
  PluginSettingTab,
  Setting,
  SettingDefinitionPage,
  SettingDefinitionRender,
} from 'obsidian';
import {
  updateDisabledRowsAccessibility,
  addForbiddenCharProtection,
  appendLines,
  buildDescRow,
  FirstLineIsTitlePlugin,
  mountLegacyHost,
} from './settings-base';
import { t, getCurrentLocale } from '../i18n';
import { CustomReplacement } from '../types';

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

/**
 * Behavioural notes for the master toggle, as bare newline-separated lines
 * (no bullet markup) — its own row below the toggle, matching the trim-note
 * pattern in `tab-replace-characters.ts`.
 */
function appendMasterNote(parent: HTMLElement | DocumentFragment): void {
  appendLines(parent, [
    (target) =>
      target.appendText(t('settings.customRules.rulesAppliedSequentially')),
    (target) => {
      target.appendText(t('settings.customRules.leaveBlank.part1'));
      appendEmphasis(target, 'settings.customRules.leaveBlank.replaceWith');
      target.appendText(t('settings.customRules.leaveBlank.part2'));
    },
    (target) => {
      target.appendText(t('settings.customRules.untitledWarning.part1'));
      appendEmphasis(
        target,
        'settings.customRules.untitledWarning.replaceWith'
      );
      target.appendText(t('settings.customRules.untitledWarning.part2'));
      appendEmphasis(
        target,
        'settings.customRules.untitledWarning.textToReplace'
      );
      target.appendText(t('settings.customRules.untitledWarning.part3'));
      appendEmphasis(target, 'settings.customRules.untitledWarning.untitled');
      target.appendText(t('settings.customRules.untitledWarning.part4'));
    },
    (target) =>
      target.appendText(t('settings.customRules.whitespacePreserved')),
  ]);
}

function buildApplyAfterForbiddenDescription(): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(
      t('settings.customRules.processingOrder.asSetInReplace.part1')
    );
    appendEmphasis(
      frag,
      'settings.customRules.processingOrder.asSetInReplace.replaceCharacters'
    );
    frag.appendText(
      t('settings.customRules.processingOrder.asSetInReplace.part2')
    );
  });
}

function buildApplyAfterMarkupDescription(): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(
      t('settings.customRules.processingOrder.asSetInStrip.part1')
    );
    appendEmphasis(
      frag,
      'settings.customRules.processingOrder.asSetInStrip.stripMarkup'
    );
    frag.appendText(
      t('settings.customRules.processingOrder.asSetInStrip.part2')
    );
  });
}

/**
 * Builds one rule row. Handlers close over the rule object rather than its
 * index so drag-reordering (which mutates the array without re-rendering)
 * cannot make them write to the wrong rule.
 */
function buildRuleRow(
  plugin: FirstLineIsTitlePlugin,
  tab: PluginSettingTab,
  rule: CustomReplacement
): SettingDefinitionRender {
  const ruleIndex = () =>
    plugin.settings.customRules.customReplacements.indexOf(rule);

  return {
    name:
      rule.searchText ||
      rule.replaceText ||
      t('settings.customRules.emptyRule', 'Empty rule'),
    searchable: false,
    render: (setting) => {
      const host = mountLegacyHost(setting.settingEl);

      const enableSetting = new Setting(host).setName(
        t('settings.customRules.headers.enable')
      );
      const searchTextSetting = new Setting(host).setName(
        t('settings.customRules.headers.textToReplace')
      );
      const replaceTextSetting = new Setting(host).setName(
        t('settings.customRules.headers.replaceWith')
      );
      const onlyAtStartSetting = new Setting(host).setName(
        t('settings.customRules.headers.onlyMatchLineStart')
      );
      const onlyWholeLineSetting = new Setting(host).setName(
        t('settings.customRules.headers.onlyMatchWholeLine')
      );

      /** Per-rule enable gates the rule's own fields, not its enable toggle. */
      const applyRowEnabledState = () => {
        [
          searchTextSetting,
          replaceTextSetting,
          onlyAtStartSetting,
          onlyWholeLineSetting,
        ].forEach((dependent) => {
          dependent.setDisabled(!rule.enabled);
          dependent.settingEl.classList.toggle(
            'flit-row-disabled',
            !rule.enabled
          );
        });
        updateDisabledRowsAccessibility(host);
      };

      enableSetting.addToggle((toggle) => {
        toggle.setValue(rule.enabled).onChange(async (value) => {
          rule.enabled = value;
          plugin.debugLog(`customReplacements[${ruleIndex()}].enabled`, value);
          await persistSettings(plugin);
          applyRowEnabledState();
        });
      });

      searchTextSetting.addText((text) => {
        text
          .setPlaceholder(t('settings.replaceCharacters.emptyPlaceholder'))
          .setValue(rule.searchText)
          .onChange(async (value) => {
            rule.searchText = value;
            plugin.debugLog(
              `customReplacements[${ruleIndex()}].searchText`,
              value
            );
            await persistSettings(plugin);
          });
      });

      replaceTextSetting.addText((text) => {
        text
          .setPlaceholder(t('settings.replaceCharacters.emptyPlaceholder'))
          .setValue(rule.replaceText)
          .onChange(async (value) => {
            rule.replaceText = value;
            plugin.debugLog(
              `customReplacements[${ruleIndex()}].replaceText`,
              value
            );
            await persistSettings(plugin);
          });
        addForbiddenCharProtection(text.inputEl);
      });

      onlyAtStartSetting.addToggle((toggle) => {
        toggle.setValue(rule.onlyAtStart).onChange(async (value) => {
          rule.onlyAtStart = value;
          plugin.debugLog(
            `customReplacements[${ruleIndex()}].onlyAtStart`,
            value
          );
          // The two match modes are mutually exclusive.
          if (value) rule.onlyWholeLine = false;
          await persistSettings(plugin);
          tab.update();
        });
      });

      onlyWholeLineSetting.addToggle((toggle) => {
        toggle.setValue(rule.onlyWholeLine).onChange(async (value) => {
          rule.onlyWholeLine = value;
          plugin.debugLog(
            `customReplacements[${ruleIndex()}].onlyWholeLine`,
            value
          );
          // The two match modes are mutually exclusive.
          if (value) rule.onlyAtStart = false;
          await persistSettings(plugin);
          tab.update();
        });
      });

      applyRowEnabledState();
    },
  };
}

/**
 * Custom rules sub-page.
 *
 * The rule collection uses the native list type, so add / delete / reorder
 * affordances come from the framework. List `items` are captured when the
 * definitions are built, so every mutation that changes the row set calls
 * `tab.update()`.
 */
export function buildCustomRulesPage(
  plugin: FirstLineIsTitlePlugin,
  tab: PluginSettingTab
): SettingDefinitionPage {
  const rules = () => plugin.settings.customRules.customReplacements;

  return {
    type: 'page',
    name: t('settings.tabs.customRules'),
    desc: t('settings.customRules.desc'),
    items: [
      {
        name: t('settings.customRules.name'),
        desc: t('settings.customRules.desc'),
        control: {
          type: 'toggle',
          key: 'customRules.enableCustomReplacements',
        },
      },
      buildDescRow(
        createFragment((frag) => appendMasterNote(frag)),
        {
          visible: () => plugin.settings.customRules.enableCustomReplacements,
        }
      ),
      {
        type: 'list',
        heading: t('settings.customRules.listHeading'),
        visible: () => plugin.settings.customRules.enableCustomReplacements,
        emptyState: t('settings.customRules.emptyState', 'No custom rules.'),
        items: rules().map((rule) => buildRuleRow(plugin, tab, rule)),
        onDelete: (index) => {
          void (async () => {
            rules().splice(index, 1);
            await persistSettings(plugin);
            tab.update();
          })();
        },
        onReorder: (oldIndex, newIndex) => {
          void (async () => {
            const [moved] = rules().splice(oldIndex, 1);
            rules().splice(newIndex, 0, moved);
            await persistSettings(plugin);
          })();
        },
        addItem: {
          name: t('settings.customRules.addReplacement'),
          action: () => {
            void (async () => {
              rules().push({
                searchText: '',
                replaceText: '',
                onlyAtStart: false,
                onlyWholeLine: false,
                enabled: true,
              });
              await persistSettings(plugin);
              tab.update();
            })();
          },
        },
      },
      {
        type: 'group',
        heading: t('settings.customRules.processingOrder.title'),
        visible: () => plugin.settings.customRules.enableCustomReplacements,
        items: [
          {
            name: t('settings.customRules.processingOrder.applyAfterForbidden'),
            desc: buildApplyAfterForbiddenDescription(),
            control: {
              type: 'toggle',
              key: 'customRules.applyCustomRulesAfterForbiddenChars',
            },
          },
          {
            name: t('settings.customRules.processingOrder.applyAfterMarkup'),
            desc: buildApplyAfterMarkupDescription(),
            control: {
              type: 'toggle',
              key: 'markupStripping.applyCustomRulesAfterMarkupStripping',
            },
          },
        ],
      },
    ],
  };
}
