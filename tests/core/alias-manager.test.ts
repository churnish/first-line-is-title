/**
 * Comprehensive test suite for AliasManager
 *
 * Tests cover:
 * - getAliasPropertyKeys: parsing, whitespace, blank key
 * - updateAliasIfNeeded: canvas/popover detection, alias matching, YAML handling
 * - addAliasToFile: ZWSP markers, truncation, custom replacements, multi-property
 * - removePluginAliasesFromFile: selective removal, keepEmptyAliasProperty
 * - Edge cases: ENOENT, concurrent calls, special characters
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AliasManager } from '../../src/core/alias-manager';
import { createMockFile, createMockApp } from '../testUtils';
import { TFile, Editor, MarkdownView } from '../mockObsidian';
import { DeepPartial, PluginSettings } from '../../src/types';
import { DEFAULT_SETTINGS } from '../../src/constants';
import { deepMerge } from '../../src/utils/deep-merge';

// Create mock plugin for AliasManager
function createMockPlugin(settingsOverrides: DeepPartial<PluginSettings> = {}) {
  const app = createMockApp();
  // deepMerge deep-clones its defaults, so untouched branches never alias DEFAULT_SETTINGS
  const settings = deepMerge(DEFAULT_SETTINGS, {
    aliases: {
      enableAliases: true,
      truncateAlias: false,
      addAliasOnlyIfTitleDiffers: false,
      aliasPropertyKey: 'aliases',
      hideAliasProperty: 'never',
      hideAliasInSidebar: false,
      keepEmptyAliasProperty: true,
    },
    core: {
      charCount: 100,
    },
    markupStripping: {
      stripMarkupInAlias: false,
      applyCustomReplacementsInAlias: false,
    },
    customReplacements: {
      enableCustomReplacements: false,
      rules: [],
    },
    ...settingsOverrides,
  });

  // Add getMostRecentLeaf to workspace
  (app.workspace as any).getMostRecentLeaf = vi.fn().mockReturnValue({
    view: { getViewType: vi.fn().mockReturnValue('markdown') },
  });

  return {
    app,
    settings,
    trackUsage: vi.fn(),
    renameEngine: {
      stripFrontmatterFromContent: vi.fn((content: string) => {
        // Simple frontmatter stripping for tests
        if (!content.startsWith('---\n')) return content;
        const endIndex = content.indexOf('\n---\n', 4);
        if (endIndex === -1) return content;
        return content.substring(endIndex + 5);
      }),
    },
    pendingMetadataUpdates: new Set<TFile>(),
  } as any;
}

describe('AliasManager', () => {
  let plugin: ReturnType<typeof createMockPlugin>;
  let aliasManager: AliasManager;
  let file: TFile;
  let editor: Editor;

  beforeEach(() => {
    plugin = createMockPlugin();
    aliasManager = new AliasManager(plugin);
    file = createMockFile('test.md');
    editor = new Editor();

    // Reset all mocks
    vi.clearAllMocks();

    // Default mocks
    plugin.app.vault.getAbstractFileByPath = vi.fn().mockReturnValue(file);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor and accessors', () => {
    it('should initialize with plugin reference', () => {
      expect(aliasManager).toBeDefined();
      expect(aliasManager['plugin']).toBe(plugin);
    });

    it('should have access to app through plugin', () => {
      expect(aliasManager.app).toBe(plugin.app);
    });

    it('should have access to settings through plugin', () => {
      expect(aliasManager.settings).toBe(plugin.settings);
    });
  });

  describe('getAliasPropertyKeys', () => {
    it('should return no keys when the property name is blank', () => {
      plugin.settings.aliases.aliasPropertyKey = '';
      const keys = aliasManager['getAliasPropertyKeys']();
      expect(keys).toEqual([]);
    });

    it('should return single property key', () => {
      plugin.settings.aliases.aliasPropertyKey = 'aliases';
      const keys = aliasManager['getAliasPropertyKeys']();
      expect(keys).toEqual(['aliases']);
    });

    it('should return multiple comma-separated keys', () => {
      plugin.settings.aliases.aliasPropertyKey = 'aliases, aka, also-known-as';
      const keys = aliasManager['getAliasPropertyKeys']();
      expect(keys).toEqual(['aliases', 'aka', 'also-known-as']);
    });

    it('should trim whitespace from keys', () => {
      plugin.settings.aliases.aliasPropertyKey = '  aliases  ,  aka  ,  test  ';
      const keys = aliasManager['getAliasPropertyKeys']();
      expect(keys).toEqual(['aliases', 'aka', 'test']);
    });

    it('should filter out empty keys', () => {
      plugin.settings.aliases.aliasPropertyKey = 'aliases, , aka, ,';
      const keys = aliasManager['getAliasPropertyKeys']();
      expect(keys).toEqual(['aliases', 'aka']);
    });

    it('should return no keys when the property name is only commas', () => {
      plugin.settings.aliases.aliasPropertyKey = ', , ,';
      const keys = aliasManager['getAliasPropertyKeys']();
      expect(keys).toEqual([]);
    });

    // The setting is typed `string` and this function indexes into it directly.
    // What makes that safe is the loader: deepMerge skips null and undefined
    // source values, so a null in data.json can never displace the default.
    it('should never see a null key because deepMerge keeps the default', () => {
      const merged = deepMerge(DEFAULT_SETTINGS, {
        aliases: { aliasPropertyKey: null as any },
      });
      expect(merged.aliases.aliasPropertyKey).toBe(
        DEFAULT_SETTINGS.aliases.aliasPropertyKey
      );
    });
  });

  // A blank property name is a deliberate "no alias property" choice, not a
  // request for the default. Every entry point must bail before it reaches a
  // write - processFrontMatter opens and rewrites the file even when the
  // per-key loop inside it would iterate zero times.
  describe('blank alias property name', () => {
    beforeEach(() => {
      plugin.settings.aliases.aliasPropertyKey = '';
      plugin.app.workspace.getActiveViewOfType = vi.fn().mockReturnValue(null);
    });

    it('should make updateAliasIfNeeded return false without writing', async () => {
      const result = await aliasManager.updateAliasIfNeeded(
        file,
        'First Line\nBody'
      );

      expect(result).toBe(false);
      expect(plugin.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    });

    it('should not count updateAliasIfNeeded as plugin usage', async () => {
      await aliasManager.updateAliasIfNeeded(file, 'First Line\nBody');

      expect(plugin.trackUsage).not.toHaveBeenCalled();
    });

    it('should make addAliasToFile return without writing', async () => {
      await aliasManager.addAliasToFile(
        file,
        'First Line',
        'filename',
        'First Line\nBody'
      );

      expect(plugin.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    });

    it('should make removePluginAliasesFromFile return without writing', async () => {
      await aliasManager.removePluginAliasesFromFile(file);

      expect(plugin.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    });

    // The guard sits ahead of `activeView.save()`, which flushes the editor
    // buffer to disk - reaching it would touch the file on its own.
    it('should not save the active view', async () => {
      const mockView = {
        file,
        save: vi.fn().mockResolvedValue(undefined),
      };
      plugin.app.workspace.getActiveViewOfType = vi
        .fn()
        .mockReturnValue(mockView);

      await aliasManager.addAliasToFile(
        file,
        'First Line',
        'filename',
        'First Line\nBody'
      );
      await aliasManager.removePluginAliasesFromFile(file);

      expect(mockView.save).not.toHaveBeenCalled();
    });

    it('should still write once a property name is set', async () => {
      plugin.settings.aliases.aliasPropertyKey = 'aliases';

      await aliasManager.addAliasToFile(
        file,
        'First Line',
        'filename',
        'First Line\nBody'
      );

      expect(plugin.app.fileManager.processFrontMatter).toHaveBeenCalled();
    });
  });

  describe('addAliasToFile', () => {
    beforeEach(() => {
      plugin.app.workspace.getActiveViewOfType = vi.fn().mockReturnValue(null);
    });

    it('should skip when file no longer exists', async () => {
      plugin.app.vault.getAbstractFileByPath = vi.fn().mockReturnValue(null);

      await aliasManager.addAliasToFile(
        file,
        'First Line',
        'filename',
        'content'
      );

      expect(plugin.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    });

    it('should add ZWSP marker to alias', async () => {
      const title = 'First Line';
      const content = title + '\nBody';

      let capturedFrontmatter: any;
      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = {};
          callback(fm);
          capturedFrontmatter = fm;
        }
      );

      await aliasManager.addAliasToFile(file, title, 'filename', content);

      const zwsp = '\u200B';
      expect(capturedFrontmatter.aliases).toEqual([`${zwsp}${title}${zwsp}`]);
    });

    it('should truncate alias when enabled and exceeds charCount', async () => {
      plugin.settings.aliases.truncateAlias = true;
      plugin.settings.core.charCount = 10;

      const longTitle = 'This is a very long title that exceeds the limit';
      const content = longTitle + '\nBody';

      let capturedFrontmatter: any;
      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = {};
          callback(fm);
          capturedFrontmatter = fm;
        }
      );

      await aliasManager.addAliasToFile(file, longTitle, 'filename', content);

      const zwsp = '\u200B';
      const expectedTruncated = longTitle.slice(0, 9).trimEnd() + '…';
      expect(capturedFrontmatter.aliases).toEqual([
        `${zwsp}${expectedTruncated}${zwsp}`,
      ]);
    });

    it('should remove aliases when processed alias is only ellipsis', async () => {
      plugin.settings.aliases.truncateAlias = true;
      plugin.settings.core.charCount = 1; // Extreme truncation

      const removeAliasesSpy = vi.spyOn(
        aliasManager,
        'removePluginAliasesFromFile'
      );

      await aliasManager.addAliasToFile(file, 'Title', 'filename', 'content');

      expect(removeAliasesSpy).toHaveBeenCalledWith(file);
    });

    it('should remove aliases when empty heading (# only)', async () => {
      const removeAliasesSpy = vi.spyOn(
        aliasManager,
        'removePluginAliasesFromFile'
      );

      await aliasManager.addAliasToFile(file, '#', 'filename', '# \nContent');

      expect(removeAliasesSpy).toHaveBeenCalledWith(file);
    });

    it('should remove aliases when processed alias is empty', async () => {
      const removeAliasesSpy = vi.spyOn(
        aliasManager,
        'removePluginAliasesFromFile'
      );

      await aliasManager.addAliasToFile(file, '   ', 'filename', 'content');

      expect(removeAliasesSpy).toHaveBeenCalledWith(file);
    });

    it('should apply custom replacement rules when enabled', async () => {
      plugin.settings.customReplacements.enableCustomReplacements = true;
      plugin.settings.markupStripping.applyCustomReplacementsInAlias = true;
      plugin.settings.customReplacements.rules = [
        {
          searchText: 'TODO',
          replaceText: 'DONE',
          onlyAtStart: false,
          onlyWholeLine: false,
          enabled: true,
        },
      ];

      const title = 'TODO: Fix this';
      const content = title + '\nBody';

      let capturedFrontmatter: any;
      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = {};
          callback(fm);
          capturedFrontmatter = fm;
        }
      );

      await aliasManager.addAliasToFile(file, title, 'filename', content);

      expect(capturedFrontmatter.aliases[0]).toContain('DONE: Fix this');
    });

    it('should apply custom replacement only at start when configured', async () => {
      plugin.settings.customReplacements.enableCustomReplacements = true;
      plugin.settings.markupStripping.applyCustomReplacementsInAlias = true;
      plugin.settings.customReplacements.rules = [
        {
          searchText: 'PREFIX ',
          replaceText: 'REPLACED ',
          onlyAtStart: true,
          onlyWholeLine: false,
          enabled: true,
        },
      ];

      const title = 'PREFIX Task name';
      const content = title + '\nBody';

      let capturedFrontmatter: any;
      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = {};
          callback(fm);
          capturedFrontmatter = fm;
        }
      );

      await aliasManager.addAliasToFile(file, title, 'filename', content);

      expect(capturedFrontmatter.aliases[0]).toContain('REPLACED Task name');
    });

    it('should remove existing plugin aliases before adding new one', async () => {
      const title = 'New Title';
      // Content WITH frontmatter so it goes through the update path
      const content = '---\naliases:\n  - Old\n---\n' + title + '\nBody';
      const zwsp = '\u200B';

      let capturedFrontmatter: any;
      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          // Simulate existing frontmatter with plugin alias and user alias
          const fm: Record<string, any> = {
            aliases: [`${zwsp}Old Title${zwsp}`, 'User Added Alias'],
          };
          callback(fm);
          capturedFrontmatter = fm;
        }
      );

      await aliasManager.addAliasToFile(file, title, 'filename', content);

      expect(capturedFrontmatter.aliases).toHaveLength(2);
      expect(capturedFrontmatter.aliases).toContain('User Added Alias');
      expect(capturedFrontmatter.aliases).toContain(`${zwsp}${title}${zwsp}`);
      expect(capturedFrontmatter.aliases).not.toContain(
        `${zwsp}Old Title${zwsp}`
      );
    });

    it('should handle multiple alias property keys', async () => {
      plugin.settings.aliases.aliasPropertyKey = 'aliases, aka';
      const title = 'First Line';
      const content = title + '\nBody';

      let capturedFrontmatter: any;
      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = {};
          callback(fm);
          capturedFrontmatter = fm;
        }
      );

      await aliasManager.addAliasToFile(file, title, 'filename', content);

      const zwsp = '\u200B';
      // 'aliases' is Obsidian's canonical list property, so it stays an array.
      // Custom properties use inline (scalar) format for a single value.
      expect(capturedFrontmatter.aliases).toEqual([`${zwsp}${title}${zwsp}`]);
      expect(capturedFrontmatter.aka).toBe(`${zwsp}${title}${zwsp}`);
    });

    it("should allow 'Untitled' alias when first line is literally 'Untitled'", async () => {
      const title = 'Untitled';
      const content = title + '\nBody';

      let capturedFrontmatter: any;
      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = {};
          callback(fm);
          capturedFrontmatter = fm;
        }
      );

      await aliasManager.addAliasToFile(file, title, 'filename', content);

      const zwsp = '\u200B';
      expect(capturedFrontmatter.aliases).toEqual([`${zwsp}${title}${zwsp}`]);
    });

    it('should handle ENOENT error gracefully (file renamed during operation)', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';

      plugin.app.fileManager.processFrontMatter = vi
        .fn()
        .mockRejectedValue(error);

      // Should not throw
      await expect(
        aliasManager.addAliasToFile(file, 'Title', 'filename', 'Title\nBody')
      ).resolves.not.toThrow();
    });

    it('should log unexpected errors', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const error = new Error('Unexpected error');

      plugin.app.fileManager.processFrontMatter = vi
        .fn()
        .mockRejectedValue(error);

      await aliasManager.addAliasToFile(
        file,
        'Title',
        'filename',
        'Title\nBody'
      );

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should save active view before modifying frontmatter', async () => {
      const mockView = new MarkdownView(plugin.app);
      mockView.file = file;
      mockView.save = vi.fn();

      plugin.app.workspace.getActiveViewOfType = vi
        .fn()
        .mockReturnValue(mockView);

      await aliasManager.addAliasToFile(
        file,
        'Title',
        'filename',
        'Title\nBody'
      );

      expect(mockView.save).toHaveBeenCalled();
    });

    it('should remove aliases when alias matches filename and setting enabled', async () => {
      plugin.settings.aliases.addAliasOnlyIfTitleDiffers = true;
      const title = 'filename';
      const content = title + '\nBody';

      const removeAliasesSpy = vi.spyOn(
        aliasManager,
        'removePluginAliasesFromFile'
      );

      await aliasManager.addAliasToFile(file, title, 'filename', content);

      expect(removeAliasesSpy).toHaveBeenCalledWith(file);
    });

    it('should add file to pendingMetadataUpdates', async () => {
      const title = 'First Line';
      const content = title + '\nBody';

      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = {};
          callback(fm);
        }
      );

      await aliasManager.addAliasToFile(file, title, 'filename', content);

      expect(plugin.pendingMetadataUpdates.has(file)).toBe(true);
    });

    // Tests for firstNonEmptyLine parameter edge cases (Issue #22)
    it('should remove aliases when Untitled extracted from heading markup', async () => {
      // First line is "# Untitled" (heading), titleSourceLine after stripping is "Untitled"
      // Should NOT add alias because original line "# Untitled" is not literally "Untitled"
      // The "#" prefix means markup processing produced "Untitled", not the user

      // Markup must be stripped for the alias so "# Untitled" reduces to "Untitled"
      plugin.settings.markupStripping.stripMarkupInAlias = true;

      const removeAliasesSpy = vi.spyOn(
        aliasManager,
        'removePluginAliasesFromFile'
      );

      await aliasManager.addAliasToFile(
        file,
        '# Untitled', // originalFirstNonEmptyLine (before processing - has # prefix)
        'filename', // newTitle
        '# Untitled\nBody' // content
      );

      // Should remove aliases because "# Untitled" doesn't literally match "Untitled" pattern
      expect(removeAliasesSpy).toHaveBeenCalledWith(file);
    });

    it('should remove aliases when Untitled extracted from template syntax', async () => {
      // First line is template code, but after processing results in "Untitled"
      // Should NOT add alias since original wasn't literally "Untitled"

      plugin.settings.markupStripping.stripMarkupInAlias = true;

      const removeAliasesSpy = vi.spyOn(
        aliasManager,
        'removePluginAliasesFromFile'
      );

      await aliasManager.addAliasToFile(
        file,
        '<% tp.file.cursor() %>', // originalFirstNonEmptyLine (template syntax)
        'filename', // newTitle
        '<% tp.file.cursor() %>\nBody' // content
      );

      expect(removeAliasesSpy).toHaveBeenCalledWith(file);
    });

    it('should handle card link where firstNonEmptyLine differs from titleSourceLine', async () => {
      // First line is Markdown link, titleSourceLine is extracted link text

      let capturedFrontmatter: any;
      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = {};
          callback(fm);
          capturedFrontmatter = fm;
        }
      );

      await aliasManager.addAliasToFile(
        file,
        'Link Title', // originalFirstNonEmptyLine
        'filename', // newTitle
        '[Link Title](https://example.com)\nBody' // content
      );

      const zwsp = '\u200B';
      expect(capturedFrontmatter.aliases).toEqual([`${zwsp}Link Title${zwsp}`]);
    });
  });

  describe('removePluginAliasesFromFile', () => {
    beforeEach(() => {
      plugin.app.workspace.getActiveViewOfType = vi.fn().mockReturnValue(null);
    });

    it('should skip when file no longer exists', async () => {
      plugin.app.vault.getAbstractFileByPath = vi.fn().mockReturnValue(null);

      await aliasManager.removePluginAliasesFromFile(file);

      expect(plugin.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    });

    it('should remove only ZWSP-marked aliases', async () => {
      const zwsp = '\u200B';

      let capturedFrontmatter: any;
      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = {
            aliases: [
              `${zwsp}Plugin Alias${zwsp}`,
              'User Alias',
              `${zwsp}Another Plugin${zwsp}`,
            ],
          };
          callback(fm);
          capturedFrontmatter = fm;
        }
      );

      await aliasManager.removePluginAliasesFromFile(file);

      expect(capturedFrontmatter.aliases).toEqual(['User Alias']);
    });

    it('should preserve user-added aliases', async () => {
      let capturedFrontmatter: any;
      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = {
            aliases: ['User Alias 1', 'User Alias 2'],
          };
          callback(fm);
          capturedFrontmatter = fm;
        }
      );

      await aliasManager.removePluginAliasesFromFile(file);

      expect(capturedFrontmatter.aliases).toEqual([
        'User Alias 1',
        'User Alias 2',
      ]);
    });

    it('should delete property when empty and keepEmptyAliasProperty is false', async () => {
      plugin.settings.aliases.keepEmptyAliasProperty = false;
      const zwsp = '\u200B';

      let capturedFrontmatter: any;
      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = {
            aliases: [`${zwsp}Plugin Alias${zwsp}`],
          };
          callback(fm);
          capturedFrontmatter = fm;
        }
      );

      await aliasManager.removePluginAliasesFromFile(file);

      expect(capturedFrontmatter.aliases).toBeUndefined();
    });

    it('should keep property as null when empty and keepEmptyAliasProperty is true', async () => {
      plugin.settings.aliases.keepEmptyAliasProperty = true;
      const zwsp = '\u200B';

      let capturedFrontmatter: any;
      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = {
            aliases: [`${zwsp}Plugin Alias${zwsp}`],
          };
          callback(fm);
          capturedFrontmatter = fm;
        }
      );

      await aliasManager.removePluginAliasesFromFile(file);

      expect(capturedFrontmatter.aliases).toBeNull();
    });

    it('should handle multiple alias property keys', async () => {
      plugin.settings.aliases.aliasPropertyKey = 'aliases, aka';
      const zwsp = '\u200B';

      let capturedFrontmatter: any;
      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = {
            aliases: [`${zwsp}Plugin${zwsp}`, 'User'],
            aka: `${zwsp}Plugin${zwsp}`,
          };
          callback(fm);
          capturedFrontmatter = fm;
        }
      );

      await aliasManager.removePluginAliasesFromFile(file);

      expect(capturedFrontmatter.aliases).toEqual(['User']);
      expect(capturedFrontmatter.aka).toBeNull(); // keepEmptyAliasProperty is true
    });

    it('should collapse non-aliases properties to a scalar after removal', async () => {
      plugin.settings.aliases.aliasPropertyKey = 'aka';
      const zwsp = '\u200B';

      let capturedFrontmatter: any;
      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = {
            aka: [`${zwsp}Plugin${zwsp}`, 'User Value'],
          };
          callback(fm);
          capturedFrontmatter = fm;
        }
      );

      await aliasManager.removePluginAliasesFromFile(file);

      // Custom properties collapse to inline (scalar) format when one value remains
      expect(capturedFrontmatter.aka).toBe('User Value');
    });

    it('should filter out empty strings', async () => {
      let capturedFrontmatter: any;
      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = {
            aliases: ['Valid', '', 'Also Valid', ''],
          };
          callback(fm);
          capturedFrontmatter = fm;
        }
      );

      await aliasManager.removePluginAliasesFromFile(file);

      expect(capturedFrontmatter.aliases).toEqual(['Valid', 'Also Valid']);
    });

    it('should handle string value (not array)', async () => {
      const zwsp = '\u200B';

      let capturedFrontmatter: any;
      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = {
            aliases: `${zwsp}Plugin Alias${zwsp}`,
          };
          callback(fm);
          capturedFrontmatter = fm;
        }
      );

      await aliasManager.removePluginAliasesFromFile(file);

      expect(capturedFrontmatter.aliases).toBeNull();
    });

    it('should add file to pendingMetadataUpdates', async () => {
      const zwsp = '\u200B';

      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = { aliases: [`${zwsp}Plugin${zwsp}`] };
          callback(fm);
        }
      );

      await aliasManager.removePluginAliasesFromFile(file);

      expect(plugin.pendingMetadataUpdates.has(file)).toBe(true);
    });

    it('should handle ENOENT error gracefully', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';

      plugin.app.fileManager.processFrontMatter = vi
        .fn()
        .mockRejectedValue(error);

      await expect(
        aliasManager.removePluginAliasesFromFile(file)
      ).resolves.not.toThrow();
    });

    it('should save active view before modifying frontmatter', async () => {
      const mockView = new MarkdownView(plugin.app);
      mockView.file = file;
      mockView.save = vi.fn();

      plugin.app.workspace.getActiveViewOfType = vi
        .fn()
        .mockReturnValue(mockView);

      await aliasManager.removePluginAliasesFromFile(file);

      expect(mockView.save).toHaveBeenCalled();
    });
  });

  describe('isEditorInPopoverOrCanvas', () => {
    it('should return false when editor is provided', () => {
      // Editor provided means it's from editor-change event (not popover)
      const result = aliasManager.isEditorInPopoverOrCanvas(editor, file);

      expect(result).toBe(false);
    });

    it('should return true when no active view', () => {
      plugin.app.workspace.getActiveViewOfType = vi.fn().mockReturnValue(null);

      const result = aliasManager.isEditorInPopoverOrCanvas(null as any, file);

      expect(result).toBe(true);
    });

    it("should return true when active view file doesn't match", () => {
      const otherFile = createMockFile('other.md');
      const mockView = new MarkdownView(plugin.app);
      mockView.file = otherFile;

      plugin.app.workspace.getActiveViewOfType = vi
        .fn()
        .mockReturnValue(mockView);

      const result = aliasManager.isEditorInPopoverOrCanvas(null as any, file);

      expect(result).toBe(true);
    });

    it('should return false when active view file matches', () => {
      const mockView = new MarkdownView(plugin.app);
      mockView.file = file;

      plugin.app.workspace.getActiveViewOfType = vi
        .fn()
        .mockReturnValue(mockView);

      const result = aliasManager.isEditorInPopoverOrCanvas(null as any, file);

      expect(result).toBe(false);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      plugin.app.workspace.getActiveViewOfType = vi.fn().mockReturnValue(null);
    });

    it('should handle file path with special characters', async () => {
      file.path = 'folder/file [special] (chars).md';
      file.basename = 'file [special] (chars)';

      let capturedFrontmatter: any;
      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = {};
          callback(fm);
          capturedFrontmatter = fm;
        }
      );

      await aliasManager.addAliasToFile(
        file,
        'Title',
        file.basename,
        'Title\nBody'
      );

      expect(capturedFrontmatter.aliases).toBeDefined();
    });

    it('should handle very long alias content', async () => {
      plugin.settings.aliases.truncateAlias = false;
      const veryLongTitle = 'A'.repeat(1000);

      let capturedFrontmatter: any;
      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = {};
          callback(fm);
          capturedFrontmatter = fm;
        }
      );

      await aliasManager.addAliasToFile(
        file,
        veryLongTitle,
        'filename',
        veryLongTitle + '\nBody'
      );

      expect(capturedFrontmatter.aliases[0]).toContain('A'.repeat(1000));
    });

    it('should handle alias with special Unicode characters', async () => {
      const title = 'Title with emoji \u{1F680} and symbols \u00A9\u00AE\u2122';

      let capturedFrontmatter: any;
      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = {};
          callback(fm);
          capturedFrontmatter = fm;
        }
      );

      await aliasManager.addAliasToFile(
        file,
        title,
        'filename',
        title + '\nBody'
      );

      expect(capturedFrontmatter.aliases[0]).toContain('\u{1F680}');
      expect(capturedFrontmatter.aliases[0]).toContain('\u00A9\u00AE\u2122');
    });

    it('should handle file deleted during operation', async () => {
      // First check passes, second fails
      plugin.app.vault.getAbstractFileByPath = vi
        .fn()
        .mockReturnValueOnce(file)
        .mockReturnValueOnce(null);

      await aliasManager.addAliasToFile(
        file,
        'Title',
        'filename',
        'Title\nBody'
      );

      // Should not call processFrontMatter after detecting file deletion
      expect(plugin.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    });

    it('should handle concurrent calls to same file', async () => {
      const title = 'Title';
      const content = title + '\nBody';

      let callCount = 0;
      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          callCount++;
          const fm: Record<string, any> = {};
          callback(fm);
        }
      );

      // Simulate concurrent calls
      await Promise.all([
        aliasManager.addAliasToFile(file, title, 'filename', content),
        aliasManager.addAliasToFile(file, title, 'filename', content),
        aliasManager.addAliasToFile(file, title, 'filename', content),
      ]);

      expect(callCount).toBe(3); // All should complete
    });

    it('should not open frontmatter when the property key is empty', async () => {
      plugin.settings.aliases.aliasPropertyKey = '';

      plugin.app.fileManager.processFrontMatter = vi.fn();

      await aliasManager.addAliasToFile(
        file,
        'Title',
        'filename',
        'Title\nBody'
      );

      expect(plugin.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    });

    it('should handle null values in frontmatter', async () => {
      let capturedFrontmatter: any;
      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (_file: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = { aliases: null };
          callback(fm);
          capturedFrontmatter = fm;
        }
      );

      await aliasManager.removePluginAliasesFromFile(file);

      // Should handle null gracefully (no crash)
      expect(capturedFrontmatter.aliases).toBeNull();
    });
  });
});
