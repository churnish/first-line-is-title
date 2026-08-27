import { Menu, MenuItem } from 'obsidian';

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
}

/**
 * Renders menu items from declarative configuration
 */
export class MenuRenderer {
  /**
   * Render menu items from configuration.
   *
   * Never add a separator before these items. Obsidian buckets section-less menu
   * items — every plugin that skips setSection() — into one group, and buckets
   * separators there too, so injecting one splits that shared group and strands
   * our items in a section of their own.
   *
   * @param menu Obsidian Menu instance
   * @param config Menu configuration
   * @param context Context object passed to visibility/onClick functions
   */
  render(menu: Menu, config: MenuConfig, context: unknown): void {
    this.renderItems(
      (cb) => {
        menu.addItem(cb);
      },
      this.getVisibleItems(config, context),
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
}
