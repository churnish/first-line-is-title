import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  verboseLog,
  isValidHeading,
  detectOS,
  canModifyFile,
  hasDisablePropertyInFile,
  containsSafeword,
  extractTitle,
} from '../src/utils';
import { createTestSettings, createMockFile, createMockApp } from './testUtils';
import { PluginSettings } from '../src/types';
import { TFile, App, Platform } from './mockObsidian';

describe('utils', () => {
  let settings: PluginSettings;
  let app: App;

  beforeEach(() => {
    settings = createTestSettings();
    app = createMockApp();
  });

  describe('verboseLog', () => {
    let consoleSpy: any;

    beforeEach(() => {
      // In vitest v4, spyOn on a pre-mocked vi.fn() shares call history with the
      // global mock from setup.ts. mockClear() resets the count for this test.
      consoleSpy = vi.spyOn(console, 'debug');
      consoleSpy.mockClear();
    });

    it('should log when verbose logging is enabled', () => {
      settings.core.verboseLogging = true;
      const plugin = { settings };

      verboseLog(plugin, 'Test message');

      expect(consoleSpy).toHaveBeenCalledWith('Test message');
    });

    it('should log with data when provided', () => {
      settings.core.verboseLogging = true;
      const plugin = { settings };
      const data = { foo: 'bar' };

      verboseLog(plugin, 'Test message', data);

      expect(consoleSpy).toHaveBeenCalledWith('Test message', data);
    });

    it('should not log when verbose logging is disabled', () => {
      settings.core.verboseLogging = false;
      const plugin = { settings };

      verboseLog(plugin, 'Test message');

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('isValidHeading', () => {
    it('should return true for h1 heading', () => {
      expect(isValidHeading('# Heading')).toBe(true);
    });

    it('should return true for h2 heading', () => {
      expect(isValidHeading('## Heading')).toBe(true);
    });

    it('should return true for h3-h6 headings', () => {
      expect(isValidHeading('### Heading')).toBe(true);
      expect(isValidHeading('#### Heading')).toBe(true);
      expect(isValidHeading('##### Heading')).toBe(true);
      expect(isValidHeading('###### Heading')).toBe(true);
    });

    it('should return false for more than 6 hashes', () => {
      expect(isValidHeading('####### Heading')).toBe(false);
    });

    it('should return false when no space after hashes', () => {
      expect(isValidHeading('#Heading')).toBe(false);
    });

    it('should return false for plain text', () => {
      expect(isValidHeading('Plain text')).toBe(false);
    });

    it('should return false for hash in middle of line', () => {
      expect(isValidHeading('Text # Heading')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidHeading('')).toBe(false);
    });

    it('should handle headings with special characters', () => {
      expect(isValidHeading('# Heading with **bold** and _italic_')).toBe(true);
    });

    it('should handle headings with numbers', () => {
      expect(isValidHeading('# 123 Numbers')).toBe(true);
    });
  });

  describe('detectOS', () => {
    it('should detect macOS', () => {
      Platform.isMacOS = true;
      Platform.isWin = false;

      expect(detectOS()).toBe('macOS');
    });

    it('should detect iOS', () => {
      Platform.isMacOS = false;
      Platform.isIosApp = true;
      Platform.isWin = false;

      expect(detectOS()).toBe('macOS');
    });

    it('should detect Windows', () => {
      Platform.isMacOS = false;
      Platform.isIosApp = false;
      Platform.isWin = true;

      expect(detectOS()).toBe('Windows');
    });

    it('should default to Linux', () => {
      Platform.isMacOS = false;
      Platform.isIosApp = false;
      Platform.isWin = false;
      Platform.isLinux = true;

      expect(detectOS()).toBe('Linux');
    });

    it('should detect Android as Linux', () => {
      Platform.isMacOS = false;
      Platform.isIosApp = false;
      Platform.isWin = false;
      Platform.isAndroidApp = true;

      expect(detectOS()).toBe('Linux');
    });
  });

  describe('hasDisablePropertyInFile', () => {
    it('should return true when file has matching disable property', async () => {
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { 'no rename': 'true' },
      });

      const result = await hasDisablePropertyInFile(
        file,
        app,
        'no rename',
        'true'
      );
      expect(result).toBe(true);
    });

    it('should return false when file has no frontmatter', async () => {
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: null,
      });

      const result = await hasDisablePropertyInFile(
        file,
        app,
        'no rename',
        'true'
      );
      expect(result).toBe(false);
    });

    it('should return false when file has no cache', async () => {
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue(null);

      const result = await hasDisablePropertyInFile(
        file,
        app,
        'no rename',
        'true'
      );
      expect(result).toBe(false);
    });

    it('should return false when property does not exist', async () => {
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { other: 'value' },
      });

      const result = await hasDisablePropertyInFile(
        file,
        app,
        'no rename',
        'true'
      );
      expect(result).toBe(false);
    });

    it('should handle array property values', async () => {
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { tags: ['important', 'draft'] },
      });

      const result = await hasDisablePropertyInFile(file, app, 'tags', 'draft');
      expect(result).toBe(true);
    });

    it('should handle case-insensitive string comparison', async () => {
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { status: 'DISABLED' },
      });

      const result = await hasDisablePropertyInFile(
        file,
        app,
        'status',
        'disabled'
      );
      expect(result).toBe(true);
    });

    it('should handle boolean property values', async () => {
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { disabled: true },
      });

      const result = await hasDisablePropertyInFile(
        file,
        app,
        'disabled',
        'true'
      );
      expect(result).toBe(true);
    });

    it('should handle numeric property values', async () => {
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { count: 5 },
      });

      const result = await hasDisablePropertyInFile(file, app, 'count', '5');
      expect(result).toBe(true);
    });

    it('should return false when property value does not match', async () => {
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { status: 'draft' },
      });

      const result = await hasDisablePropertyInFile(
        file,
        app,
        'status',
        'published'
      );
      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockImplementation(() => {
        throw new Error('Cache error');
      });

      const result = await hasDisablePropertyInFile(
        file,
        app,
        'no rename',
        'true'
      );
      expect(result).toBe(false);
    });
  });

  describe('canModifyFile', () => {
    let file: TFile;

    beforeEach(() => {
      file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: null,
      });
      app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);
    });

    it('should allow modification for valid file with manual command', async () => {
      const result = await canModifyFile(file, app, 'no rename', 'true', true);

      expect(result.canModify).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should block modification when disable property is present', async () => {
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { 'no rename': 'true' },
      });

      const result = await canModifyFile(file, app, 'no rename', 'true', true);

      expect(result.canModify).toBe(false);
      expect(result.reason).toBe('disable property present');
    });

    it('should block automatic modification when file not open in editor', async () => {
      app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);

      const result = await canModifyFile(file, app, 'no rename', 'true', false);

      expect(result.canModify).toBe(false);
      expect(result.reason).toBe('file not open in editor');
    });

    it('should allow automatic modification when file is open in editor', async () => {
      const mockLeaf = {
        view: {
          file: file,
        },
      };
      app.workspace.getLeavesOfType = vi.fn().mockReturnValue([mockLeaf]);

      const result = await canModifyFile(file, app, 'no rename', 'true', false);

      expect(result.canModify).toBe(true);
    });

    it('should respect hasActiveEditor parameter when provided', async () => {
      const result = await canModifyFile(
        file,
        app,
        'no rename',
        'true',
        false,
        true // hasActiveEditor = true
      );

      expect(result.canModify).toBe(true);
    });

    it('should block when hasActiveEditor is false', async () => {
      const result = await canModifyFile(
        file,
        app,
        'no rename',
        'true',
        false,
        false // hasActiveEditor = false
      );

      expect(result.canModify).toBe(false);
      expect(result.reason).toBe('file not open in editor');
    });

    it('should allow manual command even when file not open', async () => {
      app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);

      const result = await canModifyFile(file, app, 'no rename', 'true', true);

      expect(result.canModify).toBe(true);
    });
  });

  describe('containsSafeword', () => {
    beforeEach(() => {
      settings.safewords.enableSafewords = true;
      settings.safewords.safewords = [
        {
          text: 'draft',
          onlyAtStart: false,
          onlyWholeLine: false,
          enabled: true,
          caseSensitive: false,
        },
      ];
    });

    it('should return false when safewords are disabled', () => {
      settings.safewords.enableSafewords = false;

      expect(containsSafeword('draft note.md', settings)).toBe(false);
    });

    it('should detect safeword in filename', () => {
      expect(containsSafeword('draft note.md', settings)).toBe(true);
    });

    it('should detect safeword in filename without extension', () => {
      expect(containsSafeword('My draft', settings)).toBe(true);
    });

    it('should be case-insensitive by default', () => {
      expect(containsSafeword('DRAFT note.md', settings)).toBe(true);
      expect(containsSafeword('Draft Note.md', settings)).toBe(true);
    });

    it('should respect case sensitivity when enabled', () => {
      settings.safewords.safewords[0].caseSensitive = true;

      expect(containsSafeword('draft note.md', settings)).toBe(true);
      expect(containsSafeword('DRAFT note.md', settings)).toBe(false);
    });

    it('should match only at start when onlyAtStart is true', () => {
      settings.safewords.safewords[0].onlyAtStart = true;

      expect(containsSafeword('draft note.md', settings)).toBe(true);
      expect(containsSafeword('my draft.md', settings)).toBe(false);
    });

    it('should match whole line when onlyWholeLine is true', () => {
      settings.safewords.safewords[0].onlyWholeLine = true;

      expect(containsSafeword('draft.md', settings)).toBe(true);
      expect(containsSafeword('draft', settings)).toBe(true);
      expect(containsSafeword('draft note.md', settings)).toBe(false);
    });

    it('should skip disabled safewords', () => {
      settings.safewords.safewords[0].enabled = false;

      expect(containsSafeword('draft note.md', settings)).toBe(false);
    });

    it('should skip empty safewords', () => {
      settings.safewords.safewords = [
        {
          text: '',
          onlyAtStart: false,
          onlyWholeLine: false,
          enabled: true,
          caseSensitive: false,
        },
      ];

      expect(containsSafeword('any file.md', settings)).toBe(false);
    });

    it('should check multiple safewords', () => {
      settings.safewords.safewords = [
        {
          text: 'draft',
          onlyAtStart: false,
          onlyWholeLine: false,
          enabled: true,
          caseSensitive: false,
        },
        {
          text: 'todo',
          onlyAtStart: false,
          onlyWholeLine: false,
          enabled: true,
          caseSensitive: false,
        },
      ];

      expect(containsSafeword('draft note.md', settings)).toBe(true);
      expect(containsSafeword('todo list.md', settings)).toBe(true);
      expect(containsSafeword('final version.md', settings)).toBe(false);
    });

    it('should handle safewords with special characters', () => {
      settings.safewords.safewords = [
        {
          text: '[draft]',
          onlyAtStart: false,
          onlyWholeLine: false,
          enabled: true,
          caseSensitive: false,
        },
      ];

      expect(containsSafeword('[draft] note.md', settings)).toBe(true);
    });

    it('should trim filenames and safewords for whole line comparison', () => {
      settings.safewords.safewords[0].onlyWholeLine = true;
      settings.safewords.safewords[0].text = '  draft  ';

      expect(containsSafeword('  draft  .md', settings)).toBe(true);
    });
  });

  describe('extractTitle', () => {
    beforeEach(() => {
      // Enable all markup stripping by default for tests
      settings.markupStripping.enableStripMarkup = true;
      settings.markupStripping.stripMarkupSettings.callouts = true;
      settings.markupStripping.stripMarkupSettings.quote = true;
      settings.markupStripping.stripMarkupSettings.taskLists = true;
      settings.markupStripping.stripMarkupSettings.unorderedLists = true;
      settings.markupStripping.stripMarkupSettings.orderedLists = true;
    });

    describe('callout markup stripping', () => {
      it('should strip callout and return title', () => {
        expect(extractTitle('> [!note] My Title', settings)).toBe('My Title');
      });

      it('should handle folded callout with no title', () => {
        expect(extractTitle('> [!note]-', settings)).toBe('Untitled');
      });

      it('should handle expanded callout with no title', () => {
        expect(extractTitle('> [!note]+', settings)).toBe('Untitled');
      });

      it('should handle callout with trailing space only', () => {
        expect(extractTitle('> [!note]+ ', settings)).toBe('Untitled');
      });

      it('should handle folded callout with title', () => {
        expect(extractTitle('> [!note]- My Title', settings)).toBe('My Title');
      });

      it('should handle expanded callout with title', () => {
        expect(extractTitle('> [!note]+ My Title', settings)).toBe('My Title');
      });

      it('should preserve dash in callout title content', () => {
        expect(extractTitle('> [!note] - hello', settings)).toBe('- hello');
      });

      it('should preserve plus in callout title content', () => {
        expect(extractTitle('> [!note] + hello', settings)).toBe('+ hello');
      });

      it('should handle callout with no fold indicator and no title', () => {
        expect(extractTitle('> [!warning]', settings)).toBe('Untitled');
      });
    });

    describe('task list context awareness', () => {
      it('should strip task list when enabled', () => {
        expect(extractTitle('- [x] My Task', settings)).toBe('My Task');
      });

      it('should NOT strip task list marker when only unordered list stripping enabled', () => {
        settings.markupStripping.stripMarkupSettings.taskLists = false;
        settings.markupStripping.stripMarkupSettings.unorderedLists = true;

        // Task list should NOT have its marker stripped as unordered list
        expect(extractTitle('- [x] My Task', settings)).toBe('- [x] My Task');
      });

      it('should NOT strip ordered task list marker when only ordered list stripping enabled', () => {
        settings.markupStripping.stripMarkupSettings.taskLists = false;
        settings.markupStripping.stripMarkupSettings.orderedLists = true;

        // Task list should NOT have its marker stripped as ordered list
        expect(extractTitle('1. [x] My Task', settings)).toBe('1. [x] My Task');
      });

      it('should strip task list checkbox for ordered task list', () => {
        expect(extractTitle('1. [x] My Task', settings)).toBe('My Task');
      });

      it('should handle empty task list marker', () => {
        expect(extractTitle('- [ ] ', settings)).toBe('Untitled');
      });

      it('should handle indented empty task list marker', () => {
        expect(extractTitle('  - [x] ', settings)).toBe('Untitled');
      });
    });

    describe('unordered list context awareness', () => {
      it('should strip unordered list marker', () => {
        expect(extractTitle('- My Item', settings)).toBe('My Item');
      });

      it('should handle indented empty unordered list marker (0-3 spaces)', () => {
        expect(extractTitle('  - ', settings)).toBe('Untitled');
      });

      it('should handle 3-space indented empty list marker', () => {
        expect(extractTitle('   - ', settings)).toBe('Untitled');
      });

      it('should NOT strip list marker with 4+ spaces (code block)', () => {
        // 4 spaces = code block per CommonMark spec
        expect(extractTitle('    - item', settings)).toBe('- item');
      });

      it('should NOT strip list-like content after callout stripping', () => {
        // Original line is callout, not list - should preserve dash in title
        expect(extractTitle('> [!info] - hello there', settings)).toBe(
          '- hello there'
        );
      });

      it('should NOT strip list-like content after quote stripping', () => {
        // After quote stripped, "- hello" remains but shouldn't be stripped as list
        // because original line was a quote, not a list
        settings.markupStripping.stripMarkupSettings.callouts = false;
        expect(extractTitle('> - hello there', settings)).toBe('- hello there');
      });
    });

    describe('ordered list context awareness', () => {
      it('should strip ordered list marker', () => {
        expect(extractTitle('1. My Item', settings)).toBe('My Item');
      });

      it('should handle indented empty ordered list marker', () => {
        expect(extractTitle('  1. ', settings)).toBe('Untitled');
      });

      it('should NOT strip ordered list marker with 4+ spaces (code block)', () => {
        expect(extractTitle('    1. item', settings)).toBe('1. item');
      });

      it('should NOT strip ordered list-like content after callout stripping', () => {
        expect(extractTitle('> [!info] 1. hello', settings)).toBe('1. hello');
      });
    });

    describe('quote markup stripping', () => {
      it('should strip quote markup', () => {
        settings.markupStripping.stripMarkupSettings.callouts = false;
        expect(extractTitle('> My Quote', settings)).toBe('My Quote');
      });

      it('should handle empty quote', () => {
        settings.markupStripping.stripMarkupSettings.callouts = false;
        expect(extractTitle('> ', settings)).toBe('Untitled');
      });
    });

    describe('indentation and code block detection', () => {
      it('should treat 0-space indent as valid list', () => {
        expect(extractTitle('- item', settings)).toBe('item');
      });

      it('should treat 1-space indent as valid list', () => {
        expect(extractTitle(' - item', settings)).toBe('item');
      });

      it('should treat 2-space indent as valid list', () => {
        expect(extractTitle('  - item', settings)).toBe('item');
      });

      it('should treat 3-space indent as valid list', () => {
        expect(extractTitle('   - item', settings)).toBe('item');
      });

      it('should treat 4-space indent as code block (no strip)', () => {
        expect(extractTitle('    - item', settings)).toBe('- item');
      });

      it('should treat 5+ space indent as code block (no strip)', () => {
        expect(extractTitle('     - item', settings)).toBe('- item');
      });

      it('should treat tab indent as code block (no strip)', () => {
        // Tab expands to column 4 per CommonMark, so it's a code block
        expect(extractTitle('\t- item', settings)).toBe('- item');
      });

      it('should treat space+tab indent as code block (no strip)', () => {
        // Space (col 1) + tab (expands to col 4) = 4 visual spaces = code block
        expect(extractTitle(' \t- item', settings)).toBe('- item');
      });

      it('should treat tab-indented task list as code block (no strip)', () => {
        expect(extractTitle('\t- [x] task', settings)).toBe('- [x] task');
      });

      it('should treat tab-indented ordered list as code block (no strip)', () => {
        expect(extractTitle('\t1. item', settings)).toBe('1. item');
      });

      it('should treat tab-indented empty unordered marker as code block (no Untitled)', () => {
        // Tab = code block, so "\t- " should become "-" not "Untitled"
        expect(extractTitle('\t- ', settings)).toBe('-');
      });

      it('should treat tab-indented empty task marker as code block (no Untitled)', () => {
        expect(extractTitle('\t- [ ] ', settings)).toBe('- [ ]');
      });

      it('should treat tab-indented empty ordered marker as code block (no Untitled)', () => {
        expect(extractTitle('\t1. ', settings)).toBe('1.');
      });
    });
  });
});
