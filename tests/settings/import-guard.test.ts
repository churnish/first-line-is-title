import { describe, it, expect } from 'vitest';
import { evaluateSettingsImport } from '../../src/settings/import-guard';
import { CURRENT_DATA_SCHEMA_VERSION } from '../../src/constants';

describe('evaluateSettingsImport', () => {
  it('accepts a payload stamped with the current schema version', () => {
    const raw = JSON.stringify({
      dataSchemaVersion: CURRENT_DATA_SCHEMA_VERSION,
      core: { renameAutomatically: false },
    });

    const verdict = evaluateSettingsImport(raw);

    expect(verdict.kind).toBe('accepted');
    if (verdict.kind === 'accepted') {
      expect(verdict.settings.core).toEqual({ renameAutomatically: false });
    }
  });

  it('refuses a payload stamped with a different schema version', () => {
    const raw = JSON.stringify({
      dataSchemaVersion: CURRENT_DATA_SCHEMA_VERSION - 1,
      core: { renameAutomatically: false },
    });

    expect(evaluateSettingsImport(raw).kind).toBe('incompatible-schema');
  });

  it('refuses a payload with no schema version at all', () => {
    const raw = JSON.stringify({ core: { renameAutomatically: false } });

    expect(evaluateSettingsImport(raw).kind).toBe('incompatible-schema');
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
});
