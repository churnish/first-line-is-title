import { PluginSettings } from '../types';

/**
 * Hoisted out of main.ts: this is pure, and a standalone helper cannot call
 * a plugin method, so every consumer needs it importable on its own.
 */
export function parsePropertyValue(value: string): string | number | boolean {
  // Try to parse as boolean
  const lowerValue = value.toLowerCase().trim();
  if (lowerValue === 'true') return true;
  if (lowerValue === 'false') return false;

  // Try to parse as number
  if (!isNaN(Number(value)) && value.trim() !== '') {
    return Number(value);
  }

  // Return as string
  return value;
}

/**
 * Adds or removes the disable-renaming property on a note's frontmatter.
 * Centralized so every caller (single-note commands, the bulk modal, and the
 * file context menu) writes the same coerced type - the key is registered as
 * a checkbox property, and writing the raw settings string there is
 * YAML-inconsistent even though read-side normalization still detects it.
 */
export function setDisableRenamingProperty(
  frontmatter: Record<string, unknown>,
  settings: PluginSettings,
  enabled: boolean
): void {
  const { disableRenamingKey, disableRenamingValue } = settings.exclusions;
  if (enabled) {
    delete frontmatter[disableRenamingKey];
  } else {
    frontmatter[disableRenamingKey] = parsePropertyValue(disableRenamingValue);
  }
}
