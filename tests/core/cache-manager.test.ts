import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CacheManager,
  DEFAULT_CACHE_CONFIG,
} from '../../src/core/cache-manager';
import { createMockApp } from '../testUtils';
import { App, TFile } from '../mockObsidian';

// Create a minimal mock plugin for CacheManager
function createMockPlugin() {
  const app = createMockApp();
  const fileStateManager = {
    updateOperationCount: vi.fn(),
    getOperationData: vi.fn(),
    acquireLock: vi.fn().mockReturnValue(true),
    releaseLock: vi.fn(),
    isLocked: vi.fn().mockReturnValue(false),
    clearAllLocks: vi.fn(),
    markPendingAliasRecheck: vi.fn(),
    hasPendingAliasRecheck: vi.fn().mockReturnValue(false),
    clearPendingAliasRecheck: vi.fn(),
  };

  return {
    app,
    fileStateManager,
  } as any;
}

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  let mockPlugin: any;

  beforeEach(() => {
    mockPlugin = createMockPlugin();
    cacheManager = new CacheManager(mockPlugin);
  });

  describe('Content Cache', () => {
    it('should store and retrieve content', () => {
      const filePath = 'test.md';
      const content = 'Hello World';

      cacheManager.setContent(filePath, content);
      const result = cacheManager.getContent(filePath);

      expect(result).toBe(content);
    });

    it('should return undefined for non-existent content', () => {
      const result = cacheManager.getContent('non-existent.md');
      expect(result).toBeUndefined();
    });

    it('should detect content changes', () => {
      const filePath = 'test.md';
      cacheManager.setContent(filePath, 'Old content');

      expect(cacheManager.hasContentChanged(filePath, 'New content')).toBe(
        true
      );
      expect(cacheManager.hasContentChanged(filePath, 'Old content')).toBe(
        false
      );
    });

    it('should update content when set multiple times', () => {
      const filePath = 'test.md';

      cacheManager.setContent(filePath, 'First');
      cacheManager.setContent(filePath, 'Second');
      cacheManager.setContent(filePath, 'Third');

      expect(cacheManager.getContent(filePath)).toBe('Third');
    });

    it('should handle large content strings', () => {
      const filePath = 'test.md';
      const largeContent = 'x'.repeat(100000);

      cacheManager.setContent(filePath, largeContent);
      expect(cacheManager.getContent(filePath)).toBe(largeContent);
    });

    it('should evict LRU entries when cache is full', () => {
      const smallCache = new CacheManager(mockPlugin, {
        ...DEFAULT_CACHE_CONFIG,
        maxContentEntries: 3,
      });

      // Fill cache
      smallCache.setContent('file1.md', 'content1');
      smallCache.setContent('file2.md', 'content2');
      smallCache.setContent('file3.md', 'content3');

      // Access file1 and file2 to make them more recently used
      smallCache.getContent('file1.md');
      smallCache.getContent('file2.md');

      // Add file4, should evict file3 (least recently used)
      smallCache.setContent('file4.md', 'content4');

      expect(smallCache.getContent('file1.md')).toBe('content1');
      expect(smallCache.getContent('file2.md')).toBe('content2');
      expect(smallCache.getContent('file3.md')).toBeUndefined();
      expect(smallCache.getContent('file4.md')).toBe('content4');
    });
  });

  describe('Path Reservation', () => {
    it('should reserve and release paths', () => {
      const path = 'Notes/test.md';

      cacheManager.reservePath(path);
      expect(cacheManager.isPathReserved(path)).toBe(true);

      cacheManager.releasePath(path);
      expect(cacheManager.isPathReserved(path)).toBe(false);
    });

    it('should handle case-insensitive path reservation', () => {
      cacheManager.reservePath('Notes/Test.md');
      expect(cacheManager.isPathReserved('notes/test.md')).toBe(true);
      expect(cacheManager.isPathReserved('NOTES/TEST.MD')).toBe(true);
    });

    it('should release multiple paths in batch', () => {
      const paths = ['file1.md', 'file2.md', 'file3.md'];

      paths.forEach((path) => cacheManager.reservePath(path));
      paths.forEach((path) =>
        expect(cacheManager.isPathReserved(path)).toBe(true)
      );

      cacheManager.releasePathsBatch(paths);
      paths.forEach((path) =>
        expect(cacheManager.isPathReserved(path)).toBe(false)
      );
    });

    it('should clear all reserved paths', () => {
      cacheManager.reservePath('file1.md');
      cacheManager.reservePath('file2.md');
      cacheManager.reservePath('file3.md');

      cacheManager.clearReservedPaths();

      expect(cacheManager.isPathReserved('file1.md')).toBe(false);
      expect(cacheManager.isPathReserved('file2.md')).toBe(false);
      expect(cacheManager.isPathReserved('file3.md')).toBe(false);
    });

    it('should not error when releasing non-reserved path', () => {
      expect(() => cacheManager.releasePath('non-existent.md')).not.toThrow();
    });
  });

  describe('Path Conflict Detection', () => {
    beforeEach(() => {
      // Mock vault to return some existing files
      mockPlugin.app.vault.getAllLoadedFiles = vi
        .fn()
        .mockReturnValue([new TFile('existing.md'), new TFile('another.md')]);
    });

    it('should detect conflict with reserved path', () => {
      const path = 'reserved.md';
      cacheManager.reservePath(path);

      expect(cacheManager.hasPathConflict(path)).toBe(true);
    });

    it('should detect conflict with existing file', () => {
      mockPlugin.app.vault.getAbstractFileByPath = vi
        .fn()
        .mockReturnValue(new TFile('existing.md'));

      expect(cacheManager.hasPathConflict('existing.md')).toBe(true);
    });

    it('should not detect conflict for non-existent, non-reserved path', () => {
      mockPlugin.app.vault.getAbstractFileByPath = vi
        .fn()
        .mockReturnValue(null);

      expect(cacheManager.hasPathConflict('new-file.md')).toBe(false);
    });
  });

  describe('File Event Notifications', () => {
    it('should handle file creation notification', () => {
      const path = 'new-file.md';

      cacheManager.notifyFileCreated(path);

      // File should now exist in cache
      expect(cacheManager.fileExists(path)).toBe(true);
    });

    it('should handle file deletion notification', () => {
      const path = 'deleted-file.md';

      // Setup: file exists with content and is reserved
      cacheManager.setContent(path, 'content');
      cacheManager.reservePath(path);
      cacheManager.notifyFileCreated(path);

      // Delete file
      cacheManager.notifyFileDeleted(path);

      // Should clear all traces of the file
      expect(cacheManager.getContent(path)).toBeUndefined();
      expect(cacheManager.isPathReserved(path)).toBe(false);
    });

    it('should handle file rename notification', () => {
      const oldPath = 'old-name.md';
      const newPath = 'new-name.md';
      const content = 'File content';

      // Setup: old file exists with content
      cacheManager.setContent(oldPath, content);
      cacheManager.notifyFileCreated(oldPath);

      // Rename file
      cacheManager.notifyFileRenamed(oldPath, newPath);

      // Content should move to new path
      expect(cacheManager.getContent(oldPath)).toBeUndefined();
      expect(cacheManager.getContent(newPath)).toBe(content);

      // Old path should be released, new path reserved
      expect(cacheManager.isPathReserved(oldPath)).toBe(false);
      expect(cacheManager.isPathReserved(newPath)).toBe(true);
    });

    it('should handle rename when file has no cached content', () => {
      const oldPath = 'old.md';
      const newPath = 'new.md';

      // Rename without prior content
      expect(() =>
        cacheManager.notifyFileRenamed(oldPath, newPath)
      ).not.toThrow();

      // New path should still be reserved
      expect(cacheManager.isPathReserved(newPath)).toBe(true);
    });
  });

  describe('File Operation Locks', () => {
    it('should delegate lock acquisition to fileStateManager', () => {
      const filePath = 'test.md';

      cacheManager.acquireLock(filePath);

      expect(mockPlugin.fileStateManager.acquireLock).toHaveBeenCalledWith(
        filePath
      );
    });

    it('should delegate lock release to fileStateManager', () => {
      const filePath = 'test.md';

      cacheManager.releaseLock(filePath);

      expect(mockPlugin.fileStateManager.releaseLock).toHaveBeenCalledWith(
        filePath
      );
    });

    it('should delegate lock check to fileStateManager', () => {
      const filePath = 'test.md';

      cacheManager.isLocked(filePath);

      expect(mockPlugin.fileStateManager.isLocked).toHaveBeenCalledWith(
        filePath
      );
    });

    it('should delegate clear all locks to fileStateManager', () => {
      cacheManager.clearAllLocks();

      expect(mockPlugin.fileStateManager.clearAllLocks).toHaveBeenCalled();
    });
  });

  describe('Operation Tracking', () => {
    it('should delegate operation tracking to fileStateManager', () => {
      const filePath = 'test.md';
      const content = 'content';

      cacheManager.trackOperation(filePath, content);

      expect(
        mockPlugin.fileStateManager.updateOperationCount
      ).toHaveBeenCalledWith(filePath, content);
    });

    it('should delegate get operation data to fileStateManager', () => {
      const filePath = 'test.md';

      cacheManager.getOperationData(filePath);

      expect(mockPlugin.fileStateManager.getOperationData).toHaveBeenCalledWith(
        filePath
      );
    });
  });

  describe('Alias Recheck Flags', () => {
    it('should delegate mark pending alias recheck', () => {
      const filePath = 'test.md';

      cacheManager.markPendingAliasRecheck(filePath);

      expect(
        mockPlugin.fileStateManager.markPendingAliasRecheck
      ).toHaveBeenCalledWith(filePath);
    });

    it('should delegate has pending alias recheck check', () => {
      const filePath = 'test.md';

      cacheManager.hasPendingAliasRecheck(filePath);

      expect(
        mockPlugin.fileStateManager.hasPendingAliasRecheck
      ).toHaveBeenCalledWith(filePath);
    });

    it('should delegate clear pending alias recheck', () => {
      const filePath = 'test.md';

      cacheManager.clearPendingAliasRecheck(filePath);

      expect(
        mockPlugin.fileStateManager.clearPendingAliasRecheck
      ).toHaveBeenCalledWith(filePath);
    });
  });

  describe('Statistics', () => {
    it('should return accurate statistics', () => {
      cacheManager.setContent('file1.md', 'content1');
      cacheManager.setContent('file2.md', 'content2');
      cacheManager.reservePath('reserved1.md');
      cacheManager.reservePath('reserved2.md');
      cacheManager.reservePath('reserved3.md');

      const stats = cacheManager.getStats();

      expect(stats.contentCacheSize).toBe(2);
      expect(stats.tempPathsCount).toBe(3);
    });

    it('should return zero stats for empty cache', () => {
      const stats = cacheManager.getStats();

      expect(stats.contentCacheSize).toBe(0);
      expect(stats.tempPathsCount).toBe(0);
    });
  });

  describe('Dispose', () => {
    it('should clear all caches on dispose', () => {
      cacheManager.setContent('file1.md', 'content1');
      cacheManager.reservePath('reserved1.md');

      cacheManager.dispose();

      expect(cacheManager.getContent('file1.md')).toBeUndefined();
      expect(cacheManager.isPathReserved('reserved1.md')).toBe(false);

      const stats = cacheManager.getStats();
      expect(stats.contentCacheSize).toBe(0);
      expect(stats.tempPathsCount).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings as paths', () => {
      cacheManager.reservePath('');
      expect(cacheManager.isPathReserved('')).toBe(true);

      cacheManager.setContent('', 'content');
      expect(cacheManager.getContent('')).toBe('content');
    });

    it('should handle paths with special characters', () => {
      const path = 'folder/[special] (file) #2.md';

      cacheManager.reservePath(path);
      expect(cacheManager.isPathReserved(path)).toBe(true);

      cacheManager.setContent(path, 'content');
      expect(cacheManager.getContent(path)).toBe('content');
    });

    it('should handle very long paths', () => {
      const longPath = 'a/'.repeat(100) + 'file.md';

      cacheManager.reservePath(longPath);
      expect(cacheManager.isPathReserved(longPath)).toBe(true);

      cacheManager.setContent(longPath, 'content');
      expect(cacheManager.getContent(longPath)).toBe('content');
    });

    it('should handle concurrent operations on same file', () => {
      const path = 'test.md';

      cacheManager.setContent(path, 'v1');
      cacheManager.reservePath(path);
      cacheManager.setContent(path, 'v2');
      cacheManager.setContent(path, 'v3');

      expect(cacheManager.getContent(path)).toBe('v3');
      expect(cacheManager.isPathReserved(path)).toBe(true);
    });
  });
});
