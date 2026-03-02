import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  normalizeTag,
  parseTagsFromYAML,
  stripFrontmatter,
  fileHasTargetTags,
} from '../../src/utils/tag-utils';
import {
  createTestSettings,
  createMockFile,
  createMockApp,
} from '../testUtils';
import { PluginSettings } from '../../src/types';
import { App, TFile, getFrontMatterInfo, parseYaml } from '../mockObsidian';

describe('tag-utils', () => {
  let settings: PluginSettings;
  let app: App;

  beforeEach(() => {
    settings = createTestSettings();
    app = createMockApp();
  });

  describe('normalizeTag', () => {
    it('should remove leading # from tag', () => {
      expect(normalizeTag('#tag')).toBe('tag');
    });

    it('should leave tag without # unchanged', () => {
      expect(normalizeTag('tag')).toBe('tag');
    });

    it('should handle nested tags with #', () => {
      expect(normalizeTag('#work/project')).toBe('work/project');
    });

    it('should handle nested tags without #', () => {
      expect(normalizeTag('work/project')).toBe('work/project');
    });

    it('should handle empty string', () => {
      expect(normalizeTag('')).toBe('');
    });

    it('should handle tag with multiple # characters', () => {
      expect(normalizeTag('##tag')).toBe('#tag');
    });

    it('should handle tag with spaces', () => {
      expect(normalizeTag('#my tag')).toBe('my tag');
    });

    it('should handle special characters', () => {
      expect(normalizeTag('#tag-with_special.chars')).toBe(
        'tag-with_special.chars'
      );
    });
  });

  describe('parseTagsFromYAML', () => {
    beforeEach(() => {
      // Mock getFrontMatterInfo to return no frontmatter by default
      vi.mocked(getFrontMatterInfo).mockReturnValue({
        exists: false,
        frontmatter: '',
        contentStart: 0,
        lineStart: 0,
      });
    });

    it('should return empty array when no frontmatter exists', () => {
      const content = 'Just some content without frontmatter';
      const result = parseTagsFromYAML(content);
      expect(result).toEqual([]);
    });

    it('should parse tags from array in frontmatter', () => {
      const content = '---\ntags: [tag1, tag2, tag3]\n---\nContent';

      vi.mocked(getFrontMatterInfo).mockReturnValue({
        exists: true,
        frontmatter: 'tags: [tag1, tag2, tag3]',
        contentStart: 30,
        lineStart: 0,
      });

      vi.mocked(parseYaml).mockReturnValue({
        tags: ['tag1', 'tag2', 'tag3'],
      });

      const result = parseTagsFromYAML(content);
      expect(result).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should parse single tag from frontmatter', () => {
      const content = '---\ntags: important\n---\nContent';

      vi.mocked(getFrontMatterInfo).mockReturnValue({
        exists: true,
        frontmatter: 'tags: important',
        contentStart: 25,
        lineStart: 0,
      });

      vi.mocked(parseYaml).mockReturnValue({
        tags: 'important',
      });

      const result = parseTagsFromYAML(content);
      expect(result).toEqual(['important']);
    });

    it('should handle YAML parse errors', () => {
      const content = '---\ntags: [invalid yaml\n---\nContent';

      vi.mocked(getFrontMatterInfo).mockReturnValue({
        exists: true,
        frontmatter: 'tags: [invalid yaml',
        contentStart: 25,
        lineStart: 0,
      });

      vi.mocked(parseYaml).mockImplementation(() => {
        throw new Error('YAML parse error');
      });

      const result = parseTagsFromYAML(content);
      expect(result).toEqual([]);
    });

    it('should return empty array when tags property does not exist', () => {
      const content = '---\ntitle: My Note\n---\nContent';

      vi.mocked(getFrontMatterInfo).mockReturnValue({
        exists: true,
        frontmatter: 'title: My Note',
        contentStart: 20,
        lineStart: 0,
      });

      vi.mocked(parseYaml).mockReturnValue({
        title: 'My Note',
      });

      const result = parseTagsFromYAML(content);
      expect(result).toEqual([]);
    });

    it('should handle numeric tags', () => {
      const content = '---\ntags: [1, 2, 3]\n---\nContent';

      vi.mocked(getFrontMatterInfo).mockReturnValue({
        exists: true,
        frontmatter: 'tags: [1, 2, 3]',
        contentStart: 20,
        lineStart: 0,
      });

      vi.mocked(parseYaml).mockReturnValue({
        tags: [1, 2, 3],
      });

      const result = parseTagsFromYAML(content);
      expect(result).toEqual(['1', '2', '3']);
    });

    it('should handle null/undefined frontmatter object', () => {
      const content = '---\n---\nContent';

      vi.mocked(getFrontMatterInfo).mockReturnValue({
        exists: true,
        frontmatter: '',
        contentStart: 10,
        lineStart: 0,
      });

      vi.mocked(parseYaml).mockReturnValue(null as any);

      const result = parseTagsFromYAML(content);
      expect(result).toEqual([]);
    });
  });

  describe('stripFrontmatter', () => {
    beforeEach(() => {
      vi.mocked(getFrontMatterInfo).mockReturnValue({
        exists: false,
        frontmatter: '',
        contentStart: 0,
        lineStart: 0,
      });
    });

    it('should return content unchanged when no frontmatter', () => {
      const content = 'Just some content';
      const result = stripFrontmatter(content);
      expect(result).toBe(content);
    });

    it('should strip frontmatter and return remaining content', () => {
      const content = '---\ntitle: My Note\n---\nThis is the content';

      vi.mocked(getFrontMatterInfo).mockReturnValue({
        exists: true,
        frontmatter: 'title: My Note',
        contentStart: 23,
        lineStart: 0,
      });

      const result = stripFrontmatter(content);
      expect(result).toBe('This is the content');
    });

    it('should handle empty content after frontmatter', () => {
      const content = '---\ntitle: My Note\n---\n';

      vi.mocked(getFrontMatterInfo).mockReturnValue({
        exists: true,
        frontmatter: 'title: My Note',
        contentStart: 23,
        lineStart: 0,
      });

      const result = stripFrontmatter(content);
      expect(result).toBe('');
    });

    it('should handle empty string', () => {
      const result = stripFrontmatter('');
      expect(result).toBe('');
    });

    it('should preserve leading newlines after frontmatter', () => {
      const content = '---\ntitle: My Note\n---\n\n\nContent';

      vi.mocked(getFrontMatterInfo).mockReturnValue({
        exists: true,
        frontmatter: 'title: My Note',
        contentStart: 23,
        lineStart: 0,
      });

      const result = stripFrontmatter(content);
      expect(result).toBe('\n\nContent');
    });
  });

  describe('fileHasTargetTags', () => {
    let file: TFile;

    beforeEach(() => {
      file = createMockFile('test.md');
      settings.exclusions.excludedTags = ['work', 'important'];
      settings.exclusions.tagMatchingMode = 'In Properties and note body';
      settings.exclusions.excludeChildTags = true;
    });

    it('should return false when no target tags configured', () => {
      settings.exclusions.excludedTags = [];

      const result = fileHasTargetTags(file, settings, app);
      expect(result).toBe(false);
    });

    it('should return false when only empty tags configured', () => {
      settings.exclusions.excludedTags = ['', '  '];

      const result = fileHasTargetTags(file, settings, app);
      expect(result).toBe(false);
    });

    it('should detect tag in frontmatter', () => {
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { tags: ['work', 'project'] },
        tags: [],
      });

      const result = fileHasTargetTags(file, settings, app);
      expect(result).toBe(true);
    });

    it('should detect single tag in frontmatter', () => {
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { tags: 'important' },
        tags: [],
      });

      const result = fileHasTargetTags(file, settings, app);
      expect(result).toBe(true);
    });

    it('should detect inline tag', () => {
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: null,
        tags: [
          {
            tag: '#work',
            position: {
              start: { line: 0, col: 0, offset: 0 },
              end: { line: 0, col: 5, offset: 5 },
            },
          },
        ],
      });

      const result = fileHasTargetTags(file, settings, app);
      expect(result).toBe(true);
    });

    it('should detect child tags when excludeChildTags is true', () => {
      settings.exclusions.excludeChildTags = true;
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { tags: ['work/project/backend'] },
        tags: [],
      });

      const result = fileHasTargetTags(file, settings, app);
      expect(result).toBe(true);
    });

    it('should not detect child tags when excludeChildTags is false', () => {
      settings.exclusions.excludeChildTags = false;
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { tags: ['work/project'] },
        tags: [],
      });

      const result = fileHasTargetTags(file, settings, app);
      expect(result).toBe(false);
    });

    it('should normalize tags with # prefix', () => {
      settings.exclusions.excludedTags = ['#work'];
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { tags: ['work'] },
        tags: [],
      });

      const result = fileHasTargetTags(file, settings, app);
      expect(result).toBe(true);
    });

    it('should only check frontmatter when mode is "In Properties only"', () => {
      settings.exclusions.tagMatchingMode = 'In Properties only';
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: null,
        tags: [
          {
            tag: '#work',
            position: {
              start: { line: 0, col: 0, offset: 0 },
              end: { line: 0, col: 5, offset: 5 },
            },
          },
        ],
      });

      const result = fileHasTargetTags(file, settings, app);
      expect(result).toBe(false);
    });

    it('should only check inline tags when mode is "In note body only"', () => {
      settings.exclusions.tagMatchingMode = 'In note body only';
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { tags: ['work'] },
        tags: [],
      });

      const result = fileHasTargetTags(file, settings, app);
      expect(result).toBe(false);
    });

    it('should parse tags from provided content', () => {
      const content = '---\ntags: [work]\n---\nContent';

      vi.mocked(getFrontMatterInfo).mockReturnValue({
        exists: true,
        frontmatter: 'tags: [work]',
        contentStart: 20,
        lineStart: 0,
      });

      vi.mocked(parseYaml).mockReturnValue({
        tags: ['work'],
      });

      const result = fileHasTargetTags(file, settings, app, content);
      expect(result).toBe(true);
    });

    it('should return false when file has no cache', () => {
      app.metadataCache.getFileCache = vi.fn().mockReturnValue(null);

      const result = fileHasTargetTags(file, settings, app);
      expect(result).toBe(false);
    });

    it('should handle numeric tags in frontmatter', () => {
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { tags: [1, 2, 3] },
        tags: [],
      });

      settings.exclusions.excludedTags = ['1'];

      const result = fileHasTargetTags(file, settings, app);
      expect(result).toBe(true);
    });

    it('should detect exact match before child tag check', () => {
      settings.exclusions.excludedTags = ['work'];
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { tags: ['work'] },
        tags: [],
      });

      const result = fileHasTargetTags(file, settings, app);
      expect(result).toBe(true);
    });

    it('should handle tags in both frontmatter and inline', () => {
      settings.exclusions.tagMatchingMode = 'In Properties and note body';
      app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { tags: ['project'] },
        tags: [
          {
            tag: '#work',
            position: {
              start: { line: 0, col: 0, offset: 0 },
              end: { line: 0, col: 5, offset: 5 },
            },
          },
        ],
      });

      const result = fileHasTargetTags(file, settings, app);
      expect(result).toBe(true);
    });
  });
});
