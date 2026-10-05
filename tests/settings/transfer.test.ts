/**
 * Tests for the settings transfer format.
 *
 * A transfer file carries a diff against DEFAULT_SETTINGS, not a whole-object dump, so
 * the two halves have to agree: what the diff omits, the merge has to restore from the
 * defaults. These cover that round trip plus the guards that stop a hand-edited payload
 * from writing a shape the plugin cannot read back.
 */

import { describe, it, expect } from 'vitest';
import {
  applySettingsTransfer,
  createSettingsTransfer,
  createSettingsTransferFilename,
  createSettingsTransferJson,
  SettingsTransfer,
} from '../../src/settings/transfer';
import {
  CURRENT_DATA_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
} from '../../src/constants';
import { createTestSettings } from '../testUtils';
import { PluginSettings } from '../../src/types';

/** Wraps a raw payload in an envelope, the way a hand-edited file would arrive. */
function transferOf(settings: Record<string, unknown>): SettingsTransfer {
  return {
    plugin: 'first-line-is-title',
    dataSchemaVersion: CURRENT_DATA_SCHEMA_VERSION,
    settings,
  };
}

describe('createSettingsTransfer', () => {
  it('round-trips every mutated setting back to the same values', () => {
    const settings = createTestSettings({
      core: { charCount: 42, renameAutomatically: false },
      exclusions: { excludedFolders: ['Notes', 'Templates'] },
      aliases: { enableAliases: true, aliasPropertyKey: 'alias' },
      characterReplacements: {
        charReplacements: { colon: { replacement: '-', enabled: true } },
      },
    });

    const restored = applySettingsTransfer(createSettingsTransfer(settings));

    expect(restored).toEqual(settings);
  });

  it('omits settings left at their defaults', () => {
    const transfer = createSettingsTransfer(
      createTestSettings({ core: { charCount: 42 } })
    );

    expect(transfer.settings.exclusions).toBeUndefined();
    expect(transfer.settings.aliases).toBeUndefined();
  });

  it('carries only the changed leaf of a nested branch', () => {
    const transfer = createSettingsTransfer(
      createTestSettings({ core: { charCount: 42 } })
    );

    expect(transfer.settings.core).toEqual({ charCount: 42 });
  });

  it('carries a changed array whole rather than by element', () => {
    // The rules array differs from the default in one field of one element; arrays are
    // replaced wholesale on merge, so a partial copy would drop the other rule.
    const settings = createTestSettings();
    settings.customReplacements.rules[0].enabled = true;

    const transfer = createSettingsTransfer(settings);

    expect(transfer.settings.customReplacements).toEqual({
      rules: settings.customReplacements.rules,
    });
  });

  it('stamps the envelope rather than the payload', () => {
    const transfer = createSettingsTransfer(createTestSettings());

    expect(transfer.plugin).toBe('first-line-is-title');
    expect(transfer.dataSchemaVersion).toBe(CURRENT_DATA_SCHEMA_VERSION);
    expect('dataSchemaVersion' in transfer.settings).toBe(false);
  });

  it('never puts dataSchemaVersion in the payload even when it differs', () => {
    // A settings object carrying a stale version is exactly what the payload must not
    // propagate: the next loadSettings() would discard everything on the strength of it.
    const settings = createTestSettings();
    (settings as unknown as Record<string, unknown>).dataSchemaVersion = 1;

    expect(
      'dataSchemaVersion' in createSettingsTransfer(settings).settings
    ).toBe(false);
  });
});

describe('createSettingsTransferJson', () => {
  it('serialises the envelope as parseable JSON', () => {
    const json = createSettingsTransferJson(
      createTestSettings({ core: { charCount: 42 } })
    );

    expect(JSON.parse(json)).toEqual({
      plugin: 'first-line-is-title',
      dataSchemaVersion: CURRENT_DATA_SCHEMA_VERSION,
      settings: { core: { charCount: 42 } },
    });
  });
});

describe('applySettingsTransfer', () => {
  it('restores a key the payload omits to its default', () => {
    const applied = applySettingsTransfer(
      transferOf({ core: { charCount: 42 } })
    );

    expect(applied.core.charCount).toBe(42);
    expect(applied.core.renameAutomatically).toBe(
      DEFAULT_SETTINGS.core.renameAutomatically
    );
    expect(applied.exclusions.excludedFolders).toEqual(
      DEFAULT_SETTINGS.exclusions.excludedFolders
    );
  });

  it('is a reset, not a patch: an omitted key does not keep the current value', () => {
    // Applying a payload built from one vault must not leave another vault's settings
    // half-merged, so the merge always starts from the defaults.
    const applied = applySettingsTransfer(transferOf({}));

    expect(applied).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps the default when a leaf type mismatches', () => {
    const applied = applySettingsTransfer(
      transferOf({ core: { charCount: 'lots' } })
    );

    expect(applied.core.charCount).toBe(DEFAULT_SETTINGS.core.charCount);
  });

  it('keeps the default when an array is supplied as a scalar', () => {
    // `typeof [] === 'object'` too, so array-ness is checked separately — without it a
    // string would reach every downstream read that expects a list.
    const applied = applySettingsTransfer(
      transferOf({ exclusions: { excludedFolders: 'Notes' } })
    );

    expect(applied.exclusions.excludedFolders).toEqual(
      DEFAULT_SETTINGS.exclusions.excludedFolders
    );
  });

  it('keeps the default branch when an object branch is supplied as a scalar', () => {
    const applied = applySettingsTransfer(transferOf({ exclusions: 'none' }));

    expect(applied.exclusions).toEqual(DEFAULT_SETTINGS.exclusions);
  });

  it('ignores dataSchemaVersion supplied inside the payload', () => {
    const applied = applySettingsTransfer(
      transferOf({ dataSchemaVersion: 1, core: { charCount: 42 } })
    );

    expect(applied.dataSchemaVersion).toBe(CURRENT_DATA_SCHEMA_VERSION);
    expect(applied.core.charCount).toBe(42);
  });

  it('returns a fresh object rather than the shared defaults', () => {
    // Settings are mutated in place, so handing back DEFAULT_SETTINGS or one of its
    // branches would leak the importing vault's state into the module-level defaults.
    const applied = applySettingsTransfer(transferOf({}));

    expect(applied).not.toBe(DEFAULT_SETTINGS);
    expect(applied.core).not.toBe(DEFAULT_SETTINGS.core);
    expect(applied.exclusions.excludedFolders).not.toBe(
      DEFAULT_SETTINGS.exclusions.excludedFolders
    );
  });

  it('does not alias the payload it was given', () => {
    const payload = { exclusions: { excludedFolders: ['Notes'] } };

    const applied: PluginSettings = applySettingsTransfer(transferOf(payload));
    applied.exclusions.excludedFolders.push('Templates');

    expect(payload.exclusions.excludedFolders).toEqual(['Notes']);
  });
});

describe('createSettingsTransferFilename', () => {
  it('formats the local date and time without separators Obsidian rejects', () => {
    const name = createSettingsTransferFilename(
      new Date(2026, 7, 20, 14, 5, 9)
    );

    expect(name).toBe('first-line-is-title-settings-20260820-140509.json');
  });

  it('contains no character forbidden in an Obsidian path', () => {
    // Obsidian's checkPath forbids * " \ / < > : | ? — a colon on every platform, which
    // is what rules out an ISO timestamp here.
    const name = createSettingsTransferFilename(new Date(2026, 0, 1, 0, 0, 0));

    expect(name).not.toMatch(/[*"\\/<>:|?]/);
  });
});
