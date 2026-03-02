import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isFileInConfiguredFolders,
  fileHasExcludedProperties,
  shouldProcessFile,
  isFileExcluded,
} from '../../src/utils/file-exclusions';
import {
  createTestSettings,
  createMockFile,
  createMockApp,
} from '../testUtils';
import { PluginSettings } from '../../src/types';
import { TFile, App, TFolder } from '../mockObsidian';

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
      settings.exclusions.excludeSubfolders = false;
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

    it('should check subfolders when excludeSubfolders is enabled', () => {
      settings.exclusions.excludeSubfolders = true;
      settings.exclusions.excludedFolders = ['Notes'];

      const file = createMockFile('Notes/Work/test.md');
      file.parent = new TFolder('Notes/Work');

      const result = isFileInConfiguredFolders(file, settings);
      expect(result).toBe(true);
    });

    it('should not check subfolders when excludeSubfolders is disabled', () => {
      settings.exclusions.excludeSubfolders = false;
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
      settings.exclusions.excludeSubfolders = true;
      settings.exclusions.excludedFolders = ['/'];

      const file = createMockFile('Notes/test.md');
      file.parent = new TFolder('Notes');

      const result = isFileInConfiguredFolders(file, settings);
      // Root folder "/" has no subfolders to check
      expect(result).toBe(false);
    });

    it('should handle deeply nested subfolders', () => {
      settings.exclusions.excludeSubfolders = true;
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

  describe('isFileExcluded', () => {
    beforeEach(() => {
      settings.exclusions.excludedFolders = [];
      settings.exclusions.excludedTags = [];
      settings.exclusions.excludedProperties = [];
      settings.exclusions.tagMatchingMode = 'In Properties and note body';
      settings.exclusions.excludeChildTags = true;
    });

    it('should return false when no exclusions configured', () => {
      const file = createMockFile('test.md');
      file.parent = new TFolder('Notes');

      const result = isFileExcluded(file, settings, app);
      expect(result).toBe(false);
    });

    it('should return true if file has excluded property', () => {
      settings.exclusions.excludedProperties = [
        { key: 'status', value: 'draft' },
      ];
      const file = createMockFile('test.md');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { status: 'draft' },
      });

      const result = isFileExcluded(file, settings, app);
      expect(result).toBe(true);
    });

    it('should return true if file is in excluded folder', () => {
      settings.exclusions.excludedFolders = ['Archive'];
      const file = createMockFile('Archive/test.md');
      file.parent = new TFolder('Archive');

      const result = isFileExcluded(file, settings, app);
      expect(result).toBe(true);
    });

    it('should return true if file has excluded tag in frontmatter', () => {
      settings.exclusions.excludedTags = ['archived'];
      const file = createMockFile('test.md');
      file.parent = new TFolder('Notes');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { tags: ['archived'] },
        tags: [],
      });

      const result = isFileExcluded(file, settings, app);
      expect(result).toBe(true);
    });

    it('should return true if file has excluded tag inline', () => {
      settings.exclusions.excludedTags = ['archived'];
      const file = createMockFile('test.md');
      file.parent = new TFolder('Notes');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: null,
        tags: [
          {
            tag: '#archived',
            position: {
              start: { line: 0, col: 0, offset: 0 },
              end: { line: 0, col: 9, offset: 9 },
            },
          },
        ],
      });

      const result = isFileExcluded(file, settings, app);
      expect(result).toBe(true);
    });

    it('should match child tags when excludeChildTags is true', () => {
      settings.exclusions.excludedTags = ['work'];
      settings.exclusions.excludeChildTags = true;
      const file = createMockFile('test.md');
      file.parent = new TFolder('Notes');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { tags: ['work/project'] },
        tags: [],
      });

      const result = isFileExcluded(file, settings, app);
      expect(result).toBe(true);
    });

    it('should not match child tags when excludeChildTags is false', () => {
      settings.exclusions.excludedTags = ['work'];
      settings.exclusions.excludeChildTags = false;
      const file = createMockFile('test.md');
      file.parent = new TFolder('Notes');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { tags: ['work/project'] },
        tags: [],
      });

      const result = isFileExcluded(file, settings, app);
      expect(result).toBe(false);
    });

    it('should only check frontmatter tags when mode is "In Properties only"', () => {
      settings.exclusions.tagMatchingMode = 'In Properties only';
      settings.exclusions.excludedTags = ['archived'];
      const file = createMockFile('test.md');
      file.parent = new TFolder('Notes');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: null,
        tags: [
          {
            tag: '#archived',
            position: {
              start: { line: 0, col: 0, offset: 0 },
              end: { line: 0, col: 9, offset: 9 },
            },
          },
        ],
      });

      const result = isFileExcluded(file, settings, app);
      expect(result).toBe(false); // Should not match inline tags
    });

    it('should only check inline tags when mode is "In note body only"', () => {
      settings.exclusions.tagMatchingMode = 'In note body only';
      settings.exclusions.excludedTags = ['archived'];
      const file = createMockFile('test.md');
      file.parent = new TFolder('Notes');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { tags: ['archived'] },
        tags: [],
      });

      const result = isFileExcluded(file, settings, app);
      expect(result).toBe(false); // Should not match frontmatter tags
    });

    it('should normalize tags with # prefix', () => {
      settings.exclusions.excludedTags = ['#archived'];
      const file = createMockFile('test.md');
      file.parent = new TFolder('Notes');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { tags: ['archived'] },
        tags: [],
      });

      const result = isFileExcluded(file, settings, app);
      expect(result).toBe(true);
    });

    it('should handle tag as single string in frontmatter', () => {
      settings.exclusions.excludedTags = ['archived'];
      const file = createMockFile('test.md');
      file.parent = new TFolder('Notes');
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { tags: 'archived' }, // Single string, not array
        tags: [],
      });

      const result = isFileExcluded(file, settings, app);
      expect(result).toBe(true);
    });
  });
});
