import { CURRENT_DATA_SCHEMA_VERSION } from '../constants';

export type SettingsImportVerdict =
  | { kind: 'accepted'; settings: Record<string, unknown> }
  | { kind: 'unreadable' }
  | { kind: 'incompatible-schema' };

/**
 * Decides whether a settings file may be applied. Pure — takes the file's raw text and reads
 * no plugin state, so the decision is testable without the file-input plumbing around it.
 *
 * `loadSettings()` discards any data.json whose schema version does not match, so this path
 * must not become a back door around that gate. Refusing is also the only non-destructive
 * option: `dataSchemaVersion` is itself a settings key, so the caller's type filter would copy
 * a mismatched one straight through, and the next load would then silently wipe every setting
 * the user still had.
 */
export function evaluateSettingsImport(rawText: string): SettingsImportVerdict {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { kind: 'unreadable' };
  }

  // `JSON.parse` returns null, numbers and strings without throwing, and an array passes a
  // bare `typeof === 'object'` test — none of them are a settings object.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'unreadable' };
  }

  const settings = parsed as Record<string, unknown>;
  if (settings.dataSchemaVersion !== CURRENT_DATA_SCHEMA_VERSION) {
    return { kind: 'incompatible-schema' };
  }

  return { kind: 'accepted', settings };
}
