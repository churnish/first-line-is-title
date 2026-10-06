import { App, SettingDefinitionGroup } from 'obsidian';
import { getOwnerWindow } from '../utils/owner-window';

/** Community plugin directory, appended with a plugin ID */
const PLUGIN_DIRECTORY_URL = 'https://community.obsidian.md/plugins/';

/** Carries the target plugin ID on links that point at another plugin */
const PLUGIN_LINK_ATTR = 'data-flit-plugin-link';

/**
 * Link to a plugin's page in the community plugin directory.
 *
 * A plain web link on purpose: `obsidian://` URLs are inert inside the
 * settings window — its own popout since Obsidian 1.13, with no
 * custom-protocol handling — while ordinary `https` links work there.
 */
export function createPluginLink(
  parent: HTMLElement | DocumentFragment,
  pluginId: string,
  label: string
): void {
  parent.createEl('a', {
    text: label,
    href: `${PLUGIN_DIRECTORY_URL}${pluginId}`,
    attr: { [PLUGIN_LINK_ATTR]: pluginId },
  });
}

/**
 * Open the plugin's directory entry inside Obsidian, or leave the click alone
 * and let the browser follow the href.
 *
 * The in-app route is a best-effort enhancement: `app.setting` is undocumented
 * and able to disappear in any release, so a missing one falls through to the
 * link's own destination rather than failing.
 */
function routePluginLinkClick(app: App, event: MouseEvent): void {
  // A modifier-click is the user deliberately asking for a new tab or window,
  // which only the plain href can give them.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const target = event.target as HTMLElement | null;
  const link = target?.closest?.(`[${PLUGIN_LINK_ATTR}]`);
  const pluginId = link?.getAttribute(PLUGIN_LINK_ATTR);
  if (!link || !pluginId) return;

  const setting = app.setting;
  if (typeof setting?.close !== 'function') return;

  event.preventDefault();
  // Dispatched from the main window because the settings window has no
  // custom-protocol handling of its own. `workspace.containerEl` is built from
  // the main document and is never reassigned to a popout.
  const mainWindow = getOwnerWindow(app.workspace.containerEl);

  // The directory entry opens as a modal over the settings pane, which only
  // works while the pane shares the main window. Comparing the clicked link's
  // window is exact where the `settingsPopoutWindow` preference is not: that
  // key stays true on mobile, which never pops settings out.
  if (getOwnerWindow(link) !== mainWindow) setting.close();

  mainWindow.open(`obsidian://show-plugin?id=${pluginId}`);
}

/**
 * Containers Obsidian renders settings rows into — a page's content area, or
 * the tab's own root for rows outside any page.
 */
const SETTINGS_CONTAINER_SELECTOR =
  '.setting-page-content, .vertical-tab-content';

/**
 * Arms plugin-link routing for one settings page.
 *
 * Every page holding a `createPluginLink` needs one of these in its `items`;
 * without it the links still work, they just open in a browser. Per page
 * rather than once per tab because opening a sub-page runs every top-level
 * row's cleanup, which would disarm the listener exactly where it is needed.
 *
 * Wrapped in a hidden group, and appended last, for two structural CSS
 * reasons. A bare row merges into the implicit group of whatever rows sit next
 * to it and — being `:first-child`, which ignores `display: none` — absorbs
 * the exemption that suppresses the divider above the first row, painting a
 * stray line above its neighbour. A hidden group placed first would instead
 * hand the next group an unwanted `margin-top` via `.setting-group +
 * .setting-group`. Rows render before visibility is applied, so the row inside
 * still runs `render` and still registers its cleanup.
 */
export function buildPluginLinkRouterGroup(app: App): SettingDefinitionGroup {
  return {
    type: 'group',
    // The only guard: the row below carries no `visible` of its own, so
    // dropping this predicate surfaces an empty settings row on every page.
    visible: () => false,
    items: [
      {
        name: '',
        searchable: false,
        render: (setting) => {
          // Bound to the enclosing container element, NEVER to a document.
          // Obsidian builds settings rows in the main document and adopts the
          // subtree into the settings window afterwards when that window is
          // separate — the default. Adoption rebinds `ownerDocument` without
          // migrating listeners bound to the old document, so a listener bound
          // to `settingEl.ownerDocument` here lands on the main document and
          // never sees a click in the settings window. Element listeners
          // survive adoption, so the container stays correct either way.
          const host =
            setting.settingEl.closest(SETTINGS_CONTAINER_SELECTOR) ??
            setting.settingEl.ownerDocument;
          const handleClick = (event: MouseEvent) =>
            routePluginLinkClick(app, event);
          host.addEventListener('click', handleClick);
          return () => host.removeEventListener('click', handleClick);
        },
      },
    ],
  };
}
