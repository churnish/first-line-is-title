import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RenameEngine } from '../../src/core/rename-engine';
import {
  createMockFile,
  createMockApp,
  createTestSettings,
} from '../testUtils';
import { TFile, Editor, App } from '../mockObsidian';

// Mock plugin for RenameEngine
function createMockPlugin() {
  const app = createMockApp();
  const settings = createTestSettings();

  return {
    app,
    settings,
    trackUsage: vi.fn(),
    cacheManager: {
      isLocked: vi.fn().mockReturnValue(false),
      acquireLock: vi.fn().mockReturnValue(true),
      releaseLock: vi.fn(),
      markPendingAliasRecheck: vi.fn(),
      hasPendingAliasRecheck: vi.fn().mockReturnValue(false),
    },
    fileStateManager: {
      // Content tracking
      isEditorSyncing: vi.fn().mockReturnValue(false),
      getLastEditorContent: vi.fn().mockReturnValue(undefined),
      setLastEditorContent: vi.fn(),
      deleteLastEditorContent: vi.fn(),
      isEditorContentStale: vi.fn().mockReturnValue(false),
      getLastSavedContent: vi.fn().mockReturnValue(undefined),
      setLastSavedContent: vi.fn(),
      deleteLastSavedContent: vi.fn(),
      isSavedContentStale: vi.fn().mockReturnValue(false),
      // Title region cache
      getTitleRegionCache: vi.fn().mockReturnValue(undefined),
      setTitleRegionCache: vi.fn(),
      deleteTitleRegionCache: vi.fn(),
      clearAllTitleRegionCaches: vi.fn(),
      updateTitleRegionCacheKey: vi.fn(),
      // Fresh read flag
      needsFreshRead: vi.fn().mockReturnValue(false),
      markNeedsFreshRead: vi.fn(),
      clearNeedsFreshRead: vi.fn(),
      // Alias update status
      setLastAliasUpdateStatus: vi.fn(),
      getLastAliasUpdateStatus: vi.fn().mockReturnValue(undefined),
      isAliasStatusStale: vi.fn().mockReturnValue(true),
      // File lifecycle
      notifyFileRenamed: vi.fn(),
      notifyFileDeleted: vi.fn(),
      markRecentlyRenamed: vi.fn(),
      wasRecentlyRenamed: vi.fn().mockReturnValue(false),
      // Editor syncing
      markEditorSyncing: vi.fn(),
      clearEditorSyncing: vi.fn(),
      // Pending alias recheck
      markPendingAliasRecheck: vi.fn(),
      hasPendingAliasRecheck: vi.fn().mockReturnValue(false),
      getPendingAliasEditor: vi.fn().mockReturnValue(undefined),
      clearPendingAliasRecheck: vi.fn(),
      getFilesWithPendingAliasRecheck: vi.fn().mockReturnValue([]),
      // Lifecycle timers
      setCreationDelayTimer: vi.fn(),
      clearCreationDelayTimer: vi.fn(),
      isFileInCreationDelay: vi.fn().mockReturnValue(false),
      setThrottleTimer: vi.fn(),
      clearThrottleTimer: vi.fn(),
      hasThrottleTimer: vi.fn().mockReturnValue(false),
      clearAllThrottleTimers: vi.fn(),
      // Locking
      acquireLock: vi.fn().mockReturnValue(true),
      releaseLock: vi.fn(),
      isLocked: vi.fn().mockReturnValue(false),
      clearAllLocks: vi.fn(),
      // Notice rate limiting
      setLastSelfRefNotice: vi.fn(),
      canShowSelfRefNotice: vi.fn().mockReturnValue(true),
      setLastSafewordNotice: vi.fn(),
      canShowSafewordNotice: vi.fn().mockReturnValue(true),
      // Operation tracking
      getOperationData: vi.fn().mockReturnValue(undefined),
      setOperationData: vi.fn(),
      updateOperationCount: vi.fn(),
      // Maintenance
      runMaintenance: vi.fn(),
      dispose: vi.fn(),
      // State access
      getState: vi.fn().mockReturnValue(undefined),
    },
    eventHandlerManager: {
      isAliasUpdatePending: vi.fn().mockReturnValue(false),
      markAliasUpdatePending: vi.fn(),
      clearAliasUpdatePending: vi.fn(),
    },
    aliasManager: {
      updateAliasIfNeeded: vi.fn().mockResolvedValue(false),
    },
  } as any;
}

describe('RenameEngine', () => {
  let plugin: any;
  let renameEngine: RenameEngine;
  let file: TFile;
  let editor: Editor;

  beforeEach(() => {
    plugin = createMockPlugin();
    renameEngine = new RenameEngine(plugin);
    file = createMockFile('test.md');
    editor = new Editor();
  });

  describe('constructor', () => {
    it('should initialize rate limiters', () => {
      expect(renameEngine).toBeDefined();
      expect(renameEngine['perFileRateLimiter']).toBeDefined();
      expect(renameEngine['globalRateLimiter']).toBeDefined();
    });
  });

  describe('checkFileTimeLimit', () => {
    it('should return true when under limit', () => {
      const result = renameEngine.checkFileTimeLimit(file);
      expect(result).toBe(true);
    });

    it('should track per-file rate limits', () => {
      const file1 = createMockFile('file1.md');
      const file2 = createMockFile('file2.md');

      // Different files should have independent limits
      expect(renameEngine.checkFileTimeLimit(file1)).toBe(true);
      expect(renameEngine.checkFileTimeLimit(file2)).toBe(true);
    });

    it('should return false when limit exceeded', () => {
      // Call 20 times (limit is 15 per 500ms)
      for (let i = 0; i < 20; i++) {
        renameEngine.checkFileTimeLimit(file);
      }

      // Should eventually return false
      const result = renameEngine.checkFileTimeLimit(file);
      expect(result).toBe(false);
    });
  });

  describe('checkGlobalRateLimit', () => {
    it('should return true when under global limit', () => {
      const result = renameEngine.checkGlobalRateLimit();
      expect(result).toBe(true);
    });

    it('should return false when global limit exceeded', () => {
      // Call 35 times (global limit is 30 per 500ms)
      for (let i = 0; i < 35; i++) {
        renameEngine.checkGlobalRateLimit();
      }

      const result = renameEngine.checkGlobalRateLimit();
      expect(result).toBe(false);
    });
  });

  describe('stripFrontmatterFromContent', () => {
    it('should strip frontmatter from content', () => {
      const content = '---\ntitle: Test\n---\nBody content';
      const result = renameEngine.stripFrontmatterFromContent(content, file);
      expect(result).toBe('Body content');
    });

    it('should handle content without frontmatter', () => {
      const content = 'Just body content';
      const result = renameEngine.stripFrontmatterFromContent(content, file);
      expect(result).toBe('Just body content');
    });

    it('should return empty string for undefined content', () => {
      const result = renameEngine.stripFrontmatterFromContent(undefined, file);
      expect(result).toBe('');
    });

    it('should return empty string for empty content', () => {
      const result = renameEngine.stripFrontmatterFromContent('', file);
      expect(result).toBe('');
    });

    it('should handle frontmatter with multiple lines', () => {
      const content =
        '---\ntitle: Test\ntags: [tag1, tag2]\ndate: 2024-01-01\n---\nContent here';
      const result = renameEngine.stripFrontmatterFromContent(content, file);
      expect(result).toBe('Content here');
    });

    it('should handle content with only frontmatter', () => {
      const content = '---\ntitle: Test\n---';
      const result = renameEngine.stripFrontmatterFromContent(content, file);
      expect(result).toBe('');
    });

    it('should handle incomplete frontmatter (no closing ---)', () => {
      const content = '---\ntitle: Test\nBody content';
      const result = renameEngine.stripFrontmatterFromContent(content, file);
      expect(result).toBe('---\ntitle: Test\nBody content'); // Returns as-is
    });

    it('should handle content starting with --- but not frontmatter', () => {
      const content = '--- not frontmatter\nContent';
      const result = renameEngine.stripFrontmatterFromContent(content, file);
      // If first line is exactly "---", it searches for closing
      // Since "--- not frontmatter" has text after, it won't be treated as frontmatter
      expect(result).toBe('--- not frontmatter\nContent');
    });

    it('should handle frontmatter with empty lines', () => {
      const content = '---\n\ntitle: Test\n\n---\nContent';
      const result = renameEngine.stripFrontmatterFromContent(content, file);
      expect(result).toBe('Content');
    });

    it('should preserve newlines in body content', () => {
      const content = '---\ntitle: Test\n---\nLine 1\nLine 2\nLine 3';
      const result = renameEngine.stripFrontmatterFromContent(content, file);
      expect(result).toBe('Line 1\nLine 2\nLine 3');
    });
  });

  describe('extractTitleRegion', () => {
    beforeEach(() => {
      plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatterPosition: null,
      });
    });

    it('should extract first non-empty line', () => {
      const content = 'First Line\nSecond Line';
      editor.getValue = vi.fn().mockReturnValue(content);

      const result = renameEngine.extractTitleRegion(editor, file);

      expect(result.firstNonEmptyLine).toBe('First Line');
      expect(result.titleSourceLine).toBeDefined();
      expect(result.lastUpdated).toBeGreaterThan(0);
    });

    it('should skip frontmatter when extracting title', () => {
      const content = '---\ntitle: Test\n---\nFirst Body Line\nSecond Line';
      editor.getValue = vi.fn().mockReturnValue(content);

      plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatterPosition: {
          start: { line: 0, col: 0, offset: 0 },
          end: { line: 2, col: 3, offset: 23 },
        },
      });

      const result = renameEngine.extractTitleRegion(editor, file);

      expect(result.firstNonEmptyLine).toBe('First Body Line');
    });

    it('should skip empty lines', () => {
      const content = '\n\n\nFirst Line\nSecond Line';
      editor.getValue = vi.fn().mockReturnValue(content);

      const result = renameEngine.extractTitleRegion(editor, file);

      expect(result.firstNonEmptyLine).toBe('First Line');
    });

    it('should handle content with only empty lines', () => {
      const content = '\n\n\n';
      editor.getValue = vi.fn().mockReturnValue(content);

      const result = renameEngine.extractTitleRegion(editor, file);

      expect(result.firstNonEmptyLine).toBe('');
      expect(result.titleSourceLine).toBe('');
    });

    it('should handle empty content', () => {
      const content = '';
      editor.getValue = vi.fn().mockReturnValue(content);

      const result = renameEngine.extractTitleRegion(editor, file);

      expect(result.firstNonEmptyLine).toBe('');
      expect(result.titleSourceLine).toBe('');
    });

    it('should use provided content instead of editor', () => {
      const content = 'Provided Content';
      editor.getValue = vi.fn().mockReturnValue('Editor Content');

      const result = renameEngine.extractTitleRegion(editor, file, content);

      expect(result.firstNonEmptyLine).toBe('Provided Content');
      expect(editor.getValue).not.toHaveBeenCalled();
    });

    it('should handle content with whitespace-only lines', () => {
      const content = '   \n\t\t\n  \nFirst Line';
      editor.getValue = vi.fn().mockReturnValue(content);

      const result = renameEngine.extractTitleRegion(editor, file);

      expect(result.firstNonEmptyLine).toBe('First Line');
    });

    it('should preserve leading/trailing whitespace in title line', () => {
      const content = '  Padded Title  \nSecond Line';
      editor.getValue = vi.fn().mockReturnValue(content);

      const result = renameEngine.extractTitleRegion(editor, file);

      expect(result.firstNonEmptyLine).toBe('  Padded Title  ');
    });

    it('should handle single line content', () => {
      const content = 'Single Line';
      editor.getValue = vi.fn().mockReturnValue(content);

      const result = renameEngine.extractTitleRegion(editor, file);

      expect(result.firstNonEmptyLine).toBe('Single Line');
    });
  });

  describe('clearTitleRegionCache', () => {
    it('should clear title region cache via fileStateManager', () => {
      renameEngine.clearTitleRegionCache();

      expect(
        plugin.fileStateManager.clearAllTitleRegionCaches
      ).toHaveBeenCalled();
    });
  });

  describe('updateTitleRegionCacheKey', () => {
    it('should update cache key when file is renamed', () => {
      plugin.fileStateManager.updateTitleRegionCacheKey = vi.fn();
      const oldPath = 'old/path.md';
      const newPath = 'new/path.md';

      renameEngine.updateTitleRegionCacheKey(oldPath, newPath);

      expect(
        plugin.fileStateManager.updateTitleRegionCacheKey
      ).toHaveBeenCalledWith(oldPath, newPath);
    });
  });

  describe('processEditorChangeOptimal', () => {
    beforeEach(() => {
      editor.getValue = vi.fn().mockReturnValue('Test content');
      plugin.app.vault.read = vi.fn().mockResolvedValue('Test content');
    });

    it('should return early when file is locked', async () => {
      plugin.cacheManager.isLocked = vi.fn().mockReturnValue(true);
      plugin.fileStateManager.isEditorSyncing = vi.fn().mockReturnValue(false);

      await renameEngine.processEditorChangeOptimal(editor, file);

      expect(plugin.cacheManager.markPendingAliasRecheck).toHaveBeenCalledWith(
        file.path
      );
      expect(plugin.trackUsage).toHaveBeenCalled();
    });

    it('should not mark for recheck when editor is syncing', async () => {
      plugin.cacheManager.isLocked = vi.fn().mockReturnValue(true);
      plugin.fileStateManager.isEditorSyncing = vi.fn().mockReturnValue(true);

      await renameEngine.processEditorChangeOptimal(editor, file);

      expect(
        plugin.cacheManager.markPendingAliasRecheck
      ).not.toHaveBeenCalled();
    });

    it('should skip processing when only frontmatter changed', async () => {
      const previousContent = '---\ntitle: Old\n---\nBody';
      const currentContent = '---\ntitle: New\n---\nBody';

      plugin.fileStateManager.getLastEditorContent = vi
        .fn()
        .mockReturnValue(previousContent);
      editor.getValue = vi.fn().mockReturnValue(currentContent);

      await renameEngine.processEditorChangeOptimal(editor, file);

      expect(plugin.fileStateManager.setLastEditorContent).toHaveBeenCalledWith(
        file.path,
        currentContent
      );
    });

    it('should process when body content changes', async () => {
      const previousContent = '---\ntitle: Test\n---\nOld Body';
      const currentContent = '---\ntitle: Test\n---\nNew Body';

      plugin.fileStateManager.getLastEditorContent = vi
        .fn()
        .mockReturnValue(previousContent);
      editor.getValue = vi.fn().mockReturnValue(currentContent);

      await renameEngine.processEditorChangeOptimal(editor, file);

      // Should update last editor content
      expect(plugin.fileStateManager.setLastEditorContent).toHaveBeenCalled();
    });

    it('should handle first editor event', async () => {
      plugin.fileStateManager.getLastEditorContent = vi
        .fn()
        .mockReturnValue(null);
      editor.getValue = vi.fn().mockReturnValue('New content');
      plugin.app.vault.read = vi.fn().mockResolvedValue('Old content');

      await renameEngine.processEditorChangeOptimal(editor, file);

      expect(plugin.app.vault.read).toHaveBeenCalledWith(file);
    });

    it('should skip when no body edits on first open', async () => {
      const content = '---\ntitle: Test\n---\nBody';
      plugin.fileStateManager.getLastEditorContent = vi
        .fn()
        .mockReturnValue(null);
      editor.getValue = vi.fn().mockReturnValue(content);
      plugin.app.vault.read = vi.fn().mockResolvedValue(content);

      await renameEngine.processEditorChangeOptimal(editor, file);

      // Should initialize cache but not process
      expect(plugin.fileStateManager.setTitleRegionCache).toHaveBeenCalled();
    });

    it('should track usage on every call', async () => {
      await renameEngine.processEditorChangeOptimal(editor, file);

      expect(plugin.trackUsage).toHaveBeenCalled();
    });
  });

  describe('processFile', () => {
    beforeEach(() => {
      plugin.app.vault.getAbstractFileByPath = vi.fn().mockReturnValue(file);
      plugin.app.vault.read = vi
        .fn()
        .mockResolvedValue('# Test Title\nContent');
    });

    it('should return false when file not found', async () => {
      plugin.app.vault.getAbstractFileByPath = vi.fn().mockReturnValue(null);

      const result = await renameEngine.processFile(file);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('file-not-found');
    });

    it('should track usage', async () => {
      plugin.app.vault.getAbstractFileByPath = vi.fn().mockReturnValue(null);

      await renameEngine.processFile(file);

      expect(plugin.trackUsage).toHaveBeenCalled();
    });

    it('should use provided content when available', async () => {
      const providedContent = '# Provided Title\nContent';
      plugin.app.vault.getAbstractFileByPath = vi.fn().mockReturnValue(file);

      await renameEngine.processFile(file, false, false, providedContent);

      // Should not read from vault when content is provided
      expect(plugin.app.vault.read).not.toHaveBeenCalled();
    });
  });

  describe('checkFileExistsCaseInsensitive', () => {
    it('should return false when file does not exist', () => {
      plugin.app.vault.getAbstractFileByPath = vi.fn().mockReturnValue(null);
      plugin.app.vault.getAllLoadedFiles = vi.fn().mockReturnValue([]);

      const result = renameEngine.checkFileExistsCaseInsensitive('test.md');

      expect(result).toBe(false);
    });

    it('should return true with exact case match', () => {
      const existingFile = createMockFile('Test.md');
      plugin.app.vault.getAbstractFileByPath = vi
        .fn()
        .mockReturnValue(existingFile);

      const result = renameEngine.checkFileExistsCaseInsensitive('Test.md');

      expect(result).toBe(true);
    });

    it('should return true with case-insensitive match', () => {
      const existingFile = createMockFile('Test.md');
      plugin.app.vault.getAbstractFileByPath = vi.fn().mockReturnValue(null);
      plugin.app.vault.getAllLoadedFiles = vi
        .fn()
        .mockReturnValue([existingFile]);

      const result = renameEngine.checkFileExistsCaseInsensitive('test.md');

      expect(result).toBe(true);
    });

    it('should find file among multiple files', () => {
      const file1 = createMockFile('file1.md');
      const file2 = createMockFile('Target.md');
      const file3 = createMockFile('file3.md');

      plugin.app.vault.getAbstractFileByPath = vi.fn().mockReturnValue(null);
      plugin.app.vault.getAllLoadedFiles = vi
        .fn()
        .mockReturnValue([file1, file2, file3]);

      const result = renameEngine.checkFileExistsCaseInsensitive('target.md');

      expect(result).toBe(true);
    });

    it('should handle paths with folders', () => {
      const existingFile = createMockFile('Folder/File.md');
      plugin.app.vault.getAbstractFileByPath = vi.fn().mockReturnValue(null);
      plugin.app.vault.getAllLoadedFiles = vi
        .fn()
        .mockReturnValue([existingFile]);

      const result =
        renameEngine.checkFileExistsCaseInsensitive('folder/file.md');

      expect(result).toBe(true);
    });

    it('should return true when multiple case-variants exist', () => {
      const file1 = createMockFile('test.md');
      const file2 = createMockFile('Test.md');
      const file3 = createMockFile('TEST.md');

      plugin.app.vault.getAbstractFileByPath = vi.fn().mockReturnValue(null);
      plugin.app.vault.getAllLoadedFiles = vi
        .fn()
        .mockReturnValue([file1, file2, file3]);

      const result = renameEngine.checkFileExistsCaseInsensitive('TeSt.md');

      expect(result).toBe(true); // Found match
    });
  });

  describe('edge cases', () => {
    it('should handle very long file paths', () => {
      const longPath = 'a/'.repeat(100) + 'file.md';
      const file = createMockFile(longPath);

      expect(() => renameEngine.checkFileTimeLimit(file)).not.toThrow();
    });

    it('should handle special characters in file paths', () => {
      const file = createMockFile('folder/file [special] (chars).md');

      expect(() => renameEngine.checkFileTimeLimit(file)).not.toThrow();
    });

    it('should handle rapid successive calls to rate limiter', () => {
      for (let i = 0; i < 100; i++) {
        renameEngine.checkGlobalRateLimit();
      }

      // Should not throw, just return false when limit exceeded
      expect(() => renameEngine.checkGlobalRateLimit()).not.toThrow();
    });

    it('should handle null/undefined gracefully in stripFrontmatter', () => {
      expect(() =>
        renameEngine.stripFrontmatterFromContent(null as any, file)
      ).not.toThrow();
      expect(() =>
        renameEngine.stripFrontmatterFromContent(undefined, file)
      ).not.toThrow();
    });

    it('should handle very large content in stripFrontmatter', () => {
      const largeFrontmatter = '---\n' + 'x'.repeat(10000) + '\n---\nBody';

      const result = renameEngine.stripFrontmatterFromContent(
        largeFrontmatter,
        file
      );

      expect(result).toBe('Body');
    });

    it('should handle content with many lines', () => {
      const manyLines = Array(1000).fill('line').join('\n');
      const content = '---\ntitle: Test\n---\n' + manyLines;

      const result = renameEngine.stripFrontmatterFromContent(content, file);

      expect(result.split('\n').length).toBe(1000);
    });
  });
});
