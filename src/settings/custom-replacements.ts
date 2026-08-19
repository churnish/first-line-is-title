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
  appendEmphasis,
} from './settings-base';
import { t, tp } from '../i18n';
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
 * Behavioural notes for the master toggle, as bare newline-separated lines
 * (no bullet markup) — its own row below the toggle, matching the trim-note
 * pattern in `character-replacements.ts`.
 */
function appendMasterNote(parent: HTMLElement | DocumentFragment): void {
  appendLines(parent, [
    (target) =>
      target.appendText(t('settings.customReplacements.rulesApplyTopToBottom')),
    (target) => {
      target.appendText(t('settings.customReplacements.leaveBlank.part1'));
      appendEmphasis(
        target,
        'settings.customReplacements.leaveBlank.replaceWith'
      );
      target.appendText(t('settings.customReplacements.leaveBlank.part2'));
    },
    (target) =>
      target.appendText(t('settings.customReplacements.whitespacePreserved')),
  ]);
}

function buildApplyAfterForbiddenDescription(): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(
      t('settings.customReplacements.processingOrder.asSetInReplace.part1')
    );
    appendEmphasis(
      frag,
      'settings.customReplacements.processingOrder.asSetInReplace.characterReplacements'
    );
    frag.appendText(
      t('settings.customReplacements.processingOrder.asSetInReplace.part2')
    );
  });
}

function buildApplyAfterMarkupDescription(): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(
      t('settings.customReplacements.processingOrder.asSetInStrip.part1')
    );
    appendEmphasis(
      frag,
      'settings.customReplacements.processingOrder.asSetInStrip.markupStripping'
    );
    frag.appendText(
      t('settings.customReplacements.processingOrder.asSetInStrip.part2')
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
    plugin.settings.customReplacements.rules.indexOf(rule);

  return {
    name:
      rule.searchText ||
      rule.replaceText ||
      t('settings.customReplacements.emptyRule', 'Empty rule'),
    searchable: false,
    render: (setting) => {
      const host = mountLegacyHost(setting.settingEl);

      const enableSetting = new Setting(host).setName(
        t('settings.customReplacements.headers.enable')
      );
      const searchTextSetting = new Setting(host).setName(
        t('settings.customReplacements.headers.textToReplace')
      );
      const replaceTextSetting = new Setting(host).setName(
        t('settings.customReplacements.headers.replaceWith')
      );
      const onlyAtStartSetting = new Setting(host).setName(
        t('settings.customReplacements.headers.onlyMatchLineStart')
      );
      const onlyWholeLineSetting = new Setting(host).setName(
        t('settings.customReplacements.headers.onlyMatchWholeLine')
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
          .setPlaceholder(t('settings.characterReplacements.emptyPlaceholder'))
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
          .setPlaceholder(t('settings.characterReplacements.emptyPlaceholder'))
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
 * Custom replacements sub-page.
 *
 * The rule collection uses the native list type, so add / delete / reorder
 * affordances come from the framework. List `items` are captured when the
 * definitions are built, so every mutation that changes the row set calls
 * `tab.update()`.
 */
export function buildCustomReplacementsPage(
  plugin: FirstLineIsTitlePlugin,
  tab: PluginSettingTab
): SettingDefinitionPage {
  const rules = () => plugin.settings.customReplacements.rules;

  return {
    type: 'page',
    name: t('settings.sections.customReplacements'),
    desc: t('settings.customReplacements.desc'),
    // Counts what the plugin acts on, not what the list holds: a disabled or
    // blank-search rule never fires, so counting it would overstate the page.
    // Silent at zero and while the master toggle is off, rather than reading
    // "0 rules": the count is an at-a-glance summary, and a summary of nothing
    // is noise the native affordance does not show either.
    displayValue: () => {
      if (!plugin.settings.customReplacements.enableCustomReplacements)
        return '';
      const active = rules().filter(
        (rule) => rule.enabled && rule.searchText
      ).length;
      return active ? tp('settings.ruleCount', active) : '';
    },
    items: [
      {
        name: t('settings.customReplacements.name'),
        desc: t('settings.customReplacements.toggleDesc'),
        control: {
          type: 'toggle',
          key: 'customReplacements.enableCustomReplacements',
        },
      },
      {
        name: t(
          'settings.customReplacements.processingOrder.applyAfterForbidden'
        ),
        desc: buildApplyAfterForbiddenDescription(),
        visible: () =>
          plugin.settings.customReplacements.enableCustomReplacements,
        control: {
          type: 'toggle',
          key: 'customReplacements.applyAfterForbiddenChars',
        },
      },
      {
        name: t('settings.customReplacements.processingOrder.applyAfterMarkup'),
        desc: buildApplyAfterMarkupDescription(),
        visible: () =>
          plugin.settings.customReplacements.enableCustomReplacements,
        control: {
          type: 'toggle',
          key: 'markupStripping.applyCustomReplacementsAfterMarkupStripping',
        },
      },
      buildDescRow(
        createFragment((frag) => appendMasterNote(frag)),
        {
          visible: () =>
            plugin.settings.customReplacements.enableCustomReplacements,
        }
      ),
      {
        type: 'list',
        visible: () =>
          plugin.settings.customReplacements.enableCustomReplacements,
        emptyState: t(
          'settings.customReplacements.emptyState',
          'No custom replacements.'
        ),
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
          name: t('settings.customReplacements.addReplacement'),
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
    ],
  };
}
