/**
 * Tests for PluginInitializer.
 *
 * The forbidden-char first-enable cascade also exists in the settings tab, and
 * both latch on `core.hasEnabledForbiddenChars` — whichever fires first locks
 * the other out permanently. Parity between the two is asserted in
 * tests/settings/settings-main.test.ts; this file pins the load-time side.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App } from '../mockObsidian';
import { DEFAULT_SETTINGS } from '../../src/constants';
import { processForbiddenChars } from '../../src/utils/string-processing';
import type { PluginSettings } from '../../src/types';
import type { CharKey } from '../../src/types/char-replacement';

vi.mock('../../src/utils', () => ({
  verboseLog: vi.fn(),
}));

import { PluginInitializer } from '../../src/core/plugin-initializer';
import type { FirstLineIsTitlePlugin } from '../../src/settings/settings-base';

interface TestPlugin {
  app: App;
  settings: PluginSettings;
  saveSettings: ReturnType<typeof vi.fn>;
}

function makePlugin(): TestPlugin {
  return {
    app: new App(),
    settings: structuredClone(DEFAULT_SETTINGS) as PluginSettings,
    saveSettings: vi.fn().mockResolvedValue(undefined),
  };
}

function enabledCharKeys(settings: PluginSettings): CharKey[] {
  const { charReplacements } = settings.replaceCharacters;
  return (Object.keys(charReplacements) as CharKey[]).filter(
    (key) => charReplacements[key].enabled
  );
}

describe('PluginInitializer', () => {
  let plugin: TestPlugin;
  let initializer: PluginInitializer;

  beforeEach(() => {
    vi.clearAllMocks();
    plugin = makePlugin();
    initializer = new PluginInitializer(
      plugin as unknown as FirstLineIsTitlePlugin
    );
  });

  describe('initializeFirstEnableLogic — forbidden chars', () => {
    beforeEach(() => {
      plugin.settings.replaceCharacters.enableForbiddenCharReplacements = true;
      plugin.settings.core.hasEnabledForbiddenChars = false;
    });

    it('enables every forbidden char except backslash', async () => {
      await initializer.initializeFirstEnableLogic();

      expect(enabledCharKeys(plugin.settings).sort()).toEqual(
        [
          'asterisk',
          'caret',
          'colon',
          'dot',
          'greaterThan',
          'hash',
          'leftBracket',
          'lessThan',
          'pipe',
          'question',
          'quote',
          'rightBracket',
          'slash',
        ].sort()
      );
    });

    it('leaves backslash off so it keeps acting as an escape character', async () => {
      await initializer.initializeFirstEnableLogic();

      expect(
        plugin.settings.replaceCharacters.charReplacements.backslash.enabled
      ).toBe(false);
    });

    it('replaces rather than drops a Windows/Android-only character', async () => {
      await initializer.initializeFirstEnableLogic();

      // A forbidden char whose toggle is off is deleted outright, so the
      // Windows/Android keys have to be part of the cascade on every OS.
      expect(processForbiddenChars('What? Yes', plugin.settings)).toBe(
        'What？Yes'
      );
    });

    it('sets the latch and persists once', async () => {
      await initializer.initializeFirstEnableLogic();

      expect(plugin.settings.core.hasEnabledForbiddenChars).toBe(true);
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    it('does nothing once the latch is set', async () => {
      plugin.settings.core.hasEnabledForbiddenChars = true;
      const before = enabledCharKeys(plugin.settings);

      await initializer.initializeFirstEnableLogic();

      expect(enabledCharKeys(plugin.settings)).toEqual(before);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
    });

    it('does nothing while the master toggle is off', async () => {
      plugin.settings.replaceCharacters.enableForbiddenCharReplacements = false;
      const before = enabledCharKeys(plugin.settings);

      await initializer.initializeFirstEnableLogic();

      expect(enabledCharKeys(plugin.settings)).toEqual(before);
      expect(plugin.settings.core.hasEnabledForbiddenChars).toBe(false);
    });
  });

  describe('initializeFirstEnableLogic — custom replacements', () => {
    beforeEach(() => {
      plugin.settings.customRules.enableCustomReplacements = true;
      plugin.settings.core.hasEnabledCustomReplacements = false;
      plugin.settings.customRules.customReplacements.forEach((rule) => {
        rule.enabled = false;
      });
    });

    it('bulk-enables every rule and sets the latch', async () => {
      await initializer.initializeFirstEnableLogic();

      expect(
        plugin.settings.customRules.customReplacements.every((r) => r.enabled)
      ).toBe(true);
      expect(plugin.settings.core.hasEnabledCustomReplacements).toBe(true);
    });

    it('does nothing once the latch is set', async () => {
      plugin.settings.core.hasEnabledCustomReplacements = true;

      await initializer.initializeFirstEnableLogic();

      expect(
        plugin.settings.customRules.customReplacements.some((r) => r.enabled)
      ).toBe(false);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
    });
  });

  describe('initializeFirstEnableLogic — persistence', () => {
    it('saves once even when both cascades fire in the same run', async () => {
      plugin.settings.replaceCharacters.enableForbiddenCharReplacements = true;
      plugin.settings.core.hasEnabledForbiddenChars = false;
      plugin.settings.customRules.enableCustomReplacements = true;
      plugin.settings.core.hasEnabledCustomReplacements = false;

      await initializer.initializeFirstEnableLogic();

      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    it('does not save when neither cascade applies', async () => {
      await initializer.initializeFirstEnableLogic();

      expect(plugin.saveSettings).not.toHaveBeenCalled();
    });
  });

  describe('checkFirstTimeExclusionsSetup', () => {
    function mockConfigFiles(files: Record<string, unknown>): void {
      plugin.app.vault.adapter.read = vi.fn(async (path: string) => {
        if (!(path in files)) throw new Error(`missing ${path}`);
        return JSON.stringify(files[path]);
      });
    }

    function mockLoadedPlugins(...ids: string[]): void {
      plugin.app.plugins.getPlugin = vi.fn((id: string) =>
        ids.includes(id) ? { _loaded: true } : null
      );
    }

    it('returns early once setup has already run', async () => {
      plugin.settings.core.hasSetupExclusions = true;

      await initializer.checkFirstTimeExclusionsSetup();

      expect(plugin.app.vault.adapter.read).not.toHaveBeenCalled();
      expect(plugin.saveSettings).not.toHaveBeenCalled();
    });

    it('marks setup complete so it never runs twice', async () => {
      await initializer.checkFirstTimeExclusionsSetup();

      expect(plugin.settings.core.hasSetupExclusions).toBe(true);
    });

    it('excludes Excalidraw drawings when the plugin is loaded', async () => {
      mockLoadedPlugins('obsidian-excalidraw-plugin');

      await initializer.checkFirstTimeExclusionsSetup();

      expect(plugin.settings.exclusions.excludedProperties).toContainEqual({
        key: 'excalidraw-plugin',
        value: 'parsed',
      });
    });

    it('leaves excluded properties alone when Excalidraw is absent', async () => {
      const before = structuredClone(
        plugin.settings.exclusions.excludedProperties
      );

      await initializer.checkFirstTimeExclusionsSetup();

      expect(plugin.settings.exclusions.excludedProperties).toEqual(before);
    });

    it('excludes the core Templates folder when that plugin is enabled', async () => {
      mockConfigFiles({
        '.obsidian/core-plugins.json': { templates: true },
        '.obsidian/templates.json': { folder: 'Templates' },
      });

      await initializer.checkFirstTimeExclusionsSetup();

      expect(plugin.settings.exclusions.excludedFolders).toContain('Templates');
    });

    it('ignores the Templates folder when the core plugin is disabled', async () => {
      mockConfigFiles({
        '.obsidian/core-plugins.json': { templates: false },
        '.obsidian/templates.json': { folder: 'Templates' },
      });

      await initializer.checkFirstTimeExclusionsSetup();

      expect(plugin.settings.exclusions.excludedFolders).not.toContain(
        'Templates'
      );
    });

    it('excludes the Templater folder when Templater is loaded', async () => {
      mockLoadedPlugins('templater-obsidian');
      mockConfigFiles({
        '.obsidian/plugins/templater-obsidian/data.json': {
          templates_folder: 'Meta/Templater',
        },
      });

      await initializer.checkFirstTimeExclusionsSetup();

      expect(plugin.settings.exclusions.excludedFolders).toContain(
        'Meta/Templater'
      );
    });

    it('issues the config reads together instead of chaining them', async () => {
      const requested: string[] = [];
      const pending: (() => void)[] = [];
      plugin.app.vault.adapter.read = vi.fn((path: string) => {
        requested.push(path);
        return new Promise<string>((resolve) =>
          pending.push(() => resolve('{}'))
        );
      });
      mockLoadedPlugins('templater-obsidian');

      const setup = initializer.checkFirstTimeExclusionsSetup();
      // Not awaited yet: every read must already be in flight.
      expect(requested).toHaveLength(3);

      pending.forEach((resolve) => resolve());
      await setup;
    });

    it('does not read the Templater config when Templater is absent', async () => {
      mockConfigFiles({ '.obsidian/core-plugins.json': { templates: false } });

      await initializer.checkFirstTimeExclusionsSetup();

      expect(plugin.app.vault.adapter.read).not.toHaveBeenCalledWith(
        expect.stringContaining('templater-obsidian')
      );
    });

    it('does not add the same folder twice when both plugins share one', async () => {
      mockLoadedPlugins('templater-obsidian');
      mockConfigFiles({
        '.obsidian/core-plugins.json': { templates: true },
        '.obsidian/templates.json': { folder: 'Templates' },
        '.obsidian/plugins/templater-obsidian/data.json': {
          templates_folder: 'Templates',
        },
      });

      await initializer.checkFirstTimeExclusionsSetup();

      expect(
        plugin.settings.exclusions.excludedFolders.filter(
          (folder) => folder === 'Templates'
        )
      ).toHaveLength(1);
    });
  });
});
