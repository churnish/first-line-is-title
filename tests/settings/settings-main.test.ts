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
import { processForbiddenChars } from '../../src/utils/string-processing';
import type { PluginSettings } from '../../src/types';
import type { CharKey } from '../../src/types/char-replacement';

vi.mock('../../src/i18n', () => ({
  t: vi.fn((key: string) => key),
  getCurrentLocale: vi.fn(() => 'en'),
}));

vi.mock('../../src/utils', () => ({
  normalizeExclusionLists: vi.fn(() => false),
  detectOS: vi.fn(() => 'macOS'),
  verboseLog: vi.fn(),
}));

// Page builders are covered by their own tabs; stub them to isolate the shell.
vi.mock('../../src/settings/tab-general', () => ({
  buildGeneralDefinitions: vi.fn(() => []),
  buildNoteCreationGroup: vi.fn(() => ({
    type: 'group',
    heading: 'settings.tabs.noteCreationGroup',
    items: [{ name: 'settings.general.insertTitleOnCreation.name' }],
  })),
  buildFooterDefinitions: vi.fn(() => [
    { name: 'settings.general.renameAllNotes.name', render: vi.fn() },
  ]),
  buildSupportGroup: vi.fn(() => ({
    type: 'group',
    items: [{ name: 'settings.general.sendFeedback.name', render: vi.fn() }],
  })),
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
import { PluginInitializer } from '../../src/core/plugin-initializer';
import { normalizeExclusionLists } from '../../src/utils';
import { buildSupportGroup } from '../../src/settings/tab-general';

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

    // Matched by heading, not by type — other groups sit alongside this one.
    const ADVANCED_HEADING = 'settings.tabs.advancedGroup';

    const advancedGroupIndex = () =>
      tab
        .getSettingDefinitions()
        .findIndex(
          (def) => (def as { heading?: string }).heading === ADVANCED_HEADING
        );

    const advancedGroup = () =>
      tab.getSettingDefinitions()[advancedGroupIndex()] as
        | { heading?: string; items?: { name?: string }[] }
        | undefined;

    it('keeps only Exclusions as a top-level page', () => {
      expect(topLevel()).toEqual(['Exclusions']);
    });

    it('nests the remaining six sections under the Advanced group', () => {
      const group = advancedGroup();
      expect(group?.heading).toBe(ADVANCED_HEADING);
      expect(group?.items?.map((i) => i.name)).toEqual([
        'Alias',
        'Character replacements',
        'Commands',
        'Custom rules',
        'Markup stripping',
        'Advanced',
      ]);
    });

    it('orders the page-level action, Exclusions and Note creation between General and Advanced', () => {
      const defs = tab.getSettingDefinitions();
      const advanced = advancedGroupIndex();

      expect((defs[advanced - 1] as { heading?: string }).heading).toBe(
        'settings.tabs.noteCreationGroup'
      );
      expect((defs[advanced - 2] as { name?: string }).name).toBe('Exclusions');
      expect((defs[advanced - 3] as { name?: string }).name).toBe(
        'settings.general.renameAllNotes.name'
      );
    });

    it('puts the feedback group last', () => {
      const defs = tab.getSettingDefinitions();
      // tab-general is mocked here, so asserting the group's shape would only
      // re-read this file's own fixture. Placement is the one thing
      // settings-main actually decides; the shape is pinned in
      // tab-general.test.ts against the real builder.
      expect(defs[defs.length - 1]).toBe(
        vi.mocked(buildSupportGroup).mock.results[0].value
      );
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

  describe('first-enable cascade parity', () => {
    // The same cascade also runs at plugin load, and both latch on
    // core.hasEnabledForbiddenChars — whichever fires first permanently locks
    // the other out, so the two must enable an identical key set.
    const enabledCharKeys = (settings: PluginSettings): CharKey[] => {
      const { charReplacements } = settings.replaceCharacters;
      return (Object.keys(charReplacements) as CharKey[])
        .filter((key) => charReplacements[key].enabled)
        .sort();
    };

    async function afterSettingsToggle(): Promise<PluginSettings> {
      const fresh = makePlugin();
      const freshTab = new FirstLineIsTitleSettings(
        fresh.app as never,
        fresh as never
      );
      await freshTab.setControlValue(
        'replaceCharacters.enableForbiddenCharReplacements',
        true
      );
      return fresh.settings;
    }

    async function afterPluginLoad(): Promise<PluginSettings> {
      const fresh = makePlugin();
      fresh.settings.replaceCharacters.enableForbiddenCharReplacements = true;
      await new PluginInitializer(fresh as never).initializeFirstEnableLogic();
      return fresh.settings;
    }

    it('enables the same characters from either entry point', async () => {
      expect(enabledCharKeys(await afterSettingsToggle())).toEqual(
        enabledCharKeys(await afterPluginLoad())
      );
    });

    it('leaves backslash off from either entry point', async () => {
      for (const settings of [
        await afterSettingsToggle(),
        await afterPluginLoad(),
      ]) {
        expect(
          settings.replaceCharacters.charReplacements.backslash.enabled
        ).toBe(false);
      }
    });

    it('replaces rather than drops ? from either entry point', async () => {
      // A forbidden char whose toggle is off is deleted outright, so trimming
      // the Windows/Android keys out of the cascade would lose them silently.
      for (const settings of [
        await afterSettingsToggle(),
        await afterPluginLoad(),
      ]) {
        expect(processForbiddenChars('What? Yes', settings)).toBe('What？Yes');
      }
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

  describe('hide', () => {
    it('saves and rebuilds the definitions when exclusions were pruned', () => {
      vi.mocked(normalizeExclusionLists).mockReturnValueOnce(true);

      tab.hide();

      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
      // List items are mapped at definition time, so the pruned arrays only
      // reach the DOM once the definitions are rebuilt.
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the exclusion lists were already clean', () => {
      vi.mocked(normalizeExclusionLists).mockReturnValueOnce(false);

      tab.hide();

      expect(plugin.saveSettings).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });
  });
});
