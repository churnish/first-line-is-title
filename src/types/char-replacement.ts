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
 * Maps each replaceable character to its {@link CharReplacements} key.
 *
 * Sole source of the char↔key pairing: it was previously re-encoded in four places
 * (two reversal loops, a lookup table and a switch), which is how they drifted apart.
 * Iteration order is significant to the reversal loops, since one replacement string
 * can be a substring of another.
 */
export const CHAR_TO_SETTING_KEY: Record<string, CharKey> = {
  '/': 'slash',
  ':': 'colon',
  '*': 'asterisk',
  '?': 'question',
  '<': 'lessThan',
  '>': 'greaterThan',
  '"': 'quote',
  '|': 'pipe',
  '#': 'hash',
  '[': 'leftBracket',
  ']': 'rightBracket',
  '^': 'caret',
  '\\': 'backslash',
  '.': 'dot',
};

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

/**
 * Characters auto-enabled the first time forbidden char replacement is switched on.
 *
 * Two independent code paths run this cascade — plugin load and the settings
 * toggle — and both latch on the same flag, so whichever fires first locks the
 * other out. They must therefore enable an identical key set.
 *
 * Windows/Android keys are included because the forbidden set is universal:
 * `processForbiddenChars` DELETES a forbidden character whose toggle is off
 * rather than passing it through, so omitting them would strip `? * " < >` from
 * every new user's filenames on every OS.
 */
export const FIRST_ENABLE_CHAR_KEYS: CharKey[] = [
  ...PRIMARY_CHAR_KEYS,
  ...WINDOWS_ANDROID_CHAR_KEYS,
  // Backslash defaults off; enabling it flips `extractTitle` to the literal-backslash branch, which stops treating `\` as a Markdown escape character.
].filter((key) => key !== 'backslash');
