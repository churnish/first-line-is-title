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
import { App, TFile, TFolder } from './mockObsidian';
import { createTestSettings } from './testUtils';

// Track Notice calls via spy
const noticeInstances: { message: string; timeout?: number }[] = [];

/** Index arithmetic rather than `.at(-1)`, which is outside the lib target. */
function lastNoticeMessage(): string | undefined {
  return noticeInstances[noticeInstances.length - 1]?.message;
}

// Mock i18n
vi.mock('../src/i18n', () => ({
  t: vi.fn((key: string) => {
    const translations: Record<string, string> = {
      'notifications.renamedNotes': 'Renamed {{renamed}}/{{total}} notes',
      'notifications.renamedNotesWithErrors':
        'Renamed {{renamed}}/{{total}} notes ({{errors}} errors)',
      'notifications.processingNNotes': 'Processing {{count}} notes...',
      'notifications.processedNotesWithErrors':
        'Processed {{processed}}/{{total}} notes ({{errors}} errors)',
      'notifications.renameEngineNotInitialized':
        'Rename engine not initialized',
      'notifications.propertyManagerNotInitialized':
        'Property manager not initialized',
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
    vi.spyOn(mockObsidian, 'Notice').mockImplementation(function (
      message: string,
      timeout?: number
    ) {
      noticeInstances.push({ message, timeout });
      return {
        message,
        timeout,
        setMessage: vi.fn(),
        hide: vi.fn(),
        containerEl: document.createElement('div'),
      } as any;
    } as any);

    mockApp = new App();
    mockPlugin = {
      app: mockApp,
      settings: createTestSettings(),
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

    it('never claims notes were renamed, since it only writes a property', async () => {
      const { DisableEnableModal } = await import('../src/modals');

      const files = [new TFile('test1.md'), new TFile('test2.md')];
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

      expect(
        noticeInstances.filter((n) => /renam/i.test(n.message))
      ).toHaveLength(0);
      expect(noticeInstances.map((n) => n.message)).toEqual([
        'Processing 2 notes...',
        'Processed 0/2 notes (2 errors)',
      ]);
    });

    it('processes every note when the batch spans several chunks', async () => {
      const { DisableEnableModal } = await import('../src/modals');

      // 20 files is larger than the internal chunk size, so this covers the
      // boundary between chunks as well as a partial trailing chunk.
      const files = Array.from(
        { length: 20 },
        (_, index) => new TFile(`note${index}.md`)
      );
      const touched: string[] = [];
      mockApp.fileManager.processFrontMatter = vi.fn(async (file: TFile) => {
        touched.push(file.path);
      });

      const modal = new DisableEnableModal(
        mockApp,
        mockPlugin,
        files,
        'disable'
      );

      await modal['processFiles']();

      expect(touched.sort()).toEqual(files.map((f) => f.path).sort());
      expect(lastNoticeMessage()).toBe('Disabled renaming for 20 notes');
    });

    it('keeps going after a failure mid-chunk', async () => {
      const { DisableEnableModal } = await import('../src/modals');

      const files = Array.from(
        { length: 12 },
        (_, index) => new TFile(`note${index}.md`)
      );
      mockApp.fileManager.processFrontMatter = vi.fn(async (file: TFile) => {
        if (file.path === 'note3.md') throw new Error('Test error');
      });

      const modal = new DisableEnableModal(
        mockApp,
        mockPlugin,
        files,
        'disable'
      );

      await modal['processFiles']();

      expect(lastNoticeMessage()).toBe('Processed 11/12 notes (1 errors)');
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

    it('should rename in concurrent chunks without losing count', async () => {
      const { RenameAllFilesModal } = await import('../src/modals');

      const files = Array.from(
        { length: 10 },
        (_, index) => new TFile(`test${index}.md`)
      );
      mockApp.vault.getMarkdownFiles = vi.fn().mockReturnValue(files);

      let inFlight = 0;
      let peakInFlight = 0;
      mockPlugin.renameEngine.processFile = vi.fn(async () => {
        inFlight++;
        peakInFlight = Math.max(peakInFlight, inFlight);
        await Promise.resolve();
        inFlight--;
        return { success: true };
      });

      const modal = new RenameAllFilesModal(mockApp, mockPlugin);
      await modal['renameAllFiles']();

      // One full chunk runs at once, and every note still lands in the total
      expect(peakInFlight).toBe(8);
      expect(lastNoticeMessage()).toBe('Renamed 10/10 notes');
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

  describe('RenameMultipleFoldersModal file classification', () => {
    /** Builds `path` as a Markdown file parented to the folder that owns it. */
    function fileIn(folder: any, name: string): TFile {
      const file = new TFile(`${folder.path}/${name}`);
      (file as any).parent = folder;
      return file;
    }

    it('processes a nested-folder note once when both folders are selected', async () => {
      const { RenameMultipleFoldersModal } = await import('../src/modals');

      const parent = new TFolder('A');
      const child = new TFolder('A/B');
      const shallow = fileIn(parent, 'note.md');
      const deep = fileIn(child, 'deep.md');
      mockApp.vault.getMarkdownFiles = vi.fn().mockReturnValue([shallow, deep]);

      const modal = new RenameMultipleFoldersModal(mockApp, mockPlugin, [
        parent,
        child,
      ]);
      await modal['renameMultipleFolders'](true, false, false, false);

      const processed = mockPlugin.renameEngine.processFile.mock.calls.map(
        (call: unknown[]) => (call[0] as TFile).path
      );
      expect(processed.sort()).toEqual(['A/B/deep.md', 'A/note.md']);
    });

    it('counts each note under the selection exactly once', async () => {
      const { RenameMultipleFoldersModal } = await import('../src/modals');

      const parent = new TFolder('A');
      const child = new TFolder('A/B');
      mockApp.vault.getMarkdownFiles = vi
        .fn()
        .mockReturnValue([fileIn(parent, 'note.md'), fileIn(child, 'deep.md')]);

      const modal = new RenameMultipleFoldersModal(mockApp, mockPlugin, [
        parent,
        child,
      ]);
      await modal['renameMultipleFolders'](true, false, false, false);

      expect(lastNoticeMessage()).toBe('Renamed 2/2 notes');
    });

    it('counts subfolder notes even when they are not processed', async () => {
      const { RenameMultipleFoldersModal } = await import('../src/modals');

      const parent = new TFolder('A');
      const child = new TFolder('A/B');
      mockApp.vault.getMarkdownFiles = vi
        .fn()
        .mockReturnValue([fileIn(parent, 'note.md'), fileIn(child, 'deep.md')]);

      const modal = new RenameMultipleFoldersModal(mockApp, mockPlugin, [
        parent,
      ]);
      await modal['renameMultipleFolders'](false, false, false, false);

      expect(mockPlugin.renameEngine.processFile).toHaveBeenCalledTimes(1);
      expect(lastNoticeMessage()).toBe('Renamed 1/2 notes');
    });

    it('previews the same count the run reports when a folder and its own subfolder are both selected', async () => {
      const { RenameMultipleFoldersModal } = await import('../src/modals');

      const parent = new TFolder('A');
      const child = new TFolder('A/B');
      const files = [fileIn(parent, 'note.md'), fileIn(child, 'deep.md')];
      mockApp.vault.getMarkdownFiles = vi.fn().mockReturnValue(files);

      const modal = new RenameMultipleFoldersModal(mockApp, mockPlugin, [
        parent,
        child,
      ]);

      // onOpen can't be exercised directly here: the mock Modal base class sets
      // onOpen as an instance field, which shadows this subclass's prototype
      // method, and the mock contentEl has no createEl/empty DOM helpers either.
      // countTotalFiles is the DOM-free computation onOpen's preview renders.
      const previewCount = modal['countTotalFiles'](files);

      await modal['renameMultipleFolders'](true, false, false, false);
      const runTotal = Number(lastNoticeMessage()?.match(/\/(\d+) notes/)?.[1]);

      expect(previewCount).toBe(runTotal);
      expect(previewCount).toBe(2);
    });
  });

  describe('ProcessTagModal file scan caching', () => {
    beforeEach(() => {
      mockApp.vault.getMarkdownFiles = vi
        .fn()
        .mockReturnValue([new TFile('tagged.md'), new TFile('plain.md')]);
      mockApp.metadataCache.getFileCache = vi.fn((file: TFile) =>
        file.path === 'tagged.md'
          ? { frontmatter: { tags: ['project/alpha'] }, tags: [] }
          : { frontmatter: {}, tags: [] }
      );
    });

    it('scans the vault once per checkbox state', async () => {
      const { ProcessTagModal } = await import('../src/modals');

      const modal = new ProcessTagModal(mockApp, mockPlugin, 'project');

      expect(modal['getMatchingFiles'](true)).toHaveLength(1);
      expect(modal['getMatchingFiles'](true)).toHaveLength(1);
      expect(mockApp.vault.getMarkdownFiles).toHaveBeenCalledTimes(1);
    });

    it('rescans when the checkbox state differs from the cached one', async () => {
      const { ProcessTagModal } = await import('../src/modals');

      const modal = new ProcessTagModal(mockApp, mockPlugin, 'project');

      expect(modal['getMatchingFiles'](false)).toHaveLength(0);
      expect(modal['getMatchingFiles'](true)).toHaveLength(1);
      expect(mockApp.vault.getMarkdownFiles).toHaveBeenCalledTimes(2);
    });

    it('sorts its own copy rather than the cached list', async () => {
      const { ProcessTagModal } = await import('../src/modals');

      // Vault order is the reverse of creation order, so an in-place sort of
      // the cached list would be visible here.
      const newest = new TFile('newest.md');
      const oldest = new TFile('oldest.md');
      newest.stat.ctime = 2000;
      oldest.stat.ctime = 1000;
      mockApp.vault.getMarkdownFiles = vi
        .fn()
        .mockReturnValue([newest, oldest]);
      mockApp.metadataCache.getFileCache = vi.fn(() => ({
        frontmatter: { tags: ['project/alpha'] },
        tags: [],
      }));

      const modal = new ProcessTagModal(mockApp, mockPlugin, 'project');
      const cached = modal['getMatchingFiles'](true);

      await modal['processTagFiles'](true, false, false, false);

      expect(cached.map((f) => f.path)).toEqual(['newest.md', 'oldest.md']);
      expect(
        mockPlugin.renameEngine.processFile.mock.calls.map(
          (call: unknown[]) => (call[0] as TFile).path
        )
      ).toEqual(['oldest.md', 'newest.md']);
    });
  });
});
