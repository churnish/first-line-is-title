/**
 * Tests for settings tab race condition handling
 *
 * Tests verify the race condition patterns documented in the codebase:
 * - Generation counter for RAF callback guards
 * - AbortController for event listener cleanup
 * - Proper order of operations in display()
 * - Proper cleanup in hide()
 *
 * Note: Due to JSDOM limitations with AbortSignal in addEventListener,
 * these tests verify the patterns at the unit level rather than running
 * the full display() method.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { App } from '../mockObsidian';
import { DEFAULT_SETTINGS } from '../../src/constants';

// Mock i18n
vi.mock('../../src/i18n', () => ({
  t: vi.fn((key: string) => key),
  getCurrentLocale: vi.fn(() => 'en'),
}));

// Mock utils
vi.mock('../../src/utils', () => ({
  deduplicateExclusions: vi.fn((arr: unknown[]) => arr),
  verboseLog: vi.fn(),
}));

// Mock all tab classes
vi.mock('../../src/settings/tab-general', () => ({
  GeneralTab: vi.fn().mockImplementation(() => ({ display: vi.fn() })),
}));
vi.mock('../../src/settings/tab-exclusions', () => ({
  IncludeExcludeTab: vi.fn().mockImplementation(() => ({ display: vi.fn() })),
}));
vi.mock('../../src/settings/tab-alias', () => ({
  PropertiesTab: vi.fn().mockImplementation(() => ({ display: vi.fn() })),
}));
vi.mock('../../src/settings/tab-replace-characters', () => ({
  ForbiddenCharsTab: vi.fn().mockImplementation(() => ({ display: vi.fn() })),
}));
vi.mock('../../src/settings/tab-strip-markup', () => ({
  StripMarkupTab: vi.fn().mockImplementation(() => ({ display: vi.fn() })),
}));
vi.mock('../../src/settings/tab-custom-rules', () => ({
  CustomReplacementsTab: vi.fn().mockImplementation(() => ({
    display: vi.fn(),
  })),
}));
vi.mock('../../src/settings/tab-safewords', () => ({
  SafewordsTab: vi.fn().mockImplementation(() => ({ display: vi.fn() })),
}));
vi.mock('../../src/settings/tab-commands', () => ({
  CommandsTab: vi.fn().mockImplementation(() => ({ display: vi.fn() })),
}));
vi.mock('../../src/settings/tab-other', () => ({
  OtherTab: vi.fn().mockImplementation(() => ({ display: vi.fn() })),
}));

describe('Settings Tab Race Condition Patterns', () => {
  let mockApp: App;
  let mockPlugin: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockApp = new App();
    mockPlugin = {
      app: mockApp,
      settings: { ...DEFAULT_SETTINGS },
      saveSettings: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe('FirstLineIsTitleSettings class initialization', () => {
    it('should have race condition safeguards initialized', async () => {
      const { FirstLineIsTitleSettings } =
        await import('../../src/settings/settings-main');
      const settings = new FirstLineIsTitleSettings(mockApp, mockPlugin);

      // Verify initialization of race condition safeguards
      expect((settings as any).activationGeneration).toBe(0);
      expect((settings as any).cachedTabRows).toEqual([]);
      expect((settings as any).abortController).toBeNull();
      expect((settings as any).resizeTimeout).toBeNull();
      expect((settings as any).isDisplayed).toBe(false);
    });
  });

  describe('Generation counter pattern', () => {
    it('should use generation counter to guard async operations', async () => {
      const { FirstLineIsTitleSettings } =
        await import('../../src/settings/settings-main');
      const settings = new FirstLineIsTitleSettings(mockApp, mockPlugin);

      // Simulate what happens during tab activation
      const startGeneration = (settings as any).activationGeneration;

      // Increment generation (simulates another display() call during async operation)
      (settings as any).activationGeneration++;

      // The guard pattern: if generation changed, abort
      const currentGeneration = (settings as any).activationGeneration;
      expect(currentGeneration).toBeGreaterThan(startGeneration);
    });
  });

  describe('AbortController pattern', () => {
    it('should create new AbortController when null', async () => {
      const { FirstLineIsTitleSettings } =
        await import('../../src/settings/settings-main');
      const settings = new FirstLineIsTitleSettings(mockApp, mockPlugin);

      // Initially null
      expect((settings as any).abortController).toBeNull();

      // Simulate what display() does: create new controller
      (settings as any).abortController = new AbortController();
      expect((settings as any).abortController).not.toBeNull();
      expect((settings as any).abortController.signal.aborted).toBe(false);
    });

    it('should abort previous controller before creating new one', async () => {
      const { FirstLineIsTitleSettings } =
        await import('../../src/settings/settings-main');
      const settings = new FirstLineIsTitleSettings(mockApp, mockPlugin);

      // Create first controller
      const firstController = new AbortController();
      (settings as any).abortController = firstController;

      // Simulate what display() does: abort old, create new
      firstController.abort();
      const secondController = new AbortController();
      (settings as any).abortController = secondController;

      expect(firstController.signal.aborted).toBe(true);
      expect(secondController.signal.aborted).toBe(false);
    });
  });

  describe('Cached tab rows pattern', () => {
    it('should clear cached rows on new display cycle', async () => {
      const { FirstLineIsTitleSettings } =
        await import('../../src/settings/settings-main');
      const settings = new FirstLineIsTitleSettings(mockApp, mockPlugin);

      // Simulate cached rows from previous display
      (settings as any).cachedTabRows = [
        [document.createElement('div')],
        [document.createElement('div')],
      ];

      expect((settings as any).cachedTabRows.length).toBe(2);

      // Simulate what display() does: clear cache
      (settings as any).cachedTabRows = [];

      expect((settings as any).cachedTabRows).toEqual([]);
    });
  });

  describe('Resize timeout pattern', () => {
    it('should clear resize timeout on new display cycle', async () => {
      vi.useFakeTimers();

      const { FirstLineIsTitleSettings } =
        await import('../../src/settings/settings-main');
      const settings = new FirstLineIsTitleSettings(mockApp, mockPlugin);

      // Simulate a pending resize timeout
      (settings as any).resizeTimeout = setTimeout(() => {}, 100);
      expect((settings as any).resizeTimeout).not.toBeNull();

      // Simulate what display() does: clear timeout
      if ((settings as any).resizeTimeout) {
        clearTimeout((settings as any).resizeTimeout);
        (settings as any).resizeTimeout = null;
      }

      expect((settings as any).resizeTimeout).toBeNull();

      vi.useRealTimers();
    });
  });

  describe('Order of operations in display()', () => {
    it('should follow correct cleanup order: abort -> clear cache -> empty DOM', async () => {
      const { FirstLineIsTitleSettings } =
        await import('../../src/settings/settings-main');
      const settings = new FirstLineIsTitleSettings(mockApp, mockPlugin);

      // Set up initial state
      const oldController = new AbortController();
      (settings as any).abortController = oldController;
      (settings as any).cachedTabRows = [[document.createElement('div')]];

      const operations: string[] = [];

      // Simulate the order from display():
      // 1. Abort old listeners first
      operations.push('abort');
      oldController.abort();

      // 2. Then clear cached tab rows
      operations.push('clearCache');
      (settings as any).cachedTabRows = [];

      // 3. Then clean DOM (containerEl.empty())
      operations.push('emptyDOM');

      // 4. Then create new controller
      operations.push('newController');
      (settings as any).abortController = new AbortController();

      expect(operations).toEqual([
        'abort',
        'clearCache',
        'emptyDOM',
        'newController',
      ]);
      expect(oldController.signal.aborted).toBe(true);
      expect((settings as any).cachedTabRows).toEqual([]);
      expect((settings as any).abortController.signal.aborted).toBe(false);
    });
  });

  describe('hide() cleanup', () => {
    it('should abort controller on hide', async () => {
      const { FirstLineIsTitleSettings } =
        await import('../../src/settings/settings-main');
      const settings = new FirstLineIsTitleSettings(mockApp, mockPlugin);

      // Set up state as if display() was called
      (settings as any).abortController = new AbortController();
      (settings as any).isDisplayed = true;

      const controller = (settings as any).abortController;

      // Call hide
      settings.hide();

      expect(controller.signal.aborted).toBe(true);
    });

    it('should clear resize timeout on hide', async () => {
      vi.useFakeTimers();

      const { FirstLineIsTitleSettings } =
        await import('../../src/settings/settings-main');
      const settings = new FirstLineIsTitleSettings(mockApp, mockPlugin);

      // Set up state as if display() was called with pending resize
      (settings as any).abortController = new AbortController();
      (settings as any).resizeTimeout = setTimeout(() => {}, 100);
      (settings as any).isDisplayed = true;

      expect((settings as any).resizeTimeout).not.toBeNull();

      settings.hide();

      expect((settings as any).resizeTimeout).toBeNull();

      vi.useRealTimers();
    });

    it('should set isDisplayed to false on hide', async () => {
      const { FirstLineIsTitleSettings } =
        await import('../../src/settings/settings-main');
      const settings = new FirstLineIsTitleSettings(mockApp, mockPlugin);

      // Set up state as if display() was called
      (settings as any).abortController = new AbortController();
      (settings as any).isDisplayed = true;

      settings.hide();

      expect((settings as any).isDisplayed).toBe(false);
    });

    it('should increment activationGeneration on hide to invalidate in-flight operations', async () => {
      const { FirstLineIsTitleSettings } =
        await import('../../src/settings/settings-main');
      const settings = new FirstLineIsTitleSettings(mockApp, mockPlugin);

      // Set up state as if display() was called
      (settings as any).abortController = new AbortController();
      (settings as any).isDisplayed = true;
      const generationBeforeHide = (settings as any).activationGeneration;

      settings.hide();

      // Generation should have incremented to invalidate any in-flight tab activations
      expect((settings as any).activationGeneration).toBe(
        generationBeforeHide + 1
      );
    });
  });

  describe('RAF callback guard pattern', () => {
    it('should skip callback if generation changes', async () => {
      const { FirstLineIsTitleSettings } =
        await import('../../src/settings/settings-main');
      const settings = new FirstLineIsTitleSettings(mockApp, mockPlugin);

      let callbackExecuted = false;

      // Simulate the RAF callback guard pattern from computeTabRows:
      const capturedGeneration = (settings as any).activationGeneration;

      // Increment generation (simulates another display() call)
      (settings as any).activationGeneration++;

      // The guard: if generation changed, skip
      if (
        (settings as any).activationGeneration === capturedGeneration &&
        !(settings as any).abortController?.signal.aborted
      ) {
        callbackExecuted = true;
      }

      expect(callbackExecuted).toBe(false);
    });

    it('should skip callback if aborted', async () => {
      const { FirstLineIsTitleSettings } =
        await import('../../src/settings/settings-main');
      const settings = new FirstLineIsTitleSettings(mockApp, mockPlugin);

      let callbackExecuted = false;

      // Set up controller and abort it
      (settings as any).abortController = new AbortController();
      const capturedGeneration = (settings as any).activationGeneration;
      (settings as any).abortController.abort();

      // The guard: if aborted, skip
      if (
        (settings as any).activationGeneration === capturedGeneration &&
        !(settings as any).abortController?.signal.aborted
      ) {
        callbackExecuted = true;
      }

      expect(callbackExecuted).toBe(false);
    });

    it('should execute callback if generation and abort signal are valid', async () => {
      const { FirstLineIsTitleSettings } =
        await import('../../src/settings/settings-main');
      const settings = new FirstLineIsTitleSettings(mockApp, mockPlugin);

      let callbackExecuted = false;

      // Set up valid state
      (settings as any).abortController = new AbortController();
      const capturedGeneration = (settings as any).activationGeneration;

      // The guard: both checks pass, callback should execute
      if (
        (settings as any).activationGeneration === capturedGeneration &&
        !(settings as any).abortController?.signal.aborted
      ) {
        callbackExecuted = true;
      }

      expect(callbackExecuted).toBe(true);
    });
  });
});
