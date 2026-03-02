/**
 * Comprehensive test suite for AliasManager
 *
 * Tests cover:
 * - getAliasPropertyKeys: parsing, whitespace, defaults
 * - updateAliasIfNeeded: canvas/popover detection, alias matching, YAML handling
 * - addAliasToFile: ZWSP markers, truncation, custom rules, multi-property
 * - removePluginAliasesFromFile: selective removal, keepEmptyAliasProperty
 * - Edge cases: ENOENT, concurrent calls, special characters
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { AliasManager } from '../../src/core/alias-manager';
import {
  createMockFile,
  createMockApp,
  createTestSettings,
} from '../testUtils';
import {
  TFile,
  App,
  Editor,
  MarkdownView,
  getFrontMatterInfo,
  parseYaml,
  Workspace,
} from '../mockObsidian';
import { PluginSettings } from '../../src/types';
import { DEFAULT_SETTINGS } from '../../src/constants';

// Deep merge for nested settings
function deepMerge<T extends Record<string, any>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };
  for (const key in source) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, any>,
        source[key] as Record<string, any>
      ) as T[Extract<keyof T, string>];
    } else {
      result[key] = source[key] as T[Extract<keyof T, string>];
    }
  }
  return result;
}

// Create mock plugin for AliasManager
function createMockPlugin(settingsOverrides: Partial<PluginSettings> = {}) {
  const app = createMockApp();
  const settings = deepMerge(DEFAULT_SETTINGS, {
    aliases: {
      enableAliases: true,
      truncateAlias: false,
      addAliasOnlyIfFirstLineDiffers: false,
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
      applyCustomRulesInAlias: false,
    },
    customRules: {
      enableCustomReplacements: false,
      customReplacements: [],
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
    pendingMetadataUpdates: new Set<string>(),
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
    it("should return default 'aliases' when not configured", () => {
      plugin.settings.aliases.aliasPropertyKey = '';
      const keys = aliasManager['getAliasPropertyKeys']();
      expect(keys).toEqual(['aliases']);
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

    it('should handle only commas (returns empty, uses default in callers)', () => {
      plugin.settings.aliases.aliasPropertyKey = ', , ,';
      const keys = aliasManager['getAliasPropertyKeys']();
      // When all entries are empty after filtering, returns empty array
      // The fallback happens via || "aliases" at the top of the function
      expect(keys).toEqual([]);
    });

    it('should handle null/undefined property key', () => {
      plugin.settings.aliases.aliasPropertyKey = null as any;
      const keys = aliasManager['getAliasPropertyKeys']();
      expect(keys).toEqual(['aliases']);
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
        'content',
        'First Line'
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

      await aliasManager.addAliasToFile(
        file,
        title,
        'filename',
        content,
        title
      );

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

      await aliasManager.addAliasToFile(
        file,
        longTitle,
        'filename',
        content,
        longTitle
      );

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

      await aliasManager.addAliasToFile(
        file,
        'Title',
        'filename',
        'content',
        'Title'
      );

      expect(removeAliasesSpy).toHaveBeenCalledWith(file);
    });

    it('should remove aliases when empty heading (# only)', async () => {
      const removeAliasesSpy = vi.spyOn(
        aliasManager,
        'removePluginAliasesFromFile'
      );

      await aliasManager.addAliasToFile(
        file,
        '#',
        'filename',
        '# \nContent',
        '# '
      );

      expect(removeAliasesSpy).toHaveBeenCalledWith(file);
    });

    it('should remove aliases when processed alias is empty', async () => {
      const removeAliasesSpy = vi.spyOn(
        aliasManager,
        'removePluginAliasesFromFile'
      );

      await aliasManager.addAliasToFile(
        file,
        '   ',
        'filename',
        'content',
        '   '
      );

      expect(removeAliasesSpy).toHaveBeenCalledWith(file);
    });

    it('should apply custom replacement rules when enabled', async () => {
      plugin.settings.customRules.enableCustomReplacements = true;
      plugin.settings.markupStripping.applyCustomRulesInAlias = true;
      plugin.settings.customRules.customReplacements = [
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

      await aliasManager.addAliasToFile(
        file,
        title,
        'filename',
        content,
        title
      );

      const zwsp = '\u200B';
      expect(capturedFrontmatter.aliases[0]).toContain('DONE: Fix this');
    });

    it('should apply custom replacement only at start when configured', async () => {
      plugin.settings.customRules.enableCustomReplacements = true;
      plugin.settings.markupStripping.applyCustomRulesInAlias = true;
      plugin.settings.customRules.customReplacements = [
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

      await aliasManager.addAliasToFile(
        file,
        title,
        'filename',
        content,
        title
      );

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

      await aliasManager.addAliasToFile(
        file,
        title,
        'filename',
        content,
        title
      );

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

      await aliasManager.addAliasToFile(
        file,
        title,
        'filename',
        content,
        title
      );

      const zwsp = '\u200B';
      // Both 'aliases' and 'aka' (custom property) should be arrays for consistency
      expect(capturedFrontmatter.aliases).toEqual([`${zwsp}${title}${zwsp}`]);
      expect(capturedFrontmatter.aka).toEqual([`${zwsp}${title}${zwsp}`]);
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

      await aliasManager.addAliasToFile(
        file,
        title,
        'filename',
        content,
        title
      );

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
        aliasManager.addAliasToFile(
          file,
          'Title',
          'filename',
          'Title\nBody',
          'Title'
        )
      ).resolves.not.toThrow();
    });

    it('should log unexpected errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation();
      const error = new Error('Unexpected error');

      plugin.app.fileManager.processFrontMatter = vi
        .fn()
        .mockRejectedValue(error);

      await aliasManager.addAliasToFile(
        file,
        'Title',
        'filename',
        'Title\nBody',
        'Title'
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
        'Title\nBody',
        'Title'
      );

      expect(mockView.save).toHaveBeenCalled();
    });

    it('should remove aliases when alias matches filename and setting enabled', async () => {
      plugin.settings.aliases.addAliasOnlyIfFirstLineDiffers = true;
      const title = 'filename';
      const content = title + '\nBody';

      const removeAliasesSpy = vi.spyOn(
        aliasManager,
        'removePluginAliasesFromFile'
      );

      await aliasManager.addAliasToFile(
        file,
        title,
        'filename',
        content,
        title
      );

      expect(removeAliasesSpy).toHaveBeenCalledWith(file);
    });

    it('should add file to pendingMetadataUpdates', async () => {
      const title = 'First Line';
      const content = title + '\nBody';

      plugin.app.fileManager.processFrontMatter = vi.fn(
        async (f: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = {};
          callback(fm);
        }
      );

      await aliasManager.addAliasToFile(
        file,
        title,
        'filename',
        content,
        title
      );

      expect(plugin.pendingMetadataUpdates.has(file.path)).toBe(true);
    });

    // Tests for firstNonEmptyLine parameter edge cases (Issue #22)
    it('should remove aliases when Untitled extracted from heading markup', async () => {
      // First line is "# Untitled" (heading), titleSourceLine after stripping is "Untitled"
      // Should NOT add alias because original line "# Untitled" is not literally "Untitled"
      // The "#" prefix means markup processing produced "Untitled", not the user

      const removeAliasesSpy = vi.spyOn(
        aliasManager,
        'removePluginAliasesFromFile'
      );

      await aliasManager.addAliasToFile(
        file,
        'Untitled', // titleSourceLine (after processing)
        'filename',
        '# Untitled\nBody', // content
        '# Untitled' // firstNonEmptyLine (before processing - has # prefix)
      );

      // Should remove aliases because "# Untitled" doesn't literally match "Untitled" pattern
      expect(removeAliasesSpy).toHaveBeenCalledWith(file);
    });

    it('should remove aliases when Untitled extracted from template syntax', async () => {
      // First line is template code, but after processing results in "Untitled"
      // Should NOT add alias since original wasn't literally "Untitled"

      const removeAliasesSpy = vi.spyOn(
        aliasManager,
        'removePluginAliasesFromFile'
      );

      await aliasManager.addAliasToFile(
        file,
        'Untitled', // titleSourceLine (result after processing empty template)
        'filename',
        '<%* template code %>\nBody', // content
        '<%* template code %>' // firstNonEmptyLine (template syntax)
      );

      expect(removeAliasesSpy).toHaveBeenCalledWith(file);
    });

    it('should handle card link where firstNonEmptyLine differs from titleSourceLine', async () => {
      // First line is markdown link, titleSourceLine is extracted link text

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
        'Link Title', // titleSourceLine (extracted from link)
        'filename',
        '[Link Title](https://example.com)\nBody', // content
        '[Link Title](https://example.com)' // firstNonEmptyLine
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

    it('should keep array format for non-aliases properties after removal', async () => {
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

      // Should keep array format for consistency
      expect(capturedFrontmatter.aka).toEqual(['User Value']);
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
        async (f: TFile, callback: (fm: any) => void) => {
          const fm: Record<string, any> = { aliases: [`${zwsp}Plugin${zwsp}`] };
          callback(fm);
        }
      );

      await aliasManager.removePluginAliasesFromFile(file);

      expect(plugin.pendingMetadataUpdates.has(file.path)).toBe(true);
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
        'Title\nBody',
        'Title'
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
        veryLongTitle + '\nBody',
        veryLongTitle
      );

      const zwsp = '\u200B';
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
        title + '\nBody',
        title
      );

      const zwsp = '\u200B';
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
        'Title\nBody',
        'Title'
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
        aliasManager.addAliasToFile(file, title, 'filename', content, title),
        aliasManager.addAliasToFile(file, title, 'filename', content, title),
        aliasManager.addAliasToFile(file, title, 'filename', content, title),
      ]);

      expect(callCount).toBe(3); // All should complete
    });

    it('should handle empty alias property key gracefully', async () => {
      plugin.settings.aliases.aliasPropertyKey = '';

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
        'filename',
        'Title\nBody',
        'Title'
      );

      // Should fall back to 'aliases'
      expect(capturedFrontmatter.aliases).toBeDefined();
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
