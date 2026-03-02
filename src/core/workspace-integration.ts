import { TFile, MarkdownView, ViewWithFileEditor } from 'obsidian';
import { around } from 'monkey-around';
import { verboseLog } from '../utils';
import { RenameAllFilesModal } from '../modals';
import FirstLineIsTitle from '../../main';
import { FileCreationCoordinator } from './file-creation-coordinator';
import { t } from '../i18n';

/**
 * WorkspaceIntegration
 *
 * Manages integration with Obsidian workspace UI elements:
 * - Ribbon icons
 * - Command palette customization
 * - Save event hooks
 * - Cursor positioning on file creation
 *
 * Responsibilities:
 * - Register and configure ribbon icons
 * - Add custom icons to command palette
 * - Hook into save events for rename on save
 * - Position cursor on new file creation
 */
export class WorkspaceIntegration {
  private plugin: FirstLineIsTitle;
  private saveCommandPatchCleanup?: () => void;
  private fileCreationCoordinator: FileCreationCoordinator;

  // Track last title insertion to prevent mass insertions when canvas is active
  public lastTitleInsertionTime = 0;
  public readonly TITLE_INSERTION_RATE_LIMIT_MS = 1000; // Only process 1 file per second

  constructor(plugin: FirstLineIsTitle) {
    this.plugin = plugin;
    this.fileCreationCoordinator = new FileCreationCoordinator(plugin);
  }

  get app() {
    return this.plugin.app;
  }

  get settings() {
    return this.plugin.settings;
  }

  get isFullyLoaded() {
    return this.plugin.isFullyLoaded;
  }

  get renameEngine() {
    return this.plugin.renameEngine;
  }

  /**
   * Register ribbon icons
   */
  registerRibbonIcons(): void {
    this.plugin.addRibbonIcon(
      'file-type',
      t('commands.putFirstLineInTitle'),
      () => {
        void this.plugin.commandRegistrar.executeRenameCurrentFile();
      }
    );
    this.plugin.addRibbonIcon(
      'files',
      t('commands.putFirstLineInTitleAllNotes'),
      () => {
        new RenameAllFilesModal(this.app, this.plugin).open();
      }
    );
    this.plugin.addRibbonIcon(
      'file-cog',
      t('commands.toggleAutomaticRenaming'),
      () => {
        void this.plugin.commandRegistrar.executeToggleAutomaticRenaming();
      }
    );
  }

  /**
   * Setup save event hook for rename on save
   */
  setupSaveEventHook(): void {
    // Get the save command
    const saveCommand = this.app.commands?.commands?.['editor:save-file'];
    if (saveCommand?.checkCallback) {
      // Use monkey-around for safe patching that can be uninstalled in any order
      const plugin = this.plugin;
      const settings = this.settings;

      this.saveCommandPatchCleanup = around(saveCommand, {
        checkCallback(original) {
          return function (checking: boolean) {
            // First call the original save logic
            const result = original ? original.call(this, checking) : true;

            // If not checking and save succeeded, run our rename logic - process immediately regardless of check interval
            if (!checking && settings.core.renameOnSave) {
              const activeFile = plugin.app.workspace.getActiveFile();
              if (activeFile && activeFile.extension === 'md') {
                // Run rename (unless excluded) with no delay and show notices like manual command
                setTimeout(() => {
                  void plugin.commandRegistrar.executeRenameUnlessExcluded();
                }, 100); // Small delay to ensure save is complete
              }
            }

            return result;
          };
        },
      });

      verboseLog(this.plugin, 'Save event hook installed for rename on save');
    }
  }

  /**
   * Setup processing for new files - sequential execution after single delay
   */
  setupCursorPositioning(): void {
    // Wait for layout ready before registering create event
    // This ensures we only process genuinely new files, not existing files from vault load
    this.app.workspace.onLayoutReady(() => {
      // Listen for file creation events
      this.plugin.registerEvent(
        this.app.vault.on('create', async (file) => {
          if (!(file instanceof TFile) || file.extension !== 'md') return;

          // Capture plugin reference explicitly for inner function
          const plugin = this.plugin;
          const app = this.app;
          const settings = this.settings.core;

          // Guard: ensure plugin is fully initialized
          if (!plugin?.fileOperations) {
            verboseLog(
              plugin,
              `CREATE: Plugin not fully initialized, skipping ${file.name}`
            );
            return;
          }

          // Guard: check if file still exists at original path
          // Prevents duplicate file creation when CREATE event fires after editor-change already renamed the file
          const currentFile = app.vault.getAbstractFileByPath(file.path);
          if (!currentFile || !(currentFile instanceof TFile)) {
            verboseLog(
              plugin,
              `CREATE: File no longer exists at original path (already renamed), skipping: ${file.path}`
            );
            return;
          }

          // Guard: skip if file was recently renamed (stale CREATE event)
          // Prevents CREATE from processing files that were already processed and renamed by editor-change
          if (plugin.recentlyRenamedPaths.has(file.path)) {
            verboseLog(
              plugin,
              `CREATE: Skipping recently renamed file: ${file.path}`
            );
            return;
          }

          // Define processing function first
          const processFileCreation = async () => {
            // Capture initial content immediately from the specific file's editor
            let initialContent = '';
            try {
              const leaves = app.workspace.getLeavesOfType('markdown');
              for (const leaf of leaves) {
                if (!(leaf.view instanceof MarkdownView)) continue;
                const view = leaf.view;
                if (view.file?.path === file.path && view.editor) {
                  initialContent = view.editor.getValue();
                  verboseLog(
                    plugin,
                    `CREATE: Captured initial editor content for ${file.path}: ${initialContent.length} chars`
                  );
                  break;
                }
              }
            } catch {
              verboseLog(
                plugin,
                `CREATE: Could not read initial editor content`
              );
            }

            verboseLog(
              plugin,
              `CREATE: New file created, processing: ${file.name}`
            );

            try {
              // Canvas rate limiting: prevent mass insertions when canvas creates many files
              const canvasIsActive =
                app.workspace.getMostRecentLeaf()?.view?.getViewType?.() ===
                'canvas';
              if (canvasIsActive) {
                const now = Date.now();
                const timeSinceLastInsertion =
                  now - plugin.workspaceIntegration.lastTitleInsertionTime;

                if (
                  timeSinceLastInsertion <
                  plugin.workspaceIntegration.TITLE_INSERTION_RATE_LIMIT_MS
                ) {
                  verboseLog(
                    plugin,
                    `CREATE: Skipping - rate limited (${timeSinceLastInsertion}ms since last): ${file.name}`
                  );
                  plugin.editorLifecycle.clearCreationDelayTimer(file.path);
                  return;
                }

                plugin.workspaceIntegration.lastTitleInsertionTime = now;
              }

              // Call FileCreationCoordinator to determine actions
              const actions =
                await plugin.workspaceIntegration.fileCreationCoordinator.determineActions(
                  file,
                  {
                    initialContent,
                    pluginLoadTime: plugin.pluginLoadTime,
                  }
                );

              // Execute title insertion and cursor positioning immediately (not affected by newNoteDelay)
              if (actions.shouldInsertTitle) {
                verboseLog(plugin, `CREATE: Inserting title for: ${file.path}`);
                await plugin.fileOperations.insertTitleOnCreation(
                  file,
                  initialContent
                );
              }

              if (actions.shouldMoveCursor) {
                verboseLog(
                  plugin,
                  `CREATE: Moving cursor for: ${file.path} (placeCursorAtEnd: ${actions.placeCursorAtEnd})`
                );

                setTimeout(() => {
                  // Re-check if file has a view after delay
                  const leaves = app.workspace.getLeavesOfType('markdown');
                  let fileHasView = false;
                  for (const leaf of leaves) {
                    if (!(leaf.view instanceof MarkdownView)) continue;
                    if (leaf.view.file?.path === file.path) {
                      fileHasView = true;
                      break;
                    }
                  }

                  if (fileHasView) {
                    // Use coordinator's explicit placeCursorAtEnd decision
                    // This respects the decision tree outcomes from Nodes 16-18
                    void plugin.fileOperations.handleCursorPositioning(
                      file,
                      !actions.shouldInsertTitle,
                      actions.placeCursorAtEnd
                    );
                  } else {
                    verboseLog(
                      plugin,
                      `Skipping cursor positioning - no view found (canvas): ${file.path}`
                    );
                  }
                }, 200);
              }

              // Rename file if automatic mode - respects newNoteDelay setting
              const processRename = async () => {
                try {
                  if (
                    settings.renameNotes === 'automatically' &&
                    plugin.isFullyLoaded
                  ) {
                    verboseLog(
                      plugin,
                      `CREATE: Processing rename after delay: ${file.name}`
                    );

                    // Get current editor content if file is open
                    let editorContent: string | undefined;
                    const leaves = app.workspace.getLeavesOfType('markdown');
                    for (const leaf of leaves) {
                      // Cast to ViewWithFileEditor to access MarkdownView properties
                      const view = leaf.view as ViewWithFileEditor;
                      if (
                        view &&
                        view.file &&
                        view.file.path === file.path &&
                        view.editor
                      ) {
                        const value = view.editor.getValue();
                        if (typeof value === 'string') {
                          editorContent = value;
                        }
                        break;
                      }
                    }
                    // hasActiveEditor=true because we just verified editor exists
                    await plugin.renameEngine.processFile(
                      file,
                      true,
                      false,
                      editorContent,
                      false,
                      undefined,
                      true
                    );
                  }

                  verboseLog(
                    plugin,
                    `CREATE: Completed processing new file: ${file.name}`
                  );
                } catch (error) {
                  console.error(
                    `CREATE: Failed to process rename for ${file.path}:`,
                    error
                  );
                } finally {
                  plugin.editorLifecycle.clearCreationDelayTimer(file.path);
                }
              };

              // Execute rename with delay (if configured)
              if (settings.newNoteDelay === 0) {
                // No delay - process immediately without blocking events
                await processRename();
              } else {
                // Has delay - use timer and block events during delay
                verboseLog(
                  plugin,
                  `CREATE: Scheduling rename in ${settings.newNoteDelay}ms: ${file.name}`
                );
                const timer = setTimeout(() => {
                  void processRename();
                }, settings.newNoteDelay);
                plugin.editorLifecycle.setCreationDelayTimer(file.path, timer);
              }
            } catch (error) {
              console.error(
                `CREATE: Failed to process new file ${file.path}:`,
                error
              );
              plugin.editorLifecycle.clearCreationDelayTimer(file.path);
            }
          }; // End processFileCreation

          await processFileCreation();
        })
      );
    });
  }

  /**
   * Cleanup all workspace integrations
   */
  cleanup(): void {
    // Clean up save event hook using monkey-around's cleanup function
    if (this.saveCommandPatchCleanup) {
      this.saveCommandPatchCleanup();
    }

    // Clear any pending creation delay timers
    this.plugin.editorLifecycle?.clearAllCreationDelayTimers?.();
  }
}
