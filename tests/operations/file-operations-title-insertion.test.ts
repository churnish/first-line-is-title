import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileOperations } from '../../src/operations/file-operations';
import { App, MarkdownView, TFile } from '../mockObsidian';
import { createMockApp, createTestSettings } from '../testUtils';
import { PluginSettings } from '../../src/types';
import type FirstLineIsTitle from '../../main';

// The module mocks below are why these tests live apart from file-operations.test.ts,
// which exercises the real utils against the same class.
vi.mock('../../src/i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('../../src/utils', () => ({
  verboseLog: vi.fn(),
  shouldProcessFile: vi.fn().mockReturnValue(true),
  hasDisablePropertyInFile: vi.fn().mockReturnValue(false),
  reverseCharacterReplacements: (basename: string) => basename,
}));

vi.mock('../../src/utils/content-reader', () => ({
  readFileContent: vi.fn().mockResolvedValue(''),
}));

const FILE_PATH = 'Notes/My Title.md';
const TITLE = 'My Title';

function createFile(path: string = FILE_PATH): TFile {
  const file = new TFile(path);
  file.basename = TITLE;
  file.extension = 'md';
  file.name = `${TITLE}.md`;
  return file;
}

/**
 * A Markdown view whose editor reports `content` and records every write, so a test can
 * assert what the insertion path did rather than what it intended to do.
 * @param mode 'live-preview' matches what the creation paths target; 'preview' is Reading view
 */
function createView(
  app: App,
  file: TFile | null,
  content: string,
  mode: 'live-preview' | 'preview' = 'live-preview'
) {
  const view = new MarkdownView(app);
  view.file = file;
  view.editor.getValue = vi.fn().mockReturnValue(content);
  view.editor.getLine = vi
    .fn()
    .mockImplementation((line: number) => content.split('\n')[line] ?? '');
  (view as unknown as { leaf: unknown }).leaf = {
    setViewState: vi.fn().mockResolvedValue(undefined),
  };
  view.getState = vi
    .fn()
    .mockReturnValue(
      mode === 'live-preview'
        ? { mode: 'source', source: false }
        : { mode: 'preview', source: false }
    );
  return view;
}

describe('FileOperations title insertion', () => {
  let app: App;
  let settings: PluginSettings;
  let fileStateManager: {
    markEditorSyncing: ReturnType<typeof vi.fn>;
    clearEditorSyncing: ReturnType<typeof vi.fn>;
  };
  let fileOperations: FileOperations;
  let file: TFile;

  beforeEach(() => {
    vi.clearAllMocks();

    app = createMockApp();
    app.vault.process = vi.fn();

    settings = createTestSettings();
    settings.core.formatAsHeading = false;
    settings.core.moveCursorToFirstLine = true;
    settings.core.placeCursorAtLineEnd = true;

    fileStateManager = {
      markEditorSyncing: vi.fn(),
      clearEditorSyncing: vi.fn(),
    };

    file = createFile();

    fileOperations = new FileOperations({
      app,
      settings,
      fileStateManager,
    } as unknown as FirstLineIsTitle);
  });

  describe('editor-syncing guard around the plugin’s own write', () => {
    it('marks syncing before the write and clears it after', async () => {
      const order: string[] = [];
      const view = createView(app, file, '');
      fileStateManager.markEditorSyncing.mockImplementation(() =>
        order.push('mark')
      );
      fileStateManager.clearEditorSyncing.mockImplementation(() =>
        order.push('clear')
      );
      view.editor.replaceRange = vi.fn().mockImplementation(() => {
        order.push('write');
        view.editor.getValue = vi.fn().mockReturnValue(`${TITLE}\n`);
      });

      await fileOperations.insertTitle(file, '', view);

      expect(order).toEqual(['mark', 'write', 'clear']);
      expect(fileStateManager.markEditorSyncing).toHaveBeenCalledWith(
        file.path
      );
      expect(fileStateManager.clearEditorSyncing).toHaveBeenCalledWith(
        file.path
      );
    });

    it('clears the syncing flag when the write throws', async () => {
      const view = createView(app, file, '');
      view.editor.replaceRange = vi.fn().mockImplementation(() => {
        throw new Error('editor detached mid-write');
      });

      await fileOperations.insertTitle(file, '', view);

      expect(fileStateManager.markEditorSyncing).toHaveBeenCalledWith(
        file.path
      );
      expect(fileStateManager.clearEditorSyncing).toHaveBeenCalledWith(
        file.path
      );
    });

    it('never marks syncing when no write is needed', async () => {
      // Title already on the insertion line, so the loop is skipped entirely
      const view = createView(app, file, `${TITLE}\n`);

      const result = await fileOperations.insertTitle(file, '', view);

      expect(result.inserted).toBe(true);
      expect(view.editor.replaceRange).not.toHaveBeenCalled();
      expect(fileStateManager.markEditorSyncing).not.toHaveBeenCalled();
    });

    it('guards the heading-replacement write too', async () => {
      const view = createView(app, file, '---\na: b\n---\n## \n');

      await fileOperations.insertTitle(file, '---\na: b\n---\n## \n', view);

      expect(view.editor.setLine).toHaveBeenCalledWith(3, `## ${TITLE}`);
      expect(fileStateManager.markEditorSyncing).toHaveBeenCalledWith(
        file.path
      );
      expect(fileStateManager.clearEditorSyncing).toHaveBeenCalledWith(
        file.path
      );
    });
  });

  describe('live content re-derivation before writing', () => {
    it('bails without writing when a body appeared after the creation snapshot', async () => {
      // Snapshot says empty, live editor already holds a body the user typed
      const view = createView(app, file, '---\na: b\n---\nUser typed this\n');

      const result = await fileOperations.insertTitle(file, '', view);

      expect(result).toEqual({ inserted: false, cursorPositioned: false });
      expect(view.editor.replaceRange).not.toHaveBeenCalled();
    });

    it('does not fall through to vault.process after bailing', async () => {
      // vault.process reads from disk, which lags the editor by Obsidian's save debounce,
      // so falling through would see an empty body and insert a duplicate title
      const view = createView(app, file, 'User typed this\n');

      await fileOperations.insertTitle(file, '', view);

      expect(app.vault.process).not.toHaveBeenCalled();
    });

    it('respects a properties block when deciding the body is empty', async () => {
      const view = createView(app, file, '---\na: b\n---\n');
      view.editor.replaceRange = vi.fn().mockImplementation(() => {
        view.editor.getValue = vi
          .fn()
          .mockReturnValue(`---\na: b\n---\n${TITLE}\n`);
      });

      const result = await fileOperations.insertTitle(file, '', view);

      expect(result.inserted).toBe(true);
      // Line 3 is the first line below the closing ---
      expect(view.editor.replaceRange).toHaveBeenCalledWith(`${TITLE}\n`, {
        line: 3,
        ch: 0,
      });
    });

    it('writes only once when a landed write fails verification', async () => {
      // The write lands but not on the insertion line. The old loop wrote first and never
      // undid a failed attempt, so ten failed verifications prepended ten titles.
      const view = createView(app, file, '');
      view.editor.replaceRange = vi.fn().mockImplementation(() => {
        view.editor.getValue = vi
          .fn()
          .mockReturnValue(`Something else\n${TITLE}\n`);
      });

      await fileOperations.insertTitle(file, '', view);

      expect(view.editor.replaceRange).toHaveBeenCalledTimes(1);
      expect(app.vault.process).not.toHaveBeenCalled();
    });

    it('skips insertion in the vault fallback when disk already has a body', async () => {
      // No view at all, so the fallback runs; its callback must leave content untouched
      app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);
      let returned: string | undefined;
      app.vault.process = vi.fn(
        async (_f: TFile, fn: (content: string) => string) => {
          returned = fn('---\na: b\n---\nAlready here\n');
          return returned;
        }
      );

      const result = await fileOperations.insertTitle(file, '');

      expect(returned).toBe('---\na: b\n---\nAlready here\n');
      expect(result.inserted).toBe(false);
    });

    it('inserts below the properties block in the vault fallback', async () => {
      app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);
      let returned: string | undefined;
      app.vault.process = vi.fn(
        async (_f: TFile, fn: (content: string) => string) => {
          returned = fn('---\na: b\n---\n');
          return returned;
        }
      );

      const result = await fileOperations.insertTitle(file, '');

      expect(returned).toBe(`---\na: b\n---\n${TITLE}\n`);
      expect(result.inserted).toBe(true);
    });
  });

  describe('resolveMarkdownViewForFile', () => {
    it('uses a matching hint without scanning leaves', () => {
      const view = createView(app, file, '');
      app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);

      expect(fileOperations.resolveMarkdownViewForFile(file, view)).toBe(view);
      expect(app.workspace.getLeavesOfType).not.toHaveBeenCalled();
    });

    it('falls back to a scan when the hint names another file', () => {
      const staleView = createView(app, createFile('Notes/Other.md'), '');
      const liveView = createView(app, file, '');
      app.workspace.getLeavesOfType = vi
        .fn()
        .mockReturnValue([{ view: liveView }]);

      expect(fileOperations.resolveMarkdownViewForFile(file, staleView)).toBe(
        liveView
      );
      expect(app.workspace.getLeavesOfType).toHaveBeenCalledWith('markdown');
    });

    it('returns null when nothing matches', () => {
      app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);

      expect(fileOperations.resolveMarkdownViewForFile(file, null)).toBeNull();
    });

    it('rejects a hint with no editor when an editor is required', () => {
      const view = createView(app, file, '');
      (view as unknown as { editor: unknown }).editor = undefined;
      app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);

      expect(fileOperations.resolveMarkdownViewForFile(file, view)).toBeNull();
    });

    it('does not scan leaves when insertion is handed a usable hint', async () => {
      const view = createView(app, file, '');
      app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);

      await fileOperations.insertTitle(file, '', view);

      expect(app.workspace.getLeavesOfType).not.toHaveBeenCalled();
    });
  });

  describe('handleCursorPositioning view state', () => {
    it('never transitions the view state, in either mode', async () => {
      // Obsidian already opens a newly created note in Live Preview regardless
      // of the default-view setting, and this path runs only for new notes.
      for (const mode of ['live-preview', 'preview'] as const) {
        const view = createView(app, file, `${TITLE}\n`, mode);

        await fileOperations.handleCursorPositioning(file, true, true, view);

        const leaf = (view as unknown as { leaf: { setViewState: unknown } })
          .leaf;
        expect(leaf.setViewState).not.toHaveBeenCalled();
        expect(view.editor.setCursor).toHaveBeenCalledWith({
          line: 0,
          ch: TITLE.length,
        });
      }
    });

    it('does nothing when no view matches the file', async () => {
      app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);

      await expect(
        fileOperations.handleCursorPositioning(file, true, true)
      ).resolves.toBeUndefined();
    });
  });

  describe('cursorPositioned reporting', () => {
    it('reports the cursor settled when placed in an already-Live-Preview view', async () => {
      const view = createView(app, file, '', 'live-preview');
      view.editor.replaceRange = vi.fn().mockImplementation(() => {
        view.editor.getValue = vi.fn().mockReturnValue(`${TITLE}\n`);
      });

      const result = await fileOperations.insertTitle(file, '', view);

      expect(result).toEqual({ inserted: true, cursorPositioned: true });
    });

    it('reports it settled regardless of the view mode', async () => {
      // Placement alone settles it now that the delayed pass owes no transition.
      const view = createView(app, file, '', 'preview');
      view.editor.replaceRange = vi.fn().mockImplementation(() => {
        view.editor.getValue = vi.fn().mockReturnValue(`${TITLE}\n`);
      });

      const result = await fileOperations.insertTitle(file, '', view);

      expect(result).toEqual({ inserted: true, cursorPositioned: true });
    });

    it('does not report it settled when the cursor settings are off', async () => {
      settings.core.placeCursorAtLineEnd = false;
      const view = createView(app, file, '', 'live-preview');
      view.editor.replaceRange = vi.fn().mockImplementation(() => {
        view.editor.getValue = vi.fn().mockReturnValue(`${TITLE}\n`);
      });

      const result = await fileOperations.insertTitle(file, '', view);

      expect(result).toEqual({ inserted: true, cursorPositioned: false });
    });
  });
});
