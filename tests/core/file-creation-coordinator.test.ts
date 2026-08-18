import { describe, it, expect, vi, beforeEach, MockedFunction } from 'vitest';
// Type-only, so it resolves to the real Obsidian types under tsc while the runtime import below stays mocked
import type { App as ObsidianApp } from 'obsidian';
import { App, TFile } from '../mockObsidian';
import {
  createMockFile,
  createMockFolder,
  createTestSettings,
} from '../testUtils';
import { DEFAULT_SETTINGS } from '../../src/constants';
// Leaf module, not the barrel: this is the exact call the rename path makes to decide renaming
import { shouldProcessFile } from '../../src/utils/file-exclusions';
import type FirstLineIsTitle from '../../main';
import type { FileOperations } from '../../src/operations/file-operations';
import type { DeepPartial, PluginSettings } from '../../src/types';

// Keep the real barrel so the integration case below can exercise the real exclusion gate;
// only verboseLog is stubbed, to keep decision-path logging out of the test output.
vi.mock('../../src/utils', async () => {
  const actual =
    await vi.importActual<typeof import('../../src/utils')>('../../src/utils');
  return { ...actual, verboseLog: vi.fn() };
});

type ExclusionGate = FileOperations['isFileExcludedForCursorPositioning'];

/** The slice of the plugin the coordinator actually reads. */
interface CoordinatorPluginStub {
  app: App;
  settings: PluginSettings;
  fileOperations: Pick<FileOperations, 'isFileExcludedForCursorPositioning'>;
}

describe('FileCreationCoordinator', () => {
  let mockPlugin: CoordinatorPluginStub;
  let mockApp: App;
  let mockExclusionGate: MockedFunction<ExclusionGate>;
  let file: TFile;

  // The stub is structurally narrower than the plugin, so the cast lives here rather than in every test
  async function determineActions(initialContent: string) {
    const { FileCreationCoordinator } =
      await import('../../src/core/file-creation-coordinator');
    const coordinator = new FileCreationCoordinator(
      mockPlugin as unknown as FirstLineIsTitle
    );
    return coordinator.determineActions(file, {
      initialContent,
      pluginLoadTime: Date.now(),
    });
  }

  /** Swap the stubbed gate for the real one, so exclusion rules are evaluated instead of asserted. */
  async function useRealExclusionGate() {
    const { FileOperations } =
      await import('../../src/operations/file-operations');
    mockPlugin.fileOperations = new FileOperations(
      mockPlugin as unknown as FirstLineIsTitle
    );
  }

  /** Both features on, plus the exclusion rules under test. */
  function applyExclusions(
    exclusions: DeepPartial<PluginSettings>['exclusions']
  ) {
    mockPlugin.settings = createTestSettings({
      core: { insertTitleOnCreation: true, moveCursorToFirstLine: true },
      exclusions,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockApp = new App();
    file = createMockFile('test.md');
    mockExclusionGate = vi.fn().mockReturnValue(false);

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
        isFileExcludedForCursorPositioning: mockExclusionGate,
      },
    };
  });

  it('inserts title and moves cursor when both features enabled, no exclusions, empty content (regression baseline)', async () => {
    const result = await determineActions('');

    expect(result.shouldInsertTitle).toBe(true);
    expect(result.shouldMoveCursor).toBe(true);
    expect(result.placeCursorAtEnd).toBe(true);
    // Sole breadcrumb assertion in the suite, kept as a smoke check that the tree still walks the expected nodes
    expect(result.decisionPath).toBe(
      '1Y → 2N → 2bN → 2cN → 3N → 14C → 17Y → 18N'
    );
  });

  it('does nothing when content-excluded (tag/property/disable-renaming)', async () => {
    mockExclusionGate.mockReturnValue(true);

    const initialContent = '---\ntags: excluded\n---\n';
    const result = await determineActions(initialContent);

    expect(result.shouldMoveCursor).toBe(false);
    expect(result.shouldInsertTitle).toBe(false);
    expect(result.placeCursorAtEnd).toBe(false);
    expect(mockExclusionGate).toHaveBeenCalledWith(file, initialContent, {
      ignoreFolder: true,
    });
  });

  it('does nothing for a new note that cannot match a tag whitelist', async () => {
    await useRealExclusionGate();
    applyExclusions({
      excludedTags: ['keep'],
      tagScopeStrategy: 'Exclude all except...',
    });

    const result = await determineActions('');

    expect(result.shouldInsertTitle).toBe(false);
    expect(result.shouldMoveCursor).toBe(false);
    expect(result.placeCursorAtEnd).toBe(false);
  });

  it('inserts the title for a new note that carries no blacklisted tag', async () => {
    await useRealExclusionGate();
    applyExclusions({
      excludedTags: ['skip'],
      tagScopeStrategy: 'Only exclude...',
    });

    const result = await determineActions('');

    expect(result.shouldInsertTitle).toBe(true);
    expect(result.shouldMoveCursor).toBe(true);
  });

  it('does nothing for a new note that cannot match a property whitelist', async () => {
    await useRealExclusionGate();
    applyExclusions({
      excludedProperties: [{ key: 'status', value: 'draft' }],
      propertyScopeStrategy: 'Exclude all except...',
    });

    const result = await determineActions('');

    expect(result.shouldInsertTitle).toBe(false);
    expect(result.shouldMoveCursor).toBe(false);
    expect(result.placeCursorAtEnd).toBe(false);
  });

  it('inserts the title for a new note that carries no blacklisted property', async () => {
    await useRealExclusionGate();
    applyExclusions({
      excludedProperties: [{ key: 'status', value: 'draft' }],
      propertyScopeStrategy: 'Only exclude...',
    });

    const result = await determineActions('');

    expect(result.shouldInsertTitle).toBe(true);
    expect(result.shouldMoveCursor).toBe(true);
  });

  it('acts exactly when the rename path would rename, for every tag and property exclusion shape', async () => {
    await useRealExclusionGate();

    const noMetadata = { frontmatter: {}, tags: [] };
    const taggedNote = { frontmatter: { tags: ['keep'] }, tags: [] };
    const draftNote = { frontmatter: { status: 'draft' }, tags: [] };

    const cases: {
      name: string;
      exclusions: DeepPartial<PluginSettings>['exclusions'];
      cache: unknown;
    }[] = [
      {
        name: 'tag blacklist, untagged note',
        exclusions: {
          excludedTags: ['keep'],
          tagScopeStrategy: 'Only exclude...',
        },
        cache: noMetadata,
      },
      {
        name: 'tag blacklist, tagged note',
        exclusions: {
          excludedTags: ['keep'],
          tagScopeStrategy: 'Only exclude...',
        },
        cache: taggedNote,
      },
      {
        name: 'tag whitelist, untagged note',
        exclusions: {
          excludedTags: ['keep'],
          tagScopeStrategy: 'Exclude all except...',
        },
        cache: noMetadata,
      },
      {
        name: 'tag whitelist, tagged note',
        exclusions: {
          excludedTags: ['keep'],
          tagScopeStrategy: 'Exclude all except...',
        },
        cache: taggedNote,
      },
      {
        name: 'property blacklist, bare note',
        exclusions: {
          excludedProperties: [{ key: 'status', value: 'draft' }],
          propertyScopeStrategy: 'Only exclude...',
        },
        cache: noMetadata,
      },
      {
        name: 'property blacklist, draft note',
        exclusions: {
          excludedProperties: [{ key: 'status', value: 'draft' }],
          propertyScopeStrategy: 'Only exclude...',
        },
        cache: draftNote,
      },
      {
        name: 'property whitelist, bare note',
        exclusions: {
          excludedProperties: [{ key: 'status', value: 'draft' }],
          propertyScopeStrategy: 'Exclude all except...',
        },
        cache: noMetadata,
      },
      {
        name: 'property whitelist, draft note',
        exclusions: {
          excludedProperties: [{ key: 'status', value: 'draft' }],
          propertyScopeStrategy: 'Exclude all except...',
        },
        cache: draftNote,
      },
    ];

    const renameVerdicts: boolean[] = [];

    for (const testCase of cases) {
      applyExclusions(testCase.exclusions);
      mockApp.metadataCache.getFileCache = vi
        .fn()
        .mockReturnValue(testCase.cache);

      // The rename path's own gate, called exactly as rename-engine calls it
      const renameAllowed = shouldProcessFile(
        file,
        mockPlugin.settings,
        mockApp as unknown as ObsidianApp,
        '',
        undefined,
        mockPlugin
      );
      renameVerdicts.push(renameAllowed);

      const result = await determineActions('');

      expect(result.shouldInsertTitle, testCase.name).toBe(renameAllowed);
      expect(result.shouldMoveCursor, testCase.name).toBe(renameAllowed);
    }

    // Guards against a matrix that agrees only because nothing is ever excluded
    expect(renameVerdicts).toContain(true);
    expect(renameVerdicts).toContain(false);
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

    const result = await determineActions('');

    expect(result.shouldInsertTitle).toBe(false);
    expect(result.shouldMoveCursor).toBe(false);
    expect(result.placeCursorAtEnd).toBe(false);
    expect(mockExclusionGate).toHaveBeenCalledTimes(0);
  });

  it('does nothing when the file name matches an enabled file-name exclusion (Node 2c)', async () => {
    mockPlugin.settings = createTestSettings({
      core: {
        ...structuredClone(DEFAULT_SETTINGS.core),
        insertTitleOnCreation: true,
        moveCursorToFirstLine: true,
      },
      exclusions: {
        // DEFAULT_SETTINGS ships its one entry disabled, so the fixture supplies its own
        fileNameExclusions: [
          {
            text: 'test',
            onlyAtStart: false,
            onlyWholeLine: false,
            enabled: true,
            caseSensitive: false,
          },
        ],
      },
    });

    const result = await determineActions('');

    expect(result.shouldInsertTitle).toBe(false);
    expect(result.shouldMoveCursor).toBe(false);
    expect(result.placeCursorAtEnd).toBe(false);
    // One, not zero: 2c runs after 2b, so the content gate has already fired — this pins that ordering
    expect(mockExclusionGate).toHaveBeenCalledTimes(1);
  });

  // Every other fixture is `test.md`, whose name, basename and path all match the exclusion text alike, so a `file.name` → `file.path` swap here would stay green while silently diverging from the rename path, which matches on the name only
  it('proceeds for a file inside an excluded-sounding folder, pinning Node 2c to the file name rather than the path', async () => {
    file = createMockFile('excluded-term/note.md');
    mockPlugin.settings = createTestSettings({
      core: {
        ...structuredClone(DEFAULT_SETTINGS.core),
        insertTitleOnCreation: true,
        moveCursorToFirstLine: true,
      },
      exclusions: {
        fileNameExclusions: [
          {
            text: 'excluded-term',
            onlyAtStart: false,
            onlyWholeLine: false,
            enabled: true,
            caseSensitive: false,
          },
        ],
      },
    });

    const result = await determineActions('');

    expect(result.shouldInsertTitle).toBe(true);
    expect(result.shouldMoveCursor).toBe(true);
  });

  it('proceeds to settings hub when content not excluded, no Templater, and no exclusions configured (Node 3N regression baseline)', async () => {
    const result = await determineActions('');

    expect(mockExclusionGate).toHaveBeenCalledTimes(1);
    expect(result.shouldInsertTitle).toBe(true);
    expect(result.shouldMoveCursor).toBe(true);
    expect(result.placeCursorAtEnd).toBe(true);
  });

  it('excludes at Node 2b through the real exclusion gate, not a stub', async () => {
    const { FileOperations } =
      await import('../../src/operations/file-operations');
    mockPlugin.settings = createTestSettings({
      core: {
        ...structuredClone(DEFAULT_SETTINGS.core),
        insertTitleOnCreation: true,
        moveCursorToFirstLine: true,
      },
      exclusions: {
        ...structuredClone(DEFAULT_SETTINGS.exclusions),
        excludedProperties: [{ key: 'status', value: 'draft' }],
      },
    });
    // Empty initial content has no frontmatter, so the gate must fall back to the cache
    mockApp.metadataCache.getFileCache = vi.fn().mockReturnValue({
      frontmatter: { status: 'draft' },
      tags: [],
    });
    mockPlugin.fileOperations = new FileOperations(
      mockPlugin as unknown as FirstLineIsTitle
    );

    const result = await determineActions('');

    expect(result.shouldInsertTitle).toBe(false);
    expect(result.shouldMoveCursor).toBe(false);
    expect(result.placeCursorAtEnd).toBe(false);
  });

  it('does nothing when Templater renames the note into a file-name exclusion after Node 2c cleared it (Node 13b)', async () => {
    file = createMockFile('notes/test.md');
    file.parent = createMockFolder('notes');
    mockPlugin.settings = createTestSettings({
      core: {
        ...structuredClone(DEFAULT_SETTINGS.core),
        insertTitleOnCreation: true,
        moveCursorToFirstLine: true,
      },
      exclusions: {
        // A configured tag rule is what sends the walk down the Templater branch at Node 3
        excludedTags: ['exclude-me'],
        fileNameExclusions: [
          {
            text: 'daily',
            onlyAtStart: false,
            onlyWholeLine: false,
            enabled: true,
            caseSensitive: false,
          },
        ],
      },
    });
    mockApp.plugins.plugins['templater-obsidian'] = {
      settings: {
        trigger_on_file_creation: true,
        templates_folder: 'Templates',
        enable_folder_templates: true,
        folder_templates: [{ folder: 'notes', template: 'Templates/daily.md' }],
      },
    };
    // The rename lands during the Node 12 wait, so the name Node 2c cleared is stale by Node 13.
    // Deferred rather than fired inline: the coordinator's own `eventRef` is still in its temporal dead zone while `on` is running.
    const fireTemplaterEvent = (
      _name: string,
      callback: (data: { file: TFile }) => void
    ) => {
      window.setTimeout(() => {
        file.name = 'daily.md';
        callback({ file });
      }, 0);
      return {};
    };
    // Cast because the mock exposes Obsidian's overloaded `on`, which no single implementation signature satisfies
    mockApp.workspace.on =
      fireTemplaterEvent as unknown as typeof mockApp.workspace.on;

    const result = await determineActions('');

    expect(result.shouldInsertTitle).toBe(false);
    expect(result.shouldMoveCursor).toBe(false);
    expect(result.placeCursorAtEnd).toBe(false);
    expect(result.decisionPath).toContain('13bY');
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

    const result = await determineActions('');

    expect(result.shouldInsertTitle).toBe(true);
    expect(result.shouldMoveCursor).toBe(true);
    expect(result.placeCursorAtEnd).toBe(true);
  });
});
