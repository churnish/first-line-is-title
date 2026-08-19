import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EditorLifecycleManager } from '../../src/core/editor-lifecycle';
import { App, Editor, TFile } from '../mockObsidian';
import { createMockApp, createTestSettings } from '../testUtils';
import type FirstLineIsTitle from '../../main';

/**
 * The plugin's own programmatic writes reach this handler synchronously, while the rename
 * pipeline it feeds runs later from a throttle timer. These tests pin the guard to the
 * synchronous side, where the syncing flag is still set.
 */
describe('EditorLifecycleManager editor-syncing guard', () => {
  let app: App;
  let editor: Editor;
  let file: TFile;
  let isEditorSyncing: ReturnType<typeof vi.fn>;
  let setThrottleTimer: ReturnType<typeof vi.fn>;
  let processEditorChangeOptimal: ReturnType<typeof vi.fn>;
  let lifecycle: EditorLifecycleManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    app = createMockApp();
    app.metadataCache.getFileCache = vi.fn().mockReturnValue(null);

    file = new TFile('Notes/My Title.md');
    file.basename = 'My Title';
    file.extension = 'md';

    editor = new Editor();
    editor.getValue = vi.fn().mockReturnValue('A freshly written title\n');

    isEditorSyncing = vi.fn().mockReturnValue(false);
    setThrottleTimer = vi.fn();
    processEditorChangeOptimal = vi.fn().mockResolvedValue(undefined);

    const settings = createTestSettings();
    settings.core.checkInterval = 0;

    lifecycle = new EditorLifecycleManager({
      app,
      settings,
      isFullyLoaded: true,
      fileStateManager: {
        isEditorSyncing,
        hasThrottleTimer: vi.fn().mockReturnValue(false),
        setThrottleTimer,
        clearThrottleTimer: vi.fn(),
        setLastEditorContent: vi.fn(),
      },
      renameEngine: { processEditorChangeOptimal },
    } as unknown as FirstLineIsTitle);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts a throttle timer for a genuine user edit', () => {
    lifecycle.handleEditorChangeWithThrottle(editor, file);

    expect(setThrottleTimer).toHaveBeenCalled();
  });

  it('does not schedule the rename pipeline for the plugin’s own write', () => {
    isEditorSyncing.mockReturnValue(true);

    lifecycle.handleEditorChangeWithThrottle(editor, file);

    expect(setThrottleTimer).not.toHaveBeenCalled();
  });

  it('never reaches processEditorChangeOptimal while the plugin is writing', async () => {
    isEditorSyncing.mockReturnValue(true);

    lifecycle.handleEditorChangeWithThrottle(editor, file);
    await vi.advanceTimersByTimeAsync(100);

    expect(processEditorChangeOptimal).not.toHaveBeenCalled();
  });

  it('checks the flag against the file being edited', () => {
    isEditorSyncing.mockReturnValue(true);

    lifecycle.handleEditorChangeWithThrottle(editor, file);

    expect(isEditorSyncing).toHaveBeenCalledWith(file.path);
  });
});
