/**
 * Tests for FirstLineIsTitle.loadSettings.
 *
 * 4.0.0 dropped every per-key migration in favour of a one-time reset: stored data
 * whose `dataSchemaVersion` is not the current one is discarded and replaced with the
 * defaults. These cover both sides of that branch, and that the reset result is
 * stamped with the current version so it does not reset again on the next load.
 */

import { describe, it, expect, vi } from 'vitest';
import type { App, PluginManifest } from 'obsidian';
import FirstLineIsTitle from '../main';
import {
  CURRENT_DATA_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
} from '../src/constants';

type SettingsRecord = Record<string, Record<string, unknown>> & {
  dataSchemaVersion: number;
};

/** Runs loadSettings against the given data.json contents and returns the result. */
async function loadStoredSettings(stored: unknown): Promise<SettingsRecord> {
  const plugin = new FirstLineIsTitle({} as App, {} as PluginManifest);
  plugin.loadData = vi.fn().mockResolvedValue(stored);
  plugin.saveData = vi.fn().mockResolvedValue(undefined);

  await plugin.loadSettings();

  return plugin.settings as unknown as SettingsRecord;
}

describe('FirstLineIsTitle.loadSettings', () => {
  describe('schema-version reset', () => {
    it('discards stored settings when dataSchemaVersion is absent', async () => {
      const settings = await loadStoredSettings({
        core: { charCount: 42, renameAutomatically: false },
        exclusions: { excludedFolders: ['Notes'] },
      });

      expect(settings.core.charCount).toBe(DEFAULT_SETTINGS.core.charCount);
      expect(settings.core.renameAutomatically).toBe(
        DEFAULT_SETTINGS.core.renameAutomatically
      );
      expect(settings.exclusions.excludedFolders).toEqual(
        DEFAULT_SETTINGS.exclusions.excludedFolders
      );
    });

    it('discards stored settings when dataSchemaVersion is an older number', async () => {
      const settings = await loadStoredSettings({
        dataSchemaVersion: 3,
        core: { charCount: 42 },
      });

      expect(settings.core.charCount).toBe(DEFAULT_SETTINGS.core.charCount);
    });

    it('discards stored settings when dataSchemaVersion is a newer number', async () => {
      const settings = await loadStoredSettings({
        dataSchemaVersion: 5,
        core: { charCount: 42 },
      });

      expect(settings.core.charCount).toBe(DEFAULT_SETTINGS.core.charCount);
    });

    it('discards stored settings when dataSchemaVersion is the version as a string', async () => {
      // The comparison is strict, so a stringified version is a mismatch like any other
      const settings = await loadStoredSettings({
        dataSchemaVersion: '4',
        core: { charCount: 42 },
      });

      expect(settings.core.charCount).toBe(DEFAULT_SETTINGS.core.charCount);
    });

    it('drops flat legacy top-level keys rather than carrying them forward', async () => {
      // Pre-nesting data.json files stored settings flat alongside the nested sections;
      // deepMerge would copy any survivor back into data.json on the next save.
      const settings = await loadStoredSettings({
        excludedFolders: ['Templates'],
        charCount: 60,
        safewords: [{ text: 'keep' }],
        commandVisibility: { renameCurrentFile: false },
      });

      expect('excludedFolders' in settings).toBe(false);
      expect('charCount' in settings).toBe(false);
      expect('safewords' in settings).toBe(false);
      expect('commandVisibility' in settings).toBe(false);
    });

    it('resets the exclusion-setup flag so auto-detection runs again', async () => {
      const settings = await loadStoredSettings({
        core: { hasSetupExclusions: true },
      });

      expect(settings.core.hasSetupExclusions).toBe(false);
    });

    it('starts from the defaults when there is no stored data at all', async () => {
      const settings = await loadStoredSettings(null);

      expect(settings.core.charCount).toBe(DEFAULT_SETTINGS.core.charCount);
      expect(settings.dataSchemaVersion).toBe(CURRENT_DATA_SCHEMA_VERSION);
    });

    it('does not hand out the shared DEFAULT_SETTINGS object', async () => {
      // Settings are mutated in place (osPreset on every load), so a shared reference
      // would leak one vault's state into the module-level defaults.
      const settings = await loadStoredSettings({});

      expect(settings).not.toBe(DEFAULT_SETTINGS);
      expect(settings.core).not.toBe(DEFAULT_SETTINGS.core);
      expect(settings.exclusions).not.toBe(DEFAULT_SETTINGS.exclusions);
    });
  });

  describe('current-schema merge', () => {
    it('preserves stored values when dataSchemaVersion matches', async () => {
      const settings = await loadStoredSettings({
        dataSchemaVersion: CURRENT_DATA_SCHEMA_VERSION,
        core: { charCount: 42, renameAutomatically: false },
        exclusions: { excludedFolders: ['Notes'] },
      });

      expect(settings.core.charCount).toBe(42);
      expect(settings.core.renameAutomatically).toBe(false);
      expect(settings.exclusions.excludedFolders).toEqual(['Notes']);
    });

    it('fills unstored keys from the defaults', async () => {
      const settings = await loadStoredSettings({
        dataSchemaVersion: CURRENT_DATA_SCHEMA_VERSION,
        core: { charCount: 42 },
      });

      expect(settings.core.charCount).toBe(42);
      expect(settings.core.insertTitle).toBe(DEFAULT_SETTINGS.core.insertTitle);
      expect(settings.aliases.aliasPropertyKey).toBe(
        DEFAULT_SETTINGS.aliases.aliasPropertyKey
      );
    });

    it('keeps the exclusion-setup flag that was already set', async () => {
      const settings = await loadStoredSettings({
        dataSchemaVersion: CURRENT_DATA_SCHEMA_VERSION,
        core: { hasSetupExclusions: true },
      });

      expect(settings.core.hasSetupExclusions).toBe(true);
    });
  });

  describe('reset result', () => {
    it('carries the current dataSchemaVersion after a reset', async () => {
      const settings = await loadStoredSettings({
        core: { charCount: 42 },
      });

      expect(settings.dataSchemaVersion).toBe(CURRENT_DATA_SCHEMA_VERSION);
    });

    it('does not reset a second time once the version has been written', async () => {
      // Feeding the reset result back in is what the next plugin load does, so a value
      // stored after the reset must survive it.
      const reset = await loadStoredSettings({ core: { charCount: 42 } });
      reset.core.charCount = 42;

      const reloaded = await loadStoredSettings(reset);

      expect(reloaded.core.charCount).toBe(42);
      expect(reloaded.dataSchemaVersion).toBe(CURRENT_DATA_SCHEMA_VERSION);
    });
  });
});

describe('pre-4.0.0 settings backup', () => {
  /** loadSettings against a stubbed vault, reporting what it wrote where. */
  async function loadWithAdapter(
    stored: unknown,
    opts: {
      readFails?: boolean;
      createFails?: boolean;
      dir?: string | undefined;
    } = {}
  ) {
    const writes: Record<string, string> = {};
    const adapter = {
      read: vi.fn(async (p: string) => {
        if (opts.readFails) throw new Error('unreadable');
        return JSON.stringify(stored);
      }),
      write: vi.fn(async (p: string, data: string) => {
        writes[p] = data;
      }),
    };
    const create = vi.fn(async (p: string, data: string) => {
      if (opts.createFails) throw new Error('File already exists.');
      writes[p] = data;
      return { path: p };
    });
    const app = { vault: { adapter, create } } as unknown as App;
    const manifest = {
      dir: 'dir' in opts ? opts.dir : '.obsidian/plugins/first-line-is-title',
    } as PluginManifest;

    const plugin = new FirstLineIsTitle(app, manifest);
    // The mocked Plugin base ignores its constructor arguments and builds its
    // own app/manifest, so these have to be assigned after construction.
    plugin.app = app;
    plugin.manifest = manifest;
    plugin.loadData = vi.fn().mockResolvedValue(stored);
    plugin.saveData = vi.fn().mockResolvedValue(undefined);
    await plugin.loadSettings();
    return { plugin, writes, adapter, create };
  }

  /** `first-line-is-title-settings-YYYYMMDD-HHmmss.json`, at the vault root. */
  const BACKUP_NAME = /^first-line-is-title-settings-\d{8}-\d{6}\.json$/;

  it('copies data.json to the vault root before discarding a pre-4.0.0 file', async () => {
    const { writes } = await loadWithAdapter({
      renameNotes: 'automatically',
      core: { charCount: 42 },
    });

    const [path, contents] = Object.entries(writes)[0];
    // Vault root, not the plugin folder: a backup under .obsidian/ is one the user
    // cannot open from inside their own vault.
    expect(path).toMatch(BACKUP_NAME);
    expect(contents).toContain('renameNotes');
  });

  it('copies the prior file verbatim rather than as a transfer payload', async () => {
    // Every pre-4.0.0 key was renamed, and a transfer payload only ever visits keys the
    // current defaults still have — so a diff would drop exactly what this preserves.
    const stored = { renameNotes: 'automatically', charCount: 42 };
    const { writes } = await loadWithAdapter(stored);

    expect(Object.values(writes)[0]).toBe(JSON.stringify(stored));
  });

  it('writes no backup for a genuinely new install', async () => {
    // Nothing stored means nothing to lose; a backup here would be an empty file
    // and would wrongly make a new user look like an upgrader.
    const { create } = await loadWithAdapter({});
    expect(create).not.toHaveBeenCalled();
  });

  it('writes no backup when the stored file is already current', async () => {
    const { create } = await loadWithAdapter({
      dataSchemaVersion: CURRENT_DATA_SCHEMA_VERSION,
      core: { charCount: 42 },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('still resets when the backup cannot be read', async () => {
    // Losing the backup must not block the reset, or a corrupt data.json would
    // wedge the plugin on every load.
    const { plugin } = await loadWithAdapter(
      { renameNotes: 'automatically', core: { charCount: 42 } },
      { readFails: true }
    );
    expect(plugin.settings.core.charCount).toBe(
      DEFAULT_SETTINGS.core.charCount
    );
  });

  it('still resets when the backup cannot be written', async () => {
    const { plugin } = await loadWithAdapter(
      { renameNotes: 'automatically', core: { charCount: 42 } },
      { createFails: true }
    );
    expect(plugin.settings.dataSchemaVersion).toBe(CURRENT_DATA_SCHEMA_VERSION);
  });

  it('suffixes the name rather than giving up when the first one is taken', async () => {
    // Nothing stored means loadSettings writes no backup, so the plugin here is just a
    // vehicle for calling the writer directly.
    const { plugin } = await loadWithAdapter({});
    // `vault.create` throws on an existing path; only the unsuffixed name is taken.
    const create = vi.fn(async (path: string) => {
      if (/-\d{6}\.json$/.test(path)) throw new Error('File already exists.');
      return { path };
    });
    (plugin.app.vault as unknown as { create: unknown }).create = create;

    expect(await plugin.writeSettingsBackup('{}')).toMatch(
      /^first-line-is-title-settings-\d{8}-\d{6}-1\.json$/
    );
  });

  it('resets without a backup when the plugin folder is unknown', async () => {
    const { plugin, adapter } = await loadWithAdapter(
      { renameNotes: 'automatically', core: { charCount: 42 } },
      { dir: undefined }
    );
    expect(adapter.read).not.toHaveBeenCalled();
    expect(plugin.settings.dataSchemaVersion).toBe(CURRENT_DATA_SCHEMA_VERSION);
  });
});
