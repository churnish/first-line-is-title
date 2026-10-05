/*
 * Adapted from Notebook Navigator (https://github.com/johansan/notebook-navigator)
 * Copyright (c) 2025-2026 Johan Sanneblad
 * Modified 2026 for First Line is Title.
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later version.
 */

import { CURRENT_DATA_SCHEMA_VERSION, DEFAULT_SETTINGS } from '../constants';
import { PluginSettings } from '../types';

/** Envelope marker, so a settings file from another plugin is refused rather than merged. */
export const SETTINGS_TRANSFER_PLUGIN = 'first-line-is-title';

/**
 * A settings file: an envelope carrying a diff against `DEFAULT_SETTINGS` rather than a
 * whole-object dump, so the payload stays readable and hand-editable in the transfer
 * modals.
 */
export interface SettingsTransfer {
  plugin: typeof SETTINGS_TRANSFER_PLUGIN;
  dataSchemaVersion: number;
  /** Only the leaves differing from `DEFAULT_SETTINGS`. */
  settings: Record<string, unknown>;
}

/**
 * Settings keys the payload must never carry.
 *
 * `dataSchemaVersion` is a real key of `DEFAULT_SETTINGS`, so a merge that walks base keys
 * would otherwise accept `"settings": {"dataSchemaVersion": 3}` from a hand-edited file,
 * persist it, and make the next `loadSettings()` discard every setting. The version lives
 * on the envelope only.
 */
const NON_TRANSFERABLE_KEYS = new Set(['dataSchemaVersion']);

const TRANSFER_FILENAME_PREFIX = 'first-line-is-title-settings';

/**
 * Narrows to a mergeable object branch. Arrays report `'object'` too but are copied
 * whole, so they must not be walked as branches.
 */
export function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Structural equality over the pure-JSON shapes settings are made of. Compares by
 * structure rather than by serialised text, so a key-order difference inside a stored
 * rule object cannot masquerade as a changed setting.
 */
function isDeepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;

  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => isDeepEqual(item, right[index]))
    );
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    return (
      leftKeys.length === Object.keys(right).length &&
      leftKeys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(right, key) &&
          isDeepEqual(left[key], right[key])
      )
    );
  }

  return false;
}

/**
 * True when `override` may replace `base` as a leaf value.
 *
 * `typeof` alone lets an array through where a primitive-free object branch lives (both
 * report `'object'`), so array-ness is compared too.
 */
function hasMatchingShape(base: unknown, override: unknown): boolean {
  return (
    typeof override === typeof base &&
    Array.isArray(override) === Array.isArray(base)
  );
}

/**
 * Walks `defaults` leaf by leaf and keeps only what `current` changed. Arrays are compared
 * and copied whole, matching what `deepMerge` does on load.
 *
 * Iterates the defaults' keys, so a key absent from the current defaults is never visited
 * — which is exactly why the 4.0.0 reset backup must stay a verbatim copy of the prior
 * `data.json` rather than a transfer payload.
 */
function createTransferableSettingsSnapshot(
  defaults: Record<string, unknown>,
  current: Record<string, unknown>
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};

  for (const key of Object.keys(defaults)) {
    if (NON_TRANSFERABLE_KEYS.has(key)) continue;

    const defaultValue = defaults[key];
    const currentValue = current[key];
    if (currentValue === undefined) continue;

    if (isPlainObject(defaultValue) && isPlainObject(currentValue)) {
      const branch = createTransferableSettingsSnapshot(
        defaultValue,
        currentValue
      );
      if (Object.keys(branch).length > 0) snapshot[key] = branch;
      continue;
    }

    if (!isDeepEqual(defaultValue, currentValue)) {
      snapshot[key] = structuredClone(currentValue);
    }
  }

  return snapshot;
}

/**
 * Merges a transfer payload over `defaults`. A key the payload omits takes its default,
 * so applying a transfer is a reset-and-apply rather than a patch.
 *
 * Per leaf the override is kept only when its shape matches the default's; otherwise the
 * default survives. That guard is what stops `{"exclusions": {"excludedFolders": "x"}}`
 * from reaching a downstream read that expects an array.
 */
function mergeTransferableSettings(
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};

  for (const key of Object.keys(defaults)) {
    const defaultValue = defaults[key];
    const overrideValue = NON_TRANSFERABLE_KEYS.has(key)
      ? undefined
      : overrides[key];

    if (overrideValue === undefined) {
      merged[key] = structuredClone(defaultValue);
      continue;
    }

    if (isPlainObject(defaultValue)) {
      merged[key] = isPlainObject(overrideValue)
        ? mergeTransferableSettings(defaultValue, overrideValue)
        : structuredClone(defaultValue);
      continue;
    }

    merged[key] = hasMatchingShape(defaultValue, overrideValue)
      ? structuredClone(overrideValue)
      : structuredClone(defaultValue);
  }

  return merged;
}

/** Builds the envelope for the given settings. */
export function createSettingsTransfer(
  settings: PluginSettings
): SettingsTransfer {
  return {
    plugin: SETTINGS_TRANSFER_PLUGIN,
    dataSchemaVersion: CURRENT_DATA_SCHEMA_VERSION,
    settings: createTransferableSettingsSnapshot(
      DEFAULT_SETTINGS as unknown as Record<string, unknown>,
      settings as unknown as Record<string, unknown>
    ),
  };
}

/** The envelope as pretty-printed JSON, which is what both modals show and write. */
export function createSettingsTransferJson(settings: PluginSettings): string {
  return JSON.stringify(createSettingsTransfer(settings), null, 2);
}

function padTwoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * `first-line-is-title-settings-YYYYMMDD-HHmmss.json`, in local time.
 *
 * Deliberately colon-free rather than an ISO timestamp: Obsidian's path check forbids `:`
 * on every platform, so a colon-bearing name makes `vault.create` throw and the file is
 * silently never written.
 */
export function createSettingsTransferFilename(date: Date): string {
  const day = `${date.getFullYear()}${padTwoDigits(date.getMonth() + 1)}${padTwoDigits(date.getDate())}`;
  const time = `${padTwoDigits(date.getHours())}${padTwoDigits(date.getMinutes())}${padTwoDigits(date.getSeconds())}`;
  return `${TRANSFER_FILENAME_PREFIX}-${day}-${time}.json`;
}

/**
 * Pure: merges the payload over `DEFAULT_SETTINGS` and returns a fresh `PluginSettings`,
 * leaving the caller's current settings untouched so a failed save can roll back.
 */
export function applySettingsTransfer(
  transfer: SettingsTransfer
): PluginSettings {
  return mergeTransferableSettings(
    DEFAULT_SETTINGS as unknown as Record<string, unknown>,
    transfer.settings
  ) as unknown as PluginSettings;
}
