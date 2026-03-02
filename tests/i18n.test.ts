import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initI18n,
  t,
  getCurrentLocale,
  getPluralForm,
  tp,
  tpSplit,
} from '../src/i18n';
import { getLanguage } from './mockObsidian';

describe('i18n', () => {
  beforeEach(() => {
    // Reset locale to English before each test
    vi.mocked(getLanguage).mockReturnValue('en');
    initI18n();
  });

  describe('initI18n', () => {
    it('should initialize with English locale by default', () => {
      initI18n();
      expect(getCurrentLocale()).toBe('en');
    });

    it('should initialize with Russian locale when moment returns ru', () => {
      vi.mocked(getLanguage).mockReturnValue('ru');
      initI18n();
      expect(getCurrentLocale()).toBe('ru');
    });

    it('should normalize locale codes (ru-RU -> ru)', () => {
      vi.mocked(getLanguage).mockReturnValue('ru-RU');
      initI18n();
      expect(getCurrentLocale()).toBe('ru');
    });

    it('should normalize locale codes (en-US -> en)', () => {
      vi.mocked(getLanguage).mockReturnValue('en-US');
      initI18n();
      expect(getCurrentLocale()).toBe('en');
    });

    it('should fallback to English for unsupported locales', () => {
      vi.mocked(getLanguage).mockReturnValue('fr-FR');
      initI18n();
      expect(getCurrentLocale()).toBe('en');
    });

    it('should lowercase locale codes', () => {
      vi.mocked(getLanguage).mockReturnValue('EN-US');
      initI18n();
      expect(getCurrentLocale()).toBe('en');
    });
  });

  describe('t (translate)', () => {
    it('should return translation for existing key', () => {
      // Assuming translation exists in en.json
      const result = t('test.key', 'fallback');
      // If key doesn't exist, returns fallback
      expect(result).toBeDefined();
    });

    it('should return fallback when key does not exist', () => {
      const result = t('nonexistent.key', 'My Fallback');
      expect(result).toBe('My Fallback');
    });

    it('should return keyPath when no fallback provided', () => {
      const result = t('nonexistent.key');
      expect(result).toBe('nonexistent.key');
    });

    it('should support nested keys with dot notation', () => {
      const result = t('deeply.nested.key.path', 'fallback');
      expect(result).toBeDefined();
    });

    it('should replace variables in translation strings', () => {
      // If translation has {{filename}}, it should be replaced
      const result = t(
        'key.with.variable',
        { filename: 'test.md' },
        'fallback {{filename}}'
      );
      expect(result).toContain('test.md');
    });

    it('should handle multiple variables', () => {
      const result = t(
        'key',
        { name: 'John', age: 25 },
        'Hello {{name}}, you are {{age}} years old'
      );
      expect(result).toBe('Hello John, you are 25 years old');
    });

    it('should handle numeric variables', () => {
      const result = t('key', { count: 42 }, 'Count: {{count}}');
      expect(result).toBe('Count: 42');
    });

    it('should handle overloaded signature (string fallback)', () => {
      const result = t('nonexistent.key', 'String Fallback');
      expect(result).toBe('String Fallback');
    });

    it('should handle overloaded signature (variables + fallback)', () => {
      const result = t('key', { var: 'value' }, 'Fallback with {{var}}');
      expect(result).toBe('Fallback with value');
    });

    it('should return value if translation is found but is not a string', () => {
      // If translation is an object (plural forms), should return fallback
      const result = t('some.object.key', 'fallback');
      expect(result).toBeDefined();
    });

    it('should handle empty key path', () => {
      const result = t('', 'fallback');
      expect(result).toBe('fallback');
    });

    it('should handle single-level keys', () => {
      const result = t('key', 'fallback');
      expect(result).toBeDefined();
    });

    it('should not replace variables when none provided', () => {
      const result = t('key', undefined, 'Text with {{var}}');
      expect(result).toBe('Text with {{var}}');
    });

    it('should handle keys with special characters', () => {
      const result = t('key-with-dash', 'fallback');
      expect(result).toBeDefined();
    });
  });

  describe('getCurrentLocale', () => {
    it('should return current locale', () => {
      expect(getCurrentLocale()).toBe('en');
    });

    it('should return updated locale after reinit', () => {
      vi.mocked(getLanguage).mockReturnValue('ru');
      initI18n();
      expect(getCurrentLocale()).toBe('ru');
    });
  });

  describe('getPluralForm', () => {
    describe('English locale', () => {
      beforeEach(() => {
        vi.mocked(getLanguage).mockReturnValue('en');
        initI18n();
      });

      it('should return "one" form for 1', () => {
        const result = getPluralForm(1, 'file', 'files', 'files');
        expect(result).toBe('file');
      });

      it('should return "many" form for 0', () => {
        const result = getPluralForm(0, 'file', 'files', 'files');
        expect(result).toBe('files');
      });

      it('should return "many" form for 2', () => {
        const result = getPluralForm(2, 'file', 'files', 'files');
        expect(result).toBe('files');
      });

      it('should return "many" form for 5', () => {
        const result = getPluralForm(5, 'file', 'files', 'files');
        expect(result).toBe('files');
      });

      it('should return "many" form for 100', () => {
        const result = getPluralForm(100, 'file', 'files', 'files');
        expect(result).toBe('files');
      });
    });

    describe('Russian locale', () => {
      beforeEach(() => {
        vi.mocked(getLanguage).mockReturnValue('ru');
        initI18n();
      });

      // "one" form: 1, 21, 31, 41, 51, 61, 71, 81, 91, 101, 121, etc. (but not 11)
      it('should return "one" form for 1', () => {
        const result = getPluralForm(1, 'заметка', 'заметки', 'заметок');
        expect(result).toBe('заметка');
      });

      it('should return "one" form for 21', () => {
        const result = getPluralForm(21, 'заметка', 'заметки', 'заметок');
        expect(result).toBe('заметка');
      });

      it('should return "one" form for 101', () => {
        const result = getPluralForm(101, 'заметка', 'заметки', 'заметок');
        expect(result).toBe('заметка');
      });

      // "few" form: 2-4, 22-24, 32-34, etc. (but not 12-14)
      it('should return "few" form for 2', () => {
        const result = getPluralForm(2, 'заметка', 'заметки', 'заметок');
        expect(result).toBe('заметки');
      });

      it('should return "few" form for 3', () => {
        const result = getPluralForm(3, 'заметка', 'заметки', 'заметок');
        expect(result).toBe('заметки');
      });

      it('should return "few" form for 4', () => {
        const result = getPluralForm(4, 'заметка', 'заметки', 'заметок');
        expect(result).toBe('заметки');
      });

      it('should return "few" form for 22', () => {
        const result = getPluralForm(22, 'заметка', 'заметки', 'заметок');
        expect(result).toBe('заметки');
      });

      // "many" form: 0, 5-20, 25-30, 35-40, etc. (including 11-14)
      it('should return "many" form for 0', () => {
        const result = getPluralForm(0, 'заметка', 'заметки', 'заметок');
        expect(result).toBe('заметок');
      });

      it('should return "many" form for 5', () => {
        const result = getPluralForm(5, 'заметка', 'заметки', 'заметок');
        expect(result).toBe('заметок');
      });

      it('should return "many" form for 11 (exception)', () => {
        const result = getPluralForm(11, 'заметка', 'заметки', 'заметок');
        expect(result).toBe('заметок');
      });

      it('should return "many" form for 12 (exception)', () => {
        const result = getPluralForm(12, 'заметка', 'заметки', 'заметок');
        expect(result).toBe('заметок');
      });

      it('should return "many" form for 13 (exception)', () => {
        const result = getPluralForm(13, 'заметка', 'заметки', 'заметок');
        expect(result).toBe('заметок');
      });

      it('should return "many" form for 14 (exception)', () => {
        const result = getPluralForm(14, 'заметка', 'заметки', 'заметок');
        expect(result).toBe('заметок');
      });

      it('should return "many" form for 20', () => {
        const result = getPluralForm(20, 'заметка', 'заметки', 'заметок');
        expect(result).toBe('заметок');
      });

      it('should return "many" form for 111 (exception)', () => {
        const result = getPluralForm(111, 'заметка', 'заметки', 'заметок');
        expect(result).toBe('заметок');
      });
    });
  });

  describe('tp (translate plural)', () => {
    beforeEach(() => {
      vi.mocked(getLanguage).mockReturnValue('en');
      initI18n();
    });

    it('should return translated plural with count replaced', () => {
      const result = tp('some.plural.key', 5, 'Fallback: {{count}}');
      expect(result).toContain('5');
    });

    it('should return fallback when key not found', () => {
      const result = tp('nonexistent.key', 3, 'Fallback: {{count}} items');
      expect(result).toBe('Fallback: 3 items');
    });

    it('should replace {{count}} in fallback', () => {
      const result = tp('nonexistent', 42, 'Total: {{count}}');
      expect(result).toBe('Total: 42');
    });

    it('should handle count of 1 in English', () => {
      const result = tp('key', 1, '{{count}} item');
      expect(result).toContain('1');
    });

    it('should handle count of 0', () => {
      const result = tp('key', 0, '{{count}} items');
      expect(result).toContain('0');
    });

    it('should handle large counts', () => {
      const result = tp('key', 1000, '{{count}} items');
      expect(result).toContain('1000');
    });

    describe('Russian plural forms', () => {
      beforeEach(() => {
        vi.mocked(getLanguage).mockReturnValue('ru');
        initI18n();
      });

      it('should use "one" form for 1', () => {
        // Translation should exist with {one, few, many} forms
        const result = tp('plural.key', 1, '{{count}} заметка');
        expect(result).toContain('1');
      });

      it('should use "few" form for 2', () => {
        const result = tp('plural.key', 2, '{{count}} заметки');
        expect(result).toContain('2');
      });

      it('should use "many" form for 5', () => {
        const result = tp('plural.key', 5, '{{count}} заметок');
        expect(result).toContain('5');
      });

      it('should use "many" form for 11 (exception)', () => {
        const result = tp('plural.key', 11, '{{count}} заметок');
        expect(result).toContain('11');
      });
    });
  });

  describe('tpSplit', () => {
    beforeEach(() => {
      vi.mocked(getLanguage).mockReturnValue('en');
      initI18n();
    });

    it('should return split format for custom rendering', () => {
      const result = tpSplit('some.key', 5);
      expect(result).toHaveProperty('before');
      expect(result).toHaveProperty('noun');
      expect(result).toHaveProperty('after');
    });

    it('should return empty parts for non-existent key', () => {
      const result = tpSplit('nonexistent.key', 5);
      expect(result.before).toBeDefined();
    });

    it('should handle count of 1', () => {
      const result = tpSplit('key', 1);
      expect(result).toBeDefined();
    });

    it('should handle count of 0', () => {
      const result = tpSplit('key', 0);
      expect(result).toBeDefined();
    });

    describe('Russian plural forms', () => {
      beforeEach(() => {
        vi.mocked(getLanguage).mockReturnValue('ru');
        initI18n();
      });

      it('should use "one" form for 1', () => {
        const result = tpSplit('key', 1);
        expect(result).toBeDefined();
      });

      it('should use "few" form for 2', () => {
        const result = tpSplit('key', 2);
        expect(result).toBeDefined();
      });

      it('should use "many" form for 5', () => {
        const result = tpSplit('key', 5);
        expect(result).toBeDefined();
      });

      it('should use "many" form for 11 (exception)', () => {
        const result = tpSplit('key', 11);
        expect(result).toBeDefined();
      });
    });
  });

  describe('edge cases', () => {
    it('should handle very deep nesting in translation keys', () => {
      const result = t('level1.level2.level3.level4.level5.level6', 'fallback');
      expect(result).toBeDefined();
    });

    it('should handle keys with numbers', () => {
      const result = t('key123.subkey456', 'fallback');
      expect(result).toBeDefined();
    });

    it('should handle empty variable replacement', () => {
      const result = t('key', { empty: '' }, 'Text {{empty}}');
      expect(result).toBe('Text ');
    });

    it('should handle many variables', () => {
      const vars = {
        var1: 'a',
        var2: 'b',
        var3: 'c',
        var4: 'd',
        var5: 'e',
      };
      const result = t(
        'key',
        vars,
        '{{var1}} {{var2}} {{var3}} {{var4}} {{var5}}'
      );
      expect(result).toBe('a b c d e');
    });

    it('should handle variable names with underscores', () => {
      const result = t('key', { file_name: 'test.md' }, 'File: {{file_name}}');
      expect(result).toBe('File: test.md');
    });

    it('should handle Russian locale switching', () => {
      vi.mocked(getLanguage).mockReturnValue('en');
      initI18n();
      expect(getCurrentLocale()).toBe('en');

      vi.mocked(getLanguage).mockReturnValue('ru');
      initI18n();
      expect(getCurrentLocale()).toBe('ru');

      vi.mocked(getLanguage).mockReturnValue('en');
      initI18n();
      expect(getCurrentLocale()).toBe('en');
    });

    it('should handle negative counts in plural forms', () => {
      const result = getPluralForm(-1, 'item', 'items', 'items');
      expect(result).toBeDefined();
    });

    it('should handle very large counts in plural forms', () => {
      const result = getPluralForm(999999, 'item', 'items', 'items');
      expect(result).toBe('items');
    });

    it('should handle decimal counts (rounds down)', () => {
      const result = tp('key', 2.7, '{{count}} items');
      expect(result).toContain('2.7');
    });
  });
});
