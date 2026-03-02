import { TFile, Editor, Notice, MarkdownView } from 'obsidian';
import { TitleRegionCache } from '../types';
import { TIMING, LIMITS } from '../constants/timing';
import {
  verboseLog,
  detectOS,
  shouldProcessFile,
  canModifyFile,
  containsSafeword,
  extractTitle,
  isValidHeading,
  findTitleSourceLine,
  processForbiddenChars,
  isOnlyFrontmatterChanged,
} from '../utils';
import { t } from '../i18n';
import { RateLimiter } from './rate-limiter';
import { readFileContent } from '../utils/content-reader';

import FirstLineIsTitle from '../../main';

export class RenameEngine {
  private plugin: FirstLineIsTitle;

  private perFileRateLimiter: RateLimiter;
  private globalRateLimiter: RateLimiter;

  constructor(plugin: FirstLineIsTitle) {
    this.plugin = plugin;

    this.perFileRateLimiter = new RateLimiter({
      windowMs: 500,
      maxOperations: 15,
    });

    this.globalRateLimiter = new RateLimiter({
      windowMs: 500,
      maxOperations: 30,
    });
  }

  checkFileTimeLimit(file: TFile): boolean {
    return this.perFileRateLimiter.checkLimit(file.path, file.path);
  }

  checkGlobalRateLimit(): boolean {
    return this.globalRateLimiter.checkGlobalLimit();
  }

  /**
   * Update alias for a file with coordination to prevent concurrent updates.
   * Used by manual commands to ensure alias stays in sync with filename.
   * Coordinates with event-handler-manager's pendingAliasUpdates to prevent double-processing.
   *
   * @param file - The file to update alias for
   * @param isManualCommand - Whether this is a manual command (determines if we should update)
   * @returns true if alias was updated, false if skipped
   */
  private async updateAliasWithCoordination(
    file: TFile,
    _isManualCommand: boolean
  ): Promise<boolean> {
    // Update alias when aliases are enabled (for both manual and automatic modes)
    if (!this.plugin.settings.aliases.enableAliases) {
      return false;
    }

    // Check if event handler already has an update in progress
    if (this.plugin.eventHandlerManager?.isAliasUpdatePending(file.path)) {
      verboseLog(
        this.plugin,
        `Skipping alias update - event handler already processing: ${file.path}`
      );
      return false;
    }

    // Mark as in-progress to prevent event handlers from double-processing
    this.plugin.eventHandlerManager?.markAliasUpdatePending(file.path);

    try {
      // Get editor if active view matches the file being updated
      const activeView =
        this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
      const editor = activeView?.file === file ? activeView.editor : undefined;

      verboseLog(
        this.plugin,
        `// EDITOR_LOOKUP (manual): activeView=${!!activeView}, activeView.file=${activeView?.file?.path ?? 'none'}, target=${file.path}, match=${activeView?.file === file}`
      );
      verboseLog(
        this.plugin,
        `// EDITOR_PASS (manual): Passing editor=${editor ? 'defined' : 'undefined'} to updateAliasIfNeeded`
      );

      const aliasResult = await this.plugin.aliasManager.updateAliasIfNeeded(
        file,
        undefined,
        undefined,
        editor
      );
      this.plugin.fileStateManager.setLastAliasUpdateStatus(
        file.path,
        aliasResult
      );
      return aliasResult;
    } finally {
      this.plugin.eventHandlerManager?.clearAliasUpdatePending(file.path);
    }
  }

  async processEditorChangeOptimal(editor: Editor, file: TFile): Promise<void> {
    this.plugin.trackUsage();
    const startTime = Date.now();

    try {
      if (this.plugin.cacheManager?.isLocked(file.path)) {
        if (this.plugin.settings.core.verboseLogging) {
          console.debug(
            `Editor change ignored - file operation in progress: ${file.path}`
          );
        }
        // Only mark for recheck if not from our own background editor sync
        // This prevents setValue() on background editors from scheduling spurious rechecks
        if (!this.plugin.fileStateManager.isEditorSyncing(file.path)) {
          this.plugin.cacheManager?.markPendingAliasRecheck(file.path);
        } else if (this.plugin.settings.core.verboseLogging) {
          console.debug(
            `Skipping recheck - editor-change from background editor sync: ${file.path}`
          );
        }
        return;
      }

      // Always use editor content for change detection (avoid cache staleness)
      const currentContent = editor.getValue();

      // Detect if only frontmatter changed (skip processing to preserve YAML formatting)
      const previousContent = this.plugin.fileStateManager.getLastEditorContent(
        file.path
      );
      if (previousContent) {
        if (isOnlyFrontmatterChanged(currentContent, previousContent)) {
          if (this.plugin.settings.core.verboseLogging) {
            console.debug(`Skipping - only frontmatter edited: ${file.path}`);
          }
          this.plugin.fileStateManager.setLastEditorContent(
            file.path,
            currentContent
          );
          return;
        }
      } else {
        // First editor event - compare editor vs disk to detect actual edits
        const diskContent = await this.plugin.app.vault.read(file);

        if (isOnlyFrontmatterChanged(currentContent, diskContent)) {
          // No body edits (or YAML-only edit) - skip processing
          if (this.plugin.settings.core.verboseLogging) {
            console.debug(
              `Skipping - no body edits detected on first open: ${file.path}`
            );
          }
          // Initialize tracking for next edit
          const currentTitleRegion = this.extractTitleRegion(
            editor,
            file,
            currentContent
          );
          this.plugin.fileStateManager.setLastEditorContent(
            file.path,
            currentContent
          );
          this.plugin.fileStateManager.setTitleRegionCache(
            file.path,
            currentTitleRegion
          );
          return;
        }

        // Body content differs from disk - user edited body, proceed with processing
        if (this.plugin.settings.core.verboseLogging) {
          console.debug(`Body edited, will process: ${file.path}`);
        }
      }

      // Extract title region and check cache
      const currentTitleRegion = this.extractTitleRegion(
        editor,
        file,
        currentContent
      );
      const cachedTitleRegion =
        this.plugin.fileStateManager.getTitleRegionCache(file.path);

      if (
        cachedTitleRegion &&
        currentTitleRegion.firstNonEmptyLine ===
          cachedTitleRegion.firstNonEmptyLine &&
        currentTitleRegion.titleSourceLine === cachedTitleRegion.titleSourceLine
      ) {
        if (this.plugin.settings.core.verboseLogging) {
          console.debug(
            `Title region unchanged - skipping processing: ${file.path}`
          );
        }

        // Still process aliases if alias settings changed (edge case)
        // For now, skip all processing when title region unchanged
        return;
      }

      // Update lastEditorContent only when we're about to process
      // (prevents alias/metadata handlers from incorrectly skipping)
      this.plugin.fileStateManager.setLastEditorContent(
        file.path,
        currentContent
      );
      this.plugin.fileStateManager.setTitleRegionCache(
        file.path,
        currentTitleRegion
      );
      if (this.plugin.settings.core.verboseLogging) {
        console.debug(`Title region changed - processing: ${file.path}`, {
          previous: cachedTitleRegion,
          current: currentTitleRegion,
        });
      }

      const metadata = this.plugin.app.metadataCache.getFileCache(file);
      const timeSinceStart = Date.now() - startTime;
      if (this.plugin.settings.core.verboseLogging) {
        console.debug(
          `[TIMING] Content changed in ${timeSinceStart}ms: ${file.path}`
        );
      }
      // Always pass fresh editor content (already read above with canvas delay if needed)
      // This ensures canvas and regular editors use fresh content, not stale cache
      const providedContent = currentContent;
      await this.processFileImmediate(file, providedContent, metadata, editor);
    } catch (error) {
      console.error(
        `Error in optimal editor-change processing for ${file.path}:`,
        error
      );
    }
  }

  /**
   * Extract title region (first non-empty line and title source line) from editor content
   * Returns TitleRegionCache with extracted strings
   */
  extractTitleRegion(
    editor: Editor,
    file: TFile,
    providedContent?: string
  ): TitleRegionCache {
    const content = providedContent || editor.getValue();
    const metadata = this.plugin.app.metadataCache.getFileCache(file);

    // Skip frontmatter
    let startLine = 0;
    if (metadata?.frontmatterPosition) {
      startLine = metadata.frontmatterPosition.end.line + 1;
    }

    const lines = content.split('\n');

    // Find first non-empty line
    let firstNonEmptyLine = '';
    for (let i = startLine; i < lines.length; i++) {
      if (lines[i].trim() !== '') {
        firstNonEmptyLine = lines[i];
        break;
      }
    }

    if (firstNonEmptyLine === '') {
      return {
        firstNonEmptyLine: '',
        titleSourceLine: '',
        lastUpdated: Date.now(),
      };
    }

    // Get lines after frontmatter for title source computation
    const contentLines = lines.slice(startLine);

    // Use shared utility function to find title source line
    const titleSourceLine = findTitleSourceLine(
      contentLines,
      this.plugin.settings,
      this.plugin
    );

    return {
      firstNonEmptyLine,
      titleSourceLine,
      lastUpdated: Date.now(),
    };
  }

  async processFileImmediate(
    file: TFile,
    content?: string,
    metadata?: unknown,
    editor?: Editor
  ): Promise<void> {
    if (file.extension !== 'md') {
      return;
    }

    // Note: shouldProcessFile is checked inside processFile where exclusionOverrides can be applied
    // No need to check here - processFile handles all exclusion logic

    verboseLog(
      this.plugin,
      `PROCESS: Starting immediate processFile for ${file.path}`
    );

    try {
      // hasActiveEditor=true because this is called from editor-change event
      await this.processFile(
        file,
        true,
        false,
        content,
        false,
        undefined,
        true,
        editor
      );
    } catch (error) {
      console.error(`Error in immediate process for ${file.path}:`, error);
    }
  }

  stripFrontmatterFromContent(
    content: string | undefined,
    file: TFile
  ): string {
    if (!content) return '';
    const lines = content.split('\n');

    if (lines.length > 0 && lines[0].trim() === '---') {
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') {
          const strippedContent = lines.slice(i + 1).join('\n');
          verboseLog(
            this.plugin,
            `Stripped frontmatter from ${file.path} (lines 0-${i} removed)`
          );
          return strippedContent;
        }
      }
    }

    return content;
  }

  async processFile(
    file: TFile,
    noDelay = false,
    showNotices = false,
    providedContent?: string,
    isBatchOperation = false,
    exclusionOverrides?: {
      ignoreFolder?: boolean;
      ignoreTag?: boolean;
      ignoreProperty?: boolean;
    },
    hasActiveEditor?: boolean,
    editor?: Editor
  ): Promise<{ success: boolean; reason?: string }> {
    this.plugin.trackUsage();
    verboseLog(this.plugin, `Processing file: ${file.path}`, { noDelay });

    // Race condition check: File could be deleted between event trigger and processing
    // This check catches that edge case and exits early with appropriate reason
    const currentFile = this.plugin.app.vault.getAbstractFileByPath(file.path);
    if (!currentFile || !(currentFile instanceof TFile)) {
      verboseLog(
        this.plugin,
        `Skipping processing - file no longer exists or is not a TFile: ${file.path}`
      );
      return { success: false, reason: 'file-not-found' };
    }

    file = currentFile;

    if (file.extension !== 'md') {
      verboseLog(this.plugin, `Skipping non-markdown file: ${file.path}`);
      return { success: false, reason: 'not-markdown' };
    }

    // Capture original path before acquiring lock (path may change during rename)
    const originalPath = file.path;

    // Atomic lock acquisition: acquireLock() returns true if lock acquired, false if already locked
    // This prevents race condition between separate check and acquire operations
    if (!this.plugin.cacheManager?.acquireLock(originalPath)) {
      verboseLog(
        this.plugin,
        `Skipping - file operation already in progress: ${originalPath}`
      );
      return { success: false, reason: 'already-processing' };
    }

    // Track all paths that may need unlocking (prevents orphaned locks on external renames)
    const pathsToUnlock = new Set<string>([originalPath]);

    try {
      const result = await this.processFileInternal(
        file,
        noDelay,
        showNotices,
        providedContent,
        isBatchOperation,
        exclusionOverrides,
        hasActiveEditor,
        editor
      );

      // If file path changed during processing, track new path for cleanup
      if (file.path !== originalPath) {
        pathsToUnlock.add(file.path);
      }

      // Handle alias in ONE place - after processFileInternal completes
      // This consolidates alias logic instead of scattering it across multiple code paths
      const aliasHandlingReasons = [
        'success',
        'no-rename-needed',
        'empty-content-retained',
      ];
      if (
        aliasHandlingReasons.includes(result.reason || '') &&
        this.plugin.settings.aliases.enableAliases
      ) {
        await this.updateAliasWithCoordination(file, showNotices);
      }

      return result;
    } finally {
      // Release all tracked locks (handles both successful renames and external renames during processing)
      for (const path of pathsToUnlock) {
        this.plugin.cacheManager?.releaseLock(path);
      }

      // Check if content changed during processing (rapid edits during rename/alias operations)
      const newPath = file.path;
      if (
        this.plugin.cacheManager?.hasPendingAliasRecheck(originalPath) ||
        this.plugin.cacheManager?.hasPendingAliasRecheck(newPath)
      ) {
        verboseLog(
          this.plugin,
          `Content changed during processing with pending alias: ${originalPath}`
        );

        // Check if file is in active view (main editor)
        const activeView =
          this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        const isInActiveView =
          activeView && activeView.file?.path === newPath && activeView.editor;

        if (isInActiveView) {
          // File in main editor - clear flag and schedule immediate recheck
          this.plugin.cacheManager?.clearPendingAliasRecheck(originalPath);
          if (newPath !== originalPath) {
            this.plugin.cacheManager?.clearPendingAliasRecheck(newPath);
          }

          // Schedule recheck after short delay to let UI settle
          setTimeout(() => {
            void (async () => {
              const recheckFile =
                this.plugin.app.vault.getAbstractFileByPath(newPath);
              if (recheckFile && recheckFile instanceof TFile) {
                const view =
                  this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
                if (
                  view &&
                  view.file?.path === recheckFile.path &&
                  view.editor
                ) {
                  await this.processEditorChangeOptimal(
                    view.editor,
                    recheckFile
                  );
                }
              }
            })();
          }, TIMING.UI_SETTLE_DELAY_MS);
        } else {
          // File in popover or not in view - preserve flag for modify/metadata handlers
          verboseLog(
            this.plugin,
            `Preserving pending alias flag for popover-close detection: ${newPath}`
          );
        }
      }
    }
  }

  private async processFileInternal(
    file: TFile,
    noDelay: boolean,
    showNotices: boolean,
    providedContent?: string,
    isBatchOperation = false,
    exclusionOverrides?: {
      ignoreFolder?: boolean;
      ignoreTag?: boolean;
      ignoreProperty?: boolean;
    },
    hasActiveEditor?: boolean,
    editor?: Editor
  ): Promise<{ success: boolean; reason?: string }> {
    // Central gate: check policy requirements and always-on safeguards
    const { canModify, reason } = canModifyFile(
      file,
      this.plugin.app,
      this.plugin.settings.exclusions.disableRenamingKey,
      this.plugin.settings.exclusions.disableRenamingValue,
      showNotices, // showNotices indicates manual command
      hasActiveEditor // From editor-change event or auto-detected
    );

    if (!canModify) {
      verboseLog(this.plugin, `Skipping file: ${reason}: ${file.path}`);

      // Output file content if debug setting enabled
      try {
        const content =
          providedContent || (await this.plugin.app.vault.read(file));
        this.plugin.outputDebugFileContent(file, 'BLOCKED', content);
      } catch (error) {
        console.error(
          `Error reading file content for debug output: ${file.path}`,
          error
        );
      }

      if (showNotices && !isBatchOperation) {
        new Notice(
          t('notifications.notRenamedExcluded', { filename: file.basename })
        );
      }
      return { success: false, reason: 'property-disabled' };
    }

    let contentForRateLimit: string;
    try {
      contentForRateLimit = await readFileContent(this.plugin, file, {
        providedContent,
        providedEditor: editor, // Use editor from manual command
        preferFresh: true,
        searchWorkspace: showNotices, // Manual commands search for popover editors
      });

      // Output debug file content if enabled
      this.plugin.outputDebugFileContent(
        file,
        'PROCESSING',
        contentForRateLimit
      );
    } catch (error) {
      console.error(
        `Error reading file for rate limit check: ${file.path}`,
        error
      );
      return { success: false, reason: 'read-error' };
    }

    // Skip processing when editing in footnote popover
    // When user types in footnote definition, providedContent contains only the footnote text
    // (e.g., "1", "123") while disk has the full file with frontmatter and main content.
    // Size ratio < threshold indicates popover context. We must skip to avoid ping-pong renaming
    // between footnote content and main content on alternating keystrokes.
    // Threshold of 0.3 provides safety margin (was 0.5 but that's too aggressive).
    // This check allows normal processing when editing main content even if footnotes exist.
    try {
      const diskContent = await this.plugin.app.vault.read(file);
      if (diskContent.match(/\n\[\^[^\]]+\]:\s/)) {
        const ratio =
          diskContent.length > 0
            ? contentForRateLimit.length / diskContent.length
            : 1;
        if (ratio < LIMITS.FOOTNOTE_SIZE_THRESHOLD) {
          verboseLog(
            this.plugin,
            `Skipping - editing in footnote popover (editor/disk ratio ${(ratio * 100).toFixed(1)}%): ${file.path}`
          );
          return { success: false, reason: 'footnote-popover-edit' };
        }
      }
    } catch (error) {
      // If we can't read disk content, continue with normal processing
      verboseLog(
        this.plugin,
        `Could not read disk content for footnote check: ${error}`
      );
    }

    // Time-based rate limiting (per-file always enforced, global bypassed for batches)
    if (!this.checkFileTimeLimit(file)) {
      return { success: false, reason: 'time-rate-limited' };
    }

    // Global rate limiting bypassed for batch operations to avoid blocking legitimate bulk operations
    if (!isBatchOperation) {
      if (!this.checkGlobalRateLimit()) {
        return { success: false, reason: 'global-rate-limited' };
      }
    }

    // Reuse contentForRateLimit instead of reading again
    const initialContent = contentForRateLimit;

    // Pass exclusionOverrides to skip checks for manual single-file commands
    if (
      !shouldProcessFile(
        file,
        this.plugin.settings,
        this.plugin.app,
        initialContent,
        exclusionOverrides,
        this.plugin
      )
    ) {
      verboseLog(
        this.plugin,
        `Skipping file based on include/exclude strategy: ${file.path}`
      );
      return { success: false, reason: 'excluded' };
    }

    const startTime = Date.now();
    verboseLog(this.plugin, `RENAME: Starting renameFile for ${file.name}`);

    const cacheManager = this.plugin.cacheManager;
    const previousFileContent = cacheManager?.getContent(file.path);

    let content = await readFileContent(this.plugin, file, {
      providedContent,
      providedEditor: editor, // Use editor from manual command
      searchWorkspace: showNotices, // Manual commands search for popover editors
    });

    // Check if filename contains any safewords and skip if enabled (always respect safewords)
    if (containsSafeword(file.name, this.plugin.settings)) {
      if (showNotices && !isBatchOperation) {
        // Rate limit: show notice max once per 2 seconds per file
        if (this.plugin.fileStateManager.canShowSafewordNotice(file.path)) {
          verboseLog(
            this.plugin,
            `Showing notice: Safeword prevented rename of: ${file.basename}`
          );
          new Notice(
            t('notifications.safewordPreventedRename').replace(
              '{{filename}}',
              file.basename
            )
          );
          this.plugin.fileStateManager.setLastSafewordNotice(file.path);
        }
      }
      verboseLog(this.plugin, `Skipping file with safeword: ${file.path}`);
      return { success: false, reason: 'safeword' };
    }

    const currentName = file.basename;
    const contentWithoutFrontmatter = this.stripFrontmatterFromContent(
      content,
      file
    );
    const lines = contentWithoutFrontmatter.split('\n');
    let firstNonEmptyLine = '';
    for (const line of lines) {
      if (line.trim() !== '') {
        firstNonEmptyLine = line;
        break;
      }
    }

    // If first line is empty (no content after frontmatter)
    if (firstNonEmptyLine === '') {
      // Check if file had previous content
      const previousContentWithoutFrontmatter = previousFileContent
        ? this.stripFrontmatterFromContent(previousFileContent, file)
        : '';
      const hadPreviousContent =
        previousContentWithoutFrontmatter.trim() !== '';

      if (hadPreviousContent) {
        // Content was deleted - rename to Untitled
        verboseLog(
          this.plugin,
          `Content became empty - renaming to ${t('untitled')}: ${file.path}`
        );
        firstNonEmptyLine = t('untitled');
      } else {
        // File was always empty - retain current filename
        cacheManager?.setContent(file.path, content);

        // Alias handling moved to processFile - called via updateAliasWithCoordination
        // which will remove stale aliases when content is empty

        verboseLog(
          this.plugin,
          `Skipping rename for empty file - retaining current filename: ${file.path}`
        );
        return { success: false, reason: 'empty-content-retained' };
      }
    }

    // Check if only headings should be processed
    if (this.plugin.settings.core.onlyRenameIfHeading) {
      // Skip validation for the "Untitled" fallback (when content became empty)
      if (
        firstNonEmptyLine !== t('untitled') &&
        !isValidHeading(firstNonEmptyLine)
      ) {
        verboseLog(
          this.plugin,
          `Skipping file - first line is not a valid heading: ${file.path}`
        );

        // Show notice if requested and not in batch operation
        if (showNotices && !isBatchOperation) {
          new Notice(
            t('notifications.notRenamedNoHeading', { filename: file.basename })
          );
        }

        return { success: false, reason: 'not-heading' };
      }
    }

    // Determine titleSourceLine using shared utility function
    // This handles special cases like card links, code blocks, and markdown tables
    const titleSourceLine = findTitleSourceLine(
      lines,
      this.plugin.settings,
      this.plugin
    );

    // Store current content for next check in cache (only if not handled above)
    // Don't update cache if content became empty and we're renaming to Untitled (prevents cache poisoning)
    const contentBecameEmpty =
      contentWithoutFrontmatter.trim() === '' &&
      firstNonEmptyLine === t('untitled');
    if (!contentBecameEmpty) {
      cacheManager?.setContent(file.path, content);
    }

    // Use the stripped content for processing
    content = contentWithoutFrontmatter;

    // Check for self-referencing links BEFORE custom replacements to prevent character mismatch
    const escapedName = currentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pathWithoutExt = file.path.replace(/\.md$/, '');
    const escapedPath = pathWithoutExt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Match [[filename]], [[filename#heading]], [[filename#^block]], [[path/filename#heading]], with optional |alias
    // Need to check both basename and full path (some users link with path)
    const wikiLinkRegex = new RegExp(
      `\\[\\[(${escapedName}|${escapedPath})(#[^\\]|]*?)?(\\|.*?)?\\]\\]`
    );
    // Match markdown links including empty link text: [text](url) or [](url)
    // Regex is ReDoS-safe: uses negated character classes [^\]] and [^)] which don't backtrack
    const markdownLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;

    let isSelfReferencing = false;

    // Check for self-referencing wikilink in titleSourceLine (before custom replacements)
    if (wikiLinkRegex.test(titleSourceLine)) {
      isSelfReferencing = true;
      verboseLog(
        this.plugin,
        `Found self-referencing wikilink in ${file.path} before custom replacements`
      );
    }

    // Check for self-referencing Markdown link by parsing the actual URL (ignoring link text)
    let match;
    while ((match = markdownLinkRegex.exec(titleSourceLine)) !== null) {
      const url = match[2];

      // Decode percent-encoding for comparison
      let decodedUrl = url;
      try {
        decodedUrl = decodeURIComponent(url);
      } catch {
        // Invalid encoding, use original
      }

      // Check various self-reference patterns:
      // 1. Fragment-only: #heading
      // 2. Relative path with .md: filename.md or path/filename.md
      // 3. Relative path without extension: filename
      if (url.startsWith('#') && url.includes(currentName)) {
        isSelfReferencing = true;
        verboseLog(
          this.plugin,
          `Found self-referencing markdown link (fragment) in ${file.path} before custom replacements`
        );
        break;
      }

      // Check if decoded URL matches current file (with or without .md extension)
      const urlWithoutFragment = decodedUrl.split('#')[0];
      if (
        urlWithoutFragment &&
        (urlWithoutFragment === `${currentName}.md` ||
          urlWithoutFragment === currentName ||
          urlWithoutFragment === `${pathWithoutExt}.md` ||
          urlWithoutFragment === pathWithoutExt)
      ) {
        isSelfReferencing = true;
        verboseLog(
          this.plugin,
          `Found self-referencing markdown link (percent-encoded) in ${file.path} before custom replacements`
        );
        break;
      }
    }

    // Check Obsidian's cached links for self-reference (catches mid-edit states
    // where regex fails on malformed links but cache still has valid link)
    if (!isSelfReferencing) {
      const cache = this.plugin.app.metadataCache.getFileCache(file);
      if (cache?.links) {
        // Calculate absolute title line number (including frontmatter)
        const titleLineIndexInStripped = lines.findIndex(
          (l) => l === titleSourceLine
        );

        // Skip if titleSourceLine not found in stripped content
        if (titleLineIndexInStripped >= 0) {
          const frontmatterLineCount =
            cache.frontmatterPosition?.end?.line !== undefined
              ? cache.frontmatterPosition.end.line + 1
              : 0;
          const absoluteTitleLine =
            frontmatterLineCount + titleLineIndexInStripped;

          // currentName includes .md extension, get basename without it
          const basenameWithoutExt = currentName.replace(/\.md$/, '');

          for (const link of cache.links) {
            // Check if link is on title line
            if (link.position.start.line === absoluteTitleLine) {
              // Compare resolved link to current file (handles URL-encoded paths)
              // link.link is the resolved target (e.g., "note" or "folder/note")
              const linkTarget = link.link.replace(/\.md$/, '');
              if (
                linkTarget === basenameWithoutExt ||
                linkTarget === pathWithoutExt ||
                link.link === file.path ||
                link.link === pathWithoutExt
              ) {
                isSelfReferencing = true;
                verboseLog(
                  this.plugin,
                  `Found cached self-referencing link in ${file.path}`
                );
                break;
              }
            }
          }
        }
      }
    }

    // Apply custom replacements and markup stripping in the correct order
    let newTitle = titleSourceLine;
    verboseLog(
      this.plugin,
      `Custom replacements enabled: ${this.plugin.settings.customRules.enableCustomReplacements}, count: ${this.plugin.settings.customRules.customReplacements?.length || 0}`
    );

    const applyCustomRules = () => {
      if (this.plugin.settings.customRules.enableCustomReplacements) {
        for (const replacement of this.plugin.settings.customRules
          .customReplacements) {
          if (replacement.searchText === '' || !replacement.enabled) continue;

          verboseLog(this.plugin, `Checking custom replacement:`, {
            searchText: replacement.searchText,
            replaceText: replacement.replaceText,
            onlyWholeLine: replacement.onlyWholeLine,
            onlyAtStart: replacement.onlyAtStart,
            enabled: replacement.enabled,
            currentLine: newTitle,
          });

          let tempLine = newTitle;

          if (replacement.onlyWholeLine) {
            // Only replace if the entire line matches
            if (newTitle.trim() === replacement.searchText.trim()) {
              tempLine = replacement.replaceText;
              verboseLog(this.plugin, `Applied whole line replacement:`, {
                from: newTitle,
                to: tempLine,
              });
            }
          } else if (replacement.onlyAtStart) {
            if (tempLine.startsWith(replacement.searchText)) {
              tempLine =
                replacement.replaceText +
                tempLine.slice(replacement.searchText.length);
              verboseLog(this.plugin, `Applied start replacement:`, {
                from: newTitle,
                to: tempLine,
              });
            }
          } else {
            const beforeReplace = tempLine;
            tempLine = tempLine.replaceAll(
              replacement.searchText,
              replacement.replaceText
            );
            if (beforeReplace !== tempLine) {
              verboseLog(this.plugin, `Applied general replacement:`, {
                from: beforeReplace,
                to: tempLine,
              });
            }
          }

          newTitle = tempLine;
        }
      }

      // If custom replacements resulted in empty string or whitespace only, use "Untitled"
      if (newTitle.trim() === '') {
        newTitle = t('untitled');
      }
    };

    verboseLog(
      this.plugin,
      isSelfReferencing
        ? `Self-reference found in ${file.path}`
        : `No self-reference found in ${file.path}`
    );

    // Define forbidden char replacement function
    const applyForbiddenCharReplacement = () => {
      const currentOS = detectOS();
      const windowsAndroidEnabled =
        currentOS === 'Windows' ||
        this.plugin.settings.replaceCharacters.windowsAndroidEnabled;

      newTitle = processForbiddenChars(newTitle, this.plugin.settings, {
        maxLength: this.plugin.settings.core.charCount,
        windowsAndroidEnabled,
      });

      // Check if filename is empty or a forbidden name
      const forbiddenNames: string[] = [
        'CON',
        'PRN',
        'AUX',
        'NUL',
        'COM1',
        'COM2',
        'COM3',
        'COM4',
        'COM5',
        'COM6',
        'COM7',
        'COM8',
        'COM9',
        'COM0',
        'LPT1',
        'LPT2',
        'LPT3',
        'LPT4',
        'LPT5',
        'LPT6',
        'LPT7',
        'LPT8',
        'LPT9',
        'LPT0',
      ];

      const isForbiddenName =
        newTitle === '' || forbiddenNames.includes(newTitle.toUpperCase());
      if (isForbiddenName) {
        newTitle = t('untitled');
        verboseLog(
          this.plugin,
          `Using fallback name \`${t('untitled')}\` for ${file.path}`
        );
      }
    };

    // Apply operations in correct order based on settings
    if (this.plugin.settings.customRules.applyCustomRulesAfterForbiddenChars) {
      // Apply markup stripping, then forbidden chars, then custom rules
      newTitle = extractTitle(newTitle, this.plugin.settings);
      applyForbiddenCharReplacement();
      applyCustomRules();
    } else {
      // Apply custom rules and markup stripping based on other setting, then forbidden chars
      if (
        this.plugin.settings.markupStripping
          .applyCustomRulesAfterMarkupStripping
      ) {
        // Markup stripping → custom rules → forbidden chars
        newTitle = extractTitle(newTitle, this.plugin.settings);
        applyCustomRules();
      } else {
        // Custom rules → markup stripping → forbidden chars
        applyCustomRules();
        newTitle = extractTitle(newTitle, this.plugin.settings);
      }
      applyForbiddenCharReplacement();
    }

    verboseLog(this.plugin, `Extracted title from ${file.path}`, {
      firstNonEmptyLine: firstNonEmptyLine,
      titleSourceLine: titleSourceLine,
      extracted: newTitle,
    });

    const parentPath = file.parent?.path === '/' ? '' : file.parent?.path + '/';

    let newPath: string = `${parentPath}${newTitle}.md`;

    verboseLog(
      this.plugin,
      `Initial target path: ${newPath} for file: ${file.path}`
    );
    if (file.path == newPath) {
      verboseLog(
        this.plugin,
        `No rename needed for ${file.path} - already has correct name`
      );
      // Alias handling moved to processFile - single code path for all outcomes

      if (showNotices && !isBatchOperation) {
        const finalFileName =
          newPath.replace(/\.md$/, '').split('/').pop() || newTitle;
        const titleChanged = currentName !== finalFileName;
        const shouldShowNotice =
          this.plugin.settings.core.manualNotificationMode === 'Always' ||
          (this.plugin.settings.core.manualNotificationMode ===
            'On title change' &&
            titleChanged);

        if (shouldShowNotice) {
          verboseLog(
            this.plugin,
            `Showing notice: Title unchanged: ${finalFileName}`
          );
          new Notice(
            t('notifications.renamedTo').replace('{{filename}}', finalFileName)
          );
        }
      }
      return { success: true, reason: 'no-rename-needed' };
    }

    // Skip rename if file was recently renamed AND reading from disk (not fresh editor content)
    // Fresh editor content is always safe; only disk reads may be stale after rename
    if (
      !providedContent &&
      this.plugin.fileStateManager.wasRecentlyRenamed(file.path, 100)
    ) {
      verboseLog(
        this.plugin,
        `Skipping rename - file was recently renamed, disk may be stale: ${file.path}`
      );
      return { success: false, reason: 'recently-renamed' };
    }

    let counter: number = 0;
    let fileExists: boolean = this.checkFileExistsCaseInsensitive(newPath);

    verboseLog(
      this.plugin,
      `Conflict check for ${newPath}: fileExists=${fileExists}`
    );
    if (fileExists) {
      verboseLog(
        this.plugin,
        `Found conflicts for ${newPath}, starting counter loop`
      );
      let conflictCount = 0;
      const MAX_CONFLICT_ITERATIONS = 10000;
      while (fileExists && conflictCount < MAX_CONFLICT_ITERATIONS) {
        conflictCount++;
        // Check if we're about to create a path that matches current file (with counter)
        if (file.path == newPath) {
          if (conflictCount > 1) {
            verboseLog(
              this.plugin,
              `Checked ${conflictCount} conflicts for ${newPath}`
            );
          }
          verboseLog(
            this.plugin,
            `No rename needed for ${file.path} - already has correct name with counter`
          );
          // Alias handling moved to processFile - single code path for all outcomes

          if (showNotices && !isBatchOperation) {
            // Extract actual final filename from newPath (includes counter)
            const finalFileName =
              newPath.replace(/\.md$/, '').split('/').pop() || newTitle;
            const titleChanged = currentName !== finalFileName;
            const shouldShowNotice =
              this.plugin.settings.core.manualNotificationMode === 'Always' ||
              (this.plugin.settings.core.manualNotificationMode ===
                'On title change' &&
                titleChanged);

            if (shouldShowNotice) {
              verboseLog(
                this.plugin,
                `Showing notice: Updated title: ${currentName} → ${finalFileName}`
              );
              new Notice(
                t('notifications.renamedTo').replace(
                  '{{filename}}',
                  finalFileName
                )
              );
            }
          }

          return { success: true, reason: 'no-rename-needed' };
        }
        counter += 1;
        newPath = `${parentPath}${newTitle} ${counter}.md`;
        fileExists = this.checkFileExistsCaseInsensitive(newPath, false); // Don't log individual conflicts
      }

      // Check if we hit the safety limit
      if (conflictCount >= MAX_CONFLICT_ITERATIONS) {
        console.error(
          `Max conflict iterations (${MAX_CONFLICT_ITERATIONS}) reached for ${file.path}. Aborting rename to prevent infinite loop.`
        );
        return { success: false, reason: 'max-conflicts-exceeded' };
      }

      verboseLog(
        this.plugin,
        `Found available filename with counter ${counter} after checking ${conflictCount} conflicts`
      );
    } else {
      verboseLog(
        this.plugin,
        `No conflicts found for ${newPath}, proceeding without counter`
      );
    }
    if (isSelfReferencing) {
      if (!isBatchOperation) {
        // Rate limit: show notice max once per 2 seconds per file
        if (this.plugin.fileStateManager.canShowSelfRefNotice(file.path)) {
          verboseLog(
            this.plugin,
            `Showing notice: File not renamed due to self-referential link in first line: ${file.basename}`
          );
          new Notice(
            t('notifications.notRenamedSelfReference').replace(
              '{{filename}}',
              file.basename
            )
          );
          this.plugin.fileStateManager.setLastSelfRefNotice(file.path);
        }
      }
      verboseLog(this.plugin, `Skipping self-referencing file: ${file.path}`);
      return { success: false, reason: 'self-referential' };
    }

    if (noDelay) {
      cacheManager?.reservePath(newPath);
    }

    try {
      const oldPath = file.path;
      await this.plugin.app.fileManager.renameFile(file, newPath);
      const processingTime = Date.now() - startTime;
      verboseLog(
        this.plugin,
        `Successfully renamed ${oldPath} to ${newPath} (${processingTime}ms)`
      );

      // Track rename to prevent stale CREATE events from processing this file
      this.plugin.recentlyRenamedPaths.add(oldPath);
      this.plugin.recentlyRenamedPaths.add(newPath);
      setTimeout(() => {
        this.plugin.recentlyRenamedPaths.delete(oldPath);
        this.plugin.recentlyRenamedPaths.delete(newPath);
      }, 1000);

      // Mark file as recently renamed to prevent processFile with stale content
      // After rename, Obsidian events may trigger processFile before editor content stabilizes
      // 100ms delay allows editor to catch up with user's rapid typing
      this.plugin.fileStateManager.markRecentlyRenamed(newPath);
      const lastContent =
        this.plugin.fileStateManager.getLastEditorContent(oldPath);
      if (lastContent !== undefined) {
        this.plugin.fileStateManager.deleteLastEditorContent(oldPath);
        this.plugin.fileStateManager.setLastEditorContent(newPath, lastContent);
      }
      this.updateTitleRegionCacheKey(oldPath, newPath);
      cacheManager?.notifyFileRenamed(oldPath, newPath);

      // Alias handling moved to processFile - single code path for all outcomes

      if (showNotices && !isBatchOperation) {
        // Extract actual final filename from newPath (includes counter if added)
        const finalFileName =
          newPath.replace(/\.md$/, '').split('/').pop() || newTitle;
        const titleChanged = currentName !== finalFileName;
        const shouldShowNotice =
          this.plugin.settings.core.manualNotificationMode === 'Always' ||
          (this.plugin.settings.core.manualNotificationMode ===
            'On title change' &&
            titleChanged);

        if (shouldShowNotice) {
          verboseLog(
            this.plugin,
            `Showing notice: Updated title: ${currentName} → ${finalFileName}`
          );
          new Notice(
            t('notifications.renamedTo').replace('{{filename}}', finalFileName)
          );
        }
      }

      return { success: true };
    } catch (error) {
      console.error(`Failed to rename file ${file.path} to ${newPath}:`, error);
      return { success: false, reason: 'error' };
    }
  }

  checkFileExistsCaseInsensitive(
    path: string,
    logConflict: boolean = true
  ): boolean {
    // Performance: Fast path for exact match (O(1) hash lookup)
    const exactMatch = this.plugin.app.vault.getAbstractFileByPath(path);
    if (exactMatch !== null) {
      if (logConflict) {
        verboseLog(
          this.plugin,
          `Exact file conflict found: ${path} (existing file: ${exactMatch.path})`
        );
      }
      return true;
    }

    // Performance: Fallback for case-insensitive match (O(n) iteration)
    // Only triggered when exact match fails, which is the common case
    // Early return on match minimizes iteration cost
    const lowerPath = path.toLowerCase();
    const allFiles = this.plugin.app.vault.getAllLoadedFiles();

    for (const file of allFiles) {
      if (file.path.toLowerCase() === lowerPath) {
        if (logConflict) {
          verboseLog(
            this.plugin,
            `Case-insensitive file conflict found: ${path} (existing file: ${file.path})`
          );
        }
        return true;
      }
    }

    return false;
  }

  clearTitleRegionCache(): void {
    this.plugin.fileStateManager.clearAllTitleRegionCaches();
    verboseLog(this.plugin, 'Cleared title region cache');
  }

  updateTitleRegionCacheKey(oldPath: string, newPath: string): void {
    this.plugin.fileStateManager.updateTitleRegionCacheKey(oldPath, newPath);
    verboseLog(
      this.plugin,
      `Updated title region cache key: ${oldPath} → ${newPath}`
    );
  }
}
