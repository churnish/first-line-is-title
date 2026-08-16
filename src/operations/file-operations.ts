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

export class FileOperations {
  constructor(private plugin: FirstLineIsTitle) {}

  get app() {
    return this.plugin.app;
  }

  get settings(): PluginSettings {
    return this.plugin.settings;
  }

  /**
   * Inserts the filename as the first line of a newly created file
   * @param initialContent - Optional initial content captured at file creation time
   * @returns true if title was inserted, false if skipped
   */
  async insertTitleOnCreation(
    file: TFile,
    initialContent?: string
  ): Promise<boolean> {
    try {
      const untitledWord = t('untitled').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const untitledPattern = new RegExp(`^${untitledWord}(\\s[1-9]\\d*)?$`);
      if (untitledPattern.test(file.basename)) {
        verboseLog(
          this.plugin,
          `Skipping title insertion for untitled file: ${file.path}`
        );
        return false;
      }

      // Title goes into the note body, so restore the spacing the trim flags stripped from the filename
      const cleanTitle = reverseCharacterReplacements(
        file.basename,
        this.settings,
        this.plugin,
        { restoreTrimmedSpacing: true }
      );

      // Note: addHeadingToTitle setting will be applied conditionally below
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
            searchWorkspace: this.settings.core.fileReadMethod === 'Editor',
            preferFresh: true,
          });
        } catch (error) {
          console.error(
            `Failed to read file ${file.path} for title insertion:`,
            error
          );
          return false;
        }
      }

      const lines = currentContent.split('\n');

      let yamlEndLine = -1;
      if (lines[0] === '---') {
        for (let i = 1; i < lines.length; i++) {
          if (lines[i] === '---') {
            yamlEndLine = i;
            break;
          }
        }
      }

      const contentAfterYaml =
        yamlEndLine !== -1
          ? lines
              .slice(yamlEndLine + 1)
              .join('\n')
              .trim()
          : currentContent.trim();

      if (contentAfterYaml !== '') {
        verboseLog(this.plugin, `File has content (excluding YAML)`);
        const startLineIndex = yamlEndLine !== -1 ? yamlEndLine + 1 : 0;
        let firstNonEmptyLine: string | null = null;
        let firstNonEmptyLineIndex = -1;

        for (let i = startLineIndex; i < lines.length; i++) {
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

          const leaves = this.app.workspace.getLeavesOfType('markdown');
          let insertedViaEditor = false;

          for (const leaf of leaves) {
            const view = leaf.view as MarkdownView;
            if (view && view.file?.path === file.path && view.editor) {
              view.editor.setLine(firstNonEmptyLineIndex, titleWithHeading);
              verboseLog(
                this.plugin,
                `[TITLE-INSERT] Replaced heading at line ${firstNonEmptyLineIndex} via editor`
              );

              // Position cursor at end of title if both settings enabled
              this.positionCursorAfterTitleInsertion(
                view,
                firstNonEmptyLineIndex,
                titleWithHeading.length
              );

              insertedViaEditor = true;
              break;
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
          return true;
        } else {
          verboseLog(
            this.plugin,
            `File has content without heading pattern, skipping title insertion for ${file.path}`
          );

          // If both settings are ON, position cursor at line end even though we're not inserting
          if (
            this.settings.core.moveCursorToFirstLine &&
            this.settings.core.placeCursorAtLineEnd
          ) {
            // Always check exclusions (cursor never moved in excluded notes)
            const isExcluded = this.isFileExcludedForCursorPositioning(
              file,
              currentContent
            );

            if (!isExcluded) {
              const leaves = this.app.workspace.getLeavesOfType('markdown');
              for (const leaf of leaves) {
                const view = leaf.view as MarkdownView;
                if (view && view.file?.path === file.path && view.editor) {
                  const contentLine = yamlEndLine !== -1 ? yamlEndLine + 1 : 0;
                  const lineContent = view.editor.getLine(contentLine);
                  const lineLength = lineContent.length;

                  // Use setTimeout to ensure cursor positioning happens after any pending editor updates
                  window.setTimeout(() => {
                    if (view.editor) {
                      view.editor.focus();
                      verboseLog(
                        this.plugin,
                        `[CURSOR-FLIT] file-operations.ts:245 - BEFORE setCursor() | target: line ${contentLine} ch ${lineLength}`
                      );
                      view.editor.setCursor({
                        line: contentLine,
                        ch: lineLength,
                      });
                      verboseLog(
                        this.plugin,
                        `[TITLE-INSERT] File has content, positioned cursor at end of line ${contentLine} (${lineLength} chars)`
                      );
                    }
                  }, 0);
                  break;
                }
              }
            }
          }

          return false;
        }
      }

      // Apply addHeadingToTitle setting since no heading pattern was found
      const finalTitle = this.settings.markupStripping.addHeadingToTitle
        ? '# ' + cleanTitle
        : cleanTitle;

      // Check if canvas active - canvas files have no editor, use vault.process() immediately
      const canvasIsActive =
        this.app.workspace.getMostRecentLeaf()?.view?.getViewType?.() ===
        'canvas';
      let insertedViaEditor = false;

      if (!canvasIsActive) {
        // Use live build's simple loop structure (proven to work)
        const leaves = this.app.workspace.getLeavesOfType('markdown');

        for (const leaf of leaves) {
          const view = leaf.view as MarkdownView;
          if (view && view.file?.path === file.path && view.editor) {
            let titleLine = yamlEndLine !== -1 ? yamlEndLine + 1 : 0;
            const insertPos = { line: titleLine, ch: 0 };

            // Verify insertion with retry (max 10 attempts = 1000ms)
            for (let attempt = 0; attempt < 10; attempt++) {
              view.editor.replaceRange(finalTitle + '\n', insertPos);

              // Let editor process the change before verification
              await new Promise((resolve) => window.setTimeout(resolve, 10));

              // Now verify
              const content = view.editor.getValue();
              const lines = content.split('\n');
              if (lines[titleLine]?.trim() === finalTitle.trim()) {
                // Success - position cursor
                verboseLog(
                  this.plugin,
                  `[TITLE-INSERT] Verified insertion at line ${titleLine} (attempt ${attempt + 1})`
                );
                this.positionCursorAfterTitleInsertion(
                  view,
                  titleLine,
                  finalTitle.length
                );
                insertedViaEditor = true;
                break;
              }

              // Failed - wait before retry
              if (attempt < 9) {
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
              } else {
                verboseLog(
                  this.plugin,
                  `[TITLE-INSERT] Verification failed after 10 attempts, fallback to vault.process`
                );
              }
            }
            break; // Exit leaf loop
          }
        }
      }

      if (!insertedViaEditor) {
        verboseLog(
          this.plugin,
          `[TITLE-INSERT] Inserting title via vault.process`
        );
        await this.app.vault.process(file, (content) => {
          // Always use fresh content from vault.process callback (not stale initialContent)
          // This handles race conditions where file content changed since initial read
          const freshLines = content.split('\n');
          let freshYamlEndLine = -1;
          if (freshLines[0] === '---') {
            for (let i = 1; i < freshLines.length; i++) {
              if (freshLines[i] === '---') {
                freshYamlEndLine = i;
                break;
              }
            }
          }

          // Check if content after YAML is non-empty (race condition: content appeared)
          const contentStartLine =
            freshYamlEndLine !== -1 ? freshYamlEndLine + 1 : 0;
          const contentAfterYaml = freshLines
            .slice(contentStartLine)
            .join('\n')
            .trim();
          if (contentAfterYaml !== '') {
            // Content exists - skip insertion to avoid duplicate
            return content;
          }

          if (freshYamlEndLine !== -1) {
            freshLines.splice(freshYamlEndLine + 1, 0, finalTitle);
            return freshLines.join('\n');
          } else {
            return finalTitle + '\n' + content;
          }
        });
      }

      verboseLog(this.plugin, `Successfully inserted title in ${file.path}`);
      return true;
    } catch (error) {
      console.error(
        `Error inserting title on creation for ${file.path}:`,
        error
      );
      return false;
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
    explicitPlaceCursorAtEnd?: boolean
  ): Promise<void> {
    try {
      verboseLog(
        this.plugin,
        `handleCursorPositioning called for ${file.path}, usePlaceCursorAtLineEndSetting: ${usePlaceCursorAtLineEndSetting}`
      );

      let targetView: MarkdownView | null = null;
      const leaves = this.app.workspace.getLeavesOfType('markdown');
      for (const leaf of leaves) {
        const view = leaf.view as MarkdownView;
        if (view && view.file?.path === file.path) {
          targetView = view;
          break;
        }
      }

      verboseLog(
        this.plugin,
        `Target view found: ${!!targetView}, file matches: ${targetView?.file?.path === file.path}`
      );

      if (targetView && targetView.file?.path === file.path) {
        await targetView.leaf.setViewState({
          type: 'markdown',
          state: {
            mode: 'source',
            source: false,
          },
        });

        targetView.editor?.focus();

        let titleLineNumber = 0;
        let titleLineLength = 0;
        const content = targetView.editor?.getValue() || '';
        const lines = content.split('\n');

        let yamlEndLine = -1;
        if (lines[0] === '---') {
          for (let i = 1; i < lines.length; i++) {
            if (lines[i] === '---') {
              yamlEndLine = i;
              break;
            }
          }
        }

        if (yamlEndLine !== -1) {
          titleLineNumber = yamlEndLine + 1;
          verboseLog(
            this.plugin,
            `Found frontmatter ending at line ${yamlEndLine}, title on line ${titleLineNumber}`
          );
        } else {
          titleLineNumber = 0;
          verboseLog(
            this.plugin,
            `No frontmatter found, title on line ${titleLineNumber}`
          );
        }

        titleLineLength =
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
          `[CURSOR-FLIT] file-operations.ts:500 - BEFORE setCursor() | target: line ${targetPosition.line} ch ${targetPosition.ch}`
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
   * Helper to consolidate cursor positioning logic in insertTitleOnCreation
   * @param view The Markdown view where title was inserted
   * @param titleLine Line number where title was inserted
   * @param titleLength Length of the inserted title
   */
  private positionCursorAfterTitleInsertion(
    view: MarkdownView,
    titleLine: number,
    titleLength: number
  ): void {
    if (
      this.settings.core.moveCursorToFirstLine &&
      this.settings.core.placeCursorAtLineEnd
    ) {
      window.setTimeout(() => {
        if (view.editor) {
          view.editor.focus();
          verboseLog(
            this.plugin,
            `[CURSOR-FLIT] file-operations.ts:641 - BEFORE setCursor() | target: line ${titleLine} ch ${titleLength}`
          );
          view.editor.setCursor({ line: titleLine, ch: titleLength });
          verboseLog(
            this.plugin,
            `[TITLE-INSERT] Positioned cursor at end of title line ${titleLine} (${titleLength} chars)`
          );
        }
      }, 0);
    }
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    // No cleanup needed
  }
}
