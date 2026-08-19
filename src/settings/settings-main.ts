import {
  PluginSettingTab,
  App,
  Plugin,
  Notice,
  SettingDefinitionItem,
} from 'obsidian';
import { FirstLineIsTitlePlugin } from './settings-base';
import { t } from '../i18n';
import { normalizeExclusionLists } from '../utils';
import { getPath, setPath } from './settings-paths';
import { FIRST_ENABLE_CHAR_KEYS } from '../types/char-replacement';

import {
  buildGeneralDefinitions,
  buildNewNotesGroup,
  buildFooterDefinitions,
  buildSupportGroup,
} from './general';
import { buildExclusionsPage } from './exclusions';
import { buildCharacterReplacementsPage } from './character-replacements';
import { buildCustomReplacementsPage } from './custom-replacements';
import { buildMarkupStrippingPage } from './markup-stripping';
import { buildAliasPage } from './alias';
import { buildCommandsPage } from './commands';
import { buildOtherPage } from './other';

/**
 * Side effects that must run when a `control` writes a given key.
 *
 * The declarative API has no per-control onChange hook, but every `control`
 * write is routed through `setControlValue`, making it the one place these can
 * live. Cascades mutate settings directly and never re-enter `setControlValue`,
 * so there is no recursion and exactly one save per user action.
 */
const CASCADES: Record<string, (plugin: FirstLineIsTitlePlugin) => void> = {
  'characterReplacements.enableForbiddenCharReplacements': (plugin) => {
    const { settings } = plugin;
    if (!settings.characterReplacements.enableForbiddenCharReplacements) return;
    if (settings.core.hasEnabledForbiddenChars) return;

    for (const key of FIRST_ENABLE_CHAR_KEYS) {
      settings.characterReplacements.charReplacements[key].enabled = true;
    }
    settings.core.hasEnabledForbiddenChars = true;
  },

  'customReplacements.enableCustomReplacements': (plugin) => {
    const { settings } = plugin;
    if (!settings.customReplacements.enableCustomReplacements) {
      settings.markupStripping.applyCustomReplacementsInAlias = false;
      return;
    }
    if (settings.core.hasEnabledCustomReplacements) return;
    for (const replacement of settings.customReplacements.rules) {
      replacement.enabled = true;
    }
    settings.core.hasEnabledCustomReplacements = true;
  },

  'aliases.enableAliases': (plugin) => {
    const { settings } = plugin;
    if (!settings.aliases.enableAliases || settings.core.hasEnabledAliases) {
      return;
    }
    settings.aliases.keepEmptyAliasProperty = true;
    settings.markupStripping.stripMarkupInAlias = true;
    if (settings.customReplacements.enableCustomReplacements) {
      settings.markupStripping.applyCustomReplacementsInAlias = true;
    }
    settings.core.hasEnabledAliases = true;
  },

  'aliases.hideAliasProperty': (plugin) => plugin.updatePropertyVisibility?.(),
  'aliases.hideAliasInSidebar': (plugin) => plugin.updatePropertyVisibility?.(),
  'core.checkInterval': (plugin) =>
    plugin.editorLifecycle?.initializeCheckingSystem(),

  'core.debug': (plugin) => {
    const enabled = plugin.settings.core.debug;
    // Stamps when debugging was switched on so log output is attributable.
    plugin.settings.core.debugEnabledTimestamp = enabled
      ? (plugin.getCurrentTimestamp?.() ?? '')
      : '';
    if (enabled) plugin.outputAllSettings?.();
  },
};

/**
 * Keys whose cascade force-writes a value on another control.
 *
 * `refreshDomState()` only re-evaluates visible/disabled predicates — it never
 * re-reads control values, so a force-written sibling would keep rendering its
 * stale value. These need a full `update()` instead.
 */
const VALUE_MUTATING_KEYS = new Set([
  'characterReplacements.enableForbiddenCharReplacements',
  'customReplacements.enableCustomReplacements',
  'aliases.enableAliases',
]);

export class FirstLineIsTitleSettings extends PluginSettingTab {
  plugin: FirstLineIsTitlePlugin;

  constructor(app: App, plugin: FirstLineIsTitlePlugin) {
    // PluginSettingTab expects Plugin, but we use minimal interface for flexibility
    super(app, plugin as unknown as Plugin);
    this.plugin = plugin;
    this.icon = 'file-type-corner';
  }

  getControlValue(key: string): unknown {
    return getPath(
      this.plugin.settings as unknown as Record<string, unknown>,
      key
    );
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    setPath(
      this.plugin.settings as unknown as Record<string, unknown>,
      key,
      value
    );
    CASCADES[key]?.(this.plugin);

    try {
      await this.plugin.saveSettings();
    } catch {
      const notice = new Notice(t('settings.errors.saveFailed'));
      notice.containerEl.addClass('mod-warning');
    }

    if (VALUE_MUTATING_KEYS.has(key)) {
      this.update();
    } else {
      this.refreshDomState();
    }
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      // General settings stay at the top level with no heading, per Obsidian's
      // convention that a tab's primary section is unlabelled.
      ...buildGeneralDefinitions(this.plugin),
      // Page-level action closes out the everyday settings, above the Exclusions row.
      ...buildFooterDefinitions(this.plugin),
      buildExclusionsPage(this.plugin, this),
      buildNewNotesGroup(this.plugin),
      {
        type: 'group',
        heading: t('settings.sections.advancedGroup'),
        items: [
          buildAliasPage(this.plugin),
          buildCharacterReplacementsPage(this.plugin),
          buildCommandsPage(this.plugin),
          buildCustomReplacementsPage(this.plugin, this),
          buildMarkupStrippingPage(this.plugin),
          buildOtherPage(this.plugin, this),
        ],
      },
      buildSupportGroup(),
    ];
  }

  hide(): void {
    // Deferred to close so half-finished rows are left alone while the modal is open
    if (normalizeExclusionLists(this.plugin.settings)) {
      this.plugin.saveSettings().catch(() => {
        const notice = new Notice(t('settings.errors.saveFailed'));
        notice.containerEl.addClass('mod-warning');
      });
      // List definitions map their items at definition time, so the pruned
      // arrays only reach the DOM after the definitions are rebuilt.
      this.update();
    }
    super.hide();
  }
}
