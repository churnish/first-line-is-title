import type {} from 'obsidian';
import FirstLineIsTitlePlugin from '../../main';
import { TIMING } from '../constants/timing';
import { TitleRegionCache } from '../types';

/**
 * Operation tracking data for a file
 */
export interface OperationData {
  count: number;
  lastContent: string;
  lastUpdate: number;
}

/**
 * Comprehensive per-file state tracking
 */
export interface FileState {
  path: string;

  // Lifecycle timers
  creationDelayTimer?: NodeJS.Timeout;
  throttleTimer?: NodeJS.Timeout; // checkInterval > 0 delayed processing

  // Content tracking
  lastEditorContent?: string;
  lastEditorContentTimestamp?: number; // When editor content was last set (for staleness detection)
  lastSavedContent?: string; // Content after last save (for modify handler comparison)
  lastSavedContentTimestamp?: number;
  titleRegionCache?: TitleRegionCache;
  lastSelfRefNotice?: number; // timestamp
  lastSafewordNotice?: number; // timestamp

  // Operation tracking
  operationData?: OperationData;
  isLocked?: boolean;
  lockTimestamp?: number; // When lock was acquired (for stale lock cleanup)
  pendingAliasRecheck?: boolean;
  pendingAliasEditor?: unknown; // Stored editor reference for popover detection
  lastAliasUpdateSucceeded?: boolean; // Whether last alias update succeeded (true) or was skipped (false)
  lastAliasUpdateTimestamp?: number; // When the alias update status was set (for staleness detection)
  isSyncingEditors?: boolean; // True when syncing background editors to prevent spurious rechecks

  // Rename tracking - prevents processing stale content after rename
  lastRenamedTime?: number; // Timestamp when file was renamed by plugin

  // Cache staleness tracking - when editor sync skipped in popover
  needsFreshRead?: boolean; // True when cache is stale, must read from disk not cache
  needsFreshReadTimestamp?: number; // When flag was set, for cleanup in maintenance
}

/**
 * Centralized file state manager
 */
export class FileStateManager {
  private plugin: FirstLineIsTitlePlugin;
  private fileStates: Map<string, FileState>;

  constructor(plugin: FirstLineIsTitlePlugin) {
    this.plugin = plugin;
    this.fileStates = new Map();
  }

  /**
   * Get or create file state
   */
  private getOrCreateState(path: string): FileState {
    if (!this.fileStates.has(path)) {
      this.fileStates.set(path, { path });
    }
    return this.fileStates.get(path)!;
  }

  /**
   * Get file state (read-only)
   */
  getState(path: string): Readonly<FileState> | undefined {
    return this.fileStates.get(path);
  }

  // ============================================================================
  // LIFECYCLE TIMERS
  // ============================================================================

  /**
   * Set creation delay timer for a file
   */
  setCreationDelayTimer(path: string, timer: NodeJS.Timeout): void {
    const state = this.getOrCreateState(path);
    if (state.creationDelayTimer) {
      clearTimeout(state.creationDelayTimer);
    }
    state.creationDelayTimer = timer;
  }

  /**
   * Clear creation delay timer
   */
  clearCreationDelayTimer(path: string): void {
    const state = this.fileStates.get(path);
    if (state?.creationDelayTimer) {
      clearTimeout(state.creationDelayTimer);
      delete state.creationDelayTimer;
    }
  }

  /**
   * Check if file is in creation delay
   */
  isFileInCreationDelay(path: string): boolean {
    return !!this.fileStates.get(path)?.creationDelayTimer;
  }

  /**
   * Set throttle timer for a file (checkInterval > 0 delayed processing)
   */
  setThrottleTimer(path: string, timer: NodeJS.Timeout): void {
    const state = this.getOrCreateState(path);
    if (state.throttleTimer) {
      clearTimeout(state.throttleTimer);
    }
    state.throttleTimer = timer;
  }

  /**
   * Clear throttle timer
   */
  clearThrottleTimer(path: string): void {
    const state = this.fileStates.get(path);
    if (state?.throttleTimer) {
      clearTimeout(state.throttleTimer);
      delete state.throttleTimer;
    }
  }

  /**
   * Check if file has throttle timer
   */
  hasThrottleTimer(path: string): boolean {
    return !!this.fileStates.get(path)?.throttleTimer;
  }

  /**
   * Clear all throttle timers (used on settings change)
   */
  clearAllThrottleTimers(): void {
    for (const state of this.fileStates.values()) {
      if (state.throttleTimer) {
        clearTimeout(state.throttleTimer);
        delete state.throttleTimer;
      }
    }
  }

  // ============================================================================
  // CONTENT TRACKING
  // ============================================================================

  /**
   * Set last editor content with timestamp
   */
  setLastEditorContent(path: string, content: string): void {
    const state = this.getOrCreateState(path);
    state.lastEditorContent = content;
    state.lastEditorContentTimestamp = Date.now();
  }

  /**
   * Get last editor content
   */
  getLastEditorContent(path: string): string | undefined {
    return this.fileStates.get(path)?.lastEditorContent;
  }

  /**
   * Delete last editor content
   */
  deleteLastEditorContent(path: string): void {
    const state = this.fileStates.get(path);
    if (state) {
      delete state.lastEditorContent;
      delete state.lastEditorContentTimestamp;
    }
  }

  /**
   * Check if last editor content is stale (older than specified TTL).
   *
   * Staleness thresholds are intentionally layered:
   * - 5 minutes (default): Content considered stale for comparison purposes
   * - 10 minutes: Content actually deleted from memory in runMaintenance()
   *
   * @param path - File path
   * @param maxAgeMs - Maximum age in milliseconds (default: 5 minutes)
   * @returns true if content is stale or doesn't exist
   */
  isEditorContentStale(
    path: string,
    maxAgeMs: number = 5 * 60 * 1000
  ): boolean {
    const state = this.fileStates.get(path);
    if (!state?.lastEditorContentTimestamp) return true;
    return Date.now() - state.lastEditorContentTimestamp > maxAgeMs;
  }

  /**
   * Set last saved content with timestamp (for modify handler comparison)
   */
  setLastSavedContent(path: string, content: string): void {
    const state = this.getOrCreateState(path);
    state.lastSavedContent = content;
    state.lastSavedContentTimestamp = Date.now();
  }

  /**
   * Get last saved content
   */
  getLastSavedContent(path: string): string | undefined {
    return this.fileStates.get(path)?.lastSavedContent;
  }

  /**
   * Delete last saved content (for cleanup on file rename/delete)
   */
  deleteLastSavedContent(path: string): void {
    const state = this.fileStates.get(path);
    if (state) {
      delete state.lastSavedContent;
      delete state.lastSavedContentTimestamp;
    }
  }

  /**
   * Check if last saved content is stale (older than specified TTL).
   *
   * Staleness thresholds are intentionally layered:
   * - 5 minutes (default): Content considered stale for comparison purposes
   * - 10 minutes: Content actually deleted from memory in runMaintenance()
   *
   * This allows graceful degradation where stale content still exists
   * but is treated as unreliable for frontmatter-only detection.
   *
   * @param path - File path
   * @param maxAgeMs - Maximum age in milliseconds (default: 5 minutes)
   * @returns true if content is stale or doesn't exist
   */
  isSavedContentStale(path: string, maxAgeMs: number = 5 * 60 * 1000): boolean {
    const state = this.fileStates.get(path);
    if (!state?.lastSavedContentTimestamp) return true;
    return Date.now() - state.lastSavedContentTimestamp > maxAgeMs;
  }

  /**
   * Set last alias update status with timestamp
   */
  setLastAliasUpdateStatus(path: string, succeeded: boolean): void {
    const state = this.getOrCreateState(path);
    state.lastAliasUpdateSucceeded = succeeded;
    state.lastAliasUpdateTimestamp = Date.now();
  }

  /**
   * Get last alias update status
   */
  getLastAliasUpdateStatus(path: string): boolean | undefined {
    return this.fileStates.get(path)?.lastAliasUpdateSucceeded;
  }

  /**
   * Check if last alias update status is stale (older than specified TTL)
   * @param path - File path
   * @param maxAgeMs - Maximum age in milliseconds (default: 5 minutes)
   * @returns true if status is stale or doesn't exist
   */
  isAliasStatusStale(path: string, maxAgeMs: number = 5 * 60 * 1000): boolean {
    const state = this.fileStates.get(path);
    if (!state?.lastAliasUpdateTimestamp) return true;
    return Date.now() - state.lastAliasUpdateTimestamp > maxAgeMs;
  }

  /**
   * Set title region cache
   */
  setTitleRegionCache(path: string, cache: TitleRegionCache): void {
    const state = this.getOrCreateState(path);
    state.titleRegionCache = cache;
  }

  /**
   * Get title region cache
   */
  getTitleRegionCache(path: string): TitleRegionCache | undefined {
    return this.fileStates.get(path)?.titleRegionCache;
  }

  /**
   * Delete title region cache
   */
  deleteTitleRegionCache(path: string): void {
    const state = this.fileStates.get(path);
    if (state) {
      delete state.titleRegionCache;
    }
  }

  /**
   * Clear all title region caches (on settings change)
   */
  clearAllTitleRegionCaches(): void {
    for (const state of this.fileStates.values()) {
      delete state.titleRegionCache;
    }
  }

  /**
   * Update title region cache key on rename
   */
  updateTitleRegionCacheKey(oldPath: string, newPath: string): void {
    const state = this.fileStates.get(oldPath);
    if (state?.titleRegionCache) {
      const cache = state.titleRegionCache;
      delete state.titleRegionCache;
      this.setTitleRegionCache(newPath, cache);
    }
  }

  /**
   * Set last self-reference notice timestamp
   */
  setLastSelfRefNotice(path: string): void {
    const state = this.getOrCreateState(path);
    state.lastSelfRefNotice = Date.now();
  }

  /**
   * Check if can show self-ref notice (rate limit)
   */
  canShowSelfRefNotice(path: string): boolean {
    const state = this.fileStates.get(path);
    if (!state?.lastSelfRefNotice) return true;
    return Date.now() - state.lastSelfRefNotice > TIMING.SELF_REF_NOTICE_TTL_MS;
  }

  /**
   * Set last safeword notice timestamp
   */
  setLastSafewordNotice(path: string): void {
    const state = this.getOrCreateState(path);
    state.lastSafewordNotice = Date.now();
  }

  /**
   * Check if can show safeword notice (rate limit)
   */
  canShowSafewordNotice(path: string): boolean {
    const state = this.fileStates.get(path);
    if (!state?.lastSafewordNotice) return true;
    return (
      Date.now() - state.lastSafewordNotice > TIMING.SELF_REF_NOTICE_TTL_MS
    );
  }

  // ============================================================================
  // OPERATION TRACKING
  // ============================================================================

  /**
   * Get operation data
   */
  getOperationData(path: string): OperationData | undefined {
    return this.fileStates.get(path)?.operationData;
  }

  /**
   * Set operation data
   */
  setOperationData(path: string, data: OperationData): void {
    const state = this.getOrCreateState(path);
    state.operationData = data;
  }

  /**
   * Update operation count
   */
  updateOperationCount(path: string, content: string): void {
    const state = this.getOrCreateState(path);
    if (!state.operationData) {
      state.operationData = {
        count: 1,
        lastContent: content,
        lastUpdate: Date.now(),
      };
    } else {
      state.operationData.count++;
      state.operationData.lastContent = content;
      state.operationData.lastUpdate = Date.now();
    }
  }

  /**
   * Acquire file operation lock
   */
  acquireLock(path: string): boolean {
    const state = this.getOrCreateState(path);
    if (state.isLocked) {
      return false;
    }
    state.isLocked = true;
    state.lockTimestamp = Date.now();
    return true;
  }

  /**
   * Release file operation lock
   */
  releaseLock(path: string): void {
    const state = this.fileStates.get(path);
    if (state) {
      state.isLocked = false;
      delete state.lockTimestamp;
    }
  }

  /**
   * Check if file is locked
   */
  isLocked(path: string): boolean {
    return this.fileStates.get(path)?.isLocked ?? false;
  }

  /**
   * Clear all locks (on unload)
   */
  clearAllLocks(): void {
    for (const state of this.fileStates.values()) {
      state.isLocked = false;
    }
  }

  /**
   * Mark file for pending alias recheck
   * @param editor - Optional editor reference for popover detection
   */
  markPendingAliasRecheck(path: string, editor?: unknown): void {
    const state = this.getOrCreateState(path);
    state.pendingAliasRecheck = true;
    if (editor) {
      state.pendingAliasEditor = editor;
    }
  }

  /**
   * Check if file has pending alias recheck
   */
  hasPendingAliasRecheck(path: string): boolean {
    return this.fileStates.get(path)?.pendingAliasRecheck ?? false;
  }

  /**
   * Get stored editor reference for pending alias recheck
   */
  getPendingAliasEditor(path: string): unknown {
    return this.fileStates.get(path)?.pendingAliasEditor;
  }

  /**
   * Clear pending alias recheck
   */
  clearPendingAliasRecheck(path: string): void {
    const state = this.fileStates.get(path);
    if (state) {
      state.pendingAliasRecheck = false;
      state.pendingAliasEditor = undefined;
    }
  }

  /**
   * Get all file paths with pending alias recheck
   */
  getFilesWithPendingAliasRecheck(): string[] {
    const files: string[] = [];
    for (const [path, state] of this.fileStates.entries()) {
      if (state.pendingAliasRecheck) {
        files.push(path);
      }
    }
    return files;
  }

  /**
   * Mark file as currently syncing background editors
   * Used to prevent editor-change events from our own setValue() operations
   * from triggering spurious rechecks
   */
  markEditorSyncing(path: string): void {
    const state = this.getOrCreateState(path);
    state.isSyncingEditors = true;
  }

  /**
   * Check if file is currently syncing background editors
   */
  isEditorSyncing(path: string): boolean {
    return this.fileStates.get(path)?.isSyncingEditors ?? false;
  }

  /**
   * Clear editor syncing flag
   */
  clearEditorSyncing(path: string): void {
    const state = this.fileStates.get(path);
    if (state) {
      state.isSyncingEditors = false;
    }
  }

  /**
   * Mark file as needing fresh read from disk (not cache)
   * Used when editor sync skipped in popover - cache is stale, must read from disk
   */
  markNeedsFreshRead(path: string): void {
    const state = this.getOrCreateState(path);
    state.needsFreshRead = true;
    state.needsFreshReadTimestamp = Date.now();
  }

  /**
   * Check if file needs fresh read from disk (cache is stale)
   */
  needsFreshRead(path: string): boolean {
    return this.fileStates.get(path)?.needsFreshRead ?? false;
  }

  /**
   * Clear needs fresh read flag
   */
  clearNeedsFreshRead(path: string): void {
    const state = this.fileStates.get(path);
    if (state) {
      state.needsFreshRead = false;
      delete state.needsFreshReadTimestamp;
    }
  }

  /**
   * Mark file as recently renamed by plugin
   * Used to prevent processFile from running with stale content immediately after rename
   */
  markRecentlyRenamed(path: string): void {
    const state = this.getOrCreateState(path);
    state.lastRenamedTime = Date.now();
  }

  /**
   * Check if file was recently renamed by plugin
   * Returns true if renamed within the specified time window
   *
   * @param path - File path to check
   * @param withinMs - Time window in milliseconds (default 100ms)
   */
  wasRecentlyRenamed(path: string, withinMs: number = 100): boolean {
    const state = this.fileStates.get(path);
    if (!state?.lastRenamedTime) return false;
    return Date.now() - state.lastRenamedTime < withinMs;
  }

  // ============================================================================
  // FILE LIFECYCLE MANAGEMENT
  // ============================================================================

  /**
   * Handle file rename - move state to new path
   */
  notifyFileRenamed(oldPath: string, newPath: string): void {
    const state = this.fileStates.get(oldPath);
    if (state) {
      state.path = newPath;
      this.fileStates.delete(oldPath);
      this.fileStates.set(newPath, state);
    }
  }

  /**
   * Handle file deletion - cleanup all state
   */
  notifyFileDeleted(path: string): void {
    const state = this.fileStates.get(path);
    if (state) {
      if (state.creationDelayTimer) clearTimeout(state.creationDelayTimer);
      if (state.throttleTimer) clearTimeout(state.throttleTimer);
      this.fileStates.delete(path);
    }
  }

  /**
   * Maintenance: cleanup stale entries
   * Called periodically to remove old operation data, flags, and timestamps
   */
  runMaintenance(): void {
    const now = Date.now();
    const staleThreshold = 10 * 60 * 1000; // 10 minutes

    for (const [path, state] of this.fileStates.entries()) {
      // Clean up stale operation data
      if (state.operationData) {
        const age = now - state.operationData.lastUpdate;
        if (age > staleThreshold) {
          delete state.operationData;
        }
      }

      // Clean up stale needsFreshRead flags (5 minutes)
      if (state.needsFreshReadTimestamp) {
        const age = now - state.needsFreshReadTimestamp;
        if (age > 5 * 60 * 1000) {
          delete state.needsFreshRead;
          delete state.needsFreshReadTimestamp;
        }
      }

      // Clean up stale lastRenamedTime (prevents memory leak)
      // Cleanup after 1 second (wasRecentlyRenamed checks 100ms window)
      if (state.lastRenamedTime) {
        const age = now - state.lastRenamedTime;
        if (age > 1000) {
          delete state.lastRenamedTime;
        }
      }

      // Clean up stale locks (prevents deadlock if lock was never released)
      if (state.isLocked && state.lockTimestamp) {
        const age = now - state.lockTimestamp;
        if (age > TIMING.FILE_LOCK_STALE_THRESHOLD_MS) {
          state.isLocked = false;
          delete state.lockTimestamp;
        }
      }

      // Clean up stale lastEditorContent (prevents memory leak from large notes)
      // Cleanup after 10 minutes (staleThreshold) - staleness check uses 5 min default
      if (state.lastEditorContentTimestamp) {
        const age = now - state.lastEditorContentTimestamp;
        if (age > staleThreshold) {
          delete state.lastEditorContent;
          delete state.lastEditorContentTimestamp;
        }
      }

      // Clean up stale lastSavedContent (prevents memory leak from large notes)
      // Cleanup after 10 minutes (staleThreshold) - staleness check uses 5 min default
      if (state.lastSavedContentTimestamp) {
        const age = now - state.lastSavedContentTimestamp;
        if (age > staleThreshold) {
          delete state.lastSavedContent;
          delete state.lastSavedContentTimestamp;
        }
      }

      // Clean up stale lastAliasUpdateStatus (prevents stale status affecting logic)
      // Cleanup after 5 minutes - status is only relevant shortly after update
      if (state.lastAliasUpdateTimestamp) {
        const age = now - state.lastAliasUpdateTimestamp;
        if (age > 5 * 60 * 1000) {
          delete state.lastAliasUpdateSucceeded;
          delete state.lastAliasUpdateTimestamp;
        }
      }

      // Clean up stale self-ref and safeword notice timestamps
      if (state.lastSelfRefNotice) {
        const age = now - state.lastSelfRefNotice;
        if (age > staleThreshold) {
          delete state.lastSelfRefNotice;
        }
      }
      if (state.lastSafewordNotice) {
        const age = now - state.lastSafewordNotice;
        if (age > staleThreshold) {
          delete state.lastSafewordNotice;
        }
      }

      // Remove completely empty state entries (only has path field)
      const stateKeys = Object.keys(state).filter(
        (k) => k !== 'path' && state[k as keyof FileState] !== undefined
      );
      if (stateKeys.length === 0) {
        this.fileStates.delete(path);
      }
    }
  }

  /**
   * Clear all state (on unload)
   */
  dispose(): void {
    for (const state of this.fileStates.values()) {
      if (state.creationDelayTimer) clearTimeout(state.creationDelayTimer);
      if (state.throttleTimer) clearTimeout(state.throttleTimer);
    }
    this.fileStates.clear();
  }
}
