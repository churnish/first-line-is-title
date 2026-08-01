/**
 * Dot-path accessors for the declarative settings API.
 *
 * Obsidian's `control` definitions address one settings key each, and the
 * default `PluginSettingTab` implementation only reaches top-level properties.
 * This plugin's settings are nested under feature sub-objects (`core.*`,
 * `exclusions.*`, …), so every `control.key` is a dot-path walked by these
 * helpers via the tab's `getControlValue`/`setControlValue` overrides.
 */

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object';
}

/**
 * Reads a dot-path (e.g. `core.renameOnSave`), returning undefined if any
 * segment is missing rather than throwing.
 */
export function getPath(obj: UnknownRecord, path: string): unknown {
  let cursor: unknown = obj;
  for (const part of path.split('.')) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

/**
 * Writes a dot-path, creating intermediate objects as needed so a settings
 * file saved by an older build without the parent object doesn't throw.
 */
export function setPath(
  obj: UnknownRecord,
  path: string,
  value: unknown
): void {
  const parts = path.split('.');
  const last = parts.pop();
  if (last === undefined) return;

  let cursor: UnknownRecord = obj;
  for (const part of parts) {
    const next = cursor[part];
    if (!isRecord(next)) {
      const created: UnknownRecord = {};
      cursor[part] = created;
      cursor = created;
    } else {
      cursor = next;
    }
  }
  cursor[last] = value;
}
