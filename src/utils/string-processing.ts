import { PluginSettings } from '../types';
import { CharKey } from '../types/char-replacement';
import { UNIVERSAL_FORBIDDEN_CHARS, WINDOWS_ANDROID_CHARS } from '../constants';

/**
 * Filter out empty/whitespace-only strings from array
 * Common utility for filtering settings arrays
 */
export function filterNonEmpty(items: string[]): string[] {
  return items.filter((item) => item.trim() !== '');
}

/**
 * Process forbidden characters in text according to settings
 * This is the shared logic used by both rename engine and link target generation
 */
export function processForbiddenChars(
  text: string,
  settings: PluginSettings,
  options?: { maxLength?: number; windowsAndroidEnabled?: boolean }
): string {
  const charMap: { [key: string]: string } = {
    '/': settings.replaceCharacters.charReplacements.slash.replacement,
    ':': settings.replaceCharacters.charReplacements.colon.replacement,
    '|': settings.replaceCharacters.charReplacements.pipe.replacement,
    '#': settings.replaceCharacters.charReplacements.hash.replacement,
    '[': settings.replaceCharacters.charReplacements.leftBracket.replacement,
    ']': settings.replaceCharacters.charReplacements.rightBracket.replacement,
    '^': settings.replaceCharacters.charReplacements.caret.replacement,
    '*': settings.replaceCharacters.charReplacements.asterisk.replacement,
    '?': settings.replaceCharacters.charReplacements.question.replacement,
    '<': settings.replaceCharacters.charReplacements.lessThan.replacement,
    '>': settings.replaceCharacters.charReplacements.greaterThan.replacement,
    '"': settings.replaceCharacters.charReplacements.quote.replacement,
    [String.fromCharCode(92)]:
      settings.replaceCharacters.charReplacements.backslash.replacement,
    '.': settings.replaceCharacters.charReplacements.dot.replacement,
  };

  // Get forbidden chars - universal chars are always forbidden
  const universalForbiddenChars = UNIVERSAL_FORBIDDEN_CHARS;
  const windowsAndroidChars = WINDOWS_ANDROID_CHARS;
  const allForbiddenChars = [...universalForbiddenChars];

  // Add Windows/Android chars if option is enabled
  const useWindowsAndroid =
    options?.windowsAndroidEnabled ??
    settings.replaceCharacters.windowsAndroidEnabled;
  if (useWindowsAndroid) {
    allForbiddenChars.push(...windowsAndroidChars);
  }
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
        const replacement = charMap['.'] || '';
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
        // Map character to setting key
        let settingKey: CharKey | null = null;
        switch (char) {
          case '/':
            settingKey = 'slash';
            break;
          case String.fromCharCode(92):
            settingKey = 'backslash';
            break;
          case ':':
            settingKey = 'colon';
            break;
          case '|':
            settingKey = 'pipe';
            break;
          case '#':
            settingKey = 'hash';
            break;
          case '[':
            settingKey = 'leftBracket';
            break;
          case ']':
            settingKey = 'rightBracket';
            break;
          case '^':
            settingKey = 'caret';
            break;
          case '*':
            settingKey = 'asterisk';
            break;
          case '?':
            settingKey = 'question';
            break;
          case '<':
            settingKey = 'lessThan';
            break;
          case '>':
            settingKey = 'greaterThan';
            break;
          case '"':
            settingKey = 'quote';
            break;
        }

        // For Windows/Android chars, also check if that toggle is enabled
        const isWindowsAndroidChar = WINDOWS_ANDROID_CHARS.includes(char);
        const canReplace = isWindowsAndroidChar
          ? useWindowsAndroid &&
            settingKey &&
            settings.replaceCharacters.charReplacements[settingKey].enabled
          : settingKey &&
            settings.replaceCharacters.charReplacements[settingKey].enabled;

        if (canReplace && settingKey) {
          shouldReplace = true;
          replacement = charMap[char] || '';

          // Check for whitespace trimming
          if (replacement !== '') {
            // Trim whitespace to the left
            if (
              settings.replaceCharacters.charReplacements[settingKey].trimLeft
            ) {
              // Remove trailing whitespace from result
              result = result.trimEnd();
            }

            // Check if we should trim whitespace to the right
            if (
              settings.replaceCharacters.charReplacements[settingKey].trimRight
            ) {
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
    // Universal forbidden characters (all OSes)
    const universalMappings = {
      '/': settings.replaceCharacters.charReplacements.slash,
      ':': settings.replaceCharacters.charReplacements.colon,
      '|': settings.replaceCharacters.charReplacements.pipe,
      '\\': settings.replaceCharacters.charReplacements.backslash,
      '#': settings.replaceCharacters.charReplacements.hash,
      '[': settings.replaceCharacters.charReplacements.leftBracket,
      ']': settings.replaceCharacters.charReplacements.rightBracket,
      '^': settings.replaceCharacters.charReplacements.caret,
    };

    for (const [forbiddenChar, replacementConfig] of Object.entries(
      universalMappings
    )) {
      if (replacementConfig.enabled && replacementConfig.replacement) {
        result = result
          .split(replacementConfig.replacement)
          .join(forbiddenChar);
      }
    }

    // Windows/Android additional characters
    if (settings.replaceCharacters.windowsAndroidEnabled) {
      const windowsAndroidMappings = {
        '*': settings.replaceCharacters.charReplacements.asterisk,
        '?': settings.replaceCharacters.charReplacements.question,
        '<': settings.replaceCharacters.charReplacements.lessThan,
        '>': settings.replaceCharacters.charReplacements.greaterThan,
        '"': settings.replaceCharacters.charReplacements.quote,
      };

      for (const [forbiddenChar, replacementConfig] of Object.entries(
        windowsAndroidMappings
      )) {
        if (replacementConfig.enabled && replacementConfig.replacement) {
          result = result
            .split(replacementConfig.replacement)
            .join(forbiddenChar);
        }
      }
    }
  }

  return result;
}
