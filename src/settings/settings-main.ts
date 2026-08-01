import {
  PluginSettingTab,
  App,
  Plugin,
  Notice,
  SettingDefinitionItem,
} from 'obsidian';
import { FirstLineIsTitlePlugin } from './settings-base';
import { t } from '../i18n';
import { deduplicateExclusions, detectOS } from '../utils';
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
    if (!settings.replaceCharacters.enableForbiddenCharReplacements) {
      settings.core.convertReplacementCharactersInTitle = false;
      return;
    }
    if (settings.core.hasEnabledForbiddenChars) return;

    for (const key of PRIMARY_CHAR_KEYS) {
      settings.replaceCharacters.charReplacements[key].enabled = true;
    }
    settings.core.hasEnabledForbiddenChars = true;

    // Windows users get the Windows/Android set switched on in the same step
    if (detectOS() === 'Windows' && !settings.core.hasEnabledWindowsAndroid) {
      settings.replaceCharacters.windowsAndroidEnabled = true;
      for (const key of WINDOWS_ANDROID_CHAR_KEYS) {
        settings.replaceCharacters.charReplacements[key].enabled = true;
      }
      settings.core.hasEnabledWindowsAndroid = true;
    }
  },

  'replaceCharacters.windowsAndroidEnabled': (plugin) => {
    const { settings } = plugin;
    if (
      !settings.replaceCharacters.windowsAndroidEnabled ||
      settings.core.hasEnabledWindowsAndroid
    ) {
      return;
    }
    for (const key of WINDOWS_ANDROID_CHAR_KEYS) {
      settings.replaceCharacters.charReplacements[key].enabled = true;
    }
    settings.core.hasEnabledWindowsAndroid = true;
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

  'markupStripping.enableStripMarkup': (plugin) => {
    const { settings } = plugin;
    if (settings.markupStripping.enableStripMarkup) return;
    settings.markupStripping.stripMarkupInAlias = false;
    settings.markupStripping.applyCustomRulesAfterMarkupStripping = false;
  },

  'exclusions.enableFileNameExclusions': (plugin) => {
    const { settings } = plugin;
    if (
      !settings.exclusions.enableFileNameExclusions ||
      settings.core.hasEnabledFileNameExclusions
    ) {
      return;
    }
    for (const exclusion of settings.exclusions.fileNameExclusions) {
      exclusion.enabled = true;
    }
    settings.core.hasEnabledFileNameExclusions = true;
  },

  'aliases.enableAliases': (plugin) => {
    const { settings } = plugin;
    if (!settings.aliases.enableAliases || settings.core.hasEnabledAliases) {
      return;
    }
    settings.aliases.keepEmptyAliasProperty = true;
    if (settings.markupStripping.enableStripMarkup) {
      settings.markupStripping.stripMarkupInAlias = true;
    }
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
  'replaceCharacters.windowsAndroidEnabled',
  'customRules.enableCustomReplacements',
  'markupStripping.enableStripMarkup',
  'exclusions.enableFileNameExclusions',
  'aliases.enableAliases',
]);

export class FirstLineIsTitleSettings extends PluginSettingTab {
  plugin: FirstLineIsTitlePlugin;

  constructor(app: App, plugin: FirstLineIsTitlePlugin) {
    // PluginSettingTab expects Plugin, but we use minimal interface for flexibility
    super(app, plugin as unknown as Plugin);
    this.plugin = plugin;
    this.icon = 'file-type';
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
      new Notice(t('settings.errors.saveFailed'));
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
      buildCharacterReplacementsPage(this.plugin, this),
      buildCustomRulesPage(this.plugin, this),
      buildMarkupStrippingPage(this.plugin, this),
      buildAliasPage(this.plugin, this),
      buildCommandsPage(this.plugin, this),
      buildOtherPage(this.plugin, this),
      // Page-level actions sit below every section.
      ...buildFooterDefinitions(this.plugin),
    ];
  }

  hide(): void {
    // Exclusion lists can accumulate duplicates while being edited; collapse
    // them once the modal closes.
    if (deduplicateExclusions(this.plugin.settings)) {
      this.plugin.saveSettings().catch(() => {
        new Notice(t('settings.errors.saveFailed'));
      });
    }
    super.hide();
  }
}
