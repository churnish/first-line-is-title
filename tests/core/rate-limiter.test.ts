import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from '../../src/core/rate-limiter';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      windowMs: 1000,
      maxOperations: 5,
    });
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      const limiter = new RateLimiter({
        windowMs: 500,
        maxOperations: 10,
      });

      expect(limiter).toBeDefined();
    });

    it('should handle zero maxOperations', () => {
      const limiter = new RateLimiter({
        windowMs: 1000,
        maxOperations: 0,
      });

      // First call is allowed (initializes tracker), subsequent calls blocked
      expect(limiter.checkLimit('test')).toBe(true);
      expect(limiter.checkLimit('test')).toBe(false);
    });
  });

  describe('checkLimit (per-key)', () => {
    it('should allow first operation for a key', () => {
      const result = rateLimiter.checkLimit('file1');
      expect(result).toBe(true);
    });

    it('should allow operations under limit', () => {
      for (let i = 0; i < 5; i++) {
        const result = rateLimiter.checkLimit('file1');
        expect(result).toBe(true);
      }
    });

    it('should block operations over limit', () => {
      // Exhaust limit (5 operations)
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkLimit('file1');
      }

      // 6th operation should be blocked
      const result = rateLimiter.checkLimit('file1');
      expect(result).toBe(false);
    });

    it('should track keys independently', () => {
      // Exhaust limit for file1
      for (let i = 0; i < 6; i++) {
        rateLimiter.checkLimit('file1');
      }

      // file2 should still be allowed
      const result = rateLimiter.checkLimit('file2');
      expect(result).toBe(true);
    });

    it('should reset after time window expires', async () => {
      const limiter = new RateLimiter({
        windowMs: 50, // Short window for testing
        maxOperations: 2,
      });

      // Exhaust limit
      limiter.checkLimit('file1');
      limiter.checkLimit('file1');
      expect(limiter.checkLimit('file1')).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Should be allowed again
      const result = limiter.checkLimit('file1');
      expect(result).toBe(true);
    });

    it('should log when label is provided and limit hit', () => {
      const consoleSpy = vi.spyOn(console, 'debug');

      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkLimit('file1');
      }

      // Hit limit with label
      rateLimiter.checkLimit('file1', 'Test Label');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit hit for Test Label')
      );
    });

    it('should not log when label is not provided', () => {
      // In vitest v4, spyOn on a pre-mocked vi.fn() shares call history with the
      // global mock from setup.ts. mockClear() resets the count for this test.
      const consoleSpy = vi.spyOn(console, 'debug');
      consoleSpy.mockClear();

      // Exhaust limit
      for (let i = 0; i < 6; i++) {
        rateLimiter.checkLimit('file1');
      }

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should handle empty string keys', () => {
      const result = rateLimiter.checkLimit('');
      expect(result).toBe(true);
    });

    it('should handle special characters in keys', () => {
      const result = rateLimiter.checkLimit('file/with:special*chars.md');
      expect(result).toBe(true);
    });

    it('should handle very long keys', () => {
      const longKey = 'a/'.repeat(1000) + 'file.md';
      const result = rateLimiter.checkLimit(longKey);
      expect(result).toBe(true);
    });

    it('should track multiple keys simultaneously', () => {
      const keys = ['file1', 'file2', 'file3', 'file4', 'file5'];

      // Each key should be independent
      keys.forEach((key) => {
        const result = rateLimiter.checkLimit(key);
        expect(result).toBe(true);
      });
    });

    it('should maintain separate counters for each key', () => {
      // Use file1 twice
      rateLimiter.checkLimit('file1');
      rateLimiter.checkLimit('file1');

      // Use file2 once
      rateLimiter.checkLimit('file2');

      // file1 should have count of 2, file2 should have count of 1
      // Both should still be under limit (5)
      expect(rateLimiter.checkLimit('file1')).toBe(true);
      expect(rateLimiter.checkLimit('file2')).toBe(true);
    });
  });

  describe('checkGlobalLimit', () => {
    it('should allow first operation', () => {
      const result = rateLimiter.checkGlobalLimit();
      expect(result).toBe(true);
    });

    it('should allow operations under global limit', () => {
      for (let i = 0; i < 5; i++) {
        const result = rateLimiter.checkGlobalLimit();
        expect(result).toBe(true);
      }
    });

    it('should block operations over global limit', () => {
      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkGlobalLimit();
      }

      // 6th operation should be blocked
      const result = rateLimiter.checkGlobalLimit();
      expect(result).toBe(false);
    });

    it('should reset after time window expires', async () => {
      const limiter = new RateLimiter({
        windowMs: 50,
        maxOperations: 2,
      });

      // Exhaust limit
      limiter.checkGlobalLimit();
      limiter.checkGlobalLimit();
      expect(limiter.checkGlobalLimit()).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Should be allowed again
      const result = limiter.checkGlobalLimit();
      expect(result).toBe(true);
    });

    it('should log when label is provided and limit hit', () => {
      const consoleSpy = vi.spyOn(console, 'debug');

      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkGlobalLimit();
      }

      // Hit limit with label
      rateLimiter.checkGlobalLimit('Global Test');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Global rate limit hit')
      );
    });

    it('should not log when label is not provided', () => {
      // In vitest v4, spyOn on a pre-mocked vi.fn() shares call history with the
      // global mock from setup.ts. mockClear() resets the count for this test.
      const consoleSpy = vi.spyOn(console, 'debug');
      consoleSpy.mockClear();

      // Exhaust limit
      for (let i = 0; i < 6; i++) {
        rateLimiter.checkGlobalLimit();
      }

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should be independent of per-key limits', () => {
      // Exhaust global limit
      for (let i = 0; i < 6; i++) {
        rateLimiter.checkGlobalLimit();
      }

      // Per-key limit should still work
      const result = rateLimiter.checkLimit('file1');
      expect(result).toBe(true);
    });
  });

  describe('clearKey', () => {
    it('should clear tracking for specific key', () => {
      // Exhaust limit for file1
      for (let i = 0; i < 6; i++) {
        rateLimiter.checkLimit('file1');
      }

      // Should be blocked
      expect(rateLimiter.checkLimit('file1')).toBe(false);

      // Clear the key
      rateLimiter.clearKey('file1');

      // Should be allowed again
      expect(rateLimiter.checkLimit('file1')).toBe(true);
    });

    it('should not affect other keys', () => {
      // Use both keys
      rateLimiter.checkLimit('file1');
      rateLimiter.checkLimit('file2');

      // Clear file1
      rateLimiter.clearKey('file1');

      // file2 should still have its count
      expect(rateLimiter.checkLimit('file2')).toBe(true);
    });

    it('should not error when clearing non-existent key', () => {
      expect(() => rateLimiter.clearKey('non-existent')).not.toThrow();
    });

    it('should not affect global limit', () => {
      // Use global limit
      rateLimiter.checkGlobalLimit();
      rateLimiter.checkGlobalLimit();

      // Clear a key
      rateLimiter.clearKey('file1');

      // Global limit should still have its count
      expect(rateLimiter.checkGlobalLimit()).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear all per-key tracking', () => {
      // Exhaust limits for multiple keys
      for (let i = 0; i < 6; i++) {
        rateLimiter.checkLimit('file1');
        rateLimiter.checkLimit('file2');
      }

      // Both should be blocked
      expect(rateLimiter.checkLimit('file1')).toBe(false);
      expect(rateLimiter.checkLimit('file2')).toBe(false);

      // Clear all
      rateLimiter.clear();

      // Both should be allowed again
      expect(rateLimiter.checkLimit('file1')).toBe(true);
      expect(rateLimiter.checkLimit('file2')).toBe(true);
    });

    it('should reset global limit', () => {
      // Exhaust global limit
      for (let i = 0; i < 6; i++) {
        rateLimiter.checkGlobalLimit();
      }

      // Should be blocked
      expect(rateLimiter.checkGlobalLimit()).toBe(false);

      // Clear all
      rateLimiter.clear();

      // Should be allowed again
      expect(rateLimiter.checkGlobalLimit()).toBe(true);
    });

    it('should reset both per-key and global limits', () => {
      // Exhaust both limits
      for (let i = 0; i < 6; i++) {
        rateLimiter.checkLimit('file1');
        rateLimiter.checkGlobalLimit();
      }

      // Clear all
      rateLimiter.clear();

      // Both should work again
      expect(rateLimiter.checkLimit('file1')).toBe(true);
      expect(rateLimiter.checkGlobalLimit()).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle maxOperations of 1', () => {
      const limiter = new RateLimiter({
        windowMs: 1000,
        maxOperations: 1,
      });

      expect(limiter.checkLimit('file1')).toBe(true);
      expect(limiter.checkLimit('file1')).toBe(false);
    });

    it('should handle very large maxOperations', () => {
      const limiter = new RateLimiter({
        windowMs: 1000,
        maxOperations: 1000000,
      });

      for (let i = 0; i < 1000; i++) {
        expect(limiter.checkLimit('file1')).toBe(true);
      }
    });

    it('should handle very small time windows', () => {
      const limiter = new RateLimiter({
        windowMs: 1, // 1ms window
        maxOperations: 5,
      });

      expect(limiter.checkLimit('file1')).toBe(true);
    });

    it('should handle very large time windows', () => {
      const limiter = new RateLimiter({
        windowMs: 3600000, // 1 hour
        maxOperations: 5,
      });

      expect(limiter.checkLimit('file1')).toBe(true);
    });

    it('should handle rapid successive calls', () => {
      for (let i = 0; i < 100; i++) {
        rateLimiter.checkLimit(`file${i}`);
      }

      // Should track all 100 keys
      expect(() => rateLimiter.checkLimit('file50')).not.toThrow();
    });

    it('should handle mixed per-key and global calls', () => {
      rateLimiter.checkLimit('file1');
      rateLimiter.checkGlobalLimit();
      rateLimiter.checkLimit('file2');
      rateLimiter.checkGlobalLimit();
      rateLimiter.checkLimit('file1');

      // All should succeed (under limits)
      expect(rateLimiter.checkLimit('file1')).toBe(true);
      expect(rateLimiter.checkGlobalLimit()).toBe(true);
    });

    it('should handle clearing in middle of window', () => {
      // Use some operations
      rateLimiter.checkLimit('file1');
      rateLimiter.checkLimit('file1');

      // Clear
      rateLimiter.clearKey('file1');

      // Should start fresh
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.checkLimit('file1')).toBe(true);
      }
    });

    it('should handle Unicode characters in keys', () => {
      const result = rateLimiter.checkLimit('file-με-中文-🎉.md');
      expect(result).toBe(true);
    });
  });

  describe('performance', () => {
    it('should handle large number of keys efficiently', () => {
      const start = Date.now();

      // Create 10000 different keys
      for (let i = 0; i < 10000; i++) {
        rateLimiter.checkLimit(`file${i}`);
      }

      const duration = Date.now() - start;

      // Should complete in reasonable time (< 1 second)
      expect(duration).toBeLessThan(1000);
    });

    it('should handle repeated operations on same key efficiently', () => {
      const start = Date.now();

      // 1000 operations on same key
      for (let i = 0; i < 1000; i++) {
        rateLimiter.checkLimit('file1');
      }

      const duration = Date.now() - start;

      // Should complete in reasonable time
      expect(duration).toBeLessThan(100);
    });
  });
});
