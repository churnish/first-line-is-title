import {
  Platform,
  SettingDefinitionItem,
  SettingDefinitionPage,
  Notice,
} from 'obsidian';
import { FirstLineIsTitlePlugin, mountLegacyHost } from './settings-base';
import { t, getCurrentLocale } from '../i18n';

// Plugin names (proper nouns, not subject to sentence case)
const PLUGIN_HOVER_EDITOR = 'Hover Editor';

/** Russian typography uses guillemets where English bolds a UI label. */
function appendEmphasisedTerm(frag: DocumentFragment, text: string): void {
  if (getCurrentLocale() === 'ru') {
    frag.appendText('«' + text + '»');
  } else {
    frag.createEl('strong', { text });
  }
}

/**
 * Builds a `part1 + <emphasised label> + part2` description, the shape shared
 * by the three cross-referencing alias toggles.
 */
function buildLabelReferenceDescription(
  descKey: string,
  labelKey: string
): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(t(`${descKey}.part1`));
    appendEmphasisedTerm(frag, t(`${descKey}.${labelKey}`));
    frag.appendText(t(`${descKey}.part2`));
  });
}

/** Description for the alias property name row: prose plus bare newline-separated notes. */
function buildAliasPropertyKeyDescription(): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(t('settings.alias.aliasPropertyName.desc'));

    const notes = frag.createDiv({
      cls: 'flit-margin-bottom-0',
    });

    notes.appendText(t('settings.alias.aliasPropertyName.quickSwitcher'));
    notes.createEl('br');
    notes.appendText(t('settings.alias.aliasPropertyName.multipleProperties'));

    frag.createEl('br');
    frag.createEl('small').createEl('strong', {
      text: t('settings.alias.aliasPropertyName.default'),
    });
  });
}

/** Description for the truncate toggle: two emphasised labels across three parts. */
function buildTruncateAliasDescription(): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(t('settings.alias.truncateAlias.desc.part1'));
    appendEmphasisedTerm(
      frag,
      t('settings.alias.truncateAlias.desc.charCount')
    );
    frag.appendText(t('settings.alias.truncateAlias.desc.part2'));
    appendEmphasisedTerm(frag, t('settings.alias.truncateAlias.desc.other'));
    frag.appendText(t('settings.alias.truncateAlias.desc.part3'));
  });
}

export function buildAliasPage(
  plugin: FirstLineIsTitlePlugin
): SettingDefinitionPage {
  // Everything below the master toggle is meaningless while aliases are off,
  // so it is hidden rather than shown greyed out.
  const aliasesEnabled = () => plugin.settings.aliases.enableAliases;

  const items: SettingDefinitionItem[] = [
    {
      name: t('settings.alias.addAlias.name'),
      desc: t('settings.alias.addAlias.desc'),
      control: {
        type: 'toggle',
        key: 'aliases.enableAliases',
      },
    },
    {
      // Empty input silently falls back to `aliases`, which `validate` cannot
      // express — it rejects rather than corrects. Hence `render`, not `control`.
      visible: aliasesEnabled,
      name: t('settings.alias.aliasPropertyName.name'),
      desc: buildAliasPropertyKeyDescription(),
      render: (setting) => {
        setting.addText((text) =>
          text
            .setPlaceholder(t('settings.replaceCharacters.emptyPlaceholder'))
            .setValue(plugin.settings.aliases.aliasPropertyKey)
            .onChange(async (value) => {
              plugin.settings.aliases.aliasPropertyKey =
                value.trim() || 'aliases';
              plugin.debugLog(
                'aliasPropertyKey',
                plugin.settings.aliases.aliasPropertyKey
              );
              try {
                await plugin.saveSettings();
              } catch {
                const notice = new Notice(t('settings.errors.saveFailed'));
                notice.containerEl.addClass('mod-warning');
              }
            })
        );
      },
    },
    {
      visible: aliasesEnabled,
      name: t('settings.alias.onlyAddIfDiffers.name'),
      desc: t('settings.alias.onlyAddIfDiffers.desc'),
      control: {
        type: 'toggle',
        key: 'aliases.addAliasOnlyIfFirstLineDiffers',
      },
    },
    {
      visible: aliasesEnabled,
      name: t('settings.alias.truncateAlias.name'),
      desc: buildTruncateAliasDescription(),
      control: {
        type: 'toggle',
        key: 'aliases.truncateAlias',
      },
    },
    {
      visible: aliasesEnabled,
      name: t('settings.alias.applyCustomRules.name'),
      desc: buildLabelReferenceDescription(
        'settings.alias.applyCustomRules.desc',
        'customRules'
      ),
      control: {
        type: 'toggle',
        key: 'markupStripping.applyCustomRulesInAlias',
        disabled: () => !plugin.settings.customRules.enableCustomReplacements,
      },
    },
    {
      visible: aliasesEnabled,
      name: t('settings.alias.stripMarkup.name'),
      desc: buildLabelReferenceDescription(
        'settings.alias.stripMarkup.desc',
        'stripMarkup'
      ),
      control: {
        type: 'toggle',
        key: 'markupStripping.stripMarkupInAlias',
      },
    },
    {
      visible: aliasesEnabled,
      name: t('settings.alias.keepEmptyProperty.name'),
      desc: t('settings.alias.keepEmptyProperty.desc'),
      control: {
        type: 'toggle',
        key: 'aliases.keepEmptyAliasProperty',
      },
    },
    {
      visible: aliasesEnabled,
      name: t('settings.alias.placeAliasLast.name'),
      desc: t('settings.alias.placeAliasLast.desc'),
      control: {
        type: 'toggle',
        key: 'aliases.placeAliasLast',
      },
    },
    {
      visible: aliasesEnabled,
      name: t('settings.alias.hideProperty.name'),
      desc: t('settings.alias.hideProperty.desc'),
      control: {
        type: 'dropdown',
        key: 'aliases.hideAliasProperty',
        options: {
          never: t('settings.alias.hideProperty.never'),
          when_empty: t('settings.alias.hideProperty.onlyWhenEmpty'),
          always: t('settings.alias.hideProperty.always'),
        },
      },
    },
    {
      name: t('settings.alias.hideInSidebar.name'),
      desc: t('settings.alias.hideInSidebar.desc'),
      visible: () =>
        aliasesEnabled() &&
        ['when_empty', 'always'].includes(
          plugin.settings.aliases.hideAliasProperty
        ),
      control: {
        type: 'toggle',
        key: 'aliases.hideAliasInSidebar',
      },
    },
    {
      // Desktop-only: the caveats it lists have no mobile equivalent.
      type: 'group',
      heading: t('settings.alias.limitations.title'),
      visible: () => aliasesEnabled() && !Platform.isMobile,
      items: [
        {
          name: '',
          render: (setting) => {
            const host = mountLegacyHost(setting.settingEl);
            const list = host.createEl('ul', {
              cls: 'setting-item-description flit-margin-top-15 flit-margin-bottom-15',
            });

            const pagePreviewBullet = list.createEl('li');
            pagePreviewBullet.appendText(
              t('settings.alias.limitations.bullet1.part1')
            );
            pagePreviewBullet.createEl('a', {
              text: PLUGIN_HOVER_EDITOR,
              href: 'obsidian://show-plugin?id=obsidian-hover-editor',
            });
            pagePreviewBullet.appendText(
              t('settings.alias.limitations.bullet1.part2')
            );

            list.createEl('li', {
              text: t('settings.alias.limitations.bullet2'),
            });
          },
        },
      ],
    },
  ];

  return {
    type: 'page',
    name: t('settings.tabs.alias'),
    desc: t('settings.alias.desc'),
    items,
  };
}
