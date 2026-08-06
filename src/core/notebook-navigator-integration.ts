import { TFile, TFolder } from 'obsidian';
import FirstLineIsTitle from '../../main';
import { MenuRenderer } from '../ui/menu-config';
import { MenuDefinitions } from '../ui/menu-definitions';
import { verboseLog } from '../utils';

interface NotebookNavigatorFileMenuCtx {
  addItem: Parameters<MenuRenderer['renderToAddItem']>[0];
  file: TFile;
  selection: { mode: 'single' | 'multiple'; files: TFile[] };
}
interface NotebookNavigatorFolderMenuCtx {
  addItem: Parameters<MenuRenderer['renderToAddItem']>[0];
  folder: TFolder;
}
interface NotebookNavigatorTagMenuCtx {
  addItem: Parameters<MenuRenderer['renderToAddItem']>[0];
  tag: string;
}

interface NotebookNavigatorApi {
  menus?: {
    registerFileMenu?: (
      cb: (ctx: NotebookNavigatorFileMenuCtx) => void
    ) => () => void;
    registerFolderMenu?: (
      cb: (ctx: NotebookNavigatorFolderMenuCtx) => void
    ) => () => void;
    registerTagMenu?: (
      cb: (ctx: NotebookNavigatorTagMenuCtx) => void
    ) => () => void;
  };
  tagCollections?: {
    isCollection?: (tag: string) => boolean;
  };
}

type NotebookNavigatorMenusApi = NonNullable<NotebookNavigatorApi['menus']>;

interface NotebookNavigatorPluginLike {
  api?: NotebookNavigatorApi;
}

/**
 * Optional integration: mirrors Flit's file/folder/tag context-menu items
 * (rename, disable, enable) into Notebook Navigator's own menus, when installed.
 * No-op entirely if Notebook Navigator isn't installed/enabled, or predates
 * the relevant `menus` API version.
 */
export class NotebookNavigatorIntegration {
  private menuRenderer: MenuRenderer;
  private menuDefinitions: MenuDefinitions;
  private disposers: Array<() => void> = [];

  // Identity of the `menus` object currently wired up. `undefined` means no
  // sync has run yet, `null` means synced while Notebook Navigator was absent.
  private registeredAgainst: object | null | undefined = undefined;

  constructor(private plugin: FirstLineIsTitle) {
    this.menuRenderer = new MenuRenderer(plugin);
    this.menuDefinitions = new MenuDefinitions(plugin);
  }

  register(): void {
    this.syncRegistration();

    // Notebook Navigator can load lazily or be enabled mid-session, so a
    // one-shot check at layout-ready would miss it permanently.
    this.plugin.registerEvent(
      this.plugin.app.plugins.on('changed', () => {
        this.syncRegistration();
      })
    );

    this.plugin.register(() => {
      this.disposeAll();
    });
  }

  /**
   * Wires up (or tears down) the menu hooks to match Notebook Navigator's
   * current state. Re-registers against a fresh API object when Notebook
   * Navigator is disabled and re-enabled, since its menu registry is rebuilt.
   */
  private syncRegistration(): void {
    const api = (
      this.plugin.app.plugins.getPlugin(
        'notebook-navigator'
      ) as NotebookNavigatorPluginLike | null
    )?.api;
    const menus = api?.menus ?? null;

    // The plugin-changed event fires for every plugin toggle in the vault, so
    // ignore anything that leaves our wiring unchanged.
    if (menus === this.registeredAgainst) return;

    this.disposeAll();

    if (!api || !menus) {
      this.registeredAgainst = null;
      verboseLog(
        this.plugin,
        'Notebook Navigator not found, skipping menu integration'
      );
      return;
    }

    this.registerMenuHooks(api, menus);
    this.registeredAgainst = menus;
    verboseLog(this.plugin, 'Notebook Navigator menu integration registered');
  }

  private registerMenuHooks(
    api: NotebookNavigatorApi,
    menus: NotebookNavigatorMenusApi
  ): void {
    if (typeof menus.registerFileMenu === 'function') {
      this.disposers.push(
        menus.registerFileMenu(({ addItem, file, selection }) => {
          if (!this.plugin.settings.core.enableContextMenus) return;
          if (selection.mode !== 'single') return;
          if (file.extension !== 'md') return;
          this.menuRenderer.renderToAddItem(
            addItem,
            this.menuDefinitions.getFileMenuConfig(),
            { file }
          );
        })
      );
    }

    if (typeof menus.registerFolderMenu === 'function') {
      this.disposers.push(
        menus.registerFolderMenu(({ addItem, folder }) => {
          if (!this.plugin.settings.core.enableContextMenus) return;
          this.menuRenderer.renderToAddItem(
            addItem,
            this.menuDefinitions.getFolderMenuConfig(),
            { folder }
          );
        })
      );
    }

    if (typeof menus.registerTagMenu === 'function') {
      this.disposers.push(
        menus.registerTagMenu(({ addItem, tag }) => {
          if (!this.plugin.settings.core.enableContextMenus) return;
          if (api.tagCollections?.isCollection?.(tag)) return;
          this.menuRenderer.renderToAddItem(
            addItem,
            this.menuDefinitions.getTagMenuConfig(),
            { tagName: this.resolveCanonicalTag(tag) }
          );
        })
      );
    }
  }

  private disposeAll(): void {
    for (const dispose of this.disposers) {
      try {
        dispose();
      } catch (error) {
        // A disposer owned by an unloaded Notebook Navigator instance must
        // never break our own teardown.
        console.error('Failed to dispose Notebook Navigator menu hook:', error);
      }
    }
    this.disposers = [];
  }

  /**
   * NN hands back tag ids lowercased and stripped of '#' (its own normalization).
   * Flit's exclusion logic (shouldShowDisableMenuForTag, toggleTagExclusion,
   * rename-time matching) is case-sensitive, so resolve back to the vault's
   * actual tag casing to avoid inert case-mismatched exclusion entries.
   */
  private resolveCanonicalTag(nnTag: string): string {
    const bare = nnTag.replace(/^#/, '').toLowerCase();
    const allTags = Object.keys(this.plugin.app.metadataCache.getTags());
    const match = allTags.find(
      (tag) => tag.replace(/^#/, '').toLowerCase() === bare
    );
    return match ? match.replace(/^#/, '') : nnTag;
  }
}
