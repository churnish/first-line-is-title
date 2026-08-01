/**
 * Character replacement configuration.
 * Unified nested structure for char replacement settings.
 */

export interface CharReplacementConfig {
  /** The string to replace the character with */
  replacement: string;
  /** Whether this replacement is enabled */
  enabled: boolean;
  /** Trim whitespace to the left of this character */
  trimLeft: boolean;
  /** Trim whitespace to the right of this character */
  trimRight: boolean;
}

export interface CharReplacements {
  slash: CharReplacementConfig;
  colon: CharReplacementConfig;
  asterisk: CharReplacementConfig;
  question: CharReplacementConfig;
  lessThan: CharReplacementConfig;
  greaterThan: CharReplacementConfig;
  quote: CharReplacementConfig;
  pipe: CharReplacementConfig;
  hash: CharReplacementConfig;
  leftBracket: CharReplacementConfig;
  rightBracket: CharReplacementConfig;
  caret: CharReplacementConfig;
  backslash: CharReplacementConfig;
  dot: CharReplacementConfig;
}

/**
 * Character keys used in replacement config
 */
export type CharKey = keyof CharReplacements;

/**
 * All supported character keys as a constant array
 */
export const CHAR_KEYS: CharKey[] = [
  'slash',
  'colon',
  'asterisk',
  'question',
  'lessThan',
  'greaterThan',
  'quote',
  'pipe',
  'hash',
  'leftBracket',
  'rightBracket',
  'caret',
  'backslash',
  'dot',
];

/**
 * Characters forbidden on all operating systems, in settings-table display order.
 * Shared so the first-enable cascade and the settings table agree on membership.
 */
export const PRIMARY_CHAR_KEYS: CharKey[] = [
  'leftBracket',
  'rightBracket',
  'hash',
  'caret',
  'pipe',
  'backslash',
  'slash',
  'colon',
  'dot',
];

/**
 * Characters forbidden only on Windows and Android, in settings-table display order.
 * Disjoint from {@link PRIMARY_CHAR_KEYS}.
 */
export const WINDOWS_ANDROID_CHAR_KEYS: CharKey[] = [
  'asterisk',
  'quote',
  'lessThan',
  'greaterThan',
  'question',
];
