import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileContent, findEditor } from '../../src/utils/content-reader';
import {
  createMockFile,
  createMockApp,
  createTestSettings,
} from '../testUtils';
import { TFile, App, Editor, MarkdownView } from '../mockObsidian';

// Mock plugin for content reader
function createMockPlugin(app: App, settings: any) {
  return {
    app,
    settings,
    fileStateManager: {
      needsFreshRead: vi.fn().mockReturnValue(false),
      clearNeedsFreshRead: vi.fn(),
    },
  } as any;
}

describe('content-reader', () => {
  let app: App;
  let file: TFile;
  let plugin: any;

  beforeEach(() => {
    app = createMockApp();
    file = createMockFile('test.md');
    const settings = createTestSettings();
    plugin = createMockPlugin(app, settings);
  });

  describe('readFileContent', () => {
    it('should use provided content when available', async () => {
      const providedContent = 'Provided content';

      const result = await readFileContent(plugin, file, { providedContent });

      expect(result).toBe(providedContent);
    });

    it('should accept empty string as provided content', async () => {
      const providedContent = '';

      const result = await readFileContent(plugin, file, { providedContent });

      expect(result).toBe('');
    });

    it('should use provided editor when available', async () => {
      const editor = new Editor();
      editor.getValue = vi.fn().mockReturnValue('Editor content');

      const result = await readFileContent(plugin, file, {
        providedEditor: editor,
      });

      expect(result).toBe('Editor content');
    });

    it('should search workspace for editor when searchWorkspace is true', async () => {
      const editorContent = 'Workspace editor content';
      const mockView = {
        file: file,
        editor: {
          getValue: vi.fn().mockReturnValue(editorContent),
        },
      };

      app.workspace.getLeavesOfType = vi
        .fn()
        .mockReturnValue([{ view: mockView }]);

      const result = await readFileContent(plugin, file, {
        searchWorkspace: true,
      });

      expect(result).toBe(editorContent);
    });

    it('should use cached read when fileReadMethod is Cache', async () => {
      plugin.settings.core.fileReadMethod = 'Cache';
      app.vault.cachedRead = vi.fn().mockResolvedValue('Cached content');

      const result = await readFileContent(plugin, file);

      expect(result).toBe('Cached content');
      expect(app.vault.cachedRead).toHaveBeenCalledWith(file);
    });

    it('should use direct read when fileReadMethod is File', async () => {
      plugin.settings.core.fileReadMethod = 'File';
      app.vault.read = vi.fn().mockResolvedValue('File content');

      const result = await readFileContent(plugin, file);

      expect(result).toBe('File content');
      expect(app.vault.read).toHaveBeenCalledWith(file);
    });

    it('should use cached read for Editor method when no editor available', async () => {
      plugin.settings.core.fileReadMethod = 'Editor';
      app.vault.cachedRead = vi.fn().mockResolvedValue('Fallback content');

      const result = await readFileContent(plugin, file);

      expect(result).toBe('Fallback content');
      expect(app.vault.cachedRead).toHaveBeenCalledWith(file);
    });

    it('should use fresh read when preferFresh is true', async () => {
      plugin.settings.core.fileReadMethod = 'Editor';
      app.vault.read = vi.fn().mockResolvedValue('Fresh content');

      const result = await readFileContent(plugin, file, { preferFresh: true });

      expect(result).toBe('Fresh content');
      expect(app.vault.read).toHaveBeenCalledWith(file);
    });

    it('should use fresh read when fileStateManager indicates need', async () => {
      plugin.settings.core.fileReadMethod = 'Editor';
      plugin.fileStateManager.needsFreshRead = vi.fn().mockReturnValue(true);
      app.vault.read = vi.fn().mockResolvedValue('Fresh content');

      const result = await readFileContent(plugin, file);

      expect(result).toBe('Fresh content');
      expect(app.vault.read).toHaveBeenCalledWith(file);
      expect(plugin.fileStateManager.clearNeedsFreshRead).toHaveBeenCalledWith(
        file.path
      );
    });

    it('should throw error when file read fails', async () => {
      app.vault.cachedRead = vi
        .fn()
        .mockRejectedValue(new Error('Read failed'));

      await expect(readFileContent(plugin, file)).rejects.toThrow(
        'Failed to read file'
      );
    });

    it('should prefer provided content over editor', async () => {
      const providedContent = 'Provided';
      const editor = new Editor();
      editor.getValue = vi.fn().mockReturnValue('Editor');

      const result = await readFileContent(plugin, file, {
        providedContent,
        providedEditor: editor,
      });

      expect(result).toBe(providedContent);
      expect(editor.getValue).not.toHaveBeenCalled();
    });

    it('should prefer provided editor over workspace search', async () => {
      const editorContent = 'Provided editor';
      const editor = new Editor();
      editor.getValue = vi.fn().mockReturnValue(editorContent);

      app.workspace.getLeavesOfType = vi.fn().mockReturnValue([
        {
          view: {
            file,
            editor: { getValue: vi.fn().mockReturnValue('Workspace') },
          },
        },
      ]);

      const result = await readFileContent(plugin, file, {
        providedEditor: editor,
        searchWorkspace: true,
      });

      expect(result).toBe(editorContent);
    });

    it('should log when verbose logging is enabled', async () => {
      plugin.settings.core.verboseLogging = true;
      // In vitest v4, spyOn on a pre-mocked vi.fn() shares call history with the
      // global mock from setup.ts. mockClear() resets the count for this test.
      const consoleSpy = vi.spyOn(console, 'debug');
      consoleSpy.mockClear();
      app.vault.cachedRead = vi.fn().mockResolvedValue('Content');

      await readFileContent(plugin, file);

      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should not log when verbose logging is disabled', async () => {
      plugin.settings.core.verboseLogging = false;
      // In vitest v4, spyOn on a pre-mocked vi.fn() shares call history with the
      // global mock from setup.ts. mockClear() resets the count for this test.
      const consoleSpy = vi.spyOn(console, 'debug');
      consoleSpy.mockClear();
      app.vault.cachedRead = vi.fn().mockResolvedValue('Content');

      await readFileContent(plugin, file);

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should handle unknown fileReadMethod with cached read', async () => {
      plugin.settings.core.fileReadMethod = 'Unknown' as any;
      app.vault.cachedRead = vi.fn().mockResolvedValue('Cached content');

      const result = await readFileContent(plugin, file);

      expect(result).toBe('Cached content');
      expect(app.vault.cachedRead).toHaveBeenCalledWith(file);
    });

    it('should handle unknown fileReadMethod with fresh read when preferFresh', async () => {
      plugin.settings.core.fileReadMethod = 'Unknown' as any;
      app.vault.read = vi.fn().mockResolvedValue('Fresh content');

      const result = await readFileContent(plugin, file, { preferFresh: true });

      expect(result).toBe('Fresh content');
      expect(app.vault.read).toHaveBeenCalledWith(file);
    });
  });

  describe('findEditor', () => {
    it('should find editor for matching file', () => {
      const editor = new Editor();
      const mockView = {
        file: file,
        editor: editor,
      };

      app.workspace.getLeavesOfType = vi
        .fn()
        .mockReturnValue([{ view: mockView }]);

      const result = findEditor(app, file);

      expect(result).toBe(editor);
    });

    it('should return null when no matching file found', () => {
      const otherFile = createMockFile('other.md');
      const mockView = {
        file: otherFile,
        editor: new Editor(),
      };

      app.workspace.getLeavesOfType = vi
        .fn()
        .mockReturnValue([{ view: mockView }]);

      const result = findEditor(app, file);

      expect(result).toBeNull();
    });

    it('should return null when no markdown leaves exist', () => {
      app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);

      const result = findEditor(app, file);

      expect(result).toBeNull();
    });

    it('should return null when view has no editor', () => {
      const mockView = {
        file: file,
        editor: null,
      };

      app.workspace.getLeavesOfType = vi
        .fn()
        .mockReturnValue([{ view: mockView }]);

      const result = findEditor(app, file);

      expect(result).toBeNull();
    });

    it('should find editor among multiple leaves', () => {
      const targetEditor = new Editor();
      const otherFile = createMockFile('other.md');

      app.workspace.getLeavesOfType = vi.fn().mockReturnValue([
        { view: { file: otherFile, editor: new Editor() } },
        { view: { file: file, editor: targetEditor } },
        {
          view: { file: createMockFile('another.md'), editor: new Editor() },
        },
      ]);

      const result = findEditor(app, file);

      expect(result).toBe(targetEditor);
    });

    it('should handle view without file property', () => {
      app.workspace.getLeavesOfType = vi
        .fn()
        .mockReturnValue([{ view: { editor: new Editor() } }]);

      const result = findEditor(app, file);

      expect(result).toBeNull();
    });
  });

  describe('workspace editor search', () => {
    it('should find editor in hover popover', async () => {
      const popoverContent = 'Popover content';
      const mockView = {
        hoverPopover: {
          targetEl: document.createElement('div'),
          editor: {
            getValue: vi.fn().mockReturnValue(popoverContent),
          },
          file: file,
        },
      };

      app.workspace.getLeavesOfType = vi
        .fn()
        .mockReturnValue([{ view: mockView }]);

      const result = await readFileContent(plugin, file, {
        searchWorkspace: true,
      });

      expect(result).toBe(popoverContent);
    });

    it('should use single popover content when exactly one popover exists', async () => {
      const popoverContent = 'Single popover';
      const mockView = {
        hoverPopover: {
          targetEl: document.createElement('div'),
          editor: {
            getValue: vi.fn().mockReturnValue(popoverContent),
          },
          file: createMockFile('different.md'), // Different file
        },
      };

      app.workspace.getLeavesOfType = vi
        .fn()
        .mockReturnValue([{ view: mockView }]);

      const result = await readFileContent(plugin, file, {
        searchWorkspace: true,
      });

      expect(result).toBe(popoverContent);
    });

    it('should not use popover with empty content', async () => {
      const mockView = {
        hoverPopover: {
          targetEl: document.createElement('div'),
          editor: {
            getValue: vi.fn().mockReturnValue(''),
          },
          file: file,
        },
      };

      app.workspace.getLeavesOfType = vi
        .fn()
        .mockReturnValue([{ view: mockView }]);
      app.vault.cachedRead = vi.fn().mockResolvedValue('Fallback content');

      const result = await readFileContent(plugin, file, {
        searchWorkspace: true,
      });

      expect(result).toBe('Fallback content');
    });

    it('should use active view editor as fallback when file matches', async () => {
      const activeContent = 'Active view content';
      const mockActiveView = new MarkdownView(app);
      mockActiveView.editor.getValue = vi.fn().mockReturnValue(activeContent);
      mockActiveView.file = file; // Must match the file being read

      app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);
      app.workspace.getActiveViewOfType = vi
        .fn()
        .mockReturnValue(mockActiveView);

      const result = await readFileContent(plugin, file, {
        searchWorkspace: true,
      });

      expect(result).toBe(activeContent);
    });

    it('should not use active view editor when file does not match', async () => {
      const activeContent = 'Active view content';
      const mockActiveView = new MarkdownView(app);
      mockActiveView.editor.getValue = vi.fn().mockReturnValue(activeContent);
      mockActiveView.file = { path: 'different/file.md' } as TFile; // Different file

      app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);
      app.workspace.getActiveViewOfType = vi
        .fn()
        .mockReturnValue(mockActiveView);
      app.vault.cachedRead = vi.fn().mockResolvedValue('Fallback content');

      const result = await readFileContent(plugin, file, {
        searchWorkspace: true,
      });

      expect(result).toBe('Fallback content');
    });

    it('should not use active view with empty content', async () => {
      const mockActiveView = new MarkdownView(app);
      mockActiveView.editor.getValue = vi.fn().mockReturnValue('');

      app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);
      app.workspace.getActiveViewOfType = vi
        .fn()
        .mockReturnValue(mockActiveView);
      app.vault.cachedRead = vi.fn().mockResolvedValue('Fallback content');

      const result = await readFileContent(plugin, file, {
        searchWorkspace: true,
      });

      expect(result).toBe('Fallback content');
    });

    it('should check main workspace leaves as final fallback', async () => {
      const leafContent = 'Main workspace content';
      const mockView = {
        file: file,
        editor: {
          getValue: vi.fn().mockReturnValue(leafContent),
        },
      };

      app.workspace.getLeavesOfType = vi
        .fn()
        .mockReturnValue([{ view: mockView }]);
      app.workspace.getActiveViewOfType = vi.fn().mockReturnValue(null);

      const result = await readFileContent(plugin, file, {
        searchWorkspace: true,
      });

      expect(result).toBe(leafContent);
    });

    it('should not use workspace leaf with empty content', async () => {
      const mockView = {
        file: file,
        editor: {
          getValue: vi.fn().mockReturnValue(''),
        },
      };

      app.workspace.getLeavesOfType = vi
        .fn()
        .mockReturnValue([{ view: mockView }]);
      app.vault.cachedRead = vi.fn().mockResolvedValue('Fallback content');

      const result = await readFileContent(plugin, file, {
        searchWorkspace: true,
      });

      expect(result).toBe('Fallback content');
    });
  });
});
