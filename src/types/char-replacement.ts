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
