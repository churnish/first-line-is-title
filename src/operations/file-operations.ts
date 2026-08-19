import { TFile, MarkdownView, getFrontMatterInfo, parseYaml } from 'obsidian';
import { PluginSettings } from '../types';
import {
  verboseLog,
  shouldProcessFile,
  hasDisablePropertyInFile,
  reverseCharacterReplacements,
} from '../utils';
import { t } from '../i18n';
import { readFileContent } from '../utils/content-reader';
import { TIMING } from '../constants/timing';
import FirstLineIsTitle from '../../main';

/** Attempts allowed when writing the title through the editor before falling back to vault.process */
const TITLE_INSERTION_MAX_ATTEMPTS = 10;

/** Pause after a programmatic editor write so CodeMirror applies the transaction before it is verified */
const EDITOR_TRANSACTION_SETTLE_MS = 10;

/** Where a title belongs in a note, derived from that note's content */
interface TitleInsertionPoint {
  /** Index of the closing `---` of the properties block, or -1 when there is none */
  frontmatterEndLine: number;
  /** Line the title is written to: the first line below the properties block */
  insertLine: number;
  /** True when the body below the properties block already holds content */
  hasBodyContent: boolean;
}

/** Outcome of a title insertion attempt */
export interface TitleInsertionResult {
  /** True when the title ended up in the note (freshly written, or already present) */
  inserted: boolean;
  /**
   * True when this call placed the cursor AND left the view in its final mode, meaning the
   * delayed cursor pass would only redo work already done. False whenever that pass still
   * owes something - a mode transition, or the cursor move itself.
   */
  cursorPositioned: boolean;
}

export class FileOperations {
  constructor(private plugin: FirstLineIsTitle) {}

  get app() {
    return this.plugin.app;
  }

  get settings(): PluginSettings {
    return this.plugin.settings;
  }

  /**
   * Derive where a title belongs in `content`, and whether a body is already there.
   *
   * Single source of truth for every path that has to answer that question. The editor
   * write path, the vault.process fallback and the cursor pass each derived it separately
   * before, which let them disagree: the editor path could insert a second title into a
   * note whose body had filled in since its snapshot was taken.
   */
  private deriveTitleInsertionPoint(content: string): TitleInsertionPoint {
    const lines = content.split('\n');

    let frontmatterEndLine = -1;
    if (lines[0] === '---') {
      for (let i = 1; i < lines.length; i++) {
        if (lines[i] === '---') {
          frontmatterEndLine = i;
          break;
        }
      }
    }

    const insertLine = frontmatterEndLine !== -1 ? frontmatterEndLine + 1 : 0;

    return {
      frontmatterEndLine,
      insertLine,
      hasBodyContent: lines.slice(insertLine).join('\n').trim() !== '',
    };
  }

  /**
   * Find the Markdown view showing `file`, preferring one the caller already resolved.
   *
   * A single note creation used to run this scan up to seven times across the call chain,
   * each one allocating a fresh array and walking every leaf in every pane. The hint lets
   * the chain share one resolution. It is re-validated rather than trusted, because a leaf
   * can be closed or re-targeted between the caller's lookup and this call, and a stale view
   * would act on the wrong note. Callers must not pass a hint across a timer boundary.
   *
   * @param requireEditor Insertion paths need an editor. The cursor path matched on path
   *   alone and then used optional chaining on the editor, so it must not filter those out.
   */
  resolveMarkdownViewForFile(
    file: TFile,
    hint?: MarkdownView | null,
    requireEditor: boolean = true
  ): MarkdownView | null {
    const matches = (view: MarkdownView | null | undefined): boolean =>
      !!view &&
      view.file?.path === file.path &&
      (!requireEditor || !!view.editor);

    if (matches(hint)) {
      return hint as MarkdownView;
    }

    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view;
      if (view instanceof MarkdownView && matches(view)) {
        return view;
      }
    }

    return null;
  }

  /**
   * Place the cursor after an insertion and report whether the delayed cursor pass is now
   * redundant. Placement alone settles it: that pass does nothing else.
   */
  private settleCursorAfterInsertion(
    view: MarkdownView,
    line: number,
    length: number
  ): boolean {
    return this.positionCursorAfterTitleInsertion(view, line, length);
  }

  /**
   * Inserts the filename as the first line of a newly created file
   * @param initialContent - Optional initial content captured at file creation time
   * @param viewHint - View already resolved by the caller, re-validated before use
   */
  async insertTitle(
    file: TFile,
    initialContent?: string,
    viewHint?: MarkdownView | null
  ): Promise<TitleInsertionResult> {
    const skipped: TitleInsertionResult = {
      inserted: false,
      cursorPositioned: false,
    };

    try {
      const untitledWord = t('untitled').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const untitledPattern = new RegExp(`^${untitledWord}(\\s[1-9]\\d*)?$`);
      if (untitledPattern.test(file.basename)) {
        verboseLog(
          this.plugin,
          `Skipping title insertion for untitled file: ${file.path}`
        );
        return skipped;
      }

      // Title goes into the note body, so restore the spacing the trim flags stripped from the filename
      const cleanTitle = reverseCharacterReplacements(
        file.basename,
        this.settings,
        this.plugin,
        { restoreTrimmedSpacing: true }
      );

      // Note: formatAsHeading setting will be applied conditionally below
      // (skipped if heading pattern already exists in template)

      verboseLog(
        this.plugin,
        `Inserting title "${cleanTitle}" in new file: ${file.path}`
      );

      let currentContent: string;

      if (initialContent !== undefined) {
        currentContent = initialContent;
        verboseLog(
          this.plugin,
          `[TITLE-INSERT] Using initial content. Length: ${currentContent.length} chars`
        );
      } else {
        verboseLog(
          this.plugin,
          `[TITLE-INSERT] Reading immediately from editor`
        );
        try {
          currentContent = await readFileContent(this.plugin, file, {
            searchWorkspace: this.settings.core.contentReadMethod === 'Editor',
            preferFresh: true,
          });
        } catch (error) {
          console.error(
            `Failed to read file ${file.path} for title insertion:`,
            error
          );
          return skipped;
        }
      }

      const lines = currentContent.split('\n');
      const snapshotPoint = this.deriveTitleInsertionPoint(currentContent);

      // One lookup for every branch below - the CREATE handler has usually resolved it already
      const targetView = this.resolveMarkdownViewForFile(file, viewHint);

      if (snapshotPoint.hasBodyContent) {
        verboseLog(this.plugin, `File has content (excluding YAML)`);
        let firstNonEmptyLine: string | null = null;
        let firstNonEmptyLineIndex = -1;

        for (let i = snapshotPoint.insertLine; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line !== '') {
            firstNonEmptyLine = line;
            firstNonEmptyLineIndex = i;
            break;
          }
        }

        const headingMatch = firstNonEmptyLine?.match(/^(#{1,6})(\s*)$/);

        if (headingMatch) {
          const hashMarks = headingMatch[1];
          const titleWithHeading = `${hashMarks} ${cleanTitle}`;

          verboseLog(
            this.plugin,
            `[TITLE-INSERT] Found heading pattern "${firstNonEmptyLine}" at line ${firstNonEmptyLineIndex}, inserting title`
          );

          let insertedViaEditor = false;
          let cursorPositioned = false;

          if (targetView) {
            // Guard our own write: CodeMirror fires editor-change for setLine exactly as it
            // does for a keystroke, and at the default newNoteDelay of 0 nothing else stops
            // that event from re-entering the rename pipeline.
            this.plugin.fileStateManager.markEditorSyncing(file.path);
            try {
              targetView.editor.setLine(
                firstNonEmptyLineIndex,
                titleWithHeading
              );
              verboseLog(
                this.plugin,
                `[TITLE-INSERT] Replaced heading at line ${firstNonEmptyLineIndex} via editor`
              );

              // Position cursor at end of title if both settings enabled
              cursorPositioned = this.settleCursorAfterInsertion(
                targetView,
                firstNonEmptyLineIndex,
                titleWithHeading.length
              );

              insertedViaEditor = true;
            } finally {
              this.plugin.fileStateManager.clearEditorSyncing(file.path);
            }
          }

          if (!insertedViaEditor) {
            verboseLog(
              this.plugin,
              `[TITLE-INSERT] Replacing heading via vault.process`
            );
            await this.app.vault.process(file, (content) => {
              const lines = content.split('\n');
              lines[firstNonEmptyLineIndex] = titleWithHeading;
              return lines.join('\n');
            });
          }

          verboseLog(
            this.plugin,
            `Successfully inserted title in heading for ${file.path}`
          );
          return { inserted: true, cursorPositioned };
        } else {
          verboseLog(
            this.plugin,
            `File has content without heading pattern, skipping title insertion for ${file.path}`
          );

          // If both settings are ON, position cursor at line end even though we're not inserting
          let cursorPositioned = false;
          if (
            this.settings.core.moveCursorToFirstLine &&
            this.settings.core.placeCursorAtLineEnd
          ) {
            // Always check exclusions (cursor never moved in excluded notes)
            const isExcluded = this.isFileExcludedForCursorPositioning(
              file,
              currentContent
            );

            if (!isExcluded && targetView) {
              const lineLength = targetView.editor.getLine(
                snapshotPoint.insertLine
              ).length;
              cursorPositioned = this.settleCursorAfterInsertion(
                targetView,
                snapshotPoint.insertLine,
                lineLength
              );
            }
          }

          return { inserted: false, cursorPositioned };
        }
      }

      // Apply formatAsHeading setting since no heading pattern was found
      const finalTitle = this.settings.core.formatAsHeading
        ? '# ' + cleanTitle
        : cleanTitle;

      // Check if canvas active - canvas files have no editor, use vault.process() immediately
      const canvasIsActive =
        this.app.workspace.getMostRecentLeaf()?.view?.getViewType?.() ===
        'canvas';
      let insertedViaEditor = false;
      let cursorPositioned = false;

      if (!canvasIsActive && targetView) {
        const view = targetView;

        // Re-derive from live editor content rather than the creation-time snapshot. Reports
        // 'inserted' when the title is already on the insertion line, 'blocked' when a body
        // appeared underneath the properties block, 'pending' when a write is still needed.
        // Order matters: our own successful write makes a body appear, so the
        // already-inserted test has to come first.
        const inspectLiveContent = (): {
          state: 'inserted' | 'blocked' | 'pending';
          point: TitleInsertionPoint;
        } => {
          const liveContent = view.editor.getValue();
          const point = this.deriveTitleInsertionPoint(liveContent);
          const lineAtInsertPoint = liveContent.split('\n')[point.insertLine];

          if (lineAtInsertPoint?.trim() === finalTitle.trim()) {
            return { state: 'inserted', point };
          }
          if (point.hasBodyContent) {
            return { state: 'blocked', point };
          }
          return { state: 'pending', point };
        };

        // Verify before writing. The previous loop wrote first and never undid a failed
        // attempt, so ten failed verifications prepended ten titles.
        let outcome = inspectLiveContent();

        if (outcome.state === 'pending') {
          // Guard our own writes for the whole retry loop: CodeMirror fires editor-change for
          // replaceRange exactly as it does for a keystroke, and at the default newNoteDelay
          // of 0 nothing else stops that event from re-entering the rename pipeline. The
          // finally clears it on every exit path, throws included.
          this.plugin.fileStateManager.markEditorSyncing(file.path);
          try {
            for (
              let attempt = 0;
              attempt < TITLE_INSERTION_MAX_ATTEMPTS &&
              outcome.state === 'pending';
              attempt++
            ) {
              if (attempt > 0) {
                verboseLog(
                  this.plugin,
                  `[TITLE-INSERT] Verification failed, retry in ${TIMING.VIEW_READINESS_RETRY_DELAY_MS}ms (attempt ${attempt + 1})`
                );
                await new Promise((resolve) =>
                  window.setTimeout(
                    resolve,
                    TIMING.VIEW_READINESS_RETRY_DELAY_MS
                  )
                );
              }

              view.editor.replaceRange(finalTitle + '\n', {
                line: outcome.point.insertLine,
                ch: 0,
              });

              // Let editor process the change before verification
              await new Promise((resolve) =>
                window.setTimeout(resolve, EDITOR_TRANSACTION_SETTLE_MS)
              );

              outcome = inspectLiveContent();
            }
          } finally {
            this.plugin.fileStateManager.clearEditorSyncing(file.path);
          }
        }

        if (outcome.state === 'blocked') {
          // A body appeared between the snapshot and now - the same race the vault.process
          // fallback names. Return instead of falling through to it: vault.process reads from
          // disk, which lags the editor by Obsidian's ~2s save debounce, so it would see an
          // empty body and insert a duplicate (odkb/obsidian-api-quirks.md).
          verboseLog(
            this.plugin,
            `[TITLE-INSERT] Body content appeared since creation, skipping insertion for ${file.path}`
          );
          return skipped;
        }

        if (outcome.state === 'inserted') {
          verboseLog(
            this.plugin,
            `[TITLE-INSERT] Verified insertion at line ${outcome.point.insertLine}`
          );
          cursorPositioned = this.settleCursorAfterInsertion(
            view,
            outcome.point.insertLine,
            finalTitle.length
          );
          insertedViaEditor = true;
        } else {
          verboseLog(
            this.plugin,
            `[TITLE-INSERT] Verification failed after ${TITLE_INSERTION_MAX_ATTEMPTS} attempts, fallback to vault.process`
          );
        }
      }

      if (!insertedViaEditor) {
        verboseLog(
          this.plugin,
          `[TITLE-INSERT] Inserting title via vault.process`
        );
        let wroteViaVault = false;

        await this.app.vault.process(file, (content) => {
          // Re-derive from the callback's content rather than the creation-time snapshot,
          // through the same helper the editor path uses so the two cannot drift again.
          const point = this.deriveTitleInsertionPoint(content);

          if (point.hasBodyContent) {
            // Content exists - skip insertion to avoid duplicate
            return content;
          }

          wroteViaVault = true;

          if (point.frontmatterEndLine !== -1) {
            const freshLines = content.split('\n');
            freshLines.splice(point.insertLine, 0, finalTitle);
            return freshLines.join('\n');
          }
          return finalTitle + '\n' + content;
        });

        if (!wroteViaVault) {
          verboseLog(
            this.plugin,
            `[TITLE-INSERT] Body content already present on disk, skipped insertion for ${file.path}`
          );
          return skipped;
        }
      }

      verboseLog(this.plugin, `Successfully inserted title in ${file.path}`);
      return { inserted: true, cursorPositioned };
    } catch (error) {
      console.error(
        `Error inserting title on creation for ${file.path}:`,
        error
      );
      return skipped;
    }
  }

  /**
   * Handles cursor positioning for new file creation (Step 1)
   * @param file - The file to position cursor in
   * @param usePlaceCursorAtLineEndSetting - Controls cursor placement:
   *   - true: Use placeCursorAtLineEnd setting (when title insertion will be skipped)
   *   - false: Always position at line start (when title will be inserted in Step 2)
   * @param explicitPlaceCursorAtEnd - Optional explicit override from coordinator decision tree
   * Rationale: If title will be inserted, cursor positioned at start now, then Step 2
   * repositions at end after insertion. If title skipped, position at end now.
   */
  async handleCursorPositioning(
    file: TFile,
    usePlaceCursorAtLineEndSetting: boolean = true,
    explicitPlaceCursorAtEnd?: boolean,
    viewHint?: MarkdownView | null
  ): Promise<void> {
    try {
      verboseLog(
        this.plugin,
        `handleCursorPositioning called for ${file.path}, usePlaceCursorAtLineEndSetting: ${usePlaceCursorAtLineEndSetting}`
      );

      // requireEditor false: the original scan matched on path alone and then used optional
      // chaining on the editor, so a view without one must still reach the mode transition
      const targetView = this.resolveMarkdownViewForFile(file, viewHint, false);

      verboseLog(
        this.plugin,
        `Target view found: ${!!targetView}, file matches: ${targetView?.file?.path === file.path}`
      );

      if (targetView) {
        // No view-state transition here: this path only ever runs for a note that was just
        // created, and Obsidian already opens those in Live Preview regardless of the
        // "Default view for new tabs" setting, which governs opening existing notes.
        targetView.editor?.focus();

        const content = targetView.editor?.getValue() || '';
        const point = this.deriveTitleInsertionPoint(content);
        const titleLineNumber = point.insertLine;

        if (point.frontmatterEndLine !== -1) {
          verboseLog(
            this.plugin,
            `Found frontmatter ending at line ${point.frontmatterEndLine}, title on line ${titleLineNumber}`
          );
        } else {
          verboseLog(
            this.plugin,
            `No frontmatter found, title on line ${titleLineNumber}`
          );
        }

        const titleLineLength =
          targetView.editor?.getLine(titleLineNumber)?.length || 0;

        // Determine target position
        let targetPosition: { line: number; ch: number };

        if (explicitPlaceCursorAtEnd !== undefined) {
          // Use explicit override from coordinator decision tree
          if (explicitPlaceCursorAtEnd) {
            targetPosition = { line: titleLineNumber, ch: titleLineLength };
          } else {
            targetPosition = { line: titleLineNumber, ch: 0 };
          }
        } else if (!usePlaceCursorAtLineEndSetting) {
          // Title will be inserted in Step 2 - position at start of title line
          targetPosition = { line: titleLineNumber, ch: 0 };
        } else {
          // Title insertion skipped - use placeCursorAtLineEnd setting
          if (this.settings.core.moveCursorToFirstLine) {
            if (this.settings.core.placeCursorAtLineEnd) {
              // Place at end of title line
              targetPosition = { line: titleLineNumber, ch: titleLineLength };
            } else {
              // Place at start of title line
              targetPosition = { line: titleLineNumber, ch: 0 };
            }
          } else {
            // Don't move cursor
            return;
          }
        }

        verboseLog(
          this.plugin,
          `[CURSOR-FLIT] file-operations.ts - BEFORE setCursor() | target: line ${targetPosition.line} ch ${targetPosition.ch}`
        );
        targetView.editor?.setCursor(targetPosition);
        verboseLog(
          this.plugin,
          `[CURSOR-POS] Set cursor to line ${targetPosition.line}, ch ${targetPosition.ch} for ${file.path}`
        );
      } else {
        verboseLog(
          this.plugin,
          `Skipping cursor positioning - no matching active view for ${file.path}`
        );
      }
    } catch (error) {
      console.error(`Error positioning cursor for ${file.path}:`, error);
    }
  }

  /**
   * Checks if a file is currently open in an editor
   */
  isFileOpenInEditor(file: TFile): boolean {
    let isOpen = false;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (
        leaf.view instanceof MarkdownView &&
        leaf.view.file?.path === file.path
      ) {
        isOpen = true;
      }
    });
    return isOpen;
  }

  /**
   * Check if file is excluded from processing (folder/tag/property exclusions + disable property)
   * Uses real-time content checking for tags if content provided
   * @param exclusionOverrides - Per-caller opt-outs; callers own which exclusion types apply
   */
  isFileExcludedForCursorPositioning(
    file: TFile,
    content?: string,
    exclusionOverrides?: {
      ignoreFolder?: boolean;
      ignoreTag?: boolean;
      ignoreProperty?: boolean;
    }
  ): boolean {
    if (
      !shouldProcessFile(
        file,
        this.settings,
        this.app,
        content,
        exclusionOverrides,
        this.plugin
      )
    ) {
      return true;
    }

    if (content) {
      const hasDisableProperty = this.checkDisablePropertyInContent(content);
      if (hasDisableProperty) {
        return true;
      }
    } else {
      if (
        hasDisablePropertyInFile(
          file,
          this.app,
          this.settings.exclusions.disableRenamingKey,
          this.settings.exclusions.disableRenamingValue
        )
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check for the disable-renaming property by parsing YAML directly from content.
   * Excluded properties are deliberately NOT checked here: shouldProcessFile now reads the
   * same real-time content, so duplicating the rules would fork the matcher again.
   */
  private checkDisablePropertyInContent(content: string): boolean {
    const frontmatterInfo = getFrontMatterInfo(content);
    if (!frontmatterInfo.exists) return false;

    let frontmatter: Record<string, unknown>;
    try {
      frontmatter = parseYaml(frontmatterInfo.frontmatter) as Record<
        string,
        unknown
      >;
    } catch (error) {
      verboseLog(this.plugin, `Failed to parse YAML: ${error}`);
      return false;
    }

    if (!frontmatter || typeof frontmatter !== 'object') return false;

    // Property matching folds case on both the key and the value
    const disableKey =
      this.settings.exclusions.disableRenamingKey.toLowerCase();
    const disableValue =
      this.settings.exclusions.disableRenamingValue.toLowerCase();

    const matchesDisableValue = (value: unknown): boolean =>
      String(value).toLowerCase() === disableValue;

    for (const [key, value] of Object.entries(frontmatter)) {
      if (key.toLowerCase() !== disableKey) continue;

      const matched = Array.isArray(value)
        ? value.some(matchesDisableValue)
        : value !== null && value !== undefined && matchesDisableValue(value);

      if (matched) {
        verboseLog(
          this.plugin,
          `Found disable property: ${key}: ${String(value)}`
        );
        return true;
      }
    }

    return false;
  }

  /**
   * Position cursor at end of title line after insertion (if settings allow)
   * Helper to consolidate cursor positioning logic in insertTitle
   * @param view The Markdown view where title was inserted
   * @param titleLine Line number where title was inserted
   * @param titleLength Length of the inserted title
   * @returns true when a cursor move was scheduled, false when settings ruled it out
   */
  private positionCursorAfterTitleInsertion(
    view: MarkdownView,
    titleLine: number,
    titleLength: number
  ): boolean {
    if (
      !this.settings.core.moveCursorToFirstLine ||
      !this.settings.core.placeCursorAtLineEnd
    ) {
      return false;
    }

    window.setTimeout(() => {
      if (view.editor) {
        view.editor.focus();
        verboseLog(
          this.plugin,
          `[CURSOR-FLIT] file-operations.ts - BEFORE setCursor() | target: line ${titleLine} ch ${titleLength}`
        );
        view.editor.setCursor({ line: titleLine, ch: titleLength });
        verboseLog(
          this.plugin,
          `[TITLE-INSERT] Positioned cursor at end of title line ${titleLine} (${titleLength} chars)`
        );
      }
    }, 0);

    return true;
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    // No cleanup needed
  }
}
