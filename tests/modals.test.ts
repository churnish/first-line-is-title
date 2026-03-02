/**
 * Tests for modal error notification behavior
 *
 * Tests cover:
 * - Success notification only shown when no errors (Issue #6 from audit)
 * - Error notification shown when errors occur
 * - No duplicate notifications (both error and success shown together)
 * - renameEngine/propertyManager null checks
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as mockObsidian from './mockObsidian';
import { App, TFile } from './mockObsidian';
import { DEFAULT_SETTINGS } from '../src/constants';

// Track Notice calls via spy
let NoticeSpy: ReturnType<typeof vi.spyOn>;
const noticeInstances: { message: string; timeout?: number }[] = [];

// Mock i18n
vi.mock('../src/i18n', () => ({
  t: vi.fn((key: string) => {
    const translations: Record<string, string> = {
      'notifications.renamedNotes': 'Renamed {{renamed}}/{{total}} notes',
      'notifications.renamedNotesWithErrors':
        'Renamed {{renamed}}/{{total}} notes ({{errors}} errors)',
      'notifications.renameEngineNotInitialized':
        'Rename engine not initialized',
      'notifications.disabledRenamingForNNotes':
        'Disabled renaming for {{count}} notes',
      'notifications.enabledRenamingForNNotes':
        'Enabled renaming for {{count}} notes',
      'modals.caution': 'Caution',
      'modals.processingFiles': 'Processing {{count}} files...',
    };
    return translations[key] || key;
  }),
  getPluralForm: vi.fn(
    (count: number, one: string, _few: string, many: string) =>
      count === 1 ? one : many
  ),
  tpSplit: vi.fn(() => ({ before: '', noun: 'notes', after: '' })),
}));

// Mock utils
vi.mock('../src/utils', () => ({
  verboseLog: vi.fn(),
  shouldProcessFile: vi.fn(() => true),
  normalizeTag: vi.fn((tag: string) => tag),
}));

describe('Modal Error Notifications', () => {
  let mockApp: App;
  let mockPlugin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    noticeInstances.length = 0;

    // Spy on Notice class to track calls.
    // In vitest v4, mockImplementation must use a regular function (not an arrow
    // function) when the source calls `new Notice(...)` — arrow functions are not
    // constructable, which causes "is not a constructor" at the call site.
    NoticeSpy = vi.spyOn(mockObsidian, 'Notice').mockImplementation(function (
      message: string,
      timeout?: number
    ) {
      noticeInstances.push({ message, timeout });
      return { message, timeout, setMessage: vi.fn(), hide: vi.fn() } as any;
    } as any);

    mockApp = new App();
    mockPlugin = {
      app: mockApp,
      settings: { ...DEFAULT_SETTINGS },
      renameEngine: {
        // processFile returns { success: boolean; reason?: string }
        processFile: vi.fn().mockResolvedValue({ success: true }),
      },
      propertyManager: {
        ensurePropertyTypeIsCheckbox: vi.fn().mockResolvedValue(undefined),
      },
      disableRenamingForNote: vi.fn().mockResolvedValue(undefined),
      enableRenamingForNote: vi.fn().mockResolvedValue(undefined),
    };

    // Mock vault methods
    mockApp.vault.getMarkdownFiles = vi.fn().mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('DisableEnableModal notification behavior', () => {
    it('should show success notice only when no errors occur', async () => {
      // Import the modal
      const { DisableEnableModal } = await import('../src/modals');

      const files = [new TFile('test1.md'), new TFile('test2.md')];
      mockPlugin.disableRenamingForNote = vi.fn().mockResolvedValue(undefined);

      const modal = new DisableEnableModal(
        mockApp,
        mockPlugin,
        files,
        'disable'
      );

      // Simulate processFiles
      await modal['processFiles']();

      // Should have success notice (plus the "please wait" notice)
      const successNotices = noticeInstances.filter((n) =>
        n.message.includes('Disabled renaming')
      );
      expect(successNotices.length).toBe(1);

      // Should NOT have error notice
      const errorNotices = noticeInstances.filter((n) =>
        n.message.includes('errors')
      );
      expect(errorNotices.length).toBe(0);
    });

    it('should show error notice only when errors occur', async () => {
      const { DisableEnableModal } = await import('../src/modals');

      const files = [new TFile('test1.md'), new TFile('test2.md')];
      // processFiles uses fileManager.processFrontMatter, not disableRenamingForNote
      mockApp.fileManager.processFrontMatter = vi
        .fn()
        .mockRejectedValue(new Error('Test error'));

      const modal = new DisableEnableModal(
        mockApp,
        mockPlugin,
        files,
        'disable'
      );

      await modal['processFiles']();

      // Should have error notice
      const errorNotices = noticeInstances.filter((n) =>
        n.message.includes('errors')
      );
      expect(errorNotices.length).toBe(1);

      // Should NOT have success notice (this was the bug - Issue #6)
      const successNotices = noticeInstances.filter((n) =>
        n.message.includes('Disabled renaming')
      );
      expect(successNotices.length).toBe(0);
    });

    it('should not show duplicate notifications', async () => {
      const { DisableEnableModal } = await import('../src/modals');

      const files = [new TFile('test1.md')];
      // processFiles uses fileManager.processFrontMatter
      mockApp.fileManager.processFrontMatter = vi
        .fn()
        .mockRejectedValue(new Error('Test error'));

      const modal = new DisableEnableModal(
        mockApp,
        mockPlugin,
        files,
        'disable'
      );

      await modal['processFiles']();

      // Count all notification types (excluding "please wait")
      const allResultNotices = noticeInstances.filter(
        (n) =>
          n.message.includes('Disabled') ||
          n.message.includes('errors') ||
          n.message.includes('Renamed')
      );

      // Should only have ONE result notification (either success OR error, not both)
      expect(allResultNotices.length).toBe(1);
    });

    it('should show notice when propertyManager is null for disable action', async () => {
      const { DisableEnableModal } = await import('../src/modals');

      mockPlugin.propertyManager = null;
      const files = [new TFile('test1.md')];

      const modal = new DisableEnableModal(
        mockApp,
        mockPlugin,
        files,
        'disable'
      );

      await modal['processFiles']();

      // Should show "not initialized" notice
      const initNotices = noticeInstances.filter((n) =>
        n.message.includes('not initialized')
      );
      expect(initNotices.length).toBe(1);
    });
  });

  describe('RenameAllFilesModal notification behavior', () => {
    it('should show notice when renameEngine is null', async () => {
      const { RenameAllFilesModal } = await import('../src/modals');

      mockPlugin.renameEngine = null;
      mockApp.vault.getMarkdownFiles = vi
        .fn()
        .mockReturnValue([new TFile('test.md')]);

      const modal = new RenameAllFilesModal(mockApp, mockPlugin);

      await modal['renameAllFiles']();

      const initNotices = noticeInstances.filter((n) =>
        n.message.includes('not initialized')
      );
      expect(initNotices.length).toBe(1);
    });

    it('should show success notice only when no errors', async () => {
      const { RenameAllFilesModal } = await import('../src/modals');

      const files = [new TFile('test1.md'), new TFile('test2.md')];
      mockApp.vault.getMarkdownFiles = vi.fn().mockReturnValue(files);
      mockPlugin.renameEngine.processFile = vi
        .fn()
        .mockResolvedValue({ success: true });

      const modal = new RenameAllFilesModal(mockApp, mockPlugin);
      await modal['renameAllFiles']();

      const successNotices = noticeInstances.filter(
        (n) => n.message.includes('Renamed') && !n.message.includes('errors')
      );
      expect(successNotices.length).toBe(1);

      const errorNotices = noticeInstances.filter((n) =>
        n.message.includes('errors')
      );
      expect(errorNotices.length).toBe(0);
    });

    it('should show error notice when errors occur', async () => {
      const { RenameAllFilesModal } = await import('../src/modals');

      const files = [new TFile('test1.md')];
      mockApp.vault.getMarkdownFiles = vi.fn().mockReturnValue(files);
      mockPlugin.renameEngine.processFile = vi
        .fn()
        .mockRejectedValue(new Error('Rename failed'));

      const modal = new RenameAllFilesModal(mockApp, mockPlugin);
      await modal['renameAllFiles']();

      const errorNotices = noticeInstances.filter((n) =>
        n.message.includes('errors')
      );
      expect(errorNotices.length).toBe(1);

      // Success notice should NOT be shown when errors occur
      const successNotices = noticeInstances.filter(
        (n) => n.message.includes('Renamed') && !n.message.includes('errors')
      );
      expect(successNotices.length).toBe(0);
    });
  });

  describe('RenameModal notification behavior', () => {
    it('should show notice when renameEngine is null', async () => {
      const { RenameModal } = await import('../src/modals');

      mockPlugin.renameEngine = null;
      const files = [new TFile('test.md')];

      const modal = new RenameModal(mockApp, mockPlugin, files);

      // RenameModal uses renameFiles method
      await modal['renameFiles'](false, false, false);

      const initNotices = noticeInstances.filter((n) =>
        n.message.includes('not initialized')
      );
      expect(initNotices.length).toBe(1);
    });

    it('should show success notice only when no errors', async () => {
      const { RenameModal } = await import('../src/modals');

      const files = [new TFile('test1.md')];
      mockPlugin.renameEngine.processFile = vi
        .fn()
        .mockResolvedValue({ success: true });

      const modal = new RenameModal(mockApp, mockPlugin, files);
      await modal['renameFiles'](false, false, false);

      const successNotices = noticeInstances.filter(
        (n) => n.message.includes('Renamed') && !n.message.includes('errors')
      );
      expect(successNotices.length).toBe(1);
    });

    it('should show error notice when errors occur', async () => {
      const { RenameModal } = await import('../src/modals');

      const files = [new TFile('test1.md')];
      mockPlugin.renameEngine.processFile = vi
        .fn()
        .mockRejectedValue(new Error('Failed'));

      const modal = new RenameModal(mockApp, mockPlugin, files);
      await modal['renameFiles'](false, false, false);

      const errorNotices = noticeInstances.filter((n) =>
        n.message.includes('errors')
      );
      expect(errorNotices.length).toBe(1);
    });
  });
});
