import {
  PluginSettingTab,
  App,
  Plugin,
  Notice,
  SettingDefinitionItem,
} from 'obsidian';
import { FirstLineIsTitlePlugin } from './settings-base';
import { t } from '../i18n';
import { deduplicateExclusions } from '../utils';
import { getPath, setPath } from './settings-paths';
import {
  PRIMARY_CHAR_KEYS,
  WINDOWS_ANDROID_CHAR_KEYS,
} from '../types/char-replacement';

import { buildGeneralDefinitions, buildFooterDefinitions } from './tab-general';
import { buildExclusionsPage } from './tab-exclusions';
import { buildCharacterReplacementsPage } from './tab-replace-characters';
import { buildCustomRulesPage } from './tab-custom-rules';
import { buildMarkupStrippingPage } from './tab-strip-markup';
import { buildAliasPage } from './tab-alias';
import { buildCommandsPage } from './tab-commands';
import { buildOtherPage } from './tab-other';

/**
 * Side effects that must run when a `control` writes a given key.
 *
 * The declarative API has no per-control onChange hook, but every `control`
 * write is routed through `setControlValue`, making it the one place these can
 * live. Cascades mutate settings directly and never re-enter `setControlValue`,
 * so there is no recursion and exactly one save per user action.
 */
const CASCADES: Record<string, (plugin: FirstLineIsTitlePlugin) => void> = {
  'replaceCharacters.enableForbiddenCharReplacements': (plugin) => {
    const { settings } = plugin;
    if (!settings.replaceCharacters.enableForbiddenCharReplacements) return;
    if (settings.core.hasEnabledForbiddenChars) return;

    for (const key of [...PRIMARY_CHAR_KEYS, ...WINDOWS_ANDROID_CHAR_KEYS]) {
      settings.replaceCharacters.charReplacements[key].enabled = true;
    }
    settings.core.hasEnabledForbiddenChars = true;
  },

  'customRules.enableCustomReplacements': (plugin) => {
    const { settings } = plugin;
    if (!settings.customRules.enableCustomReplacements) {
      settings.markupStripping.applyCustomRulesInAlias = false;
      return;
    }
    if (settings.core.hasEnabledCustomReplacements) return;
    for (const replacement of settings.customRules.customReplacements) {
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
    if (settings.customRules.enableCustomReplacements) {
      settings.markupStripping.applyCustomRulesInAlias = true;
    }
    settings.core.hasEnabledAliases = true;
  },

  'aliases.hideAliasProperty': (plugin) => plugin.updatePropertyVisibility?.(),
  'aliases.hideAliasInSidebar': (plugin) => plugin.updatePropertyVisibility?.(),
  'core.checkInterval': (plugin) =>
    plugin.editorLifecycle?.initializeCheckingSystem(),

  'core.verboseLogging': (plugin) => {
    const enabled = plugin.settings.core.verboseLogging;
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
  'replaceCharacters.enableForbiddenCharReplacements',
  'customRules.enableCustomReplacements',
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
      ...buildGeneralDefinitions(this.plugin, this),
      buildExclusionsPage(this.plugin, this),
      // Page-level actions close out the everyday settings, above Advanced.
      ...buildFooterDefinitions(this.plugin),
      {
        type: 'group',
        heading: t('settings.tabs.advancedGroup'),
        items: [
          buildAliasPage(this.plugin),
          buildCharacterReplacementsPage(this.plugin),
          buildCommandsPage(this.plugin),
          buildCustomRulesPage(this.plugin, this),
          buildMarkupStrippingPage(this.plugin),
          buildOtherPage(this.plugin, this),
        ],
      },
    ];
  }

  hide(): void {
    // Exclusion lists can accumulate duplicates and blank rows while being
    // edited; collapse them once the modal closes.
    if (deduplicateExclusions(this.plugin.settings)) {
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
