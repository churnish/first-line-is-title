/**
 * Tests for MenuDefinitions visibility rules
 *
 * Focus: which of the three items each menu config renders. The disable/enable
 * pair is mutually exclusive - exactly one of the two is offered at a time - and
 * for folders and tags the exclusion strategy inverts which one that is.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Menu as ObsidianMenu } from 'obsidian';
import { Menu, TFile, TFolder } from '../mockObsidian';
import { MenuDefinitions } from '../../src/ui/menu-definitions';
import { MenuConfig, MenuRenderer } from '../../src/ui/menu-config';
import { ContextMenuManager } from '../../src/ui/context-menus';
import {
  DeepPartial,
  EXCLUSION_STRATEGY,
  PluginSettings,
} from '../../src/types';
import { captureMenuItems, createTestSettings } from '../testUtils';

// Icons stand in for item identity: each item in a Flit menu config sets a
// distinct one, and unlike the titles they don't move with the locale.
const PUT_FIRST_LINE_IN_TITLE = 'file-type-corner';
const DISABLE_RENAMING = 'pen-off';
const ENABLE_RENAMING = 'file-pen';

const ICON_FOR_OFFER = {
  disable: DISABLE_RENAMING,
  enable: ENABLE_RENAMING,
} as const;

// Folders and tags share this table: the strategy decides whether being on the
// exclusion list means "renaming is off here" or "renaming is on here", which
// flips which half of the disable/enable pair the menu offers.
const PAIR_CASES = [
  {
    strategy: EXCLUSION_STRATEGY.ONLY_EXCLUDE,
    listed: false,
    offer: 'disable',
  },
  {
    strategy: EXCLUSION_STRATEGY.ONLY_EXCLUDE,
    listed: true,
    offer: 'enable',
  },
  {
    strategy: EXCLUSION_STRATEGY.EXCLUDE_ALL_EXCEPT,
    listed: false,
    offer: 'enable',
  },
  {
    strategy: EXCLUSION_STRATEGY.EXCLUDE_ALL_EXCEPT,
    listed: true,
    offer: 'disable',
  },
] as const;

function createMockPlugin(settingsOverrides: DeepPartial<PluginSettings> = {}) {
  const plugin: any = {
    app: {
      metadataCache: {
        getFileCache: vi.fn(() => null),
      },
    },
    settings: createTestSettings(settingsOverrides),
  };
  // The real manager, not a stub: the folder and tag predicates delegate the
  // strategy-dependent half of their decision to it.
  plugin.contextMenuManager = new ContextMenuManager(plugin);
  return plugin;
}

/** The icons of the items this config renders for this context, in menu order. */
function renderedIcons(config: MenuConfig, context: unknown): string[] {
  const menu = new Menu();
  new MenuRenderer().render(menu as unknown as ObsidianMenu, config, context);
  return captureMenuItems(menu.addItem).map((item) => item.icon);
}

describe('MenuDefinitions', () => {
  describe('getFileMenuConfig', () => {
    const file = new TFile('Notes/note.md');

    function iconsFor(plugin: any): string[] {
      return renderedIcons(new MenuDefinitions(plugin).getFileMenuConfig(), {
        file,
      });
    }

    /** Puts the disable-renaming property at `value`, or removes it entirely. */
    function setDisableRenamingProperty(plugin: any, value: unknown): void {
      plugin.app.metadataCache.getFileCache.mockReturnValue({
        frontmatter:
          value === undefined
            ? { tags: ['inbox'] }
            : { [plugin.settings.exclusions.disableRenamingKey]: value },
      });
    }

    it('should render nothing when note commands are off', () => {
      const plugin = createMockPlugin({ core: { enableFileCommands: false } });
      setDisableRenamingProperty(plugin, undefined);

      expect(iconsFor(plugin)).toEqual([]);
    });

    it('should offer disable when the note has no properties at all', () => {
      const plugin = createMockPlugin();
      plugin.app.metadataCache.getFileCache.mockReturnValue({});

      expect(iconsFor(plugin)).toEqual([
        PUT_FIRST_LINE_IN_TITLE,
        DISABLE_RENAMING,
      ]);
    });

    it('should offer disable when the properties lack the key', () => {
      const plugin = createMockPlugin();
      setDisableRenamingProperty(plugin, undefined);

      expect(iconsFor(plugin)).toEqual([
        PUT_FIRST_LINE_IN_TITLE,
        DISABLE_RENAMING,
      ]);
    });

    it('should offer enable when the value matches, ignoring case', () => {
      const plugin = createMockPlugin({
        exclusions: { disableRenamingValue: 'true' },
      });
      setDisableRenamingProperty(plugin, 'TRUE');

      expect(iconsFor(plugin)).toEqual([
        PUT_FIRST_LINE_IN_TITLE,
        ENABLE_RENAMING,
      ]);
    });

    it('should offer disable when the value is something else', () => {
      const plugin = createMockPlugin({
        exclusions: { disableRenamingValue: 'true' },
      });
      setDisableRenamingProperty(plugin, 'false');

      expect(iconsFor(plugin)).toEqual([
        PUT_FIRST_LINE_IN_TITLE,
        DISABLE_RENAMING,
      ]);
    });

    it.each([
      ['no cache at all', null],
      ['a cache with no properties', {}],
      ['properties without the key', { frontmatter: { tags: ['inbox'] } }],
      ['the key set to the matching value', { frontmatter: { flit: 'true' } }],
      ['the key set in another case', { frontmatter: { flit: 'True' } }],
      ['the key set to another value', { frontmatter: { flit: 'no' } }],
      ['the key set to a boolean', { frontmatter: { flit: true } }],
    ])(
      'should offer exactly one of disable/enable given %s',
      (_label, cache) => {
        const plugin = createMockPlugin({
          exclusions: {
            disableRenamingKey: 'flit',
            disableRenamingValue: 'true',
          },
        });
        plugin.app.metadataCache.getFileCache.mockReturnValue(cache);

        const pair = iconsFor(plugin).filter(
          (icon) => icon === DISABLE_RENAMING || icon === ENABLE_RENAMING
        );

        expect(pair).toHaveLength(1);
      }
    );
  });

  describe('getFolderMenuConfig', () => {
    const folder = new TFolder('Notes');

    function iconsFor(plugin: any): string[] {
      return renderedIcons(new MenuDefinitions(plugin).getFolderMenuConfig(), {
        folder,
      });
    }

    it('should render nothing when folder commands are off', () => {
      const plugin = createMockPlugin({
        core: { enableFolderCommands: false },
      });

      expect(iconsFor(plugin)).toEqual([]);
    });

    // Each expectation names both items in menu order, so it also asserts the
    // other half of the pair stayed hidden.
    it.each(PAIR_CASES)(
      'should offer only the $offer command under $strategy when the folder is listed: $listed',
      ({ strategy, listed, offer }) => {
        const plugin = createMockPlugin({
          exclusions: {
            folderScopeStrategy: strategy,
            excludedFolders: listed ? [folder.path] : [],
          },
        });

        expect(iconsFor(plugin)).toEqual([
          PUT_FIRST_LINE_IN_TITLE,
          ICON_FOR_OFFER[offer],
        ]);
      }
    );
  });

  describe('getTagMenuConfig', () => {
    const tagName = 'project';

    function iconsFor(plugin: any): string[] {
      return renderedIcons(new MenuDefinitions(plugin).getTagMenuConfig(), {
        tagName,
      });
    }

    it('should render nothing when tag commands are off', () => {
      const plugin = createMockPlugin({ core: { enableTagCommands: false } });

      expect(iconsFor(plugin)).toEqual([]);
    });

    it.each(PAIR_CASES)(
      'should offer only the $offer command under $strategy when the tag is listed: $listed',
      ({ strategy, listed, offer }) => {
        // The stored list carries the leading '#'; the context does not.
        const plugin = createMockPlugin({
          exclusions: {
            tagScopeStrategy: strategy,
            excludedTags: listed ? [`#${tagName}`] : [],
          },
        });

        expect(iconsFor(plugin)).toEqual([
          PUT_FIRST_LINE_IN_TITLE,
          ICON_FOR_OFFER[offer],
        ]);
      }
    );
  });
});
