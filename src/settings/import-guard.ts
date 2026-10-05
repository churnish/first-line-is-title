import { CURRENT_DATA_SCHEMA_VERSION } from '../constants';
import {
  isPlainObject,
  SETTINGS_TRANSFER_PLUGIN,
  SettingsTransfer,
} from './transfer';

export type SettingsImportVerdict =
  | { kind: 'accepted'; settings: SettingsTransfer }
  | { kind: 'unreadable' }
  | { kind: 'incompatible-schema' };

/**
 * Decides whether a settings file may be applied. Pure — takes the file's raw text and reads
 * no plugin state, so the decision is testable without the modal plumbing around it.
 *
 * `loadSettings()` discards any data.json whose schema version does not match, so this path
 * must not become a back door around that gate. The version is read off the envelope rather
 * than out of the payload: `dataSchemaVersion` is itself a settings key, and accepting one
 * from inside the payload would let a hand-edited file persist a stale version that makes
 * the next load silently wipe every setting the user still had.
 */
export function evaluateSettingsImport(rawText: string): SettingsImportVerdict {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { kind: 'unreadable' };
  }

  // `JSON.parse` returns null, numbers and strings without throwing, and an array passes a
  // bare `typeof === 'object'` test — none of them are a settings envelope.
  if (!isPlainObject(parsed)) {
    return { kind: 'unreadable' };
  }

  // A payload that is not an object has nothing to merge, which is a malformed file rather
  // than a version mismatch.
  if (!isPlainObject(parsed.settings)) {
    return { kind: 'unreadable' };
  }

  if (parsed.plugin !== SETTINGS_TRANSFER_PLUGIN) {
    return { kind: 'incompatible-schema' };
  }

  if (parsed.dataSchemaVersion !== CURRENT_DATA_SCHEMA_VERSION) {
    return { kind: 'incompatible-schema' };
  }

  return {
    kind: 'accepted',
    settings: {
      plugin: SETTINGS_TRANSFER_PLUGIN,
      dataSchemaVersion: CURRENT_DATA_SCHEMA_VERSION,
      settings: parsed.settings,
    },
  };
}
