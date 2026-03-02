import {
  TFile,
  MarkdownView,
  getFrontMatterInfo,
  parseYaml,
  Editor,
} from 'obsidian';
import { PluginSettings } from '../types';
import {
  verboseLog,
  shouldProcessFile,
  extractTitle,
  hasDisablePropertyInFile,
  findTitleSourceLine,
} from '../utils';
import { t } from '../i18n';
import { readFileContent } from '../utils/content-reader';
import FirstLineIsTitle from '../../main';

const ZWSP = '\u200B';

/** Check if alias is plugin-managed (exactly wrapped by ZWSP markers) */
function isPluginAlias(alias: unknown): boolean {
  return (
    typeof alias === 'string' && alias.startsWith(ZWSP) && alias.endsWith(ZWSP)
  );
}

export class AliasManager {
  constructor(private plugin: FirstLineIsTitle) {}

  get app() {
    return this.plugin.app;
  }

  get settings(): PluginSettings {
    return this.plugin.settings;
  }

  /**
   * Parse comma-separated alias property keys from settings.
   * Called multiple times per operation but not cached since:
   * - Property string is typically short ("aliases")
   * - Caching adds complexity without measurable benefit
   */
  private getAliasPropertyKeys(): string[] {
    const aliasPropertyKey =
      this.settings.aliases.aliasPropertyKey || 'aliases';
    return aliasPropertyKey
      .split(',')
      .map((key) => key.trim())
      .filter((key) => key.length > 0);
  }

  async updateAliasIfNeeded(
    file: TFile,
    providedContent?: string,
    targetTitle?: string,
    editor?: Editor,
    isBatchOperation = false
  ): Promise<boolean> {
    // Track plugin usage
    this.plugin.trackUsage();

    try {
      const currentFile = this.app.vault.getAbstractFileByPath(file.path);
      if (!currentFile || !(currentFile instanceof TFile)) {
        verboseLog(
          this.plugin,
          `Skipping alias update - file no longer exists: ${file.path}`
        );
        return false;
      }

      file = currentFile;

      // Note: No lock check here - alias manager is called from within processFile's lock
      // The lock is already acquired by the time we reach this point

      // Check disable property FIRST - this cannot be overridden by any command
      if (
        hasDisablePropertyInFile(
          file,
          this.app,
          this.settings.exclusions.disableRenamingKey,
          this.settings.exclusions.disableRenamingValue
        )
      ) {
        verboseLog(
          this.plugin,
          `Skipping alias update - file has disable property: ${file.path}`
        );
        return false;
      }

      if (
        !shouldProcessFile(
          file,
          this.settings,
          this.app,
          undefined,
          undefined,
          this.plugin
        )
      ) {
        return false;
      }

      // Skip ALL alias operations in popovers/canvas due to Obsidian sync/cache issues
      // Popovers and canvas have: delayed disk writes, stale editor cache, content mismatches

      // Check canvas first - works without editor parameter
      const mostRecentLeaf = this.app.workspace.getMostRecentLeaf();
      const viewType = mostRecentLeaf?.view?.getViewType?.();
      const isCanvas = viewType === 'canvas';

      if (isCanvas) {
        verboseLog(
          this.plugin,
          `Skipping alias update in canvas: ${file.path}`
        );
        return false;
      }

      // Check popover (requires editor parameter)
      if (editor && this.isEditorInPopoverOrCanvas(editor, file)) {
        verboseLog(
          this.plugin,
          `Skipping alias update in popover: ${file.path}`
        );
        return false;
      }

      const content = await readFileContent(this.plugin, file, {
        providedContent,
        providedEditor: editor,
      });

      if (!content || content.trim() === '') {
        return false;
      }

      const contentWithoutFrontmatter =
        this.plugin.renameEngine.stripFrontmatterFromContent(content, file);
      const lines = contentWithoutFrontmatter.split('\n');

      // Find first non-empty line (consistent with rename-engine.ts)
      let firstNonEmptyLine = '';
      for (const line of lines) {
        if (line.trim() !== '') {
          firstNonEmptyLine = line;
          break;
        }
      }

      if (!firstNonEmptyLine || firstNonEmptyLine.trim() === '') {
        if (this.settings.aliases.enableAliases) {
          await this.removePluginAliasesFromFile(file);
        }
        return false;
      }

      // Determine titleSourceLine using shared utility function
      // This may differ from firstNonEmptyLine in special cases (card links, code blocks, tables)
      const titleSourceLine = findTitleSourceLine(
        lines,
        this.settings,
        this.plugin
      );

      if (!this.settings.aliases.enableAliases) {
        return false;
      }

      // Parse frontmatter from fresh editor content instead of stale cache
      // This prevents race conditions where cache hasn't updated yet during YAML edits
      const frontmatterInfo = getFrontMatterInfo(content);
      let frontmatter: Record<string, unknown> | null = null;
      if (frontmatterInfo.exists) {
        try {
          frontmatter = parseYaml(frontmatterInfo.frontmatter);
        } catch {
          // YAML is malformed (e.g., user is mid-typing) - skip alias update until valid
          verboseLog(
            this.plugin,
            `Skipping alias update - malformed YAML in ${file.path}`
          );
          return false;
        }
      }

      const processedTitleSource = extractTitle(titleSourceLine, this.settings);
      const titleToCompare =
        targetTitle !== undefined ? targetTitle.trim() : file.basename.trim();
      const processedLineMatchesFilename =
        processedTitleSource.trim() === titleToCompare;

      const shouldHaveAlias =
        !this.settings.aliases.addAliasOnlyIfFirstLineDiffers ||
        !processedLineMatchesFilename;

      if (!shouldHaveAlias) {
        verboseLog(
          this.plugin,
          `Removing plugin aliases - first line matches filename: "${processedTitleSource}" = "${titleToCompare}"`
        );
        await this.removePluginAliasesFromFile(file);
        return false;
      }

      const aliasPropertyKeys = this.getAliasPropertyKeys();
      let expectedAlias = this.settings.markupStripping.stripMarkupInAlias
        ? extractTitle(titleSourceLine, this.settings)
        : titleSourceLine;
      // Apply truncation if enabled (must match what addAliasToFile will produce)
      if (this.settings.aliases.truncateAlias) {
        if (expectedAlias.length > this.settings.core.charCount - 1) {
          expectedAlias =
            expectedAlias.slice(0, this.settings.core.charCount - 1).trimEnd() +
            '…';
        }
      }
      const expectedAliasWithMarker = ZWSP + expectedAlias + ZWSP;

      let allPropertiesHaveCorrectAlias = true;
      let aliasNeedsRepositioning = false;
      for (const aliasPropertyKey of aliasPropertyKeys) {
        let existingAliases: string[] = [];
        if (frontmatter && frontmatter[aliasPropertyKey]) {
          if (Array.isArray(frontmatter[aliasPropertyKey])) {
            existingAliases = frontmatter[aliasPropertyKey] as string[];
          } else {
            existingAliases = [frontmatter[aliasPropertyKey] as string];
          }
        }

        const hasCorrectAlias = existingAliases.some(
          (alias) =>
            alias === expectedAliasWithMarker || alias === expectedAlias
        );

        if (!hasCorrectAlias) {
          allPropertiesHaveCorrectAlias = false;
          break;
        }

        // Check if alias needs repositioning (placeAliasLast ON but not last)
        if (
          this.settings.aliases.placeAliasLast &&
          existingAliases.length > 1
        ) {
          const lastAlias = existingAliases[existingAliases.length - 1];
          const isPluginAliasLast = isPluginAlias(lastAlias);
          if (!isPluginAliasLast) {
            aliasNeedsRepositioning = true;
          }
        }
      }

      if (allPropertiesHaveCorrectAlias && !aliasNeedsRepositioning) {
        verboseLog(
          this.plugin,
          `File ${file.path} already has correct alias in all properties`
        );
        return true;
      }

      // Note: Lock already acquired by processFile - alias runs within that lock
      // No need to acquire separate lock here

      try {
        verboseLog(
          this.plugin,
          `Adding alias to ${file.path} - no correct alias found`
        );
        await this.addAliasToFile(
          file,
          titleSourceLine,
          titleToCompare,
          content,
          editor,
          isBatchOperation
        );
        return true;
      } catch (error) {
        console.error('Error updating alias:', error);
        return false;
      }
    } catch (error) {
      console.error('Error updating alias:', error);
      return false;
    }
  }

  async addAliasToFile(
    file: TFile,
    originalFirstNonEmptyLine: string,
    newTitle: string,
    content: string,
    editor?: Editor,
    isBatchOperation = false
  ): Promise<void> {
    try {
      // Validate file exists and get fresh reference from vault.
      // We also re-validate before each processFrontMatter call to guard against
      // file deletion during activeView.save().
      const currentFile = this.app.vault.getAbstractFileByPath(file.path);
      if (!currentFile || !(currentFile instanceof TFile)) {
        verboseLog(
          this.plugin,
          `Skipping alias addition - file no longer exists: ${file.path}`
        );
        return;
      }
      file = currentFile;

      const firstNonEmptyLine = originalFirstNonEmptyLine;
      let aliasProcessedLine = firstNonEmptyLine;

      // Apply custom replacements to alias if enabled
      if (
        this.settings.customRules.enableCustomReplacements &&
        this.settings.markupStripping.applyCustomRulesInAlias
      ) {
        for (const replacement of this.settings.customRules
          .customReplacements) {
          if (replacement.searchText === '' || !replacement.enabled) continue;

          let tempLine = aliasProcessedLine;
          if (replacement.onlyWholeLine) {
            if (aliasProcessedLine.trim() === replacement.searchText.trim()) {
              tempLine = replacement.replaceText;
            }
          } else if (replacement.onlyAtStart) {
            if (tempLine.startsWith(replacement.searchText)) {
              tempLine =
                replacement.replaceText +
                tempLine.slice(replacement.searchText.length);
            }
          } else {
            tempLine = tempLine.replaceAll(
              replacement.searchText,
              replacement.replaceText
            );
          }
          aliasProcessedLine = tempLine;
        }
      }

      // Process alias WITHOUT forbidden char replacements.
      // Use try/finally to guarantee settings restoration even if extractTitle throws.
      const originalCharReplacementSetting =
        this.settings.replaceCharacters.enableForbiddenCharReplacements;
      const originalStripMarkupSetting =
        this.settings.markupStripping.enableStripMarkup;

      let aliasToAdd: string;
      try {
        this.settings.replaceCharacters.enableForbiddenCharReplacements = false;
        if (!this.settings.markupStripping.stripMarkupInAlias) {
          this.settings.markupStripping.enableStripMarkup = false;
        }
        aliasToAdd = extractTitle(aliasProcessedLine, this.settings);
      } finally {
        this.settings.replaceCharacters.enableForbiddenCharReplacements =
          originalCharReplacementSetting;
        this.settings.markupStripping.enableStripMarkup =
          originalStripMarkupSetting;
      }
      // Re-check alias-matches-filename after custom rules are applied.
      // The caller (updateAliasIfNeeded) checks this at line 182, but custom replacement
      // rules (lines 276-303) can modify the alias value differently, so we must verify again.
      const targetTitle = newTitle.trim();
      const aliasMatchesFilename = aliasToAdd.trim() === targetTitle;
      const shouldAddAlias =
        !this.settings.aliases.addAliasOnlyIfFirstLineDiffers ||
        !aliasMatchesFilename;

      if (!shouldAddAlias) {
        verboseLog(
          this.plugin,
          `Removing plugin aliases and skipping add - alias matches filename: \`${aliasToAdd}\` = \`${targetTitle}\``
        );
        await this.removePluginAliasesFromFile(file);
        return;
      }

      // Apply truncation to alias if enabled
      if (this.settings.aliases.truncateAlias) {
        if (aliasToAdd.length > this.settings.core.charCount - 1) {
          aliasToAdd =
            aliasToAdd.slice(0, this.settings.core.charCount - 1).trimEnd() +
            '…';
        }
      }

      // If the alias is empty, only whitespace, or just an ellipsis (from extreme truncation),
      // remove the plugin alias instead - these provide no meaningful value.
      if (
        !aliasToAdd ||
        aliasToAdd.trim() === '' ||
        aliasToAdd.trim() === '…'
      ) {
        verboseLog(
          this.plugin,
          `Removing plugin alias - no meaningful content found`
        );
        await this.removePluginAliasesFromFile(file);
        return;
      }

      // Prevent "Untitled" or "Untitled n" aliases UNLESS first line is literally that.
      // Pattern matches: "Untitled", "Untitled 2", "Untitled 10", etc.
      // Pattern excludes: "Untitled 0", "Untitled 01" (via [1-9]) to match Obsidian's
      // auto-numbering which starts at 2 for duplicates.
      const untitledWord = t('untitled').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const untitledPattern = new RegExp(`^${untitledWord}(\\s+[1-9]\\d*)?$`);
      if (untitledPattern.test(aliasToAdd.trim())) {
        // Check if original first non-empty line (before processing) was literally "Untitled" or "Untitled n"
        const originalFirstLineTrimmed = firstNonEmptyLine.trim();

        if (!untitledPattern.test(originalFirstLineTrimmed)) {
          // Extracted title is "Untitled" but first line is not literally "Untitled"
          // This happens when markup stripping results in empty content:
          // - Empty headings: `#`, `##`, etc.
          // - Empty list markers: `- `, `* `, `1. `, etc.
          // - Template syntax: `<%*`, `<% tp.file.cursor() %>`, etc.
          // Remove any stale plugin aliases since there's no valid content
          verboseLog(
            this.plugin,
            `Removing stale aliases - extracted title is "Untitled" from markup: ${originalFirstLineTrimmed}`
          );
          await this.removePluginAliasesFromFile(file);
          return;
        }
      }

      // Mark alias with ZWSP for identification
      const markedAlias = ZWSP + aliasToAdd + ZWSP;
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView && activeView.file === file) {
        await activeView.save();
      }

      // Parse content directly to avoid race conditions with metadata cache
      const lines = content.split('\n');
      const hasFrontmatter = lines.length > 0 && lines[0].trim() === '---';

      if (!hasFrontmatter) {
        // Re-validate: file could be renamed/deleted during save() above
        const currentFileForFrontmatter = this.app.vault.getAbstractFileByPath(
          file.path
        );
        if (
          !currentFileForFrontmatter ||
          !(currentFileForFrontmatter instanceof TFile)
        ) {
          verboseLog(
            this.plugin,
            `Skipping frontmatter creation - file no longer exists: ${file.path}`
          );
          return;
        }

        // No frontmatter exists - use processFrontMatter to create it properly
        const aliasPropertyKeys = this.getAliasPropertyKeys();
        await this.app.fileManager.processFrontMatter(
          currentFileForFrontmatter,
          (frontmatter) => {
            // Insert alias into all specified properties
            for (const aliasPropertyKey of aliasPropertyKeys) {
              // Use array format for 'aliases' property, inline format for custom properties
              if (aliasPropertyKey === 'aliases') {
                frontmatter[aliasPropertyKey] = [markedAlias];
              } else {
                frontmatter[aliasPropertyKey] = markedAlias;
              }
            }
          }
        );

        // Mark file as having pending metadata cache update
        this.plugin.pendingMetadataUpdates.add(currentFileForFrontmatter);
        verboseLog(
          this.plugin,
          `Created frontmatter and added alias \`${aliasToAdd}\` to ${currentFileForFrontmatter.path}`
        );
        return;
      }

      // Re-validate: file could be renamed/deleted during save() above
      const currentFileForUpdate = this.app.vault.getAbstractFileByPath(
        file.path
      );
      if (!currentFileForUpdate || !(currentFileForUpdate instanceof TFile)) {
        verboseLog(
          this.plugin,
          `Skipping frontmatter update - file no longer exists: ${file.path}`
        );
        return;
      }

      // Try editor-based update first (avoids "modified externally" notification)
      // Skip for batch operations - most files won't have editor open
      // Skip when placeAliasLast is ON - need processFrontMatter to reorder
      if (
        !isBatchOperation &&
        !this.settings.aliases.placeAliasLast &&
        (await this.tryEditorBasedAliasUpdate(
          currentFileForUpdate,
          aliasToAdd,
          editor
        ))
      ) {
        // Save to flush editor changes to disk and update metadata cache
        // Without this, reading/live preview mode won't reflect the change
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.file === currentFileForUpdate) {
          // Mark as pending to prevent duplicate processing from metadata-changed event
          this.plugin.pendingMetadataUpdates.add(currentFileForUpdate);
          await activeView.save();
        }
        verboseLog(
          this.plugin,
          `TRY_EDITOR_UPDATE: used editor path for ${currentFileForUpdate.path}`
        );
        return;
      }
      if (!isBatchOperation) {
        verboseLog(
          this.plugin,
          `TRY_EDITOR_UPDATE: falling back to processFrontMatter for ${currentFileForUpdate.path}`
        );
      }

      // File has frontmatter - update aliases via processFrontMatter
      const aliasPropertyKeys = this.getAliasPropertyKeys();
      await this.app.fileManager.processFrontMatter(
        currentFileForUpdate,
        (frontmatter) => {
          // Insert alias into all specified properties
          for (const aliasPropertyKey of aliasPropertyKeys) {
            // Check if property is 'aliases' - if yes, use current behavior
            if (aliasPropertyKey === 'aliases') {
              let existingAliases: string[] = [];
              if (frontmatter[aliasPropertyKey]) {
                if (Array.isArray(frontmatter[aliasPropertyKey])) {
                  existingAliases = [...frontmatter[aliasPropertyKey]];
                } else {
                  existingAliases = [frontmatter[aliasPropertyKey]];
                }
              }

              // Find existing plugin alias index (ZWSP-wrapped)
              const existingPluginIndex = existingAliases.findIndex((alias) =>
                isPluginAlias(alias)
              );

              // Remove plugin aliases and empty strings
              const userAliases = existingAliases.filter(
                (alias) => !isPluginAlias(alias) && alias !== ''
              );

              // Check if this exact alias already exists (unmarked)
              if (!userAliases.includes(aliasToAdd)) {
                if (existingPluginIndex === -1) {
                  // No existing plugin alias - always add at end
                  userAliases.push(markedAlias);
                } else if (this.settings.aliases.placeAliasLast) {
                  // Has existing plugin alias, placeAliasLast ON - move to end
                  userAliases.push(markedAlias);
                } else {
                  // Has existing plugin alias, placeAliasLast OFF - keep original position
                  userAliases.splice(existingPluginIndex, 0, markedAlias);
                }
                frontmatter[aliasPropertyKey] = userAliases;
              } else {
                // Alias already exists unmarked - just keep user aliases
                if (userAliases.length === 0) {
                  if (this.settings.aliases.keepEmptyAliasProperty) {
                    frontmatter[aliasPropertyKey] = null;
                  } else {
                    delete frontmatter[aliasPropertyKey];
                  }
                } else {
                  frontmatter[aliasPropertyKey] = userAliases;
                }
              }
            } else {
              // New behavior for non-aliases properties
              const propertyExists = Object.prototype.hasOwnProperty.call(
                frontmatter,
                aliasPropertyKey
              );

              if (
                !propertyExists ||
                frontmatter[aliasPropertyKey] === null ||
                frontmatter[aliasPropertyKey] === undefined ||
                frontmatter[aliasPropertyKey] === ''
              ) {
                // Property doesn't exist or has no value - insert inline
                frontmatter[aliasPropertyKey] = markedAlias;
              } else {
                // Property has existing values
                let existingValues: string[] = [];
                if (Array.isArray(frontmatter[aliasPropertyKey])) {
                  existingValues = [...frontmatter[aliasPropertyKey]];
                } else {
                  existingValues = [frontmatter[aliasPropertyKey]];
                }

                // Find existing plugin value index (ZWSP-wrapped)
                const existingPluginIndex = existingValues.findIndex((value) =>
                  isPluginAlias(value)
                );

                // Remove plugin values and empty strings
                const userValues = existingValues.filter(
                  (value) => !isPluginAlias(value) && value !== ''
                );

                // Check if this exact value already exists (unmarked)
                if (!userValues.includes(aliasToAdd)) {
                  if (userValues.length === 0) {
                    // No user values, just our value - insert inline
                    frontmatter[aliasPropertyKey] = markedAlias;
                  } else {
                    // Has user values - add plugin value
                    if (existingPluginIndex === -1) {
                      // No existing plugin value - always add at end
                      userValues.push(markedAlias);
                    } else if (this.settings.aliases.placeAliasLast) {
                      // Has existing plugin value, placeAliasLast ON - move to end
                      userValues.push(markedAlias);
                    } else {
                      // Has existing plugin value, placeAliasLast OFF - keep position
                      userValues.splice(existingPluginIndex, 0, markedAlias);
                    }
                    frontmatter[aliasPropertyKey] = userValues;
                  }
                } else {
                  // Value already exists, just restore user values
                  if (userValues.length === 0) {
                    if (this.settings.aliases.keepEmptyAliasProperty) {
                      frontmatter[aliasPropertyKey] = null;
                    } else {
                      delete frontmatter[aliasPropertyKey];
                    }
                  } else if (userValues.length === 1) {
                    frontmatter[aliasPropertyKey] = userValues[0];
                  } else {
                    frontmatter[aliasPropertyKey] = userValues;
                  }
                }
              }
            }
          }
        }
      );

      // Mark file as having pending metadata cache update
      this.plugin.pendingMetadataUpdates.add(currentFileForUpdate);
      verboseLog(
        this.plugin,
        `Updated alias \`${aliasToAdd}\` in ${currentFileForUpdate.path}`
      );
    } catch (error) {
      // Check if this is an ENOENT error (file was renamed during async operation)
      const errWithCode = error as NodeJS.ErrnoException;
      if (
        errWithCode &&
        typeof errWithCode === 'object' &&
        'code' in errWithCode &&
        errWithCode.code === 'ENOENT'
      ) {
        // File was renamed during operation - this is expected race condition, log as info
        verboseLog(
          this.plugin,
          `Skipping alias addition - file was renamed during operation: ${file.path}`
        );
      } else {
        // Unexpected error, log it
        console.error(`Failed to add alias to file ${file.path}:`, error);
      }
      // Don't throw - alias addition failure shouldn't prevent the rename
    }
  }

  async removePluginAliasesFromFile(file: TFile): Promise<void> {
    try {
      // Validate file exists and get fresh reference from vault.
      // We check twice: once here and once before processFrontMatter.
      // The second check guards against file deletion during activeView.save().
      const currentFile = this.app.vault.getAbstractFileByPath(file.path);
      if (!currentFile || !(currentFile instanceof TFile)) {
        verboseLog(
          this.plugin,
          `Skipping alias removal - file no longer exists: ${file.path}`
        );
        return;
      }
      file = currentFile;

      // Save any unsaved changes before modifying frontmatter
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView && activeView.file === file) {
        await activeView.save();
      }

      // Re-validate: file could be renamed/deleted during save() above
      const currentFileForRemoval = this.app.vault.getAbstractFileByPath(
        file.path
      );
      if (!currentFileForRemoval || !(currentFileForRemoval instanceof TFile)) {
        verboseLog(
          this.plugin,
          `Skipping alias removal - file no longer exists: ${file.path}`
        );
        return;
      }

      await this.app.fileManager.processFrontMatter(
        currentFileForRemoval,
        (frontmatter) => {
          const aliasPropertyKeys = this.getAliasPropertyKeys();

          // Remove plugin aliases from all specified properties
          for (const aliasPropertyKey of aliasPropertyKeys) {
            const propertyExists = Object.prototype.hasOwnProperty.call(
              frontmatter,
              aliasPropertyKey
            );

            if (!propertyExists) {
              continue;
            }

            const propValue = frontmatter[aliasPropertyKey];

            // Handle null/empty property
            if (
              propValue === null ||
              propValue === undefined ||
              propValue === ''
            ) {
              if (!this.settings.aliases.keepEmptyAliasProperty) {
                delete frontmatter[aliasPropertyKey];
              }
              continue;
            }

            let existingValues: string[] = [];

            // Normalize to array
            if (Array.isArray(propValue)) {
              existingValues = [...propValue];
            } else {
              existingValues = [propValue as string];
            }

            // Filter out plugin values (marked with ZWSP) and empty strings
            const filteredValues = existingValues.filter(
              (value) => !isPluginAlias(value) && value !== ''
            );

            // Update or remove the property based on remaining values
            if (filteredValues.length === 0) {
              if (!this.settings.aliases.keepEmptyAliasProperty) {
                // Delete empty property completely
                delete frontmatter[aliasPropertyKey];
              } else {
                // Keep empty property as null
                frontmatter[aliasPropertyKey] = null;
              }
            } else if (
              filteredValues.length === 1 &&
              aliasPropertyKey !== 'aliases'
            ) {
              // For non-aliases properties, convert back to single value if only one remains
              frontmatter[aliasPropertyKey] = filteredValues[0];
            } else {
              // Keep as array for aliases or multiple values
              frontmatter[aliasPropertyKey] = filteredValues;
            }
          }
        }
      );

      // Mark file as having pending metadata cache update
      this.plugin.pendingMetadataUpdates.add(currentFileForRemoval);
      verboseLog(
        this.plugin,
        `Removed plugin aliases from ${currentFileForRemoval.path}`
      );
    } catch (error) {
      // Check if this is an ENOENT error (file was renamed during async operation)
      const errWithCode = error as NodeJS.ErrnoException;
      if (
        errWithCode &&
        typeof errWithCode === 'object' &&
        'code' in errWithCode &&
        errWithCode.code === 'ENOENT'
      ) {
        // File was renamed during operation - this is expected race condition, log as info
        verboseLog(
          this.plugin,
          `Skipping alias removal - file was renamed during operation: ${file.path}`
        );
      } else {
        // Unexpected error, log it
        console.error(
          `Failed to remove plugin aliases from ${file.path}:`,
          error
        );
      }
    }
  }

  async removeAliasFromFile(file: TFile, aliasToRemove: string): Promise<void> {
    try {
      const trimmedAlias = aliasToRemove.trim();

      if (!trimmedAlias) {
        return;
      }

      // Save any unsaved changes before modifying frontmatter
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView && activeView.file === file) {
        await activeView.save();
      }

      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        const aliasPropertyKeys = this.getAliasPropertyKeys();

        // Remove the specified alias from all specified properties
        for (const aliasPropertyKey of aliasPropertyKeys) {
          if (frontmatter[aliasPropertyKey]) {
            let existingAliases: string[] = [];

            // Normalize to array
            if (Array.isArray(frontmatter[aliasPropertyKey])) {
              existingAliases = [...frontmatter[aliasPropertyKey]];
            } else {
              existingAliases = [frontmatter[aliasPropertyKey]];
            }

            // Remove the specified alias and any empty strings
            const filteredAliases = existingAliases.filter(
              (alias) => alias !== trimmedAlias && alias !== ''
            );

            // Update or remove the property
            if (filteredAliases.length === 0) {
              if (this.settings.aliases.keepEmptyAliasProperty) {
                // Keep empty property as null
                frontmatter[aliasPropertyKey] = null;
              } else {
                // Delete empty property
                delete frontmatter[aliasPropertyKey];
              }
            } else {
              frontmatter[aliasPropertyKey] = filteredAliases;
            }
          }
        }
      });

      verboseLog(
        this.plugin,
        `Removed alias "${trimmedAlias}" from ${file.path}`
      );
    } catch (error) {
      console.error(`Failed to remove alias from ${file.path}:`, error);
    }
  }

  /**
   * Check if editor is in a popover (hover preview)
   * Note: Canvas is checked separately before calling this method
   * @param editor - Editor instance to check
   * @param file - File being edited
   * @returns true if editor is in a popover, false if in main workspace
   */
  public isEditorInPopoverOrCanvas(editor: Editor, file: TFile): boolean {
    // If editor is provided, it's from editor-change event
    // Popovers don't trigger editor-change events, so this is always a real editor
    if (editor) {
      return false; // Editor provided = not a popover
    }

    // Get the active markdown view
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

    // If there's no active view, or the active view's editor doesn't match
    // the one we're syncing, it's a popover
    if (!activeView || activeView.file?.path !== file.path) {
      return true; // It's a popover
    }

    // Editor matches active view = main workspace editor
    return false;
  }

  /**
   * Get active editor for a specific file (if currently active)
   */
  private getActiveEditorForFile(file: TFile): Editor | undefined {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view?.file === file ? view.editor : undefined;
  }

  /**
   * Try to update alias via editor.replaceRange() instead of processFrontMatter.
   * This avoids disk write and "modified externally" notifications.
   * @returns true if update succeeded via editor, false if processFrontMatter needed
   */
  private async tryEditorBasedAliasUpdate(
    file: TFile,
    newAlias: string,
    editor?: Editor
  ): Promise<boolean> {
    // Step 1: Get editor
    const activeEditor = editor ?? this.getActiveEditorForFile(file);
    if (!activeEditor) {
      verboseLog(
        this.plugin,
        `TRY_EDITOR_UPDATE [1]: FAIL - no editor available for ${file.path}`
      );
      return false;
    }
    verboseLog(
      this.plugin,
      `TRY_EDITOR_UPDATE [1]: file=${file.path}, editor=defined`
    );

    // Step 2: Get editor content
    const content = activeEditor.getValue();
    verboseLog(
      this.plugin,
      `TRY_EDITOR_UPDATE [2]: content length=${content.length}`
    );

    // Step 3: Check frontmatter exists
    const fmInfo = getFrontMatterInfo(content);
    if (!fmInfo.exists) {
      verboseLog(this.plugin, `TRY_EDITOR_UPDATE [3]: FAIL - no frontmatter`);
      return false;
    }
    verboseLog(
      this.plugin,
      `TRY_EDITOR_UPDATE [3]: frontmatter exists, contentStart=${fmInfo.contentStart}`
    );

    // Step 4: Extract frontmatter section
    const frontmatterText = content.substring(0, fmInfo.contentStart);
    verboseLog(
      this.plugin,
      `TRY_EDITOR_UPDATE [4]: frontmatter length=${frontmatterText.length}`
    );

    // Step 5: Get alias property keys
    const aliasKeys = this.getAliasPropertyKeys();
    verboseLog(
      this.plugin,
      `TRY_EDITOR_UPDATE [5]: alias keys=${aliasKeys.join(',')}`
    );

    // Step 6: For each property, find ZWSP value by parsing frontmatter directly
    // Using parseYaml instead of cache avoids timing issues with cache updates
    let frontmatter: Record<string, unknown> | null = null;
    try {
      frontmatter = parseYaml(fmInfo.frontmatter);
    } catch {
      verboseLog(
        this.plugin,
        `TRY_EDITOR_UPDATE [6]: FAIL - could not parse frontmatter YAML`
      );
      return false;
    }

    const positions: Array<{
      key: string;
      oldValue: string;
      arrayIndex?: number;
    }> = [];
    let anyMissing = false;

    for (const key of aliasKeys) {
      const propValue = frontmatter?.[key];
      verboseLog(
        this.plugin,
        `TRY_EDITOR_UPDATE [6]: checking key=${key}, type=${typeof propValue}`
      );

      if (propValue === undefined) {
        verboseLog(this.plugin, `TRY_EDITOR_UPDATE [6]: key=${key} MISSING`);
        anyMissing = true;
        continue;
      }

      if (Array.isArray(propValue)) {
        // Search from end for ZWSP-wrapped value
        let found = false;
        for (let i = propValue.length - 1; i >= 0; i--) {
          const val = propValue[i];
          if (isPluginAlias(val)) {
            verboseLog(
              this.plugin,
              `TRY_EDITOR_UPDATE [6]: key=${key} FOUND at index=${i}`
            );
            positions.push({ key, oldValue: val, arrayIndex: i });
            found = true;
            break;
          }
        }
        if (!found) {
          verboseLog(
            this.plugin,
            `TRY_EDITOR_UPDATE [6]: key=${key} array has no ZWSP value`
          );
          anyMissing = true;
        }
      } else if (typeof propValue === 'string') {
        if (isPluginAlias(propValue)) {
          verboseLog(
            this.plugin,
            `TRY_EDITOR_UPDATE [6]: key=${key} FOUND string value`
          );
          positions.push({ key, oldValue: propValue });
        } else {
          verboseLog(
            this.plugin,
            `TRY_EDITOR_UPDATE [6]: key=${key} string not ZWSP-wrapped`
          );
          anyMissing = true;
        }
      } else {
        // null or other non-array, non-string value
        verboseLog(
          this.plugin,
          `TRY_EDITOR_UPDATE [6]: key=${key} has null/invalid value`
        );
        anyMissing = true;
      }
    }

    // Step 7: Check if any missing
    if (anyMissing) {
      verboseLog(
        this.plugin,
        `TRY_EDITOR_UPDATE [7]: FAIL - some properties missing ZWSP value`
      );
      return false;
    }
    verboseLog(
      this.plugin,
      `TRY_EDITOR_UPDATE [7]: all ${positions.length} properties have ZWSP values`
    );

    // Step 8: Replace ZWSP values line-by-line
    const newMarkedAlias = `${ZWSP}${newAlias}${ZWSP}`;
    const oldValue = positions[0].oldValue; // All positions have same ZWSP-wrapped value
    const fmLines = frontmatterText.split('\n');
    let replacedCount = 0;

    for (let lineNum = 0; lineNum < fmLines.length; lineNum++) {
      const line = fmLines[lineNum];
      const ch = line.lastIndexOf(oldValue); // Rightmost occurrence on line
      if (ch !== -1) {
        verboseLog(
          this.plugin,
          `TRY_EDITOR_UPDATE [8]: replacing at line=${lineNum} ch=${ch}`
        );
        activeEditor.replaceRange(
          newMarkedAlias,
          { line: lineNum, ch },
          { line: lineNum, ch: ch + oldValue.length }
        );
        replacedCount++;
      }
    }

    if (replacedCount !== positions.length) {
      verboseLog(
        this.plugin,
        `TRY_EDITOR_UPDATE [8]: FAIL - expected ${positions.length} replacements, got ${replacedCount}`
      );
      return false;
    }

    // Step 9: Force sync and verify
    if (!activeEditor.getValue().includes(newMarkedAlias)) {
      verboseLog(
        this.plugin,
        `TRY_EDITOR_UPDATE [9]: FAIL - change not persisted`
      );
      return false;
    }
    verboseLog(this.plugin, `TRY_EDITOR_UPDATE [9]: SUCCESS`);
    return true;
  }
}
