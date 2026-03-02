import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FileStateManager } from '../../src/core/file-state-manager';

// Mock plugin
function createMockPlugin() {
  return {} as any;
}

describe('FileStateManager', () => {
  let plugin: any;
  let manager: FileStateManager;

  beforeEach(() => {
    vi.useFakeTimers();
    plugin = createMockPlugin();
    manager = new FileStateManager(plugin);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('lastEditorContent', () => {
    it('should set and get editor content', () => {
      manager.setLastEditorContent('test.md', 'content');
      expect(manager.getLastEditorContent('test.md')).toBe('content');
    });

    it('should return undefined for non-existent path', () => {
      expect(manager.getLastEditorContent('nonexistent.md')).toBeUndefined();
    });

    it('should delete editor content', () => {
      manager.setLastEditorContent('test.md', 'content');
      manager.deleteLastEditorContent('test.md');
      expect(manager.getLastEditorContent('test.md')).toBeUndefined();
    });

    it('should handle delete on non-existent path', () => {
      expect(() =>
        manager.deleteLastEditorContent('nonexistent.md')
      ).not.toThrow();
    });

    it('should track staleness correctly', () => {
      manager.setLastEditorContent('test.md', 'content');
      expect(manager.isEditorContentStale('test.md')).toBe(false);

      // Advance time past default 5 min threshold
      vi.advanceTimersByTime(6 * 60 * 1000);
      expect(manager.isEditorContentStale('test.md')).toBe(true);
    });

    it('should use custom staleness threshold', () => {
      manager.setLastEditorContent('test.md', 'content');

      vi.advanceTimersByTime(2000);
      expect(manager.isEditorContentStale('test.md', 1000)).toBe(true);
      expect(manager.isEditorContentStale('test.md', 3000)).toBe(false);
    });

    it('should return stale for non-existent content', () => {
      expect(manager.isEditorContentStale('nonexistent.md')).toBe(true);
    });
  });

  describe('lastSavedContent', () => {
    it('should set and get saved content', () => {
      manager.setLastSavedContent('test.md', 'saved content');
      expect(manager.getLastSavedContent('test.md')).toBe('saved content');
    });

    it('should return undefined for non-existent path', () => {
      expect(manager.getLastSavedContent('nonexistent.md')).toBeUndefined();
    });

    it('should delete saved content', () => {
      manager.setLastSavedContent('test.md', 'content');
      manager.deleteLastSavedContent('test.md');
      expect(manager.getLastSavedContent('test.md')).toBeUndefined();
    });

    it('should handle delete on non-existent path', () => {
      expect(() =>
        manager.deleteLastSavedContent('nonexistent.md')
      ).not.toThrow();
    });

    it('should track staleness correctly', () => {
      manager.setLastSavedContent('test.md', 'content');
      expect(manager.isSavedContentStale('test.md')).toBe(false);

      // Advance time past default 5 min threshold
      vi.advanceTimersByTime(6 * 60 * 1000);
      expect(manager.isSavedContentStale('test.md')).toBe(true);
    });

    it('should use custom staleness threshold', () => {
      manager.setLastSavedContent('test.md', 'content');

      vi.advanceTimersByTime(2000);
      expect(manager.isSavedContentStale('test.md', 1000)).toBe(true);
      expect(manager.isSavedContentStale('test.md', 3000)).toBe(false);
    });

    it('should return stale for non-existent content', () => {
      expect(manager.isSavedContentStale('nonexistent.md')).toBe(true);
    });
  });

  describe('lastAliasUpdateStatus', () => {
    it('should set and get alias update status', () => {
      manager.setLastAliasUpdateStatus('test.md', true);
      expect(manager.getLastAliasUpdateStatus('test.md')).toBe(true);

      manager.setLastAliasUpdateStatus('test.md', false);
      expect(manager.getLastAliasUpdateStatus('test.md')).toBe(false);
    });

    it('should return undefined for non-existent path', () => {
      expect(
        manager.getLastAliasUpdateStatus('nonexistent.md')
      ).toBeUndefined();
    });

    it('should track staleness correctly', () => {
      manager.setLastAliasUpdateStatus('test.md', true);
      expect(manager.isAliasStatusStale('test.md')).toBe(false);

      vi.advanceTimersByTime(6 * 60 * 1000);
      expect(manager.isAliasStatusStale('test.md')).toBe(true);
    });
  });

  describe('file lifecycle', () => {
    it('should migrate state on file rename', () => {
      manager.setLastEditorContent('old.md', 'editor content');
      manager.setLastSavedContent('old.md', 'saved content');
      manager.setLastAliasUpdateStatus('old.md', true);

      manager.notifyFileRenamed('old.md', 'new.md');

      // Old path should have no state
      expect(manager.getLastEditorContent('old.md')).toBeUndefined();
      expect(manager.getLastSavedContent('old.md')).toBeUndefined();

      // New path should have all state
      expect(manager.getLastEditorContent('new.md')).toBe('editor content');
      expect(manager.getLastSavedContent('new.md')).toBe('saved content');
      expect(manager.getLastAliasUpdateStatus('new.md')).toBe(true);
    });

    it('should cleanup state on file delete', () => {
      manager.setLastEditorContent('test.md', 'content');
      manager.setLastSavedContent('test.md', 'saved');

      manager.notifyFileDeleted('test.md');

      expect(manager.getLastEditorContent('test.md')).toBeUndefined();
      expect(manager.getLastSavedContent('test.md')).toBeUndefined();
    });

    it('should handle delete on non-existent path', () => {
      expect(() => manager.notifyFileDeleted('nonexistent.md')).not.toThrow();
    });

    it('should handle rename from non-existent path', () => {
      expect(() =>
        manager.notifyFileRenamed('nonexistent.md', 'new.md')
      ).not.toThrow();
    });
  });

  describe('title region cache', () => {
    const cache = {
      firstNonEmptyLine: 'Title',
      titleSourceLine: 'Title',
      lastUpdated: Date.now(),
    };

    it('should set and get title region cache', () => {
      manager.setTitleRegionCache('test.md', cache);
      expect(manager.getTitleRegionCache('test.md')).toEqual(cache);
    });

    it('should delete title region cache', () => {
      manager.setTitleRegionCache('test.md', cache);
      manager.deleteTitleRegionCache('test.md');
      expect(manager.getTitleRegionCache('test.md')).toBeUndefined();
    });

    it('should clear all title region caches', () => {
      manager.setTitleRegionCache('test1.md', cache);
      manager.setTitleRegionCache('test2.md', cache);

      manager.clearAllTitleRegionCaches();

      expect(manager.getTitleRegionCache('test1.md')).toBeUndefined();
      expect(manager.getTitleRegionCache('test2.md')).toBeUndefined();
    });

    it('should update cache key on rename', () => {
      manager.setTitleRegionCache('old.md', cache);
      manager.updateTitleRegionCacheKey('old.md', 'new.md');

      expect(manager.getTitleRegionCache('old.md')).toBeUndefined();
      expect(manager.getTitleRegionCache('new.md')).toEqual(cache);
    });
  });

  describe('locking', () => {
    it('should acquire lock on first attempt', () => {
      expect(manager.acquireLock('test.md')).toBe(true);
      expect(manager.isLocked('test.md')).toBe(true);
    });

    it('should fail to acquire lock when already locked', () => {
      manager.acquireLock('test.md');
      expect(manager.acquireLock('test.md')).toBe(false);
    });

    it('should release lock', () => {
      manager.acquireLock('test.md');
      manager.releaseLock('test.md');
      expect(manager.isLocked('test.md')).toBe(false);
    });

    it('should allow re-acquiring lock after release', () => {
      manager.acquireLock('test.md');
      manager.releaseLock('test.md');
      expect(manager.acquireLock('test.md')).toBe(true);
    });

    it('should clear all locks', () => {
      manager.acquireLock('test1.md');
      manager.acquireLock('test2.md');

      manager.clearAllLocks();

      expect(manager.isLocked('test1.md')).toBe(false);
      expect(manager.isLocked('test2.md')).toBe(false);
    });
  });

  describe('pending alias recheck', () => {
    it('should mark and check pending alias recheck', () => {
      expect(manager.hasPendingAliasRecheck('test.md')).toBe(false);

      manager.markPendingAliasRecheck('test.md');
      expect(manager.hasPendingAliasRecheck('test.md')).toBe(true);
    });

    it('should store and retrieve pending alias editor', () => {
      const mockEditor = { getValue: () => 'content' };
      manager.markPendingAliasRecheck('test.md', mockEditor);

      expect(manager.getPendingAliasEditor('test.md')).toBe(mockEditor);
    });

    it('should clear pending alias recheck', () => {
      manager.markPendingAliasRecheck('test.md');
      manager.clearPendingAliasRecheck('test.md');

      expect(manager.hasPendingAliasRecheck('test.md')).toBe(false);
    });

    it('should get files with pending alias recheck', () => {
      manager.markPendingAliasRecheck('test1.md');
      manager.markPendingAliasRecheck('test2.md');
      manager.setLastEditorContent('test3.md', 'no recheck');

      const files = manager.getFilesWithPendingAliasRecheck();
      expect(files).toContain('test1.md');
      expect(files).toContain('test2.md');
      expect(files).not.toContain('test3.md');
    });
  });

  describe('editor syncing', () => {
    it('should mark and check editor syncing', () => {
      expect(manager.isEditorSyncing('test.md')).toBe(false);

      manager.markEditorSyncing('test.md');
      expect(manager.isEditorSyncing('test.md')).toBe(true);
    });

    it('should clear editor syncing', () => {
      manager.markEditorSyncing('test.md');
      manager.clearEditorSyncing('test.md');

      expect(manager.isEditorSyncing('test.md')).toBe(false);
    });
  });

  describe('fresh read flag', () => {
    it('should mark and check needs fresh read', () => {
      expect(manager.needsFreshRead('test.md')).toBe(false);

      manager.markNeedsFreshRead('test.md');
      expect(manager.needsFreshRead('test.md')).toBe(true);
    });

    it('should clear needs fresh read', () => {
      manager.markNeedsFreshRead('test.md');
      manager.clearNeedsFreshRead('test.md');

      expect(manager.needsFreshRead('test.md')).toBe(false);
    });
  });

  describe('recently renamed', () => {
    it('should mark and check recently renamed', () => {
      expect(manager.wasRecentlyRenamed('test.md')).toBe(false);

      manager.markRecentlyRenamed('test.md');
      expect(manager.wasRecentlyRenamed('test.md')).toBe(true);
    });

    it('should return false after time window expires', () => {
      manager.markRecentlyRenamed('test.md');

      vi.advanceTimersByTime(150);
      expect(manager.wasRecentlyRenamed('test.md')).toBe(false);
    });

    it('should use custom time window', () => {
      manager.markRecentlyRenamed('test.md');

      vi.advanceTimersByTime(50);
      expect(manager.wasRecentlyRenamed('test.md', 100)).toBe(true);
      expect(manager.wasRecentlyRenamed('test.md', 30)).toBe(false);
    });
  });

  describe('runMaintenance', () => {
    it('should cleanup stale lastEditorContent after 10 minutes', () => {
      manager.setLastEditorContent('test.md', 'content');

      vi.advanceTimersByTime(11 * 60 * 1000);
      manager.runMaintenance();

      expect(manager.getLastEditorContent('test.md')).toBeUndefined();
    });

    it('should keep fresh lastEditorContent', () => {
      manager.setLastEditorContent('test.md', 'content');

      vi.advanceTimersByTime(5 * 60 * 1000);
      manager.runMaintenance();

      expect(manager.getLastEditorContent('test.md')).toBe('content');
    });

    it('should cleanup stale lastSavedContent after 10 minutes', () => {
      manager.setLastSavedContent('test.md', 'content');

      vi.advanceTimersByTime(11 * 60 * 1000);
      manager.runMaintenance();

      expect(manager.getLastSavedContent('test.md')).toBeUndefined();
    });

    it('should cleanup stale alias status after 5 minutes', () => {
      manager.setLastAliasUpdateStatus('test.md', true);

      vi.advanceTimersByTime(6 * 60 * 1000);
      manager.runMaintenance();

      expect(manager.getLastAliasUpdateStatus('test.md')).toBeUndefined();
    });

    it('should cleanup stale locks', () => {
      manager.acquireLock('test.md');

      // Advance past 60 second stale threshold (FILE_LOCK_STALE_THRESHOLD_MS)
      vi.advanceTimersByTime(65 * 1000);
      manager.runMaintenance();

      expect(manager.isLocked('test.md')).toBe(false);
    });

    it('should remove empty state entries', () => {
      manager.setLastEditorContent('test.md', 'content');
      manager.deleteLastEditorContent('test.md');

      manager.runMaintenance();

      // State entry should be removed when empty
      expect(manager.getState('test.md')).toBeUndefined();
    });

    it('should cleanup needsFreshRead after 5 minutes', () => {
      manager.markNeedsFreshRead('test.md');

      vi.advanceTimersByTime(6 * 60 * 1000);
      manager.runMaintenance();

      expect(manager.needsFreshRead('test.md')).toBe(false);
    });

    it('should cleanup lastRenamedTime after 1 second', () => {
      manager.markRecentlyRenamed('test.md');

      vi.advanceTimersByTime(2000);
      manager.runMaintenance();

      // The wasRecentlyRenamed check should return false since timestamp is cleared
      expect(manager.wasRecentlyRenamed('test.md')).toBe(false);
    });
  });

  describe('throttle timers', () => {
    it('should set and check throttle timer', () => {
      const timer = setTimeout(() => {}, 1000);
      manager.setThrottleTimer('test.md', timer);

      expect(manager.hasThrottleTimer('test.md')).toBe(true);
    });

    it('should clear throttle timer', () => {
      const timer = setTimeout(() => {}, 1000);
      manager.setThrottleTimer('test.md', timer);
      manager.clearThrottleTimer('test.md');

      expect(manager.hasThrottleTimer('test.md')).toBe(false);
    });

    it('should clear all throttle timers', () => {
      manager.setThrottleTimer(
        'test1.md',
        setTimeout(() => {}, 1000)
      );
      manager.setThrottleTimer(
        'test2.md',
        setTimeout(() => {}, 1000)
      );

      manager.clearAllThrottleTimers();

      expect(manager.hasThrottleTimer('test1.md')).toBe(false);
      expect(manager.hasThrottleTimer('test2.md')).toBe(false);
    });

    it('should replace existing throttle timer', () => {
      const timer1 = setTimeout(() => {}, 1000);
      const timer2 = setTimeout(() => {}, 2000);

      manager.setThrottleTimer('test.md', timer1);
      manager.setThrottleTimer('test.md', timer2);

      expect(manager.hasThrottleTimer('test.md')).toBe(true);
    });
  });

  describe('creation delay timers', () => {
    it('should set and check creation delay', () => {
      const timer = setTimeout(() => {}, 1000);
      manager.setCreationDelayTimer('test.md', timer);

      expect(manager.isFileInCreationDelay('test.md')).toBe(true);
    });

    it('should clear creation delay timer', () => {
      const timer = setTimeout(() => {}, 1000);
      manager.setCreationDelayTimer('test.md', timer);
      manager.clearCreationDelayTimer('test.md');

      expect(manager.isFileInCreationDelay('test.md')).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should clear all state and timers', () => {
      manager.setLastEditorContent('test.md', 'content');
      manager.setThrottleTimer(
        'test.md',
        setTimeout(() => {}, 1000)
      );
      manager.setCreationDelayTimer(
        'test2.md',
        setTimeout(() => {}, 1000)
      );

      manager.dispose();

      expect(manager.getLastEditorContent('test.md')).toBeUndefined();
      expect(manager.hasThrottleTimer('test.md')).toBe(false);
      expect(manager.isFileInCreationDelay('test2.md')).toBe(false);
    });
  });

  describe('notice rate limiting', () => {
    it('should rate limit self-ref notices', () => {
      expect(manager.canShowSelfRefNotice('test.md')).toBe(true);

      manager.setLastSelfRefNotice('test.md');
      expect(manager.canShowSelfRefNotice('test.md')).toBe(false);

      // Advance past TTL (SELF_REF_NOTICE_TTL_MS = 2000ms)
      vi.advanceTimersByTime(2100);
      expect(manager.canShowSelfRefNotice('test.md')).toBe(true);
    });

    it('should rate limit safeword notices', () => {
      expect(manager.canShowSafewordNotice('test.md')).toBe(true);

      manager.setLastSafewordNotice('test.md');
      expect(manager.canShowSafewordNotice('test.md')).toBe(false);

      // Advance past TTL (SELF_REF_NOTICE_TTL_MS = 2000ms)
      vi.advanceTimersByTime(2100);
      expect(manager.canShowSafewordNotice('test.md')).toBe(true);
    });
  });

  describe('operation tracking', () => {
    it('should get and set operation data', () => {
      const data = { count: 5, lastContent: 'test', lastUpdate: Date.now() };
      manager.setOperationData('test.md', data);

      expect(manager.getOperationData('test.md')).toEqual(data);
    });

    it('should update operation count', () => {
      manager.updateOperationCount('test.md', 'content1');
      expect(manager.getOperationData('test.md')?.count).toBe(1);

      manager.updateOperationCount('test.md', 'content2');
      expect(manager.getOperationData('test.md')?.count).toBe(2);
      expect(manager.getOperationData('test.md')?.lastContent).toBe('content2');
    });
  });
});
