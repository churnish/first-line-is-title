import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App, TFile } from '../mockObsidian';
import {
  createMockFile,
  createMockFolder,
  createTestSettings,
} from '../testUtils';
import { DEFAULT_SETTINGS } from '../../src/constants';

// Mock the utils module
vi.mock('../../src/utils', () => ({
  verboseLog: vi.fn(),
}));

describe('FileCreationCoordinator', () => {
  let mockPlugin: any;
  let mockApp: App;
  let file: TFile;

  beforeEach(() => {
    vi.clearAllMocks();

    mockApp = new App();
    file = createMockFile('test.md');

    mockPlugin = {
      app: mockApp,
      settings: createTestSettings({
        core: {
          ...structuredClone(DEFAULT_SETTINGS.core),
          insertTitleOnCreation: true,
          moveCursorToFirstLine: true,
        },
      }),
      fileOperations: {
        isFileExcludedForCursorPositioning: vi.fn().mockReturnValue(false),
      },
    };
  });

  it('inserts title when both features enabled, no exclusions, empty content (regression baseline)', async () => {
    const { FileCreationCoordinator } =
      await import('../../src/core/file-creation-coordinator');
    const coordinator = new FileCreationCoordinator(mockPlugin);

    const result = await coordinator.determineActions(file, {
      initialContent: '',
      pluginLoadTime: Date.now(),
    });

    expect(result.shouldInsertTitle).toBe(true);
    expect(result.decisionPath).toContain('2bN');
  });

  it('does nothing when content-excluded (tag/property/disable-renaming)', async () => {
    mockPlugin.fileOperations.isFileExcludedForCursorPositioning.mockReturnValue(
      true
    );

    const { FileCreationCoordinator } =
      await import('../../src/core/file-creation-coordinator');
    const coordinator = new FileCreationCoordinator(mockPlugin);

    const initialContent = '---\ntags: excluded\n---\n';
    const result = await coordinator.determineActions(file, {
      initialContent,
      pluginLoadTime: Date.now(),
    });

    expect(result.shouldMoveCursor).toBe(false);
    expect(result.shouldInsertTitle).toBe(false);
    expect(result.decisionPath.endsWith('2bY')).toBe(true);
    expect(
      mockPlugin.fileOperations.isFileExcludedForCursorPositioning
    ).toHaveBeenCalledWith(file, initialContent, true);
  });

  it('short-circuits at folder exclusion (Node 2) without calling content exclusion check', async () => {
    mockPlugin.settings = createTestSettings({
      core: {
        ...structuredClone(DEFAULT_SETTINGS.core),
        insertTitleOnCreation: true,
        moveCursorToFirstLine: true,
      },
      exclusions: {
        ...structuredClone(DEFAULT_SETTINGS.exclusions),
        excludedFolders: ['test-folder'],
      },
    });
    file.parent = createMockFolder('test-folder');

    const { FileCreationCoordinator } =
      await import('../../src/core/file-creation-coordinator');
    const coordinator = new FileCreationCoordinator(mockPlugin);

    const result = await coordinator.determineActions(file, {
      initialContent: '',
      pluginLoadTime: Date.now(),
    });

    expect(result.shouldInsertTitle).toBe(false);
    expect(result.shouldMoveCursor).toBe(false);
    expect(result.decisionPath.endsWith('2Y')).toBe(true);
    expect(
      mockPlugin.fileOperations.isFileExcludedForCursorPositioning
    ).toHaveBeenCalledTimes(0);
  });

  it('proceeds to settings hub when content not excluded, no Templater, and no exclusions configured (Node 3N regression baseline)', async () => {
    const { FileCreationCoordinator } =
      await import('../../src/core/file-creation-coordinator');
    const coordinator = new FileCreationCoordinator(mockPlugin);

    const result = await coordinator.determineActions(file, {
      initialContent: '',
      pluginLoadTime: Date.now(),
    });

    expect(result.shouldInsertTitle).toBe(true);
    expect(result.shouldMoveCursor).toBe(true);
    expect(result.decisionPath).toContain('3N');
  });

  it('proceeds to settings hub when content not excluded, tag rules configured, and Templater not installed (Node 4N regression baseline)', async () => {
    mockPlugin.settings = createTestSettings({
      core: {
        ...structuredClone(DEFAULT_SETTINGS.core),
        insertTitleOnCreation: true,
        moveCursorToFirstLine: true,
      },
      exclusions: {
        ...structuredClone(DEFAULT_SETTINGS.exclusions),
        excludedTags: ['exclude-me'],
      },
    });

    const { FileCreationCoordinator } =
      await import('../../src/core/file-creation-coordinator');
    const coordinator = new FileCreationCoordinator(mockPlugin);

    const result = await coordinator.determineActions(file, {
      initialContent: '',
      pluginLoadTime: Date.now(),
    });

    expect(result.shouldInsertTitle).toBe(true);
    expect(result.shouldMoveCursor).toBe(true);
    expect(result.decisionPath).toContain('4N');
  });
});
