import { describe, it, expect } from 'vitest';
import { evaluateSettingsImport } from '../../src/settings/import-guard';
import { applySettingsTransfer } from '../../src/settings/transfer';
import { CURRENT_DATA_SCHEMA_VERSION } from '../../src/constants';

/** A well-formed envelope with the given payload. */
function envelope(settings: unknown): string {
  return JSON.stringify({
    plugin: 'first-line-is-title',
    dataSchemaVersion: CURRENT_DATA_SCHEMA_VERSION,
    settings,
  });
}

describe('evaluateSettingsImport', () => {
  it('accepts an envelope stamped with the current schema version', () => {
    const verdict = evaluateSettingsImport(
      envelope({ core: { renameAutomatically: false } })
    );

    expect(verdict.kind).toBe('accepted');
    if (verdict.kind === 'accepted') {
      expect(verdict.settings.plugin).toBe('first-line-is-title');
      expect(verdict.settings.dataSchemaVersion).toBe(
        CURRENT_DATA_SCHEMA_VERSION
      );
      expect(verdict.settings.settings).toEqual({
        core: { renameAutomatically: false },
      });
    }
  });

  it('accepts an envelope whose payload is empty', () => {
    // Exporting an untouched vault produces exactly this, and re-importing it is a
    // reset to defaults rather than a malformed file.
    expect(evaluateSettingsImport(envelope({})).kind).toBe('accepted');
  });

  it('refuses an envelope stamped with a different schema version', () => {
    const raw = JSON.stringify({
      plugin: 'first-line-is-title',
      dataSchemaVersion: CURRENT_DATA_SCHEMA_VERSION - 1,
      settings: { core: { renameAutomatically: false } },
    });

    expect(evaluateSettingsImport(raw).kind).toBe('incompatible-schema');
  });

  it('refuses an envelope with no schema version at all', () => {
    const raw = JSON.stringify({
      plugin: 'first-line-is-title',
      settings: { core: { renameAutomatically: false } },
    });

    expect(evaluateSettingsImport(raw).kind).toBe('incompatible-schema');
  });

  it('refuses an envelope naming another plugin', () => {
    const raw = JSON.stringify({
      plugin: 'notebook-navigator',
      dataSchemaVersion: CURRENT_DATA_SCHEMA_VERSION,
      settings: {},
    });

    expect(evaluateSettingsImport(raw).kind).toBe('incompatible-schema');
  });

  it('refuses an envelope with no plugin marker', () => {
    const raw = JSON.stringify({
      dataSchemaVersion: CURRENT_DATA_SCHEMA_VERSION,
      settings: {},
    });

    expect(evaluateSettingsImport(raw).kind).toBe('incompatible-schema');
  });

  it('refuses a bare settings object with no envelope around it', () => {
    // The pre-4.0.0 export format: a whole settings dump with no plugin marker and no
    // `settings` branch. It has no payload to merge, so it reads as malformed.
    const raw = JSON.stringify({
      dataSchemaVersion: CURRENT_DATA_SCHEMA_VERSION,
      core: { renameAutomatically: false },
    });

    expect(evaluateSettingsImport(raw).kind).toBe('unreadable');
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['an array', []],
    ['a string', 'core'],
    ['a number', 42],
  ])('refuses an envelope whose payload is %s', (_label, settings) => {
    expect(evaluateSettingsImport(envelope(settings)).kind).toBe('unreadable');
  });

  it('refuses malformed JSON', () => {
    expect(evaluateSettingsImport('{ not json').kind).toBe('unreadable');
    expect(evaluateSettingsImport('').kind).toBe('unreadable');
  });

  // `JSON.parse` returns these without throwing, and an array passes a bare
  // `typeof === 'object'` test — each has to be refused explicitly.
  it.each([
    ['null', 'null'],
    ['a number', '42'],
    ['a string', '"settings"'],
    ['an array', '[]'],
    ['a boolean', 'true'],
  ])('refuses %s', (_label, raw) => {
    expect(evaluateSettingsImport(raw).kind).toBe('unreadable');
  });

  it('keeps a payload-level dataSchemaVersion out of the merged result', () => {
    // Accepting one would let a hand-edited file persist a stale version and make the
    // next loadSettings() discard every setting the user still had.
    const verdict = evaluateSettingsImport(
      envelope({ dataSchemaVersion: 1, core: { charCount: 42 } })
    );

    expect(verdict.kind).toBe('accepted');
    if (verdict.kind !== 'accepted') return;

    const applied = applySettingsTransfer(verdict.settings);
    expect(applied.dataSchemaVersion).toBe(CURRENT_DATA_SCHEMA_VERSION);
    expect(applied.core.charCount).toBe(42);
  });
});
