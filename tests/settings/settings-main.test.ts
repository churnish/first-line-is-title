/**
 * Tests for the declarative settings tab (Obsidian 1.13+).
 *
 * Focus is `setControlValue`: the declarative API has no per-control onChange,
 * so this one method owns dot-path persistence, every cross-setting cascade,
 * and the choice between `update()` and `refreshDomState()`.
 *
 * That choice is load-bearing. `refreshDomState()` re-evaluates visible/disabled
 * predicates WITHOUT re-reading control values, so any cascade that force-writes
 * a sibling's value must use `update()` or that sibling keeps rendering a stale
 * value while the stored setting says otherwise.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App } from '../mockObsidian';
import { DEFAULT_SETTINGS } from '../../src/constants';
import type { PluginSettings } from '../../src/types';

vi.mock('../../src/i18n', () => ({
  t: vi.fn((key: string) => key),
  getCurrentLocale: vi.fn(() => 'en'),
}));

vi.mock('../../src/utils', () => ({
  deduplicateExclusions: vi.fn(() => false),
  detectOS: vi.fn(() => 'macOS'),
  verboseLog: vi.fn(),
}));

// Page builders are covered by their own tabs; stub them to isolate the shell.
vi.mock('../../src/settings/tab-general', () => ({
  buildGeneralDefinitions: vi.fn(() => []),
  buildFooterDefinitions: vi.fn(() => [
    { name: 'settings.general.renameAllNotes.name', render: vi.fn() },
    { name: '', render: vi.fn() },
  ]),
}));
vi.mock('../../src/settings/tab-exclusions', () => ({
  buildExclusionsPage: vi.fn(() => ({ type: 'page', name: 'Exclusions' })),
}));
vi.mock('../../src/settings/tab-replace-characters', () => ({
  buildCharacterReplacementsPage: vi.fn(() => ({
    type: 'page',
    name: 'Character replacements',
  })),
}));
vi.mock('../../src/settings/tab-custom-rules', () => ({
  buildCustomRulesPage: vi.fn(() => ({ type: 'page', name: 'Custom rules' })),
}));
vi.mock('../../src/settings/tab-strip-markup', () => ({
  buildMarkupStrippingPage: vi.fn(() => ({
    type: 'page',
    name: 'Markup stripping',
  })),
}));
vi.mock('../../src/settings/tab-alias', () => ({
  buildAliasPage: vi.fn(() => ({ type: 'page', name: 'Alias' })),
}));
vi.mock('../../src/settings/tab-commands', () => ({
  buildCommandsPage: vi.fn(() => ({ type: 'page', name: 'Commands' })),
}));
vi.mock('../../src/settings/tab-other', () => ({
  buildOtherPage: vi.fn(() => ({ type: 'page', name: 'Advanced' })),
}));

import { FirstLineIsTitleSettings } from '../../src/settings/settings-main';

interface TestPlugin {
  app: App;
  settings: PluginSettings;
  saveSettings: ReturnType<typeof vi.fn>;
  debugLog: ReturnType<typeof vi.fn>;
  updatePropertyVisibility: ReturnType<typeof vi.fn>;
  editorLifecycle: { initializeCheckingSystem: ReturnType<typeof vi.fn> };
}

function makePlugin(): TestPlugin {
  return {
    app: new App(),
    settings: structuredClone(DEFAULT_SETTINGS) as PluginSettings,
    saveSettings: vi.fn().mockResolvedValue(undefined),
    debugLog: vi.fn(),
    updatePropertyVisibility: vi.fn(),
    editorLifecycle: { initializeCheckingSystem: vi.fn() },
  };
}

describe('FirstLineIsTitleSettings', () => {
  let plugin: TestPlugin;
  let tab: FirstLineIsTitleSettings;
  let update: ReturnType<typeof vi.fn>;
  let refreshDomState: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    plugin = makePlugin();
    tab = new FirstLineIsTitleSettings(plugin.app as never, plugin as never);
    update = tab.update as unknown as ReturnType<typeof vi.fn>;
    refreshDomState = tab.refreshDomState as unknown as ReturnType<
      typeof vi.fn
    >;
    update.mockClear();
    refreshDomState.mockClear();
  });

  describe('getSettingDefinitions', () => {
    const topLevel = () =>
      tab
        .getSettingDefinitions()
        .filter((def) => (def as { type?: string }).type === 'page')
        .map((def) => (def as { name?: string }).name);

    const advancedGroup = () =>
      tab
        .getSettingDefinitions()
        .find((def) => (def as { type?: string }).type === 'group') as
        | { heading?: string; items?: { name?: string }[] }
        | undefined;

    it('keeps only Exclusions as a top-level page', () => {
      expect(topLevel()).toEqual(['Exclusions']);
    });

    it('nests the remaining six sections under the Advanced group', () => {
      const group = advancedGroup();
      expect(group?.heading).toBe('settings.tabs.advancedGroup');
      expect(group?.items?.map((i) => i.name)).toEqual([
        'Alias',
        'Character replacements',
        'Commands',
        'Custom rules',
        'Markup stripping',
        'Advanced',
      ]);
    });

    it('places the page-level actions above the Advanced group', () => {
      const defs = tab.getSettingDefinitions();
      const groupIndex = defs.findIndex(
        (def) => (def as { type?: string }).type === 'group'
      );
      const beforeGroup = defs.slice(groupIndex - 2, groupIndex);
      expect((beforeGroup[0] as { name?: string }).name).toBe(
        'settings.general.renameAllNotes.name'
      );
      // The feedback call to action is deliberately unnamed so it stays out of
      // the settings search index.
      expect((beforeGroup[1] as { name?: string }).name).toBe('');
    });
  });

  describe('getControlValue', () => {
    it('reads a nested key by dot-path', () => {
      plugin.settings.core.renameOnSave = true;
      expect(tab.getControlValue('core.renameOnSave')).toBe(true);
    });

    it('returns undefined for an unknown path rather than throwing', () => {
      expect(tab.getControlValue('core.nope.deeper')).toBeUndefined();
    });
  });

  describe('setControlValue', () => {
    it('persists a nested key by dot-path and saves once', async () => {
      await tab.setControlValue('core.renameOnSave', true);
      expect(plugin.settings.core.renameOnSave).toBe(true);
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    it('refreshes DOM state only, when no value-mutating cascade applies', async () => {
      await tab.setControlValue('core.renameOnSave', true);
      expect(refreshDomState).toHaveBeenCalledTimes(1);
      expect(update).not.toHaveBeenCalled();
    });

    it('still saves exactly once when a cascade mutates several settings', async () => {
      await tab.setControlValue('customRules.enableCustomReplacements', false);
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });
  });

  describe('force-off cascades', () => {
    it('preserves convertReplacementCharactersInTitle when char replacements go off', async () => {
      plugin.settings.core.convertReplacementCharactersInTitle = true;
      await tab.setControlValue(
        'replaceCharacters.enableForbiddenCharReplacements',
        false
      );
      expect(plugin.settings.core.convertReplacementCharactersInTitle).toBe(
        true
      );
    });

    it('clears applyCustomRulesInAlias when custom rules go off', async () => {
      plugin.settings.markupStripping.applyCustomRulesInAlias = true;
      await tab.setControlValue('customRules.enableCustomReplacements', false);
      expect(plugin.settings.markupStripping.applyCustomRulesInAlias).toBe(
        false
      );
    });

    it('re-renders via update() so force-written siblings never show a stale value', async () => {
      await tab.setControlValue('customRules.enableCustomReplacements', false);
      expect(update).toHaveBeenCalledTimes(1);
      expect(refreshDomState).not.toHaveBeenCalled();
    });
  });

  describe('first-enable cascades', () => {
    it('bulk-enables custom replacements the first time they are switched on', async () => {
      plugin.settings.core.hasEnabledCustomReplacements = false;
      plugin.settings.customRules.customReplacements.forEach((rule) => {
        rule.enabled = false;
      });

      await tab.setControlValue('customRules.enableCustomReplacements', true);

      expect(
        plugin.settings.customRules.customReplacements.every((r) => r.enabled)
      ).toBe(true);
      expect(plugin.settings.core.hasEnabledCustomReplacements).toBe(true);
    });

    it('does not bulk-enable again once the latch is set', async () => {
      plugin.settings.core.hasEnabledCustomReplacements = true;
      plugin.settings.customRules.customReplacements.forEach((rule) => {
        rule.enabled = false;
      });

      await tab.setControlValue('customRules.enableCustomReplacements', true);

      expect(
        plugin.settings.customRules.customReplacements.some((r) => r.enabled)
      ).toBe(false);
    });

    it('seeds alias defaults the first time aliases are switched on', async () => {
      plugin.settings.core.hasEnabledAliases = false;
      plugin.settings.aliases.keepEmptyAliasProperty = false;
      plugin.settings.markupStripping.stripMarkupInAlias = false;

      await tab.setControlValue('aliases.enableAliases', true);

      expect(plugin.settings.aliases.keepEmptyAliasProperty).toBe(true);
      expect(plugin.settings.markupStripping.stripMarkupInAlias).toBe(true);
      expect(plugin.settings.core.hasEnabledAliases).toBe(true);
    });

    it('does not seed applyCustomRulesInAlias when custom rules are disabled', async () => {
      plugin.settings.core.hasEnabledAliases = false;
      plugin.settings.customRules.enableCustomReplacements = false;
      plugin.settings.markupStripping.applyCustomRulesInAlias = false;

      await tab.setControlValue('aliases.enableAliases', true);

      expect(plugin.settings.markupStripping.applyCustomRulesInAlias).toBe(
        false
      );
    });
  });

  describe('side-effect cascades', () => {
    it('refreshes property visibility when the hiding mode changes', async () => {
      await tab.setControlValue('aliases.hideAliasProperty', 'always');
      expect(plugin.updatePropertyVisibility).toHaveBeenCalledTimes(1);
    });

    it('refreshes property visibility when sidebar hiding changes', async () => {
      await tab.setControlValue('aliases.hideAliasInSidebar', true);
      expect(plugin.updatePropertyVisibility).toHaveBeenCalledTimes(1);
    });

    it('reinitialises the checking system when the interval changes', async () => {
      await tab.setControlValue('core.checkInterval', 750);
      expect(
        plugin.editorLifecycle.initializeCheckingSystem
      ).toHaveBeenCalledTimes(1);
      expect(plugin.settings.core.checkInterval).toBe(750);
    });
  });
});
