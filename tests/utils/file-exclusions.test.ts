import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isFileInConfiguredFolders,
  fileHasExcludedProperties,
  shouldProcessFile,
  isExcludedByFileName,
} from '../../src/utils/file-exclusions';
import {
  createTestSettings,
  createMockFile,
  createMockApp,
} from '../testUtils';
import { FileNameExclusion, PluginSettings } from '../../src/types';
import { App, TFolder } from '../mockObsidian';

describe('file-exclusions', () => {
  let settings: PluginSettings;
  let app: App;

  beforeEach(() => {
    settings = createTestSettings();
    app = createMockApp();
  });

  describe('isFileInConfiguredFolders', () => {
    beforeEach(() => {
      settings.exclusions.excludedFolders = ['Notes', 'Archive'];
      settings.exclusions.matchSubfolders = false;
    });

    it('should return true if file is in configured folder', () => {
      const file = createMockFile('Notes/test.md');
      file.parent = new TFolder('Notes');

      const result = isFileInConfiguredFolders(file, settings);
      expect(result).toBe(true);
    });

    it('should return false if file is not in configured folder', () => {
      const file = createMockFile('Documents/test.md');
      file.parent = new TFolder('Documents');

      const result = isFileInConfiguredFolders(file, settings);
      expect(result).toBe(false);
    });

    it('should return false when no folders configured', () => {
      settings.exclusions.excludedFolders = [];
      const file = createMockFile('Notes/test.md');
      file.parent = new TFolder('Notes');

      const result = isFileInConfiguredFolders(file, settings);
      expect(result).toBe(false);
    });

    it('should filter out empty folder strings', () => {
      settings.exclusions.excludedFolders = ['Notes', '', '  '];
      const file = createMockFile('Notes/test.md');
      file.parent = new TFolder('Notes');

      const result = isFileInConfiguredFolders(file, settings);
      expect(result).toBe(true);
    });

    it('should check subfolders when matchSubfolders is enabled', () => {
      settings.exclusions.matchSubfolders = true;
      settings.exclusions.excludedFolders = ['Notes'];

      const file = createMockFile('Notes/Work/test.md');
      file.parent = new TFolder('Notes/Work');

      const result = isFileInConfiguredFolders(file, settings);
      expect(result).toBe(true);
    });

    it('should not check subfolders when matchSubfolders is disabled', () => {
      settings.exclusions.matchSubfolders = false;
      settings.exclusions.excludedFolders = ['Notes'];

      const file = createMockFile('Notes/Work/test.md');
      file.parent = new TFolder('Notes/Work');

      const result = isFileInConfiguredFolders(file, settings);
      expect(result).toBe(false);
    });

    it('should handle root folder "/" correctly', () => {
      settings.exclusions.excludedFolders = ['/'];
      const file = createMockFile('test.md');
      file.parent = new TFolder('');
      file.parent.path = '';

      const result = isFileInConfiguredFolders(file, settings);
      expect(result).toBe(true);
    });

    it('should not check subfolders of root folder', () => {
      settings.exclusions.matchSubfolders = true;
      settings.exclusions.excludedFolders = ['/'];

      const file = createMockFile('Notes/test.md');
      file.parent = new TFolder('Notes');

      const result = isFileInConfiguredFolders(file, settings);
      // Root folder "/" has no subfolders to check
      expect(result).toBe(false);
    });

    it('should handle deeply nested subfolders', () => {
      settings.exclusions.matchSubfolders = true;
      settings.exclusions.excludedFolders = ['Notes'];

      const file = createMockFile('Notes/Work/Projects/2024/test.md');
      file.parent = new TFolder('Notes/Work/Projects/2024');

      const result = isFileInConfiguredFolders(file, settings);
      expect(result).toBe(true);
    });
  });

  describe('fileHasExcludedProperties', () => {
    beforeEach(() => {
      settings.exclusions.excludedProperties = [
        { key: 'status', value: 'draft' },
        { key: 'archived', value: '' },
      ];
    });

    it('should return true if file has excluded property with matching value', () => {
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { status: 'draft' },
      });

      const result = fileHasExcludedProperties(file, settings, app);
      expect(result).toBe(true);
    });

    it('should return true if file has excluded property with empty value (any value matches)', () => {
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { archived: true },
      });

      const result = fileHasExcludedProperties(file, settings, app);
      expect(result).toBe(true);
    });

    it('should return false if file does not have excluded property', () => {
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { status: 'published' },
      });

      const result = fileHasExcludedProperties(file, settings, app);
      expect(result).toBe(false);
    });

    it('should return false if file has no frontmatter', () => {
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: null,
      });

      const result = fileHasExcludedProperties(file, settings, app);
      expect(result).toBe(false);
    });

    it('should return false if file has no cache', () => {
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue(null);

      const result = fileHasExcludedProperties(file, settings, app);
      expect(result).toBe(false);
    });

    it('should handle array property values', () => {
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { status: ['draft', 'pending'] },
      });

      const result = fileHasExcludedProperties(file, settings, app);
      expect(result).toBe(true);
    });

    it('should handle non-string property values', () => {
      settings.exclusions.excludedProperties = [
        { key: 'priority', value: '1' },
      ];
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { priority: 1 },
      });

      const result = fileHasExcludedProperties(file, settings, app);
      expect(result).toBe(true);
    });

    it('should filter out empty property keys', () => {
      settings.exclusions.excludedProperties = [
        { key: '', value: 'test' },
        { key: '  ', value: 'test' },
      ];
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { anything: 'value' },
      });

      const result = fileHasExcludedProperties(file, settings, app);
      expect(result).toBe(false);
    });

    it('should trim property keys and values', () => {
      settings.exclusions.excludedProperties = [
        { key: '  status  ', value: '  draft  ' },
      ];
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { status: 'draft' },
      });

      const result = fileHasExcludedProperties(file, settings, app);
      expect(result).toBe(true);
    });

    // Regression: the content path used to strip "#" for a `tags` rule while the cache
    // path did not, so the same rule excluded a file in one path and not the other.
    it('should match a bare tags rule against a frontmatter tag written with #', () => {
      settings.exclusions.excludedProperties = [{ key: 'tags', value: 'foo' }];
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { tags: ['#foo'] },
      });

      const result = fileHasExcludedProperties(file, settings, app);
      expect(result).toBe(true);
    });

    it('should match a tags rule written with # against a bare frontmatter tag', () => {
      settings.exclusions.excludedProperties = [{ key: 'tags', value: '#foo' }];
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { tags: 'foo' },
      });

      const result = fileHasExcludedProperties(file, settings, app);
      expect(result).toBe(true);
    });

    it('should not strip # for a property other than tags', () => {
      settings.exclusions.excludedProperties = [
        { key: 'status', value: 'draft' },
      ];
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { status: '#draft' },
      });

      const result = fileHasExcludedProperties(file, settings, app);
      expect(result).toBe(false);
    });
  });

  describe('shouldProcessFile', () => {
    beforeEach(() => {
      settings.exclusions.folderScopeStrategy = 'Only exclude...';
      settings.exclusions.tagScopeStrategy = 'Only exclude...';
      settings.exclusions.propertyScopeStrategy = 'Only exclude...';
      settings.exclusions.excludedFolders = [];
      settings.exclusions.excludedTags = [];
      settings.exclusions.excludedProperties = [];
    });

    describe('"Only exclude..." strategy', () => {
      it('should process all files when no exclusions configured', () => {
        const file = createMockFile('test.md');
        file.parent = new TFolder('Notes');

        const result = shouldProcessFile(file, settings, app);
        expect(result).toBe(true);
      });

      it('should not process file in excluded folder', () => {
        settings.exclusions.excludedFolders = ['Archive'];
        const file = createMockFile('Archive/test.md');
        file.parent = new TFolder('Archive');

        const result = shouldProcessFile(file, settings, app);
        expect(result).toBe(false);
      });

      it('should process file not in excluded folder', () => {
        settings.exclusions.excludedFolders = ['Archive'];
        const file = createMockFile('Notes/test.md');
        file.parent = new TFolder('Notes');

        const result = shouldProcessFile(file, settings, app);
        expect(result).toBe(true);
      });
    });

    describe('"Exclude all except..." strategy', () => {
      beforeEach(() => {
        settings.exclusions.folderScopeStrategy = 'Exclude all except...';
      });

      it('should not process any files when no folders configured', () => {
        settings.exclusions.excludedFolders = [];
        const file = createMockFile('Notes/test.md');
        file.parent = new TFolder('Notes');

        const result = shouldProcessFile(file, settings, app);
        expect(result).toBe(false);
      });

      it('should process file in included folder', () => {
        settings.exclusions.excludedFolders = ['Notes'];
        const file = createMockFile('Notes/test.md');
        file.parent = new TFolder('Notes');

        const result = shouldProcessFile(file, settings, app);
        expect(result).toBe(true);
      });

      it('should not process file not in included folder', () => {
        settings.exclusions.excludedFolders = ['Notes'];
        const file = createMockFile('Archive/test.md');
        file.parent = new TFolder('Archive');

        const result = shouldProcessFile(file, settings, app);
        expect(result).toBe(false);
      });
    });

    describe('exclusion overrides', () => {
      beforeEach(() => {
        settings.exclusions.excludedFolders = ['Archive'];
        settings.exclusions.excludedTags = ['archived'];
        settings.exclusions.excludedProperties = [
          { key: 'status', value: 'draft' },
        ];
      });

      it('should ignore folder exclusions when ignoreFolder is true', () => {
        const file = createMockFile('Archive/test.md');
        file.parent = new TFolder('Archive');

        const result = shouldProcessFile(file, settings, app, undefined, {
          ignoreFolder: true,
        });
        expect(result).toBe(true);
      });

      it('should ignore tag exclusions when ignoreTag is true', () => {
        const file = createMockFile('test.md');
        file.parent = new TFolder('Notes');
        app.metadataCache.getFileCache = vi.fn().mockReturnValue({
          frontmatter: { tags: ['archived'] },
        });

        const result = shouldProcessFile(file, settings, app, undefined, {
          ignoreTag: true,
        });
        expect(result).toBe(true);
      });

      it('should ignore property exclusions when ignoreProperty is true', () => {
        const file = createMockFile('test.md');
        file.parent = new TFolder('Notes');
        app.metadataCache.getFileCache = vi.fn().mockReturnValue({
          frontmatter: { status: 'draft' },
        });

        const result = shouldProcessFile(file, settings, app, undefined, {
          ignoreProperty: true,
        });
        expect(result).toBe(true);
      });

      it('should respect all overrides together', () => {
        const file = createMockFile('Archive/test.md');
        file.parent = new TFolder('Archive');
        app.metadataCache.getFileCache = vi.fn().mockReturnValue({
          frontmatter: { status: 'draft', tags: ['archived'] },
        });

        const result = shouldProcessFile(file, settings, app, undefined, {
          ignoreFolder: true,
          ignoreTag: true,
          ignoreProperty: true,
        });
        expect(result).toBe(true);
      });
    });

    describe('combined exclusions', () => {
      it('should exclude if ANY exclusion type matches ("Only exclude..." mode)', () => {
        settings.exclusions.folderScopeStrategy = 'Only exclude...';
        settings.exclusions.tagScopeStrategy = 'Only exclude...';
        settings.exclusions.excludedFolders = ['Archive'];
        settings.exclusions.excludedTags = ['archived'];

        const file = createMockFile('Archive/test.md');
        file.parent = new TFolder('Archive');
        app.metadataCache.getFileCache = vi.fn().mockReturnValue({
          frontmatter: { tags: ['archived'] },
        });

        // File is in excluded folder AND has excluded tag
        const result = shouldProcessFile(file, settings, app);
        expect(result).toBe(false);
      });

      it('should exclude if only folder matches', () => {
        settings.exclusions.folderScopeStrategy = 'Only exclude...';
        settings.exclusions.excludedFolders = ['Archive'];

        const file = createMockFile('Archive/test.md');
        file.parent = new TFolder('Archive');

        const result = shouldProcessFile(file, settings, app);
        expect(result).toBe(false);
      });

      it('should exclude if only tag matches', () => {
        settings.exclusions.tagScopeStrategy = 'Only exclude...';
        settings.exclusions.excludedTags = ['archived'];

        const file = createMockFile('Notes/test.md');
        file.parent = new TFolder('Notes');
        app.metadataCache.getFileCache = vi.fn().mockReturnValue({
          frontmatter: { tags: ['archived'] },
        });

        // Mock fileHasTargetTags to return true
        vi.doMock('./tag-utils', () => ({
          fileHasTargetTags: vi.fn().mockReturnValue(true),
          normalizeTag: vi.fn((tag) => tag.replace(/^#/, '')),
          stripFrontmatter: vi.fn((content) => content),
        }));

        const result = shouldProcessFile(file, settings, app);
        expect(result).toBe(false);
      });
    });
  });

  describe('isExcludedByFileName', () => {
    const rule = (
      text: string,
      overrides: Partial<FileNameExclusion> = {}
    ): FileNameExclusion => ({
      text,
      onlyAtStart: false,
      onlyWholeLine: false,
      enabled: true,
      caseSensitive: false,
      ...overrides,
    });

    beforeEach(() => {
      settings.exclusions.fileNameScopeStrategy = 'Only exclude...';
      settings.exclusions.excludedFileNames = [];
    });

    describe('"Only exclude..." strategy', () => {
      it('should exclude a file whose name matches a rule', () => {
        settings.exclusions.excludedFileNames = [rule('draft')];

        expect(isExcludedByFileName('draft note.md', settings)).toBe(true);
      });

      it('should not exclude a file whose name matches no rule', () => {
        settings.exclusions.excludedFileNames = [rule('draft')];

        expect(isExcludedByFileName('final note.md', settings)).toBe(false);
      });

      it('should exclude nothing when the list is empty', () => {
        expect(isExcludedByFileName('draft note.md', settings)).toBe(false);
      });
    });

    describe('"Exclude all except..." strategy', () => {
      beforeEach(() => {
        settings.exclusions.fileNameScopeStrategy = 'Exclude all except...';
      });

      it('should not exclude a file whose name matches a rule', () => {
        settings.exclusions.excludedFileNames = [rule('draft')];

        expect(isExcludedByFileName('draft note.md', settings)).toBe(false);
      });

      it('should exclude a file whose name matches no rule', () => {
        settings.exclusions.excludedFileNames = [rule('draft')];

        expect(isExcludedByFileName('final note.md', settings)).toBe(true);
      });

      it('should exclude everything when the list is empty', () => {
        expect(isExcludedByFileName('draft note.md', settings)).toBe(true);
      });

      // A rule the matcher skips must not count as a target either: if it did, the
      // allow-list would exclude the whole vault with no name able to satisfy it.
      it('should exclude everything when every rule is disabled', () => {
        settings.exclusions.excludedFileNames = [
          rule('draft', { enabled: false }),
        ];

        expect(isExcludedByFileName('draft note.md', settings)).toBe(true);
        expect(isExcludedByFileName('final note.md', settings)).toBe(true);
      });

      it('should exclude everything when every rule has blank text', () => {
        settings.exclusions.excludedFileNames = [rule('')];

        expect(isExcludedByFileName('draft note.md', settings)).toBe(true);
      });

      it('should still honour a live rule alongside a disabled one', () => {
        settings.exclusions.excludedFileNames = [
          rule('draft', { enabled: false }),
          rule('keep'),
        ];

        expect(isExcludedByFileName('keep this.md', settings)).toBe(false);
        expect(isExcludedByFileName('draft note.md', settings)).toBe(true);
      });
    });

    // The empty-list verdict has to match the sibling sections': an empty allow-list
    // excludes the whole vault there too, and a split here would be silent.
    describe('empty-list parity with the folder strategy', () => {
      beforeEach(() => {
        settings.exclusions.excludedFolders = [];
        settings.exclusions.excludedTags = [];
        settings.exclusions.excludedProperties = [];
        settings.exclusions.tagScopeStrategy = 'Only exclude...';
        settings.exclusions.propertyScopeStrategy = 'Only exclude...';
      });

      it('should exclude nothing under "Only exclude...", as folders do', () => {
        const file = createMockFile('Notes/test.md');
        file.parent = new TFolder('Notes');
        settings.exclusions.folderScopeStrategy = 'Only exclude...';

        expect(shouldProcessFile(file, settings, app)).toBe(true);
        expect(isExcludedByFileName('test.md', settings)).toBe(false);
      });

      it('should exclude everything under "Exclude all except...", as folders do', () => {
        const file = createMockFile('Notes/test.md');
        file.parent = new TFolder('Notes');
        settings.exclusions.folderScopeStrategy = 'Exclude all except...';
        settings.exclusions.fileNameScopeStrategy = 'Exclude all except...';

        expect(shouldProcessFile(file, settings, app)).toBe(false);
        expect(isExcludedByFileName('test.md', settings)).toBe(true);
      });
    });
  });
});
