import {
  Notice,
  PluginSettingTab,
  Setting,
  SettingDefinitionPage,
  SettingDefinitionRender,
} from 'obsidian';
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';
import { t, getCurrentLocale } from '../i18n';
import { CustomReplacement } from '../types';

/**
 * Bridges the declarative page to `SettingsTabBase`'s protected DOM helpers,
 * which the render-mounted rule rows still rely on.
 */
class CustomRulesDomHelpers extends SettingsTabBase {
  constructor(plugin: FirstLineIsTitlePlugin) {
    super(plugin, document.createElement('div'));
  }

  render(): void {
    // Rendering is driven by the declarative page; this legacy hook is unused.
  }

  applyMasterInteractiveState(container: HTMLElement, enabled: boolean): void {
    this.updateInteractiveState(container, enabled);
  }

  refreshDisabledRows(container: HTMLElement): void {
    this.updateDisabledRowsAccessibility(container);
  }

  protectInput(input: HTMLInputElement): void {
    this.addForbiddenCharProtection(input);
  }
}

async function persistSettings(plugin: FirstLineIsTitlePlugin): Promise<void> {
  try {
    await plugin.saveSettings();
  } catch {
    new Notice(t('settings.errors.saveFailed'));
  }
}

/**
 * Appends a locale-aware emphasised fragment. Russian uses guillemets rather
 * than italics.
 */
function appendEmphasis(
  parent: HTMLElement | DocumentFragment,
  localeKey: string
): void {
  if (getCurrentLocale() === 'ru') {
    parent.appendText('«' + t(localeKey) + '»');
  } else {
    parent.createEl('em', { text: t(localeKey) });
  }
}

/** Master-toggle description: intro line plus the behavioural bullet list. */
function buildMasterDescription(): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(t('settings.customRules.desc'));

    const ul = frag.createEl('ul', {
      cls: 'flit-margin-0 flit-padding-left-20',
    });
    ul.createEl('li', {
      text: t('settings.customRules.rulesAppliedSequentially'),
    });
    ul.createEl('li', {
      text: t('settings.customRules.whitespacePreserved'),
    });

    const leaveBlankItem = ul.createEl('li');
    leaveBlankItem.appendText(t('settings.customRules.leaveBlank.part1'));
    appendEmphasis(
      leaveBlankItem,
      'settings.customRules.leaveBlank.replaceWith'
    );
    leaveBlankItem.appendText(t('settings.customRules.leaveBlank.part2'));

    const untitledItem = ul.createEl('li');
    untitledItem.appendText(t('settings.customRules.untitledWarning.part1'));
    appendEmphasis(
      untitledItem,
      'settings.customRules.untitledWarning.replaceWith'
    );
    untitledItem.appendText(t('settings.customRules.untitledWarning.part2'));
    appendEmphasis(
      untitledItem,
      'settings.customRules.untitledWarning.textToReplace'
    );
    untitledItem.appendText(t('settings.customRules.untitledWarning.part3'));
    appendEmphasis(
      untitledItem,
      'settings.customRules.untitledWarning.untitled'
    );
    untitledItem.appendText(t('settings.customRules.untitledWarning.part4'));
  });
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
  helpers: CustomRulesDomHelpers,
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
      const host = setting.settingEl.createDiv({ cls: 'flit-settings-page' });

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
        helpers.refreshDisabledRows(host);
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
        helpers.protectInput(text.inputEl);
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

      const masterEnabled =
        plugin.settings.customRules.enableCustomReplacements;
      setting.setDisabled(!masterEnabled);
      helpers.applyMasterInteractiveState(host, masterEnabled);
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
  const helpers = new CustomRulesDomHelpers(plugin);
  const rules = () => plugin.settings.customRules.customReplacements;

  return {
    type: 'page',
    name: t('settings.tabs.customRules'),
    desc: t('settings.customRules.desc'),
    items: [
      {
        name: t('settings.customRules.name'),
        desc: buildMasterDescription(),
        control: {
          type: 'toggle',
          key: 'customRules.enableCustomReplacements',
        },
      },
      {
        type: 'list',
        heading: t('settings.tabs.customRules'),
        emptyState: t('settings.customRules.emptyState', 'No custom rules.'),
        items: rules().map((rule) => buildRuleRow(plugin, tab, helpers, rule)),
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
        items: [
          {
            name: t('settings.customRules.processingOrder.applyAfterForbidden'),
            desc: buildApplyAfterForbiddenDescription(),
            control: {
              type: 'toggle',
              key: 'customRules.applyCustomRulesAfterForbiddenChars',
              disabled: () =>
                !plugin.settings.customRules.enableCustomReplacements,
            },
          },
          {
            name: t('settings.customRules.processingOrder.applyAfterMarkup'),
            desc: buildApplyAfterMarkupDescription(),
            control: {
              type: 'toggle',
              key: 'markupStripping.applyCustomRulesAfterMarkupStripping',
              disabled: () =>
                !plugin.settings.customRules.enableCustomReplacements ||
                !plugin.settings.markupStripping.enableStripMarkup,
            },
          },
        ],
      },
    ],
  };
}
