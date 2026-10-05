/**
 * Tests for MenuRenderer
 *
 * Focus: the renderer adds plain items and nothing else. Obsidian buckets every
 * section-less menu item - ours and every other plugin's - into one shared group,
 * and buckets separators there too, so a single separator would split that group
 * and strand our items below a divider.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Menu as ObsidianMenu } from 'obsidian';
import { Menu } from '../mockObsidian';
import {
  MenuConfig,
  MenuItemConfig,
  MenuRenderer,
} from '../../src/ui/menu-config';
import { captureMenuItems } from '../testUtils';

function createItemConfig(
  overrides: Partial<MenuItemConfig> = {}
): MenuItemConfig {
  return {
    id: 'flit-item',
    title: 'Flit item',
    icon: 'file-pen',
    visible: () => true,
    onClick: () => {},
    ...overrides,
  };
}

/** Three items, the middle one hidden. */
function createPartiallyVisibleConfig(): MenuConfig {
  return {
    items: [
      createItemConfig({ id: 'first', title: 'First' }),
      createItemConfig({ id: 'second', title: 'Second', visible: () => false }),
      createItemConfig({ id: 'third', title: 'Third' }),
    ],
  };
}

describe('MenuRenderer', () => {
  let renderer: MenuRenderer;
  let menu: Menu;

  beforeEach(() => {
    renderer = new MenuRenderer();
    menu = new Menu();
  });

  describe('render', () => {
    it('should render only the items whose visible predicate passes', () => {
      renderer.render(
        menu as unknown as ObsidianMenu,
        createPartiallyVisibleConfig(),
        {}
      );

      expect(menu.addItem).toHaveBeenCalledTimes(2);
      expect(captureMenuItems(menu.addItem).map((item) => item.title)).toEqual([
        'First',
        'Third',
      ]);
    });

    it('should add no separator, which would split the section-less group Obsidian shares between plugins', () => {
      renderer.render(
        menu as unknown as ObsidianMenu,
        createPartiallyVisibleConfig(),
        {}
      );

      expect(menu.addSeparator).not.toHaveBeenCalled();
    });

    it('should resolve a function title with the context', () => {
      const context = { tagName: 'project' };
      const config: MenuConfig = {
        items: [
          createItemConfig({
            title: (ctx) => `Disable ${(ctx as typeof context).tagName}`,
          }),
        ],
      };

      renderer.render(menu as unknown as ObsidianMenu, config, context);

      expect(captureMenuItems(menu.addItem)[0].title).toBe('Disable project');
    });

    it('should await the config onClick when the rendered item is clicked', async () => {
      const context = { file: 'note.md' };
      // Two microtask hops: a renderer that fired the handler without awaiting it
      // would settle its own promise before `finished` was ever set.
      let finished = false;
      const onClick = vi.fn(async () => {
        await Promise.resolve();
        await Promise.resolve();
        finished = true;
      });
      const config: MenuConfig = { items: [createItemConfig({ onClick })] };

      renderer.render(menu as unknown as ObsidianMenu, config, context);
      await captureMenuItems(menu.addItem)[0].click();

      expect(onClick).toHaveBeenCalledWith(context);
      expect(finished).toBe(true);
    });

    it('should not touch the menu at all when every item is hidden', () => {
      const config: MenuConfig = {
        items: [
          createItemConfig({ id: 'first', visible: () => false }),
          createItemConfig({ id: 'second', visible: () => false }),
        ],
      };

      renderer.render(menu as unknown as ObsidianMenu, config, {});

      expect(menu.addItem).not.toHaveBeenCalled();
      expect(menu.addSeparator).not.toHaveBeenCalled();
    });
  });

  describe('renderToAddItem', () => {
    it('should render the same visible items as render', () => {
      renderer.renderToAddItem(
        (cb) => {
          menu.addItem(cb);
        },
        createPartiallyVisibleConfig(),
        {}
      );

      expect(menu.addItem).toHaveBeenCalledTimes(2);
      expect(captureMenuItems(menu.addItem).map((item) => item.title)).toEqual([
        'First',
        'Third',
      ]);
    });

    it('should add no separator when rendering into a third-party addItem either', () => {
      renderer.renderToAddItem(
        (cb) => {
          menu.addItem(cb);
        },
        createPartiallyVisibleConfig(),
        {}
      );

      expect(menu.addSeparator).not.toHaveBeenCalled();
    });
  });
});
