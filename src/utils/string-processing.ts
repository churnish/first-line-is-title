import { PluginSettings } from '../types';
import { CHAR_TO_SETTING_KEY } from '../types/char-replacement';
import { UNIVERSAL_FORBIDDEN_CHARS, WINDOWS_ANDROID_CHARS } from '../constants';

/**
 * Filter out empty/whitespace-only strings from array
 * Common utility for filtering settings arrays
 */
export function filterNonEmpty(items: string[]): string[] {
  return items.filter((item) => item.trim() !== '');
}

/**
 * FLIT stores the vault root as "/", while every path normalizer — Obsidian's
 * `normalizePath` included — strips it to "". Folder path helpers short-circuit on
 * this so a root rule survives normalization.
 */
export function isRootFolderPath(path: string): boolean {
  return path.trim() === '/';
}

/**
 * Process forbidden characters in text according to settings
 * This is the shared logic used by both rename engine and link target generation
 */
export function processForbiddenChars(
  text: string,
  settings: PluginSettings,
  options?: { maxLength?: number }
): string {
  // Forbidden chars - universal and Windows/Android chars are always forbidden
  const allForbiddenChars = [
    ...UNIVERSAL_FORBIDDEN_CHARS,
    ...WINDOWS_ANDROID_CHARS,
  ];
  const forbiddenChars = [...new Set(allForbiddenChars)].join('');

  let result = '';
  const maxLength = options?.maxLength;

  for (let i = 0; i < text.length; i++) {
    if (maxLength && result.length >= maxLength - 1) {
      result = result.trimEnd();
      result += '…';
      break;
    }
    let char = text[i];

    if (char === '.') {
      // Check if dot should be replaced (applies at any position if enabled)
      if (
        settings.replaceCharacters.enableForbiddenCharReplacements &&
        settings.replaceCharacters.charReplacements.dot.enabled
      ) {
        const replacement =
          settings.replaceCharacters.charReplacements.dot.replacement;
        if (replacement !== '') {
          // Has replacement - use it at any position
          if (settings.replaceCharacters.charReplacements.dot.trimRight) {
            // Skip upcoming whitespace characters
            while (i + 1 < text.length && /\s/.test(text[i + 1])) {
              i++;
            }
          }
          result += replacement;
        }
        // Replacement is empty - strip dot at any position (don't add anything)
      } else if (result === '') {
        // Dot replacement is disabled and dot is at start - strip it (leading dots are forbidden)
        // Don't add anything
      } else {
        // Dot replacement is disabled but dot is not at start - keep it
        result += '.';
      }
    } else if (forbiddenChars.includes(char)) {
      let shouldReplace = false;
      let replacement = '';

      // Check if master toggle is on AND individual toggle is on
      if (settings.replaceCharacters.enableForbiddenCharReplacements) {
        // `.` never reaches here - it has its own branch above - so every forbidden char has a key
        const settingKey = CHAR_TO_SETTING_KEY[char];
        const charConfig = settingKey
          ? settings.replaceCharacters.charReplacements[settingKey]
          : undefined;

        if (charConfig?.enabled) {
          shouldReplace = true;
          replacement = charConfig.replacement;

          // Check for whitespace trimming
          if (replacement !== '') {
            // Trim whitespace to the left
            if (charConfig.trimLeft) {
              // Remove trailing whitespace from result
              result = result.trimEnd();
            }

            // Check if we should trim whitespace to the right
            if (charConfig.trimRight) {
              // Skip upcoming whitespace characters
              while (i + 1 < text.length && /\s/.test(text[i + 1])) {
                i++;
              }
            }
          }
        }
      }

      if (shouldReplace && replacement !== '') {
        result += replacement;
      }
      // If master toggle is off, individual toggle is off, or replacement is empty, omit the character
    } else {
      result += char;
    }
  }

  result = result.trim().replace(/\s+/g, ' ');

  return result;
}

/**
 * Generates a safe internal link target from text
 * Applies character replacements based on settings
 */
export function generateSafeLinkTarget(
  text: string,
  settings: PluginSettings
): string {
  return processForbiddenChars(text, settings);
}

/**
 * Reverses forbidden character replacements in text
 * Converts safe characters back to original forbidden characters
 */
export function reverseSafeLinkTarget(
  text: string,
  settings: PluginSettings
): string {
  let result = text;

  // Reverse forbidden character replacements if enabled
  if (settings.replaceCharacters.enableForbiddenCharReplacements) {
    for (const [forbiddenChar, settingKey] of Object.entries(
      CHAR_TO_SETTING_KEY
    )) {
      // `dot` is excluded deliberately: `.` is in neither forbidden-char set, and
      // `generateSafeLinkTarget` only ever encodes it through the separate dot branch of
      // `processForbiddenChars`. Reversing it here would rewrite `․` back to `.` inside
      // link targets that were never encoded from a dot.
      if (settingKey === 'dot') continue;

      const replacementConfig =
        settings.replaceCharacters.charReplacements[settingKey];
      if (replacementConfig.enabled && replacementConfig.replacement) {
        result = result
          .split(replacementConfig.replacement)
          .join(forbiddenChar);
      }
    }
  }

  return result;
}
