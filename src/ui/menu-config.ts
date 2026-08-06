import { Menu, MenuItem } from 'obsidian';
import FirstLineIsTitlePlugin from '../../main';

/**
 * Declarative Menu Configuration System
 *
 * Replaces imperative menu building with declarative configuration objects.
 * Benefits:
 * - Reduces code duplication
 * - Easier to maintain and test
 * - Clear separation of menu structure from rendering logic
 * - Self-documenting menu definitions
 */

export interface MenuItemConfig {
  id: string;
  title: string | ((context: unknown) => string);
  icon: string;
  visible: (context: unknown) => boolean;
  onClick: (context: unknown) => void | Promise<void>;
}

export interface MenuConfig {
  items: MenuItemConfig[];
  addSeparator?: boolean;
}

/**
 * Renders menu items from declarative configuration
 */
export class MenuRenderer {
  constructor(private plugin: FirstLineIsTitlePlugin) {}

  /**
   * Render menu items from configuration
   * @param menu Obsidian Menu instance
   * @param config Menu configuration
   * @param context Context object passed to visibility/onClick functions
   */
  render(menu: Menu, config: MenuConfig, context: unknown): void {
    const visibleItems = this.getVisibleItems(config, context);

    if (config.addSeparator && visibleItems.length > 0) {
      menu.addSeparator();
    }

    this.renderItems(
      (cb) => {
        menu.addItem(cb);
      },
      visibleItems,
      context
    );
  }

  /**
   * Render menu items via a bare addItem callback (e.g. a third-party plugin's
   * menu API that doesn't expose the full Obsidian Menu, only addItem).
   */
  renderToAddItem(
    addItem: (cb: (item: MenuItem) => void) => void,
    config: MenuConfig,
    context: unknown
  ): void {
    this.renderItems(addItem, this.getVisibleItems(config, context), context);
  }

  private getVisibleItems(
    config: MenuConfig,
    context: unknown
  ): MenuItemConfig[] {
    return config.items.filter((item) => item.visible(context));
  }

  private renderItems(
    addItem: (cb: (item: MenuItem) => void) => void,
    visibleItems: MenuItemConfig[],
    context: unknown
  ): void {
    for (const itemConfig of visibleItems) {
      addItem((item) => {
        const title =
          typeof itemConfig.title === 'function'
            ? itemConfig.title(context)
            : itemConfig.title;

        item
          .setTitle(title)
          .setIcon(itemConfig.icon)
          .onClick(async () => {
            await itemConfig.onClick(context);
          });
      });
    }
  }

  /**
   * Check if menu has any visible items
   */
  hasVisibleItems(config: MenuConfig, context: unknown): boolean {
    return config.items.some((item) => item.visible(context));
  }
}
