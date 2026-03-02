import { Menu, TFile, TFolder, MarkdownView, EventRef } from 'obsidian';
import FirstLineIsTitlePlugin from '../../main';
import { verboseLog, isOnlyFrontmatterChanged } from '../utils';
import { tp } from '../i18n';
import { RenameModal, DisableEnableModal } from '../modals';
import { around } from 'monkey-around';
import { detectTagFromDOM, detectTagFromEditor } from '../utils/tag-detection';

/**

/**
 * Extended Workspace interface with undocumented search results event
 */
interface WorkspaceWithSearchEvents {
  on(
    name: 'search:results-menu',
    callback: (menu: Menu, leaf: Record<string, unknown>) => void
  ): EventRef;
}

/**
 * Manages all event handler registration for the First Line is Title plugin.
 * Centralizes event handler logic previously scattered in main.ts.
 */
export class EventHandlerManager {
  private plugin: FirstLineIsTitlePlugin;
  /** Tracks files with alias updates in progress to prevent concurrent updates */
  private pendingAliasUpdates: Set<string> = new Set();

  constructor(plugin: FirstLineIsTitlePlugin) {
    this.plugin = plugin;
  }

  /**
   * Check if alias update is in progress for a file.
   * Used by rename-engine to coordinate with event handlers.
   */
  isAliasUpdatePending(path: string): boolean {
    return this.pendingAliasUpdates.has(path);
  }

  /**
   * Mark alias update as in progress for a file.
   * Used by rename-engine to coordinate with event handlers.
   */
  markAliasUpdatePending(path: string): void {
    this.pendingAliasUpdates.add(path);
  }

  /**
   * Clear alias update in progress flag for a file.
   * Used by rename-engine to coordinate with event handlers.
   */
  clearAliasUpdatePending(path: string): void {
    this.pendingAliasUpdates.delete(path);
  }

  /**
   * Register all event handlers for the plugin.
   * Called during plugin load.
   * Note: Obsidian automatically manages event cleanup via Plugin.registerEvent().
   */
  registerAllHandlers(): void {
    this.registerFileMenuHandler();
    this.registerFilesMenuHandler();
    this.registerEditorMenuHandler();
    this.registerTagSearchMenuHandler();
    this.registerSearchResultsMenuHandler();
    this.registerEditorChangeHandler();
    this.registerFileSystemHandlers();
  }

  /**
   * File menu handler - single file/folder context menu
   */
  private registerFileMenuHandler(): void {
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('file-menu', (menu, file) => {
        if (!this.plugin.settings.core.enableContextMenus) return;

        if (file instanceof TFile && file.extension === 'md') {
          this.plugin.contextMenuManager.addFileMenuItems(menu, file);
        } else if (file instanceof TFolder) {
          this.plugin.contextMenuManager.addFolderMenuItems(menu, file);
        }
      })
    );
  }

  /**
   * Files menu handler - multiple files/folders selection
   */
  private registerFilesMenuHandler(): void {
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('files-menu', (menu, files) => {
        if (!this.plugin.settings.core.enableContextMenus) return;

        const markdownFiles = files.filter(
          (file): file is TFile =>
            file instanceof TFile && file.extension === 'md'
        );
        const folders = files.filter(
          (file): file is TFolder => file instanceof TFolder
        );

        // If both files and folders are selected, don't show any commands
        if (markdownFiles.length > 0 && folders.length > 0) return;
        if (markdownFiles.length === 0 && folders.length === 0) return;

        let hasVisibleItems = false;

        // Handle multiple markdown files
        if (markdownFiles.length > 0) {
          if (
            this.plugin.settings.core.commandVisibility.filePutFirstLineInTitle
          ) {
            if (!hasVisibleItems) {
              menu.addSeparator();
              hasVisibleItems = true;
            }
            menu.addItem((item) => {
              item
                .setTitle(
                  tp('commands.putFirstLineInTitleNNotes', markdownFiles.length)
                )
                .setIcon('file-type')
                .onClick(() => {
                  new RenameModal(
                    this.plugin.app,
                    this.plugin,
                    markdownFiles
                  ).open();
                });
            });
          }

          if (this.plugin.settings.core.commandVisibility.fileExclude) {
            if (!hasVisibleItems) {
              menu.addSeparator();
              hasVisibleItems = true;
            }
            menu.addItem((item) => {
              item
                .setTitle(
                  tp('commands.disableRenamingNNotes', markdownFiles.length)
                )
                .setIcon('square-x')
                .onClick(() => {
                  new DisableEnableModal(
                    this.plugin.app,
                    this.plugin,
                    markdownFiles,
                    'disable'
                  ).open();
                });
            });
          }

          if (this.plugin.settings.core.commandVisibility.fileStopExcluding) {
            if (!hasVisibleItems) {
              menu.addSeparator();
              hasVisibleItems = true;
            }
            menu.addItem((item) => {
              item
                .setTitle(
                  tp('commands.enableRenamingNNotes', markdownFiles.length)
                )
                .setIcon('square-check')
                .onClick(() => {
                  new DisableEnableModal(
                    this.plugin.app,
                    this.plugin,
                    markdownFiles,
                    'enable'
                  ).open();
                });
            });
          }
        }

        // Handle multiple folders
        if (folders.length > 1) {
          this.plugin.contextMenuManager.addMultiFolderMenuItems(menu, folders);
        }
      })
    );
  }

  /**
   * Editor menu handler - tag context menus in editor.
   * Uses unified tag detection for hashtags in note body.
   */
  private registerEditorMenuHandler(): void {
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('editor-menu', (menu, editor, view) => {
        if (!this.plugin.settings.core.enableContextMenus) return;
        if (!(view instanceof MarkdownView)) return;

        const pos = editor.getCursor();
        const line = editor.getLine(pos.line);
        const tagName = detectTagFromEditor(line, pos.ch);

        if (tagName) {
          this.plugin.contextMenuManager.addTagMenuItems(menu, tagName);
        }
      })
    );
  }

  /**
   * Unified tag context menu handler using event delegation.
   * Handles both tag pane and YAML frontmatter tags with a single DOM listener.
   */
  private registerTagSearchMenuHandler(): void {
    // Single event-delegated handler for all DOM-based tag contexts
    this.plugin.registerDomEvent(document, 'contextmenu', (evt) => {
      if (!this.plugin.settings.core.enableContextMenus) return;

      if (!(evt.target instanceof HTMLElement)) return;
      const target = evt.target;
      const tagInfo = detectTagFromDOM(target);

      if (!tagInfo) return;

      // Different handling based on where tag was found
      if (tagInfo.location === 'tag-pane') {
        // Tag pane: use Tag Wrangler's menuForEvent pattern
        const menu = this.plugin.contextMenuManager.menuForEvent(evt);
        this.plugin.contextMenuManager.addTagMenuItems(menu, tagInfo.tagName);
      } else if (tagInfo.location === 'yaml') {
        // YAML tags: use monkey-patching to inject into Obsidian's native menu
        const plugin = this.plugin;
        const remove = around(Menu.prototype, {
          showAtPosition(old) {
            return function (...args) {
              remove();
              plugin.contextMenuManager.addTagMenuItems(this, tagInfo.tagName);
              return old.apply(this, args);
            };
          },
        });
      }
    });
  }

  /**
   * Search results menu handler
   */
  private registerSearchResultsMenuHandler(): void {
    this.plugin.registerEvent(
      (this.plugin.app.workspace as unknown as WorkspaceWithSearchEvents).on(
        'search:results-menu',
        (menu: Menu, leaf: Record<string, unknown>) => {
          if (!this.plugin.settings.core.enableVaultSearchContextMenu) return;

          // Extract files from search results DOM structure
          let files: TFile[] = [];
          if (
            leaf.dom &&
            typeof leaf.dom === 'object' &&
            'vChildren' in leaf.dom &&
            leaf.dom.vChildren &&
            typeof leaf.dom.vChildren === 'object' &&
            'children' in leaf.dom.vChildren &&
            Array.isArray(leaf.dom.vChildren.children)
          ) {
            leaf.dom.vChildren.children.forEach(
              (e: Record<string, unknown>) => {
                if (
                  e.file &&
                  e.file instanceof TFile &&
                  e.file.extension === 'md'
                ) {
                  files.push(e.file);
                }
              }
            );
          }

          if (files.length < 1) return;

          let hasVisibleItems = false;

          if (
            this.plugin.settings.core.vaultSearchContextMenuVisibility
              .putFirstLineInTitle
          ) {
            if (!hasVisibleItems) {
              menu.addSeparator();
              hasVisibleItems = true;
            }
            menu.addItem((item) => {
              item
                .setTitle(
                  tp('commands.putFirstLineInTitleNNotes', files.length)
                )
                .setIcon('file-type')
                .onClick(() => {
                  new RenameModal(this.plugin.app, this.plugin, files).open();
                });
            });
          }

          if (
            this.plugin.settings.core.vaultSearchContextMenuVisibility.disable
          ) {
            if (!hasVisibleItems) {
              menu.addSeparator();
              hasVisibleItems = true;
            }
            menu.addItem((item) => {
              item
                .setTitle(tp('commands.disableRenamingNNotes', files.length))
                .setIcon('square-x')
                .onClick(() => {
                  new DisableEnableModal(
                    this.plugin.app,
                    this.plugin,
                    files,
                    'disable'
                  ).open();
                });
            });
          }

          if (
            this.plugin.settings.core.vaultSearchContextMenuVisibility.enable
          ) {
            if (!hasVisibleItems) {
              menu.addSeparator();
              hasVisibleItems = true;
            }
            menu.addItem((item) => {
              item
                .setTitle(tp('commands.enableRenamingNNotes', files.length))
                .setIcon('square-check')
                .onClick(() => {
                  new DisableEnableModal(
                    this.plugin.app,
                    this.plugin,
                    files,
                    'enable'
                  ).open();
                });
            });
          }
        }
      )
    );
  }

  /**
   * Editor change handler - processes file changes in real-time
   */
  private registerEditorChangeHandler(): void {
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('editor-change', (editor, info) => {
        if (this.plugin.settings.core.verboseLogging) {
          console.debug(
            `Editor change detected for file: ${info.file?.path || 'unknown'}`
          );
        }

        if (this.plugin.settings.core.renameNotes !== 'automatically') {
          if (this.plugin.settings.core.verboseLogging) {
            console.debug(
              `Skipping editor-change: renameNotes=${this.plugin.settings.core.renameNotes}`
            );
          }
          return;
        }

        if (!info.file) {
          if (this.plugin.settings.core.verboseLogging) {
            console.debug(`Skipping editor-change: no file in info`);
          }
          return;
        }

        if (info.file.extension !== 'md') {
          if (this.plugin.settings.core.verboseLogging) {
            console.debug(
              `Skipping editor-change: not markdown (${info.file.extension})`
            );
          }
          return;
        }

        // Early exit if still within creation delay window
        if (info.file && editor) {
          if (
            this.plugin.editorLifecycle.isFileInCreationDelay(info.file.path)
          ) {
            if (this.plugin.settings.core.verboseLogging) {
              console.debug(
                `Skipping editor-change: file in creation delay: ${info.file.path}`
              );
            }
            return;
          }
        }

        if (!this.plugin.isFullyLoaded) {
          if (this.plugin.settings.core.verboseLogging) {
            console.debug(`Skipping editor-change: plugin not fully loaded`);
          }
          return;
        }

        // Use optimal editor change handler
        this.plugin.editorLifecycle.handleEditorChangeWithThrottle(
          editor,
          info.file
        );
      })
    );
  }

  /**
   * File system event handlers (rename, delete, modify)
   */
  private registerFileSystemHandlers(): void {
    // File rename handler
    this.plugin.registerEvent(
      this.plugin.app.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFile && file.extension === 'md') {
          // Update file state
          this.plugin.fileStateManager?.notifyFileRenamed(oldPath, file.path);

          // Update cache
          if (this.plugin.cacheManager) {
            this.plugin.cacheManager.notifyFileRenamed(oldPath, file.path);
          }

          // Clean up pendingAliasUpdates for old path (state moved to new path)
          this.pendingAliasUpdates.delete(oldPath);

          verboseLog(
            this.plugin,
            `File renamed, updated cache: ${oldPath} -> ${file.path}`
          );
        }
      })
    );

    // File delete handler
    this.plugin.registerEvent(
      this.plugin.app.vault.on('delete', (file) => {
        if (file instanceof TFile) {
          this.plugin.cacheManager?.notifyFileDeleted(file.path);
          this.plugin.editorLifecycle.clearCreationDelayTimer(file.path);
          this.plugin.fileStateManager?.notifyFileDeleted(file.path);
          // Clean up pendingAliasUpdates to prevent memory leak and blocking
          this.pendingAliasUpdates.delete(file.path);
        }
      })
    );

    // File modify handler
    this.plugin.registerEvent(
      this.plugin.app.vault.on('modify', async (file) => {
        if (!(file instanceof TFile)) return;
        if (file.extension !== 'md') return;

        // Skip if file operation in progress (rename, etc.)
        if (this.plugin.cacheManager?.isLocked(file.path)) return;

        // Skip if file is in creation delay period
        if (this.plugin.editorLifecycle.isFileInCreationDelay(file.path)) {
          verboseLog(
            this.plugin,
            `Skipping modify: file in creation delay: ${file.path}`
          );
          return;
        }

        // Process rename for Cache/File modes (catches cache updates after save)
        if (
          this.plugin.settings.core.fileReadMethod === 'Cache' ||
          this.plugin.settings.core.fileReadMethod === 'File'
        ) {
          if (
            this.plugin.settings.core.renameNotes === 'automatically' &&
            this.plugin.isFullyLoaded
          ) {
            verboseLog(
              this.plugin,
              `Modify event: processing ${file.path} (fileReadMethod: ${this.plugin.settings.core.fileReadMethod})`
            );
            await this.plugin.renameEngine.processFile(file, true);
          }
        }

        // Update aliases if enabled (respects manual/automatic mode)
        // Note: Alias updates happen on save events only (not every keystroke) to reduce
        // "modified externally" notifications from processFrontMatter writes.
        if (
          this.plugin.settings.aliases.enableAliases &&
          this.plugin.settings.core.renameNotes === 'automatically'
        ) {
          // Skip if file has pending metadata update from processFrontMatter
          const hasPending = this.plugin.pendingMetadataUpdates.has(file);
          verboseLog(
            this.plugin,
            `// PENDING_META_CHECK (modify): Checking ${file.path} in pendingMetadataUpdates → ${hasPending}`
          );
          if (hasPending) {
            return;
          }

          // Skip if alias update already in progress for this file
          if (this.pendingAliasUpdates.has(file.path)) {
            return;
          }

          // Mark as in-progress BEFORE any async operation to prevent race
          // between modify and metadata-changed handlers
          this.pendingAliasUpdates.add(file.path);
          try {
            let currentContent: string;
            try {
              currentContent = await this.plugin.app.vault.read(file);
            } catch {
              // File was deleted or inaccessible - clean up and return
              this.pendingAliasUpdates.delete(file.path);
              return;
            }

            // Skip if only frontmatter changed (user manually editing YAML)
            // Use lastSavedContent - represents content from PREVIOUS save, not current editor buffer
            const previousContent =
              this.plugin.fileStateManager.getLastSavedContent(file.path);
            if (
              previousContent &&
              !this.plugin.fileStateManager.isSavedContentStale(file.path) &&
              isOnlyFrontmatterChanged(currentContent, previousContent)
            ) {
              verboseLog(
                this.plugin,
                `Skipping modify-alias update - only frontmatter edited: ${file.path}`
              );
              // Still update lastSavedContent even when skipping
              this.plugin.fileStateManager.setLastSavedContent(
                file.path,
                currentContent
              );
              return;
            }

            // Get editor if active view matches the file being updated
            const activeView =
              this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
            const editor =
              activeView?.file === file ? activeView.editor : undefined;

            verboseLog(
              this.plugin,
              `// EDITOR_LOOKUP (modify): activeView=${!!activeView}, activeView.file=${activeView?.file?.path ?? 'none'}, target=${file.path}, match=${activeView?.file === file}`
            );
            verboseLog(
              this.plugin,
              `// EDITOR_PASS (modify): Passing editor=${editor ? 'defined' : 'undefined'} to updateAliasIfNeeded`
            );

            const aliasUpdateSucceeded =
              await this.plugin.aliasManager.updateAliasIfNeeded(
                file,
                currentContent,
                undefined,
                editor
              );
            this.plugin.fileStateManager.setLastAliasUpdateStatus(
              file.path,
              aliasUpdateSucceeded
            );

            // Update lastSavedContent after processing
            this.plugin.fileStateManager.setLastSavedContent(
              file.path,
              currentContent
            );
          } finally {
            this.pendingAliasUpdates.delete(file.path);
          }
        }
      })
    );

    // Metadata change handler
    this.plugin.registerEvent(
      this.plugin.app.metadataCache.on('changed', async (file) => {
        if (!this.plugin.settings.aliases.enableAliases) return;
        if (this.plugin.settings.core.renameNotes !== 'automatically') return;
        if (file.extension !== 'md') return;

        // Skip if file operation in progress (rename, etc.)
        if (this.plugin.cacheManager?.isLocked(file.path)) return;

        // Skip if file is in creation delay period
        if (this.plugin.editorLifecycle.isFileInCreationDelay(file.path)) {
          if (this.plugin.settings.core.verboseLogging) {
            console.debug(
              `Skipping metadata-alias: file in creation delay: ${file.path}`
            );
          }
          return;
        }

        // Clear pending metadata flag FIRST - before any other checks that might return early
        // This ensures the flag is cleared when metadataCache processes our processFrontMatter write
        if (this.plugin.pendingMetadataUpdates.has(file)) {
          this.plugin.pendingMetadataUpdates.delete(file);
          verboseLog(
            this.plugin,
            `// PENDING_META_CLEAR: Clearing ${file.path} from pendingMetadataUpdates (set size: ${this.plugin.pendingMetadataUpdates.size})`
          );
          // Don't return - continue to check if alias update is needed
        }

        // Skip if alias update already in progress for this file
        if (this.pendingAliasUpdates.has(file.path)) {
          return;
        }

        // Mark as in-progress BEFORE any async operation to prevent race
        // between modify and metadata-changed handlers
        this.pendingAliasUpdates.add(file.path);
        try {
          // Check if only frontmatter changed - skip alias update to preserve YAML formatting
          let currentContent: string;
          try {
            currentContent = await this.plugin.app.vault.read(file);
          } catch {
            // File was deleted or inaccessible - clean up and return
            this.pendingAliasUpdates.delete(file.path);
            return;
          }

          // Use lastSavedContent - represents content from PREVIOUS save, not current editor buffer
          const previousContent =
            this.plugin.fileStateManager.getLastSavedContent(file.path);

          // Check for stale content comparison - skip if previous content is too old
          const contentIsStale =
            this.plugin.fileStateManager.isSavedContentStale(file.path);

          if (previousContent && !contentIsStale) {
            // Only skip if body unchanged AND last alias update succeeded AND status not stale
            // If last update was skipped (e.g., popover/canvas), retry now
            const lastUpdateSucceeded =
              this.plugin.fileStateManager.getLastAliasUpdateStatus(file.path);
            const statusIsStale =
              this.plugin.fileStateManager.isAliasStatusStale(file.path);
            if (
              isOnlyFrontmatterChanged(currentContent, previousContent) &&
              lastUpdateSucceeded &&
              !statusIsStale
            ) {
              if (this.plugin.settings.core.verboseLogging) {
                console.debug(
                  `Skipping metadata-alias update - only frontmatter edited: ${file.path}`
                );
              }
              // Still update lastSavedContent even when skipping
              this.plugin.fileStateManager.setLastSavedContent(
                file.path,
                currentContent
              );
              return;
            }
          }
          // If no previousContent, this is first save we're tracking
          // Proceed with alias update since we can't determine if YAML-only edit
          // If contentIsStale, proceed with alias update (don't rely on stale comparison)

          // Get editor if active view matches the file being updated
          const activeView =
            this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
          const editor =
            activeView?.file === file ? activeView.editor : undefined;

          verboseLog(
            this.plugin,
            `// EDITOR_LOOKUP (metadata): activeView=${!!activeView}, activeView.file=${activeView?.file?.path ?? 'none'}, target=${file.path}, match=${activeView?.file === file}`
          );
          verboseLog(
            this.plugin,
            `// EDITOR_PASS (metadata): Passing editor=${editor ? 'defined' : 'undefined'} to updateAliasIfNeeded`
          );

          const aliasUpdateSucceeded =
            await this.plugin.aliasManager.updateAliasIfNeeded(
              file,
              currentContent,
              undefined,
              editor
            );
          this.plugin.fileStateManager.setLastAliasUpdateStatus(
            file.path,
            aliasUpdateSucceeded
          );

          // Update lastSavedContent after processing
          this.plugin.fileStateManager.setLastSavedContent(
            file.path,
            currentContent
          );
        } finally {
          this.pendingAliasUpdates.delete(file.path);
        }
      })
    );
  }
}
