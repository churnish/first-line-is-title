/**
 * TimestampRateLimiter
 *
 * Utility for timestamp-based rate limiting with automatic cleanup.
 * Provides consistent pattern for preventing duplicate operations within a time window.
 *
 * Use cases:
 * - Prevent duplicate tab close processing (100ms window)
 * - Rate limit notifications (2s window)
 * - Throttle canvas title insertions (1s window)
 */
export class TimestampRateLimiter {
  private timestamps = new Map<string, number>();

  /**
   * Check if operation is allowed and update timestamp if so
   * @param key - Unique identifier for the operation
   * @param ttlMs - Time-to-live in milliseconds
   * @returns true if operation allowed (not rate limited), false if blocked
   */
  checkAndUpdate(key: string, ttlMs: number): boolean {
    const now = Date.now();
    const last = this.timestamps.get(key);

    // Check if within rate limit window
    if (last && now - last < ttlMs) {
      return false; // Blocked - too soon
    }

    // Update timestamp and schedule cleanup
    this.timestamps.set(key, now);
    window.setTimeout(() => {
      this.timestamps.delete(key);
    }, ttlMs);

    return true; // Allowed
  }

  /**
   * Check if key was recently used (within TTL window)
   * Does NOT update timestamp
   */
  wasRecentlyUsed(key: string, ttlMs: number): boolean {
    const last = this.timestamps.get(key);
    if (!last) return false;
    return Date.now() - last < ttlMs;
  }

  /**
   * Mark key as used without checking
   * Useful for marking operations that happened outside this rate limiter
   */
  mark(key: string, ttlMs: number): void {
    const now = Date.now();
    this.timestamps.set(key, now);
    window.setTimeout(() => {
      this.timestamps.delete(key);
    }, ttlMs);
  }

  /**
   * Clear specific key
   */
  clear(key: string): void {
    this.timestamps.delete(key);
  }

  /**
   * Clear all timestamps
   */
  clearAll(): void {
    this.timestamps.clear();
  }

  /**
   * Get size (mainly for debugging)
   */
  get size(): number {
    return this.timestamps.size;
  }
}
