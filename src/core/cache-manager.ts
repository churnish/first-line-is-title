import type FirstLineIsTitlePlugin from '../../main';

export interface CacheConfig {
  maxContentEntries: number;
  maxOperationEntries: number;
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxContentEntries: 1000,
  maxOperationEntries: 500,
};

class LRUCache<K, V> {
  private maxSize: number;
  private cache: Map<K, V>;
  private accessOrder: Map<K, number>; // Track access order with counter
  private accessCounter: number = 0;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.accessOrder = new Map();
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      // Update existing entry
      this.cache.delete(key);
      this.cache.set(key, value);
      this.accessOrder.set(key, ++this.accessCounter);
    } else {
      // Add new entry, evict LRU if at capacity
      if (this.cache.size >= this.maxSize) {
        // Find key with minimum access counter (least recently used)
        let lruKey: K | undefined;
        let minAccess = Infinity;

        for (const [k, accessTime] of this.accessOrder) {
          if (accessTime < minAccess) {
            minAccess = accessTime;
            lruKey = k;
          }
        }

        if (lruKey !== undefined) {
          this.cache.delete(lruKey);
          this.accessOrder.delete(lruKey);
        }
      }

      this.cache.set(key, value);
      this.accessOrder.set(key, ++this.accessCounter);
    }
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Update access order
      this.accessOrder.set(key, ++this.accessCounter);
    }
    return value;
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    this.accessOrder.delete(key);
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
    this.accessCounter = 0;
  }

  size(): number {
    return this.cache.size;
  }

  keys(): IterableIterator<K> {
    return this.cache.keys();
  }
}

class FileExistenceCache {
  private pathCache: Set<string> = new Set();
  private lastUpdate: number = 0;
  private readonly cacheTTL: number = 5000;
  private plugin: FirstLineIsTitlePlugin;

  constructor(plugin: FirstLineIsTitlePlugin) {
    this.plugin = plugin;
  }

  exists(path: string): boolean {
    const now = Date.now();
    if (now - this.lastUpdate > this.cacheTTL) {
      this.rebuildCache();
      this.lastUpdate = now;
    }

    return (
      this.pathCache.has(path.toLowerCase()) ||
      this.plugin.app.vault.getAbstractFileByPath(path) !== null
    );
  }

  private rebuildCache(): void {
    this.pathCache.clear();
    const files = this.plugin.app.vault.getAllLoadedFiles();
    for (const file of files) {
      this.pathCache.add(file.path.toLowerCase());
    }
  }

  addPath(path: string): void {
    this.pathCache.add(path.toLowerCase());
  }

  removePath(path: string): void {
    this.pathCache.delete(path.toLowerCase());
  }

  clear(): void {
    this.pathCache.clear();
    this.lastUpdate = 0;
  }
}

interface OperationData {
  count: number;
  lastContent: string;
  lastUpdate: number;
}

export class CacheManager {
  private plugin: FirstLineIsTitlePlugin;

  // Optimized data structures
  private contentCache: LRUCache<string, string>;
  private tempPaths: Set<string>;
  private fileExistence: FileExistenceCache;

  private isDisposed: boolean = false;

  constructor(
    plugin: FirstLineIsTitlePlugin,
    config: CacheConfig = DEFAULT_CACHE_CONFIG
  ) {
    this.plugin = plugin;

    // Initialize optimized caches
    this.contentCache = new LRUCache(config.maxContentEntries);
    this.tempPaths = new Set();
    this.fileExistence = new FileExistenceCache(plugin);
  }

  // ==================== CONTENT CACHE ====================

  /**
   * Get cached content for a file - O(1) operation
   */
  getContent(filePath: string): string | undefined {
    return this.contentCache.get(filePath);
  }

  /**
   * Store content in cache - O(1) operation with LRU eviction
   */
  setContent(filePath: string, content: string): void {
    this.contentCache.set(filePath, content);
  }

  /**
   * Check if content has changed - O(1) operation
   */
  hasContentChanged(filePath: string, currentContent: string): boolean {
    const cachedContent = this.contentCache.get(filePath);
    return cachedContent !== currentContent;
  }

  // ==================== TEMP PATHS (CONFLICT PREVENTION) ====================

  /**
   * Reserve a path to prevent conflicts - O(1) operation (vs O(n) with array)
   */
  reservePath(path: string): void {
    this.tempPaths.add(path.toLowerCase());
  }

  /**
   * Release a reserved path - O(1) operation
   */
  releasePath(path: string): void {
    this.tempPaths.delete(path.toLowerCase());
  }

  /**
   * Release multiple paths at once (for batch operations)
   */
  releasePathsBatch(paths: string[]): void {
    for (const path of paths) {
      this.tempPaths.delete(path.toLowerCase());
    }
  }

  /**
   * Clear all reserved paths (for immediate cleanup after batch operations)
   */
  clearReservedPaths(): void {
    this.tempPaths.clear();
  }

  /**
   * Check if path is reserved - O(1) operation (vs O(n) with array.some())
   */
  isPathReserved(path: string): boolean {
    return this.tempPaths.has(path.toLowerCase());
  }

  /**
   * Check for path conflicts - O(1) operation combining existence + reservation
   */
  hasPathConflict(path: string): boolean {
    return this.fileExistence.exists(path) || this.isPathReserved(path);
  }

  // ==================== FILE EXISTENCE CACHE ====================

  /**
   * Check if file exists - O(1) with TTL cache
   */
  fileExists(path: string): boolean {
    return this.fileExistence.exists(path);
  }

  /**
   * Notify cache of new file creation
   */
  notifyFileCreated(path: string): void {
    this.fileExistence.addPath(path);
  }

  /**
   * Notify cache of file deletion
   */
  notifyFileDeleted(path: string): void {
    this.fileExistence.removePath(path);
    this.contentCache.delete(path);
    this.releasePath(path);
  }

  /**
   * Update cache when file is renamed
   */
  notifyFileRenamed(oldPath: string, newPath: string): void {
    // Move content cache entry
    const content = this.contentCache.get(oldPath);
    if (content !== undefined) {
      this.contentCache.delete(oldPath);
      this.contentCache.set(newPath, content);
    }

    // Update file existence cache
    this.fileExistence.removePath(oldPath);
    this.fileExistence.addPath(newPath);

    // Release old path, reserve new path temporarily
    this.releasePath(oldPath);
    this.reservePath(newPath);
  }

  // ==================== OPERATION TRACKING ====================

  /**
   * Track operation for rate limiting and conflict prevention
   */
  trackOperation(filePath: string, content: string): void {
    this.plugin.fileStateManager.updateOperationCount(filePath, content);
  }

  /**
   * Get operation data for a file
   */
  getOperationData(filePath: string): OperationData | undefined {
    return this.plugin.fileStateManager.getOperationData(filePath);
  }

  // ==================== FILE OPERATION LOCK (CONSOLIDATED) ====================

  /**
   * Acquire lock for file operation (rename, alias update, etc.)
   * Prevents concurrent operations on same file
   */
  acquireLock(filePath: string): boolean {
    return this.plugin.fileStateManager.acquireLock(filePath);
  }

  /**
   * Release lock for file operation
   */
  releaseLock(filePath: string): void {
    this.plugin.fileStateManager.releaseLock(filePath);
  }

  /**
   * Check if file operation is locked
   */
  isLocked(filePath: string): boolean {
    return this.plugin.fileStateManager.isLocked(filePath);
  }

  /**
   * Clear all locks (used during plugin unload)
   */
  clearAllLocks(): void {
    this.plugin.fileStateManager.clearAllLocks();
  }

  /**
   * Mark file as needing alias recheck after current operation completes
   */
  markPendingAliasRecheck(filePath: string): void {
    this.plugin.fileStateManager.markPendingAliasRecheck(filePath);
  }

  /**
   * Check if file has pending alias recheck
   */
  hasPendingAliasRecheck(filePath: string): boolean {
    return this.plugin.fileStateManager.hasPendingAliasRecheck(filePath);
  }

  /**
   * Clear pending alias recheck flag
   */
  clearPendingAliasRecheck(filePath: string): void {
    this.plugin.fileStateManager.clearPendingAliasRecheck(filePath);
  }

  // ==================== MONITORING ====================

  /**
   * Get cache statistics for monitoring
   */
  getStats(): {
    contentCacheSize: number;
    tempPathsCount: number;
  } {
    return {
      contentCacheSize: this.contentCache.size(),
      tempPathsCount: this.tempPaths.size,
    };
  }

  /**
   * Dispose of cache manager and clean up all resources
   */
  dispose(): void {
    this.isDisposed = true;

    // Clear all caches
    this.contentCache.clear();
    this.tempPaths.clear();
    this.fileExistence.clear();
  }
}
