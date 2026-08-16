/**
 * Tests for FirstLineIsTitle.loadSettings.
 *
 * Covers the migrations that rewrite stored data before defaults are merged in.
 * They have to run pre-merge because deepMerge copies stored keys the defaults
 * lack, so anything left behind is written back to data.json on the next save.
 */

import { describe, it, expect, vi } from 'vitest';
import type { App, PluginManifest } from 'obsidian';
import FirstLineIsTitle from '../main';

type SettingsRecord = Record<string, Record<string, unknown>>;

/** Runs loadSettings against the given data.json contents and returns the result. */
async function loadStoredSettings(stored: unknown): Promise<SettingsRecord> {
  const plugin = new FirstLineIsTitle({} as App, {} as PluginManifest);
  plugin.loadData = vi.fn().mockResolvedValue(stored);
  plugin.saveData = vi.fn().mockResolvedValue(undefined);

  await plugin.loadSettings();

  return plugin.settings as unknown as SettingsRecord;
}

describe('FirstLineIsTitle.loadSettings', () => {
  describe('removed-key migration', () => {
    it('strips core.preserveModificationDate', async () => {
      const settings = await loadStoredSettings({
        core: { preserveModificationDate: true },
      });

      expect('preserveModificationDate' in settings.core).toBe(false);
    });

    it('strips core.hasSetPropertyType', async () => {
      const settings = await loadStoredSettings({
        core: { hasSetPropertyType: false },
      });

      expect('hasSetPropertyType' in settings.core).toBe(false);
    });

    it('strips exclusions.includeSubfolders', async () => {
      const settings = await loadStoredSettings({
        exclusions: { includeSubfolders: true },
      });

      expect('includeSubfolders' in settings.exclusions).toBe(false);
    });

    it('strips exclusions.includeBodyTags', async () => {
      const settings = await loadStoredSettings({
        exclusions: { includeBodyTags: true },
      });

      expect('includeBodyTags' in settings.exclusions).toBe(false);
    });

    it('strips exclusions.includeNestedTags', async () => {
      const settings = await loadStoredSettings({
        exclusions: { includeNestedTags: true },
      });

      expect('includeNestedTags' in settings.exclusions).toBe(false);
    });

    it('strips every removed key from a single stored payload', async () => {
      const settings = await loadStoredSettings({
        core: { preserveModificationDate: true, hasSetPropertyType: true },
        exclusions: {
          includeSubfolders: true,
          includeBodyTags: true,
          includeNestedTags: true,
        },
      });

      expect(Object.keys(settings.core)).not.toContain(
        'preserveModificationDate'
      );
      expect(Object.keys(settings.core)).not.toContain('hasSetPropertyType');
      expect(Object.keys(settings.exclusions)).not.toContain(
        'includeSubfolders'
      );
      expect(Object.keys(settings.exclusions)).not.toContain('includeBodyTags');
      expect(Object.keys(settings.exclusions)).not.toContain(
        'includeNestedTags'
      );
    });

    it('is a no-op when no removed key is stored', async () => {
      const settings = await loadStoredSettings({
        core: { charCount: 42 },
        exclusions: { excludedFolders: ['Notes'] },
      });

      expect(settings.core.charCount).toBe(42);
      expect(settings.exclusions.excludedFolders).toEqual(['Notes']);
    });

    it('leaves unrelated stored keys untouched', async () => {
      const settings = await loadStoredSettings({
        core: {
          charCount: 42,
          preserveModificationDate: true,
          unknownFutureKey: 'kept',
        },
        exclusions: {
          includeBodyTags: true,
          excludedTags: ['project'],
        },
      });

      expect(settings.core.charCount).toBe(42);
      expect(settings.core.unknownFutureKey).toBe('kept');
      expect(settings.exclusions.excludedTags).toEqual(['project']);
    });

    it('keeps the identically named modal checkbox state', async () => {
      // core.modalCheckboxStates.folderRename.includeSubfolders is a live setting;
      // only the exclusions-level key of the same name was removed
      const settings = await loadStoredSettings({
        core: {
          modalCheckboxStates: { folderRename: { includeSubfolders: false } },
        },
        exclusions: { includeSubfolders: true },
      });

      const modalStates = settings.core.modalCheckboxStates as Record<
        string,
        Record<string, unknown>
      >;

      expect(modalStates.folderRename.includeSubfolders).toBe(false);
      expect('includeSubfolders' in settings.exclusions).toBe(false);
    });
  });
});
