/**
 * RateLimiter
 *
 * Unified rate limiting system supporting both per-key and global rate limits.
 */

export interface RateLimitConfig {
  windowMs: number;
  maxOperations: number;
}

interface TrackerData {
  timestamp: number;
  count: number;
}

export class RateLimiter {
  private windowMs: number;
  private maxOperations: number;

  // For per-key tracking (e.g., per-file rate limiting)
  private tracker = new Map<string, TrackerData>();

  // For global tracking (all operations combined)
  private globalTracker: TrackerData = { timestamp: Date.now(), count: 0 };

  constructor(config: RateLimitConfig) {
    this.windowMs = config.windowMs;
    this.maxOperations = config.maxOperations;
  }

  /**
   * Check rate limit for a specific key (e.g., file path)
   * Returns true if operation is allowed, false if rate limit exceeded
   */
  checkLimit(key: string, label?: string): boolean {
    const now = Date.now();
    const data = this.tracker.get(key);

    // Window expired or first operation for this key - reset and allow
    if (!data || now - data.timestamp > this.windowMs) {
      this.tracker.set(key, { timestamp: now, count: 1 });
      return true;
    }

    // Check if limit exceeded
    if (data.count >= this.maxOperations) {
      if (label) {
        console.debug(
          `Rate limit hit for ${label} - ${data.count} operations in ${now - data.timestamp}ms`
        );
      }
      return false;
    }

    // Increment counter and allow
    data.count++;
    return true;
  }

  /**
   * Check global rate limit (all operations combined)
   * Returns true if operation is allowed, false if rate limit exceeded
   */
  checkGlobalLimit(label?: string): boolean {
    const now = Date.now();

    // Window expired - reset and allow
    if (now - this.globalTracker.timestamp > this.windowMs) {
      this.globalTracker = { timestamp: now, count: 1 };
      return true;
    }

    // Check if limit exceeded
    if (this.globalTracker.count >= this.maxOperations) {
      if (label) {
        console.debug(
          `Global rate limit hit - ${this.globalTracker.count} operations in ${now - this.globalTracker.timestamp}ms`
        );
      }
      return false;
    }

    // Increment counter and allow
    this.globalTracker.count++;
    return true;
  }

  /**
   * Clear tracking data for a specific key (e.g., when file is deleted)
   */
  clearKey(key: string): void {
    this.tracker.delete(key);
  }

  /**
   * Clear all tracking data
   */
  clear(): void {
    this.tracker.clear();
    this.globalTracker = { timestamp: Date.now(), count: 0 };
  }
}
