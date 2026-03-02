import { describe, it, expect, beforeEach } from 'vitest';
import {
  filterNonEmpty,
  processForbiddenChars,
  generateSafeLinkTarget,
  reverseSafeLinkTarget,
} from '../../src/utils/string-processing';
import { createTestSettings } from '../testUtils';
import { PluginSettings } from '../../src/types';

describe('string-processing', () => {
  describe('filterNonEmpty', () => {
    it('should filter out empty strings', () => {
      const input = ['hello', '', 'world', ''];
      const result = filterNonEmpty(input);
      expect(result).toEqual(['hello', 'world']);
    });

    it('should filter out whitespace-only strings', () => {
      const input = ['hello', '   ', 'world', '\t\n', 'test'];
      const result = filterNonEmpty(input);
      expect(result).toEqual(['hello', 'world', 'test']);
    });

    it('should keep strings with content even if they have whitespace', () => {
      const input = ['  hello  ', '  world  '];
      const result = filterNonEmpty(input);
      expect(result).toEqual(['  hello  ', '  world  ']);
    });

    it('should return empty array when all strings are empty', () => {
      const input = ['', '  ', '\t', '\n'];
      const result = filterNonEmpty(input);
      expect(result).toEqual([]);
    });

    it('should handle empty array input', () => {
      const result = filterNonEmpty([]);
      expect(result).toEqual([]);
    });
  });

  describe('processForbiddenChars', () => {
    let settings: PluginSettings;

    beforeEach(() => {
      settings = createTestSettings({
        replaceCharacters: {
          enableForbiddenCharReplacements: true,
          windowsAndroidEnabled: false,
          osPreset: 'macOS',
          charReplacements: {
            slash: {
              enabled: true,
              replacement: '-',
              trimLeft: false,
              trimRight: false,
            },
            colon: {
              enabled: true,
              replacement: '-',
              trimLeft: false,
              trimRight: false,
            },
            pipe: {
              enabled: true,
              replacement: '-',
              trimLeft: false,
              trimRight: false,
            },
            backslash: {
              enabled: true,
              replacement: '-',
              trimLeft: false,
              trimRight: false,
            },
            hash: {
              enabled: true,
              replacement: '',
              trimLeft: false,
              trimRight: false,
            },
            leftBracket: {
              enabled: true,
              replacement: '',
              trimLeft: false,
              trimRight: false,
            },
            rightBracket: {
              enabled: true,
              replacement: '',
              trimLeft: false,
              trimRight: false,
            },
            caret: {
              enabled: true,
              replacement: '',
              trimLeft: false,
              trimRight: false,
            },
            asterisk: {
              enabled: true,
              replacement: '',
              trimLeft: false,
              trimRight: false,
            },
            question: {
              enabled: true,
              replacement: '',
              trimLeft: false,
              trimRight: false,
            },
            lessThan: {
              enabled: true,
              replacement: '',
              trimLeft: false,
              trimRight: false,
            },
            greaterThan: {
              enabled: true,
              replacement: '',
              trimLeft: false,
              trimRight: false,
            },
            quote: {
              enabled: true,
              replacement: '',
              trimLeft: false,
              trimRight: false,
            },
            dot: {
              enabled: false,
              replacement: '',
              trimLeft: false,
              trimRight: false,
            },
          },
        },
      });
    });

    it('should replace forward slash with configured replacement', () => {
      const result = processForbiddenChars('hello/world', settings);
      expect(result).toBe('hello-world');
    });

    it('should replace colon with configured replacement', () => {
      const result = processForbiddenChars('hello:world', settings);
      expect(result).toBe('hello-world');
    });

    it('should replace backslash with configured replacement', () => {
      const result = processForbiddenChars('hello\\world', settings);
      expect(result).toBe('hello-world');
    });

    it('should strip characters when replacement is empty', () => {
      const result = processForbiddenChars('hello#world', settings);
      expect(result).toBe('helloworld');
    });

    it('should handle multiple forbidden characters', () => {
      const result = processForbiddenChars('hello/world:test#foo', settings);
      expect(result).toBe('hello-world-testfoo');
    });

    it('should not replace characters when master toggle is off', () => {
      settings.replaceCharacters.enableForbiddenCharReplacements = false;
      const result = processForbiddenChars('hello/world:test', settings);
      expect(result).toBe('helloworldtest'); // Strips forbidden chars
    });

    it('should not replace character when individual toggle is off', () => {
      settings.replaceCharacters.charReplacements.slash.enabled = false;
      const result = processForbiddenChars('hello/world', settings);
      expect(result).toBe('helloworld'); // Strips slash instead of replacing
    });

    it('should trim whitespace around result', () => {
      const result = processForbiddenChars('  hello/world  ', settings);
      expect(result).toBe('hello-world');
    });

    it('should collapse multiple spaces into single space', () => {
      const result = processForbiddenChars('hello    world', settings);
      expect(result).toBe('hello world');
    });

    it('should handle dots at the beginning (leading dots forbidden)', () => {
      const result = processForbiddenChars('.hello', settings);
      expect(result).toBe('hello');
    });

    it('should keep dots in middle when dot replacement disabled', () => {
      const result = processForbiddenChars('hello.world', settings);
      expect(result).toBe('hello.world');
    });

    it('should replace dots when dot replacement enabled', () => {
      settings.replaceCharacters.charReplacements.dot.enabled = true;
      settings.replaceCharacters.charReplacements.dot.replacement = '-';
      const result = processForbiddenChars('hello.world', settings);
      expect(result).toBe('hello-world');
    });

    it('should handle trimLeft option for replacements', () => {
      settings.replaceCharacters.charReplacements.slash.trimLeft = true;
      const result = processForbiddenChars('hello /world', settings);
      expect(result).toBe('hello-world'); // Trims space before slash
    });

    it('should handle trimRight option for replacements', () => {
      settings.replaceCharacters.charReplacements.slash.trimRight = true;
      const result = processForbiddenChars('hello/ world', settings);
      expect(result).toBe('hello-world'); // Trims space after slash
    });

    it('should respect maxLength option', () => {
      const result = processForbiddenChars(
        'hello world this is a long title',
        settings,
        {
          maxLength: 15,
        }
      );
      expect(result.length).toBeLessThanOrEqual(15);
      expect(result).toContain('…');
    });

    it('should handle Windows/Android characters when enabled', () => {
      settings.replaceCharacters.windowsAndroidEnabled = true;
      settings.replaceCharacters.charReplacements.asterisk.enabled = true;
      settings.replaceCharacters.charReplacements.asterisk.replacement = '-';
      const result = processForbiddenChars('hello*world', settings);
      expect(result).toBe('hello-world');
    });

    it('should not handle Windows/Android characters when disabled', () => {
      settings.replaceCharacters.windowsAndroidEnabled = false;
      settings.replaceCharacters.charReplacements.asterisk.enabled = true;
      settings.replaceCharacters.charReplacements.asterisk.replacement = '-';
      const result = processForbiddenChars('hello*world', settings);
      expect(result).toBe('hello*world'); // Asterisk not forbidden on macOS/Linux
    });

    it('should handle empty string input', () => {
      const result = processForbiddenChars('', settings);
      expect(result).toBe('');
    });

    it('should handle string with only forbidden characters', () => {
      const result = processForbiddenChars('//::##', settings);
      expect(result).toBe('----'); // Slashes and colons replaced, hashes stripped
    });

    it('should handle complex real-world title', () => {
      const result = processForbiddenChars(
        'Meeting Notes: 2024/01/15 [Draft]',
        settings
      );
      expect(result).toBe('Meeting Notes- 2024-01-15 Draft');
    });
  });

  describe('generateSafeLinkTarget', () => {
    let settings: PluginSettings;

    beforeEach(() => {
      settings = createTestSettings({
        replaceCharacters: {
          enableForbiddenCharReplacements: true,
          windowsAndroidEnabled: false,
          osPreset: 'macOS',
          charReplacements: {
            slash: {
              enabled: true,
              replacement: '-',
              trimLeft: false,
              trimRight: false,
            },
            colon: {
              enabled: true,
              replacement: '-',
              trimLeft: false,
              trimRight: false,
            },
            pipe: {
              enabled: true,
              replacement: '-',
              trimLeft: false,
              trimRight: false,
            },
            backslash: {
              enabled: true,
              replacement: '-',
              trimLeft: false,
              trimRight: false,
            },
            hash: {
              enabled: true,
              replacement: '',
              trimLeft: false,
              trimRight: false,
            },
            leftBracket: {
              enabled: true,
              replacement: '',
              trimLeft: false,
              trimRight: false,
            },
            rightBracket: {
              enabled: true,
              replacement: '',
              trimLeft: false,
              trimRight: false,
            },
            caret: {
              enabled: true,
              replacement: '',
              trimLeft: false,
              trimRight: false,
            },
            asterisk: {
              enabled: true,
              replacement: '',
              trimLeft: false,
              trimRight: false,
            },
            question: {
              enabled: true,
              replacement: '',
              trimLeft: false,
              trimRight: false,
            },
            lessThan: {
              enabled: true,
              replacement: '',
              trimLeft: false,
              trimRight: false,
            },
            greaterThan: {
              enabled: true,
              replacement: '',
              trimLeft: false,
              trimRight: false,
            },
            quote: {
              enabled: true,
              replacement: '',
              trimLeft: false,
              trimRight: false,
            },
            dot: {
              enabled: false,
              replacement: '',
              trimLeft: false,
              trimRight: false,
            },
          },
        },
      });
    });

    it('should generate safe link target by processing forbidden chars', () => {
      const result = generateSafeLinkTarget(
        'Title/With:Forbidden|Chars',
        settings
      );
      expect(result).toBe('Title-With-Forbidden-Chars');
    });

    it('should handle text with brackets', () => {
      const result = generateSafeLinkTarget('Title [Draft]', settings);
      expect(result).toBe('Title Draft');
    });
  });

  describe('reverseSafeLinkTarget', () => {
    let settings: PluginSettings;

    beforeEach(() => {
      settings = createTestSettings({
        replaceCharacters: {
          enableForbiddenCharReplacements: true,
          windowsAndroidEnabled: false,
          osPreset: 'macOS',
          charReplacements: {
            slash: {
              enabled: true,
              replacement: '-',
              trimLeft: false,
              trimRight: false,
            },
            colon: {
              enabled: true,
              replacement: ':',
              trimLeft: false,
              trimRight: false,
            },
            pipe: {
              enabled: true,
              replacement: '|',
              trimLeft: false,
              trimRight: false,
            },
            backslash: {
              enabled: true,
              replacement: '\\',
              trimLeft: false,
              trimRight: false,
            },
            hash: {
              enabled: true,
              replacement: '#',
              trimLeft: false,
              trimRight: false,
            },
            leftBracket: {
              enabled: true,
              replacement: '[',
              trimLeft: false,
              trimRight: false,
            },
            rightBracket: {
              enabled: true,
              replacement: ']',
              trimLeft: false,
              trimRight: false,
            },
            caret: {
              enabled: true,
              replacement: '^',
              trimLeft: false,
              trimRight: false,
            },
            asterisk: {
              enabled: true,
              replacement: '*',
              trimLeft: false,
              trimRight: false,
            },
            question: {
              enabled: true,
              replacement: '?',
              trimLeft: false,
              trimRight: false,
            },
            lessThan: {
              enabled: true,
              replacement: '<',
              trimLeft: false,
              trimRight: false,
            },
            greaterThan: {
              enabled: true,
              replacement: '>',
              trimLeft: false,
              trimRight: false,
            },
            quote: {
              enabled: true,
              replacement: '"',
              trimLeft: false,
              trimRight: false,
            },
            dot: {
              enabled: false,
              replacement: '',
              trimLeft: false,
              trimRight: false,
            },
          },
        },
      });
    });

    it('should reverse slash replacement', () => {
      const result = reverseSafeLinkTarget('Title-With-Dashes', settings);
      expect(result).toBe('Title/With/Dashes');
    });

    it('should reverse colon replacement', () => {
      const result = reverseSafeLinkTarget('Meeting Notes: 2024', settings);
      expect(result).toBe('Meeting Notes: 2024');
    });

    it('should handle multiple replacements', () => {
      // When multiple chars map to same replacement, reverse uses the first mapping
      settings.replaceCharacters.charReplacements.colon.replacement = '-';
      const safe = 'Title-With-Multiple-Separators';
      const result = reverseSafeLinkTarget(safe, settings);
      // Both slash and colon map to '-', so dashes get reversed to '/' (first mapping)
      expect(result).toContain('/');
    });

    it('should not reverse when master toggle is off', () => {
      settings.replaceCharacters.enableForbiddenCharReplacements = false;
      const result = reverseSafeLinkTarget('Title-With-Dashes', settings);
      expect(result).toBe('Title-With-Dashes');
    });

    it('should not reverse when individual toggle is off', () => {
      settings.replaceCharacters.charReplacements.slash.enabled = false;
      const result = reverseSafeLinkTarget('Title-With-Dashes', settings);
      expect(result).toBe('Title-With-Dashes');
    });

    it('should handle Windows/Android characters when enabled', () => {
      settings.replaceCharacters.windowsAndroidEnabled = true;
      settings.replaceCharacters.charReplacements.asterisk.replacement = 'STAR';
      const result = reverseSafeLinkTarget('TitleSTARBold', settings);
      expect(result).toBe('Title*Bold');
    });

    it('should not reverse Windows/Android characters when disabled', () => {
      settings.replaceCharacters.windowsAndroidEnabled = false;
      settings.replaceCharacters.charReplacements.asterisk.replacement = 'STAR';
      const result = reverseSafeLinkTarget('TitleSTARBold', settings);
      expect(result).toBe('TitleSTARBold');
    });

    it('should handle empty replacement (no reverse needed)', () => {
      settings.replaceCharacters.charReplacements.hash.replacement = '';
      const result = reverseSafeLinkTarget('TitleWithoutHash', settings);
      expect(result).toBe('TitleWithoutHash');
    });

    it('should handle empty string', () => {
      const result = reverseSafeLinkTarget('', settings);
      expect(result).toBe('');
    });
  });
});
