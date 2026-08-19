import {
  Platform,
  SettingDefinitionItem,
  SettingDefinitionPage,
  Notice,
  TextComponent,
} from 'obsidian';
import {
  FirstLineIsTitlePlugin,
  appendLines,
  buildDescRow,
  appendEmphasisedTerm,
} from './settings-base';
import { t } from '../i18n';
import { DEFAULT_SETTINGS } from '../constants';
import { createPluginLink, buildPluginLinkRouterGroup } from './plugin-links';

// Plugin names (proper nouns, not subject to sentence case)
const PLUGIN_HOVER_EDITOR = 'Hover Editor';

/**
 * The limitation caveats, as bare newline-separated lines (no bullet markup),
 * matching the master-toggle note pattern in `custom-replacements.ts`.
 */
function buildLimitationsNote(): DocumentFragment {
  return createFragment((frag) => {
    appendLines(frag, [
      (target) => {
        target.appendText(t('settings.alias.limitations.bullet1.part1'));
        createPluginLink(target, 'obsidian-hover-editor', PLUGIN_HOVER_EDITOR);
        target.appendText(t('settings.alias.limitations.bullet1.part2'));
      },
      (target) => target.appendText(t('settings.alias.limitations.bullet2')),
    ]);
  });
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
      // The master toggle gets its own box, with the caveats that qualify it
      // directly beneath rather than stranded at the foot of the page.
      type: 'group',
      items: [
        {
          name: t('settings.alias.addAlias.name'),
          desc: t('settings.alias.addAlias.desc'),
          control: {
            type: 'toggle',
            key: 'aliases.enableAliases',
          },
        },
        // Desktop-only: the caveats it lists have no mobile equivalent.
        buildDescRow(buildLimitationsNote(), {
          visible: () => aliasesEnabled() && !Platform.isMobile,
        }),
      ],
    },
    {
      // `render`, not `control`: `SettingControlBase` exposes only `key`,
      // `defaultValue`, `validate` and `disabled`, so it can express neither
      // the restore button nor the visibility refresh this row needs on change.
      visible: aliasesEnabled,
      name: t('settings.alias.aliasPropertyName.name'),
      desc: buildAliasPropertyKeyDescription(),
      render: (setting) => {
        const defaultKey = DEFAULT_SETTINGS.aliases.aliasPropertyKey;
        let textComponent: TextComponent | null = null;
        let syncRestoreState = () => {};

        const persist = async () => {
          plugin.debugLog(
            'aliasPropertyKey',
            plugin.settings.aliases.aliasPropertyKey
          );
          // Nothing else reaches property visibility on a key change: the
          // cascade map only fires for `control` rows. Without this, clearing
          // the key would leave the old key's properties hidden.
          plugin.updatePropertyVisibility?.();
          try {
            await plugin.saveSettings();
          } catch {
            const notice = new Notice(t('settings.errors.saveFailed'));
            notice.containerEl.addClass('mod-warning');
          }
        };

        // Added before the text field so it renders to its left, the order
        // Obsidian itself uses for the restore control on slider rows.
        setting.addExtraButton((button) => {
          button
            .setIcon('rotate-ccw')
            .setTooltip(t('settings.common.restoreDefault'))
            .onClick(() => {
              void (async () => {
                plugin.settings.aliases.aliasPropertyKey = defaultKey;
                textComponent?.setValue(defaultKey);
                syncRestoreState();
                await persist();
              })();
            });

          // Native dims through `aria-disabled` and leaves the button
          // clickable, since restoring to the current value does nothing.
          // Gauged on the FIELD, not the stored value: an empty field stores
          // the default, but restoring still visibly repopulates the box, so
          // dimming there would misrepresent a button that does something.
          syncRestoreState = () => {
            const shown =
              textComponent?.getValue() ??
              plugin.settings.aliases.aliasPropertyKey;
            button.extraSettingsEl.setAttribute(
              'aria-disabled',
              String(shown === defaultKey)
            );
          };
        });

        setting.addText((text) => {
          textComponent = text;
          text
            .setPlaceholder(t('settings.alias.aliasPropertyName.placeholder'))
            .setValue(plugin.settings.aliases.aliasPropertyKey)
            .onChange(async (value) => {
              // Stored as typed, empty included, so the field keeps what the
              // user put in it. An empty key is a valid choice meaning "no
              // alias property": both `alias-manager.ts` and
              // `property-visibility.ts` no-op entirely on it.
              plugin.settings.aliases.aliasPropertyKey = value.trim();
              syncRestoreState();
              await persist();
            });
        });

        syncRestoreState();
      },
    },
    {
      visible: aliasesEnabled,
      name: t('settings.alias.addAliasOnlyIfTitleDiffers.name'),
      desc: t('settings.alias.addAliasOnlyIfTitleDiffers.desc'),
      control: {
        type: 'toggle',
        key: 'aliases.addAliasOnlyIfTitleDiffers',
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
      name: t('settings.alias.applyCustomReplacements.name'),
      desc: buildLabelReferenceDescription(
        'settings.alias.applyCustomReplacements.desc',
        'customReplacements'
      ),
      control: {
        type: 'toggle',
        key: 'markupStripping.applyCustomReplacementsInAlias',
        disabled: () =>
          !plugin.settings.customReplacements.enableCustomReplacements,
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
      name: t('settings.alias.keepEmptyAliasProperty.name'),
      desc: t('settings.alias.keepEmptyAliasProperty.desc'),
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
      name: t('settings.alias.hideAliasProperty.name'),
      desc: t('settings.alias.hideAliasProperty.desc'),
      control: {
        type: 'dropdown',
        key: 'aliases.hideAliasProperty',
        options: {
          never: t('settings.alias.hideAliasProperty.never'),
          when_empty: t('settings.alias.hideAliasProperty.onlyWhenEmpty'),
          always: t('settings.alias.hideAliasProperty.always'),
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
  ];

  items.push(buildPluginLinkRouterGroup(plugin.app));

  return {
    type: 'page',
    name: t('settings.sections.alias'),
    desc: t('settings.alias.desc'),
    // Blank rather than "Disabled" when off, matching the rule-count rows: the
    // value summarises what is active, and absence already reads as inactive.
    displayValue: () =>
      plugin.settings.aliases.enableAliases ? t('settings.common.enabled') : '',
    items,
  };
}
