import { getLanguage } from 'obsidian';
import enTranslations from '../locale/en.json';
import ruTranslations from '../locale/ru.json';

// Module state - initialized immediately to prevent tree-shaking
const state = (() => {
  return {
    availableTranslations: {
      en: enTranslations,
      ru: ruTranslations,
    } as Record<string, Record<string, unknown>>,
    translations: enTranslations,
    currentLocale: 'en',
  };
})();

/**
 * Initialize i18n system
 */
export function initI18n(): void {
  // Get locale from Obsidian's API (requires minAppVersion: 1.8.0)
  state.currentLocale = getLanguage();

  // Normalize locale (e.g., 'ru-RU' -> 'ru', 'en-US' -> 'en')
  state.currentLocale = state.currentLocale.split('-')[0].toLowerCase();

  // Load translations
  if (state.availableTranslations[state.currentLocale]) {
    state.translations = state.availableTranslations[
      state.currentLocale
    ] as typeof enTranslations;
  } else {
    // Fallback to English if locale not available
    state.currentLocale = 'en';
    state.translations = state.availableTranslations[
      'en'
    ] as typeof enTranslations;
  }
}

/**
 * Get translated string by key path
 * @param keyPath - Dot-separated key path (e.g., 'commands.putFirstLineInTitle')
 * @param variables - Optional object with variables to replace (e.g., { filename: 'test.md' })
 * @param fallback - Fallback string if translation not found
 * @returns Translated string
 */
export function t(
  keyPath: string,
  variables?: Record<string, string | number> | string,
  fallback?: string
): string {
  // Handle overloaded signature (variables can be fallback string)
  let vars: Record<string, string | number> | undefined;
  let fb: string | undefined;

  if (typeof variables === 'string') {
    fb = variables;
    vars = undefined;
  } else {
    vars = variables;
    fb = fallback;
  }

  const keys = keyPath.split('.');
  let value: unknown = state.translations;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value && value !== null) {
      value = (value as Record<string, unknown>)[key];
    } else {
      // Key not found, use fallback
      let result = fb || keyPath;

      // Replace variables if provided
      if (vars) {
        for (const [varKey, varVal] of Object.entries(vars)) {
          result = result.replace(
            new RegExp(`\\{\\{${varKey}\\}\\}`, 'g'),
            String(varVal)
          );
        }
      }

      return result;
    }
  }

  let result = typeof value === 'string' ? value : fb || keyPath;

  // Replace variables if provided
  if (vars) {
    for (const [key, val] of Object.entries(vars)) {
      result = result.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
        String(val)
      );
    }
  }

  return result;
}

/**
 * Get current locale
 */
export function getCurrentLocale(): string {
  return state.currentLocale;
}

/**
 * Get plural form for Russian locale
 * @param count - Number to determine plural form
 * @param one - Form for 1, 21, 31, etc. (заметка)
 * @param few - Form for 2-4, 22-24, etc. (заметки)
 * @param many - Form for 5-20, 25-30, etc. (заметок)
 * @returns Appropriate plural form
 */
export function getPluralForm(
  count: number,
  one: string,
  few: string,
  many: string
): string {
  if (state.currentLocale !== 'ru') {
    return count === 1 ? one : many;
  }

  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  } else {
    return many;
  }
}

/**
 * Get translated plural message
 * @param keyPath - Dot-separated key path to plural forms object (e.g., 'modals.processNNotes')
 * @param count - Number to determine plural form
 * @param fallback - Fallback string if translation not found
 * @returns Translated plural string with {{count}} replaced
 */
export function tp(keyPath: string, count: number, fallback?: string): string {
  const keys = keyPath.split('.');
  let value: unknown = state.translations;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value && value !== null) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return (fallback || keyPath).replace('{{count}}', String(count));
    }
  }

  // If not an object with plural forms, return as-is
  if (typeof value === 'string') {
    return value.replace('{{count}}', String(count));
  }

  // Get the appropriate plural form
  let pluralKey: string;
  if (state.currentLocale !== 'ru') {
    pluralKey = count === 1 ? 'one' : 'many';
  } else {
    const mod10 = count % 10;
    const mod100 = count % 100;

    if (mod10 === 1 && mod100 !== 11) {
      pluralKey = 'one';
    } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      pluralKey = 'few';
    } else {
      pluralKey = 'many';
    }
  }

  const valueRecord = value as Record<string, unknown>;
  const message =
    valueRecord[pluralKey] || valueRecord['many'] || fallback || keyPath;
  if (typeof message === 'string') {
    return message.replace('{{count}}', String(count));
  }
  // Fallback for non-string message (shouldn't happen with valid translations)
  const messageStr =
    typeof message === 'object'
      ? JSON.stringify(message)
      : // eslint-disable-next-line @typescript-eslint/no-base-to-string -- fallback for unexpected types
        String(message);
  return messageStr.replace('{{count}}', String(count));
}

/**
 * Get translated plural message parts for custom formatting
 * @param keyPath - Dot-separated key path to plural forms object (e.g., 'modals.processNNotes')
 * @param count - Number to determine plural form
 * @returns Object with before, noun, and after parts for custom formatting
 */
export function tpSplit(
  keyPath: string,
  count: number
): { before: string; noun: string; after: string } {
  const keys = keyPath.split('.');
  let value: unknown = state.translations;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value && value !== null) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return { before: keyPath, noun: '', after: '' };
    }
  }

  // Get the appropriate plural form
  let pluralKey: string;
  if (state.currentLocale !== 'ru') {
    pluralKey = count === 1 ? 'one' : 'many';
  } else {
    const mod10 = count % 10;
    const mod100 = count % 100;

    if (mod10 === 1 && mod100 !== 11) {
      pluralKey = 'one';
    } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      pluralKey = 'few';
    } else {
      pluralKey = 'many';
    }
  }

  const valueRecord = value as Record<string, unknown>;
  const pluralForm = valueRecord[pluralKey] || valueRecord['many'];

  if (pluralForm && typeof pluralForm === 'object') {
    const pf = pluralForm as Record<string, string>;
    return {
      before: pf.before || '',
      noun: pf.noun || '',
      after: pf.after || '',
    };
  }

  // Fallback for simple string format
  return {
    before: typeof pluralForm === 'string' ? pluralForm : keyPath,
    noun: '',
    after: '',
  };
}
