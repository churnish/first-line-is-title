import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { App, TFile } from '../mockObsidian';
import { createTestSettings } from '../testUtils';
import { TIMING } from '../../src/constants/timing';

const { determineActions } = vi.hoisted(() => ({
  determineActions: vi.fn(),
}));

vi.mock('monkey-around', () => ({
  around: vi.fn(() => vi.fn()),
}));

vi.mock('../../src/i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('../../src/utils', () => ({
  verboseLog: vi.fn(),
}));

// In vitest v4 a constructable class mock needs a regular function, not an arrow
vi.mock('../../src/core/file-creation-coordinator', () => ({
  FileCreationCoordinator: vi.fn().mockImplementation(function () {
    return { determineActions };
  }),
}));

/**
 * Drives the vault 'create' handler the way Obsidian does, so the tests below assert on the
 * creation flow's real sequencing rather than on the handler in isolation.
 */
describe('WorkspaceIntegration creation flow', () => {
  let mockApp: App;
  let mockPlugin: Record<string, unknown>;
  let file: TFile;
  let createHandler: ((file: TFile) => Promise<void>) | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    file = new TFile('Notes/My Title.md');
    file.basename = 'My Title';
    file.extension = 'md';

    mockApp = new App();
    createHandler = undefined;
    mockApp.vault.on = vi.fn((event: string, cb: unknown) => {
      if (event === 'create') {
        createHandler = cb as (file: TFile) => Promise<void>;
      }
      return {};
    }) as unknown as typeof mockApp.vault.on;
    mockApp.vault.getAbstractFileByPath = vi.fn().mockReturnValue(file);

    const settings = createTestSettings();
    settings.core.newNoteDelay = 0;
    settings.core.renameAutomatically = true;

    mockPlugin = {
      app: mockApp,
      settings,
      isFullyLoaded: true,
      pluginLoadTime: Date.now() - 10000,
      recentlyRenamedPaths: new Set<string>(),
      registerEvent: vi.fn(),
      addRibbonIcon: vi.fn(),
      renameEngine: { processFile: vi.fn().mockResolvedValue(undefined) },
      fileOperations: {
        insertTitle: vi
          .fn()
          .mockResolvedValue({ inserted: true, cursorPositioned: false }),
        handleCursorPositioning: vi.fn().mockResolvedValue(undefined),
        resolveMarkdownViewForFile: vi.fn().mockReturnValue(null),
      },
      editorLifecycle: {
        clearCreationDelayTimer: vi.fn(),
        setCreationDelayTimer: vi.fn(),
        clearAllCreationDelayTimers: vi.fn(),
      },
    };

    determineActions.mockResolvedValue({
      shouldInsertTitle: true,
      shouldMoveCursor: true,
      placeCursorAtEnd: true,
    });

    const { WorkspaceIntegration } =
      await import('../../src/core/workspace-integration');
    const integration = new WorkspaceIntegration(
      mockPlugin as unknown as ConstructorParameters<
        typeof WorkspaceIntegration
      >[0]
    );
    (mockPlugin as { workspaceIntegration?: unknown }).workspaceIntegration =
      integration;
    integration.setupCursorPositioning();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function runCreate() {
    expect(createHandler).toBeDefined();
    await createHandler!(file);
    await vi.advanceTimersByTimeAsync(
      TIMING.RAF_CURSOR_POSITIONING_DELAY_MS + 10
    );
  }

  it('skips the delayed cursor pass when insertion already settled the cursor', async () => {
    (
      mockPlugin.fileOperations as {
        insertTitle: ReturnType<typeof vi.fn>;
      }
    ).insertTitle.mockResolvedValue({
      inserted: true,
      cursorPositioned: true,
    });

    await runCreate();

    expect(
      (
        mockPlugin.fileOperations as {
          handleCursorPositioning: ReturnType<typeof vi.fn>;
        }
      ).handleCursorPositioning
    ).not.toHaveBeenCalled();
  });

  it('still runs the delayed pass when insertion did not settle the cursor', async () => {
    await runCreate();

    expect(
      (
        mockPlugin.fileOperations as {
          handleCursorPositioning: ReturnType<typeof vi.fn>;
        }
      ).handleCursorPositioning
    ).toHaveBeenCalledWith(file, false, true);
  });

  it('keeps the cursor-only path intact when nothing is inserted', async () => {
    determineActions.mockResolvedValue({
      shouldInsertTitle: false,
      shouldMoveCursor: true,
      placeCursorAtEnd: true,
    });

    await runCreate();

    expect(
      (
        mockPlugin.fileOperations as {
          insertTitle: ReturnType<typeof vi.fn>;
        }
      ).insertTitle
    ).not.toHaveBeenCalled();
    expect(
      (
        mockPlugin.fileOperations as {
          handleCursorPositioning: ReturnType<typeof vi.fn>;
        }
      ).handleCursorPositioning
    ).toHaveBeenCalledWith(file, true, true);
  });

  it('passes the resolved view through to title insertion', async () => {
    await runCreate();

    expect(
      (
        mockPlugin.fileOperations as {
          insertTitle: ReturnType<typeof vi.fn>;
        }
      ).insertTitle
    ).toHaveBeenCalledWith(file, '', null);
  });

  it('resolves the rename editor through the shared resolver', async () => {
    await runCreate();

    expect(
      (
        mockPlugin.fileOperations as {
          resolveMarkdownViewForFile: ReturnType<typeof vi.fn>;
        }
      ).resolveMarkdownViewForFile
    ).toHaveBeenCalledWith(file, null);
  });
});
