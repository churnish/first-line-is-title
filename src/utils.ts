import {
  TFile,
  App,
  Platform,
  ViewWithFileEditor,
  getFrontMatterInfo,
} from 'obsidian';
import { PluginSettings, OSPreset } from './types';
import { CHAR_TO_SETTING_KEY } from './types/char-replacement';
import { isRootFolderPath } from './utils/string-processing';
import { t } from './i18n';
import { PropertyManager } from './core/property-manager';

// Re-export from modular utilities
export {
  filterNonEmpty,
  generateSafeLinkTarget,
  reverseSafeLinkTarget,
  processForbiddenChars,
} from './utils/string-processing';
export { deepMerge } from './utils/deep-merge';
export {
  normalizeTag,
  parseTagsFromYAML,
  stripFrontmatter,
  fileHasTargetTags,
} from './utils/tag-utils';
export {
  isFileInConfiguredFolders,
  fileHasExcludedProperties,
  shouldProcessFile,
  containsFileNameExclusion,
  isExcludedByFileName,
} from './utils/file-exclusions';

// Re-export from PropertyManager (wrapped to avoid unbound-method warning)
export const normalizePropertyValue = (value: unknown): unknown =>
  PropertyManager.normalizePropertyValue(value);

export function verboseLog(
  plugin: { settings: PluginSettings },
  message: string,
  data?: unknown
) {
  if (plugin.settings.core.debug) {
    if (data) {
      console.debug(message, data);
    } else {
      console.debug(message);
    }
  }
}

export function isValidHeading(line: string): boolean {
  return /^#{1,6}\s+.*/.test(line);
}

/**
 * Check if only frontmatter changed between two content versions.
 * Used to detect YAML-only edits and skip unnecessary alias updates.
 *
 * @param currentContent - Current file content
 * @param previousContent - Previous file content to compare against
 * @returns true if only frontmatter changed (body is identical), false if body changed
 */
export function isOnlyFrontmatterChanged(
  currentContent: string,
  previousContent: string
): boolean {
  const currentFrontmatterInfo = getFrontMatterInfo(currentContent);
  const previousFrontmatterInfo = getFrontMatterInfo(previousContent);

  const currentBody = currentContent.substring(
    currentFrontmatterInfo.contentStart
  );
  const previousBody = previousContent.substring(
    previousFrontmatterInfo.contentStart
  );

  return currentBody === previousBody;
}

export function detectOS(): OSPreset {
  if (Platform.isMacOS || Platform.isIosApp) {
    return 'macOS';
  }
  if (Platform.isWin) {
    return 'Windows';
  }
  // Android and Linux both fall under Linux category
  return 'Linux';
}

/**
 * Check if file is currently open in any editor (main workspace or popover)
 * @param file - File to check
 * @param app - Obsidian App instance
 * @returns true if file is open in any editor
 */
function isFileOpenInAnyEditor(file: TFile, app: App): boolean {
  const leaves = app.workspace.getLeavesOfType('markdown');

  // Check main workspace leaves
  for (const leaf of leaves) {
    // Cast to ViewWithFileEditor to access FileView/MarkdownView properties
    const view = leaf.view as ViewWithFileEditor;
    if (view?.file?.path === file.path) {
      return true;
    }
  }

  // Check popovers
  for (const leaf of leaves) {
    // Cast to ViewWithFileEditor to access MarkdownView properties
    const view = leaf.view as ViewWithFileEditor;
    if (view?.hoverPopover?.targetEl) {
      const popoverEditor = view.hoverPopover.editor;
      if (popoverEditor && view.hoverPopover.file?.path === file.path) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Central gate for file modification eligibility.
 * Checks policy requirements and always-on safeguards.
 *
 * @param isManualCommand - true for manual commands, false for automatic operations
 * @returns {canModify: boolean, reason?: string}
 */
export function canModifyFile(
  file: TFile,
  app: App,
  disableKey: string,
  disableValue: string,
  isManualCommand: boolean,
  hasActiveEditor?: boolean
): { canModify: boolean; reason?: string } {
  // Check 1: Disable property (ALWAYS-ON SAFEGUARD #4)
  // Fastest check, absolute blocker for all operations
  if (hasDisablePropertyInFile(file, app, disableKey, disableValue)) {
    return { canModify: false, reason: 'disable property present' };
  }

  // Check 2: File open in editor (ALWAYS-ON SAFEGUARD #5 for automatic operations)
  // Prevents processing external/programmatic edits
  // Manual commands bypass this check
  if (!isManualCommand) {
    // If hasActiveEditor provided (from editor-change event), trust it
    // This includes both leaf editors and popover/hover editors
    if (hasActiveEditor !== undefined) {
      if (!hasActiveEditor) {
        return { canModify: false, reason: 'file not open in editor' };
      }
    } else {
      // Fallback: check for open editors using helper function
      if (!isFileOpenInAnyEditor(file, app)) {
        return { canModify: false, reason: 'file not open in editor' };
      }
    }
  }

  return { canModify: true };
}

// Functions moved to modular utils (re-exported above):
// - filterNonEmpty → utils/string-processing.ts
// - generateSafeLinkTarget → utils/string-processing.ts
// - normalizeTag → utils/tag-utils.ts
// - parseTagsFromYAML, stripFrontmatter → utils/tag-utils.ts
// - fileHasTargetTags → utils/tag-utils.ts
// - isFileInConfiguredFolders → utils/file-exclusions.ts
// - fileHasExcludedProperties → utils/file-exclusions.ts
// - shouldProcessFile → utils/file-exclusions.ts
// - containsFileNameExclusion → utils/file-exclusions.ts
// - isExcludedByFileName → utils/file-exclusions.ts
// - deepMerge → utils/deep-merge.ts

export function hasDisablePropertyInFile(
  file: TFile,
  app: App,
  disableKey: string,
  disableValue: string
): boolean {
  try {
    // Use Obsidian's metadata cache to read frontmatter (already parsed YAML)
    const metadata = app.metadataCache.getFileCache(file);
    const frontmatter = metadata?.frontmatter;

    if (!frontmatter) return false;

    // Property matching folds case, so resolve the configured key against the frontmatter's own casing
    const matchedKey = Object.keys(frontmatter).find(
      (key) => key.toLowerCase() === disableKey.toLowerCase()
    );
    if (matchedKey === undefined) return false;

    // Get the property value
    const propertyValue = (frontmatter as Record<string, unknown>)[matchedKey];

    if (propertyValue === undefined || propertyValue === null) return false;

    // Normalize BOTH values for comparison
    const normalizedPropertyValue = normalizePropertyValue(propertyValue);
    const normalizedDisableValue = normalizePropertyValue(disableValue);

    // Handle array/list values
    if (Array.isArray(normalizedPropertyValue)) {
      // Check if any item in the array matches (case-insensitive for strings)
      return normalizedPropertyValue.some((item) => {
        const normalizedItem = normalizePropertyValue(item);
        if (
          typeof normalizedItem === 'string' &&
          typeof normalizedDisableValue === 'string'
        ) {
          return (
            normalizedItem.toLowerCase() ===
            normalizedDisableValue.toLowerCase()
          );
        }
        return normalizedItem === normalizedDisableValue;
      });
    }

    // Handle single values (case-insensitive comparison for strings)
    if (
      typeof normalizedPropertyValue === 'string' &&
      typeof normalizedDisableValue === 'string'
    ) {
      return (
        normalizedPropertyValue.toLowerCase() ===
        normalizedDisableValue.toLowerCase()
      );
    }

    // Direct comparison for non-string types
    return normalizedPropertyValue === normalizedDisableValue;
  } catch {
    return false;
  }
}

export function extractTitle(
  line: string,
  settings: PluginSettings,
  options?: { skipMarkupStripping?: boolean }
): string {
  const skipMarkupStripping = options?.skipMarkupStripping ?? false;
  const originalLine = line;

  // Check if original line is a valid list (0-3 spaces indent, not 4+ which is code block)
  // Task lists are checked first to prevent overlap with unordered/ordered detection
  // Per CommonMark: tabs expand to next multiple of 4, so any tab in indent = code block
  const indentStr = line.match(/^(\s*)/)?.[1] ?? '';
  const isCodeBlockIndent = indentStr.includes('\t') || indentStr.length >= 4;
  const isOriginallyTaskList =
    /^\s*(?:[-+*]|\d+\.) \[.\] /.test(line) && !isCodeBlockIndent;
  const isOriginallyUnorderedList =
    !isOriginallyTaskList && /^\s*[-+*] /.test(line) && !isCodeBlockIndent;
  const isOriginallyOrderedList =
    !isOriginallyTaskList && /^\s*\d+\. /.test(line) && !isCodeBlockIndent;

  // Check if line is only a list marker (before trim removes trailing space)
  // Uses space character class (not \s) to exclude tabs, which are code blocks per CommonMark
  if (!skipMarkupStripping) {
    if (
      settings.markupStripping.stripMarkupSettings.taskLists &&
      /^ {0,3}(?:[-+*]|\d+\.) \[.\] $/.test(line)
    ) {
      return t('untitled');
    }
    if (
      settings.markupStripping.stripMarkupSettings.unorderedLists &&
      /^ {0,3}[-+*] $/.test(line)
    ) {
      return t('untitled');
    }
    if (
      settings.markupStripping.stripMarkupSettings.orderedLists &&
      /^ {0,3}\d+\. $/.test(line)
    ) {
      return t('untitled');
    }
  }

  line = line.trim();

  // Remove template placeholder if enabled
  if (!skipMarkupStripping && settings.markupStripping.stripTemplaterSyntax) {
    line = line.replace(/<%\s*tp\.file\.cursor\(\)\s*%>/, '').trim();
    if (line === '<%*') {
      return t('untitled');
    }
  }

  // Check if original line (before trim) starts with valid heading - before any processing
  const isHeading = isValidHeading(originalLine);

  // Check for empty heading (only hash marks with optional spaces, nothing preceding)
  // Empty heading must: start at line beginning (no preceding chars), have 1-6 hashes, end with optional spaces
  const isEmptyHeading = /^#{1,6}\s*$/.test(originalLine);
  if (isEmptyHeading) {
    return t('untitled');
  }

  // Handle escaped characters based on backslash replacement setting
  const escapeMap = new Map<string, string>();
  let escapeCounter = 0;

  const backslashReplacementEnabled =
    settings.characterReplacements.enableForbiddenCharReplacements &&
    settings.characterReplacements.charReplacements.backslash.enabled;

  // Check for placeholder collision (extremely rare - user would need to type exact Unicode chars)
  const hasPlaceholderCollision = line.includes('⸢FLITESC');

  if (!backslashReplacementEnabled && !hasPlaceholderCollision) {
    // Backslash disabled: use as escape character, omit from output
    line = line.replace(/\\(.)/g, (_match: string, char: string) => {
      const placeholder = `⸢FLITESC${escapeCounter++}⸥`;
      escapeMap.set(placeholder, char);
      return placeholder;
    });
    // Handle trailing backslash (no character after it to escape)
    if (line.endsWith('\\')) {
      line = line.slice(0, -1);
    }
  }

  if (!skipMarkupStripping) {
    // Helper function to check if any placeholder overlaps with match range
    const checkEscaped = (match: string, offset: number): boolean => {
      if (backslashReplacementEnabled) return false;
      const matchEnd = offset + match.length;
      for (const placeholder of escapeMap.keys()) {
        const pos = line.indexOf(placeholder);
        // Check if placeholder overlaps with match range [offset, matchEnd)
        if (pos !== -1 && pos < matchEnd && pos + placeholder.length > offset) {
          return true;
        }
      }
      return false;
    };

    // Comment toggles cover Obsidian's %%…%% only — HTML comments are stripped by the htmlTags toggle instead.
    if (settings.markupStripping.stripCommentsEntirely) {
      // Strip comments entirely: remove everything
      line = line.replace(/%%.*?%%/g, '');
    } else if (settings.markupStripping.stripMarkupSettings.comments) {
      // Strip markup but keep content: remove markers only
      line = line.replace(
        /%%(.+?)%%/g,
        (match: string, content: string, offset: number) => {
          return checkEscaped(match, offset) ? match : content;
        }
      );
    }

    // Strip bold markup
    if (settings.markupStripping.stripMarkupSettings.bold) {
      line = line.replace(
        /\*\*(.*?)\*\*/g,
        (match: string, content: string, offset: number) => {
          return checkEscaped(match, offset) ? match : content;
        }
      );
      line = line.replace(
        /__(.*?)__/g,
        (match: string, content: string, offset: number) => {
          return checkEscaped(match, offset) ? match : content;
        }
      );
    }

    // Strip italic markup
    if (settings.markupStripping.stripMarkupSettings.italic) {
      line = line.replace(
        /\*([^*]*?)\*/g,
        (match: string, content: string, offset: number) => {
          return checkEscaped(match, offset) ? match : content;
        }
      );
      line = line.replace(
        /_([^_]*?)_/g,
        (match: string, content: string, offset: number) => {
          return checkEscaped(match, offset) ? match : content;
        }
      );
    }

    // Strip strikethrough markup
    if (settings.markupStripping.stripMarkupSettings.strikethrough) {
      line = line.replace(
        /~~(.*?)~~/g,
        (match: string, content: string, offset: number) => {
          return checkEscaped(match, offset) ? match : content;
        }
      );
    }

    // Strip highlight markup
    if (settings.markupStripping.stripMarkupSettings.highlight) {
      line = line.replace(
        /==(.*?)==/g,
        (match: string, content: string, offset: number) => {
          return checkEscaped(match, offset) ? match : content;
        }
      );
    }

    // Strip code block markup (must run before code markup stripping)
    if (settings.markupStripping.stripMarkupSettings.codeBlocks) {
      // Check if only ``` (empty code block) - return Untitled
      // Don't use multiline flag - we want to match entire string, not just first line
      if (/^\s*```\s*$/.test(line)) {
        return t('untitled');
      }

      // Match lines with optional leading whitespace followed by ```
      // Capture everything after ``` opener line
      const codeBlockMatch = /^\s*```(?!`)[^\n]*\n([\s\S]+)/m.exec(line);
      if (codeBlockMatch) {
        const content = codeBlockMatch[1];
        // Extract first non-empty line from code block content
        const contentLines = content.split('\n');
        let foundLine = false;
        for (const contentLine of contentLines) {
          const trimmed = contentLine.trim();
          if (trimmed !== '' && !trimmed.startsWith('```')) {
            line = contentLine;
            foundLine = true;
            break;
          }
        }
        // If only found ``` inside (both first and second line are ```), return Untitled
        if (!foundLine) {
          return t('untitled');
        }
      }
    }

    // Strip code markup
    if (settings.markupStripping.stripMarkupSettings.code) {
      line = line.replace(
        /`(.*?)`/g,
        (match: string, content: string, offset: number) => {
          return checkEscaped(match, offset) ? match : content;
        }
      );
    }

    // Strip inline math markup
    if (settings.markupStripping.stripInlineMathMarkup) {
      // Only match if no whitespace after opening $ and before closing $
      line = line.replace(
        /\$((?:\S(?:.*?\S)?)?)\$/g,
        (match: string, content: string, offset: number) => {
          return checkEscaped(match, offset) ? match : content;
        }
      );
    }

    // Strip callout markup (check before quote to avoid conflicts)
    // Uses callback to explicitly handle empty content case
    if (settings.markupStripping.stripMarkupSettings.callouts) {
      line = line.replace(
        /^>\s*\[![^\]]+\][-+]?(?:\s+(.*))?$/,
        (_: string, content: string) => content ?? ''
      );
    }

    // Strip quote markup
    if (settings.markupStripping.stripMarkupSettings.quote) {
      line = line.replace(/^>\s*(.*)$/, '$1');
    }

    // Strip task list markup BEFORE list markup (only if original line was a valid task list)
    if (
      isOriginallyTaskList &&
      settings.markupStripping.stripMarkupSettings.taskLists
    ) {
      line = line.replace(/^(?:[-+*]|\d+\.) \[.\] /, '');
    }

    // Strip unordered list markup (only if original line started as unordered list, not task list)
    if (
      isOriginallyUnorderedList &&
      settings.markupStripping.stripMarkupSettings.unorderedLists
    ) {
      line = line.replace(/^[-+*] /, '');
    }

    // Strip ordered list markup (only if original line started as ordered list, not task list)
    if (
      isOriginallyOrderedList &&
      settings.markupStripping.stripMarkupSettings.orderedLists
    ) {
      line = line.replace(/^\d+\. /, '');
    }

    if (settings.markupStripping.stripMarkupSettings.htmlTags) {
      // Runs once, outside the capped pass loop below, so a pathological tag input can't cause the cap to skip it.
      line = line.replace(/<!--[\s\S]*?-->/g, '');

      // Each pass unwraps one nesting level. Capped so a pathological line cannot stall
      // the rename on the editor's critical path; leftover tags are preferable to a hang.
      const maxTagUnwrapPasses = 50;
      let previousLine = '';
      let passes = 0;
      while (line !== previousLine && passes < maxTagUnwrapPasses) {
        previousLine = line;
        passes++;
        line = line.replace(
          /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>(.*?)<\/\1>/g,
          '$2'
        );
      }
    }

    // Strip footnote markup
    if (settings.markupStripping.stripMarkupSettings.footnotes) {
      // Strip [^1] style footnotes (but not if followed by colon)
      line = line.replace(/\[\^[^\]]+\](?!:)/g, '');
      // Strip ^[note] style footnotes (but not if followed by colon)
      line = line.replace(/\^\[[^\]]+\](?!:)/g, '');
    }
  }

  // Handle embedded wikilink images (remove ! before [[]])
  if (
    !skipMarkupStripping &&
    settings.markupStripping.stripMarkupSettings.wikilinks
  ) {
    const embedLinkRegex = /!\[\[(.*?)\]\]/g;
    line = line.replace(embedLinkRegex, '[[$1]]');
  }

  // Handle regular embedded image links
  if (
    !skipMarkupStripping &&
    settings.markupStripping.stripMarkupSettings.markdownLinks
  ) {
    const regularEmbedRegex = /!\[(.*?)\]\((.*?)\)/g;
    line = line.replace(
      regularEmbedRegex,
      (_match: string, displayText: string) => displayText
    );
  }

  // Handle headers - only if the original line was a valid heading and strip heading markup is enabled
  if (
    isHeading &&
    !skipMarkupStripping &&
    settings.markupStripping.stripMarkupSettings.headings
  ) {
    const headerArr: string[] = [
      '# ',
      '## ',
      '### ',
      '#### ',
      '##### ',
      '###### ',
    ];
    for (let i = 0; i < headerArr.length; i++) {
      if (line.startsWith(headerArr[i])) {
        line = line.slice(headerArr[i].length).trim();
        break;
      }
    }
  }

  // Handle wikilinks (only if strip wikilink markup is enabled)
  if (
    !skipMarkupStripping &&
    settings.markupStripping.stripMarkupSettings.wikilinks
  ) {
    while (line.includes('[[') && line.includes(']]')) {
      const openBracket = line.indexOf('[[');
      const closeBracket = line.indexOf(']]', openBracket);

      if (openBracket === -1 || closeBracket === -1) break;

      const linkText = line.slice(openBracket + 2, closeBracket);
      const beforeLink = line.slice(0, openBracket);
      const afterLink = line.slice(closeBracket + 2);

      // Handle aliased wikilinks
      const pipeIndex = linkText.indexOf('|');
      const resolvedText =
        pipeIndex !== -1 ? linkText.slice(pipeIndex + 1) : linkText;

      line = (beforeLink + resolvedText + afterLink).trim();
    }
  }

  // Check for empty links that should result in "Untitled"
  // If entire line is just empty links (regular or image), return "Untitled"
  const onlyEmptyLinksRegex = /^(\s*!?\[\]\([^)]*\)\s*)+$/;
  if (onlyEmptyLinksRegex.test(line)) {
    return t('untitled');
  }

  // Handle regular Markdown links (only if strip Markdown link markup is enabled)
  if (
    !skipMarkupStripping &&
    settings.markupStripping.stripMarkupSettings.markdownLinks
  ) {
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    line = line.replace(markdownLinkRegex, (_: string, title: string) => title);

    // Remove empty links (but keep surrounding text)
    // This handles cases like "test [](smile.md)" -> "test"
    line = line.replace(/!?\[\]\([^)]*\)/g, '').trim();
  }

  // Restore escaped characters (remove escape, keep character) - only if escaping was used
  if (!backslashReplacementEnabled && escapeMap.size > 0) {
    // Build regex for efficient single-pass restoration
    const pattern = new RegExp(Array.from(escapeMap.keys()).join('|'), 'g');
    line = line.replace(pattern, (match) => escapeMap.get(match) ?? match);
  }

  // Final check: if line is empty or only whitespace after all processing
  if (line.trim() === '') {
    return t('untitled');
  }

  // Apply title case transformation
  switch (settings.core.titleCase) {
    case 'uppercase':
      line = line.toUpperCase();
      break;
    case 'lowercase':
      line = line.toLowerCase();
      break;
    // "preserve" - no change
  }

  return line;
}

/**
 * Finds the title source line from content lines
 * Handles special cases like card links, code blocks, Markdown tables, HRs, math blocks
 *
 * @param contentLines Array of content lines (without frontmatter)
 * @param settings Plugin settings
 * @param plugin Optional plugin instance for verbose logging
 * @returns The title source line to use for filename
 */
export function findTitleSourceLine(
  contentLines: string[],
  settings: PluginSettings,
  plugin?: { settings: PluginSettings }
): string {
  // HR pattern: same char (*, -, _) 3+ times with optional regular spaces between
  const hrPattern =
    /^ *(?:(\*)(?: *\1){2,}|(-)(?: *\2){2,}|(_)(?: *\3){2,}) *$/;

  for (let i = 0; i < contentLines.length; i++) {
    const line = contentLines[i];
    const trimmedLine = line.trim();

    // Skip empty lines
    if (trimmedLine === '') {
      continue;
    }

    // Check for table - use "Table" as title if stripTableMarkup is enabled
    if (
      settings.markupStripping.stripTableMarkup &&
      trimmedLine.includes('|')
    ) {
      if (i + 1 < contentLines.length) {
        const secondLine = contentLines[i + 1];
        // Reject if separator contains escaped pipes or hyphens
        if (!secondLine.includes('\\|') && !secondLine.includes('\\-')) {
          const separatorPattern = /^\s*:?-{2,}:?\s*$/;
          const trimmedSeparator = secondLine
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '');
          const cells = trimmedSeparator.split('|');
          const isValidSeparator =
            cells.length >= 1 &&
            cells.every((cell) => separatorPattern.test(cell));
          if (isValidSeparator) {
            if (plugin) {
              verboseLog(
                plugin,
                `Table detected, using "${t('table')}" as title`
              );
            }
            return t('table');
          }
        }
      }
    }

    // Check for math block delimiter - skip $$ lines to find content after
    if (
      settings.markupStripping.stripMathBlockMarkup &&
      trimmedLine.startsWith('$$')
    ) {
      if (plugin) {
        verboseLog(plugin, `Math block delimiter detected, skipping line`);
      }
      continue;
    }

    // Check for HR - skip if enabled
    if (
      settings.markupStripping.stripHorizontalRuleMarkup &&
      hrPattern.test(line)
    ) {
      if (plugin) {
        verboseLog(plugin, `Horizontal rule detected, skipping line`);
      }
      continue;
    }

    // Check for code fences
    if (trimmedLine.startsWith('```')) {
      // Handle mermaid diagrams
      if (
        settings.markupStripping.detectDiagrams &&
        trimmedLine === '```mermaid'
      ) {
        if (plugin) {
          verboseLog(
            plugin,
            `Mermaid diagram detected, using "${t('diagram')}" as title`
          );
        }
        return t('diagram');
      }

      // Handle card links
      const cardLinkMatch = trimmedLine.match(/^```(embed|cardlink)$/);
      if (settings.markupStripping.grabTitleFromCardLink && cardLinkMatch) {
        const maxLinesToCheck = 20;
        for (
          let j = i + 1;
          j < Math.min(contentLines.length, i + maxLinesToCheck);
          j++
        ) {
          const cardLine = contentLines[j].trim();
          if (cardLine === '') continue;
          if (cardLine.toLowerCase().startsWith('title:')) {
            let title = cardLine.substring(cardLine.indexOf(':') + 1).trim();
            if (
              (title.startsWith('"') && title.endsWith('"')) ||
              (title.startsWith("'") && title.endsWith("'"))
            ) {
              title = title.substring(1, title.length - 1);
            }
            if (plugin) {
              verboseLog(plugin, `Found ${cardLinkMatch[1]} card link`, {
                title,
              });
            }
            return title;
          }
          if (cardLine.startsWith('```')) {
            if (plugin) {
              verboseLog(
                plugin,
                `Card link has no title, using ${t('untitled')}`
              );
            }
            return t('untitled');
          }
        }
        return t('untitled');
      }

      // Regular code fence - always skip past it to find real content
      if (plugin) {
        verboseLog(plugin, `Code fence detected, skipping line`);
      }
      continue;
    }

    // This is a valid content line
    return line;
  }

  return t('untitled');
}

// Punctuation binds to the character before it, so no space is restored in front of it
const PUNCTUATION_AFTER_REPLACEMENT = ',.?;:!"\'»«¡¿‽';

/**
 * Substitute every occurrence of a replacement string with its original character,
 * restoring the whitespace that `trimLeft`/`trimRight` removed during replacement.
 */
function restoreWithTrimmedSpacing(
  text: string,
  replacementChar: string,
  originalChar: string,
  trimLeft: boolean,
  trimRight: boolean
): string {
  if (!trimLeft && !trimRight) {
    return text.replaceAll(replacementChar, originalChar);
  }

  let result = '';
  let searchFrom = 0;
  let index = text.indexOf(replacementChar, searchFrom);

  while (index !== -1) {
    result += text.substring(searchFrom, index);

    let restored = trimLeft ? ' ' + originalChar : originalChar;
    if (trimRight) {
      // Empty when the match ends the string; `includes('')` is true, so no trailing space is added
      const charToRight = text.substring(
        index + replacementChar.length,
        index + replacementChar.length + 1
      );
      if (!PUNCTUATION_AFTER_REPLACEMENT.includes(charToRight)) {
        restored += ' ';
      }
    }

    result += restored;
    searchFrom = index + replacementChar.length;
    index = text.indexOf(replacementChar, searchFrom);
  }

  return result + text.substring(searchFrom);
}

/**
 * Reverse forbidden character replacements in a string
 * @param text - The text to process
 * @param settings - Plugin settings containing character replacement configuration
 * @param plugin - Optional plugin instance for verbose logging
 * @param options.restoreTrimmedSpacing - Re-insert the spaces that `trimLeft`/`trimRight` removed. Opt-in because callers that echo a filename verbatim (the insert-filename command) must not gain spaces the filename never had.
 * @returns The text with replacements reversed to original characters
 */
export function reverseCharacterReplacements(
  text: string,
  settings: PluginSettings,
  plugin?: { settings: PluginSettings },
  options?: { restoreTrimmedSpacing?: boolean }
): string {
  if (!settings.core.convertReplacementChars) {
    return text;
  }

  let result = text;

  // Find duplicate replacement strings (ambiguous - can't reverse)
  const replacementCounts = new Map<string, number>();
  const enabledReplacements: string[] = [];
  for (const settingKey of Object.values(CHAR_TO_SETTING_KEY)) {
    const replacement = settings.characterReplacements.charReplacements[settingKey];
    if (replacement.enabled && replacement.replacement) {
      replacementCounts.set(
        replacement.replacement,
        (replacementCounts.get(replacement.replacement) || 0) + 1
      );
      enabledReplacements.push(`${settingKey}="${replacement.replacement}"`);
    }
  }

  if (plugin) {
    verboseLog(
      plugin,
      `[CHAR-REVERSAL] "${text}" with replacements: [${enabledReplacements.join(', ')}]`
    );
  }

  // Reverse each enabled replacement using actual user settings
  for (const [originalChar, settingKey] of Object.entries(
    CHAR_TO_SETTING_KEY
  )) {
    const replacement = settings.characterReplacements.charReplacements[settingKey];
    if (replacement.enabled && replacement.replacement) {
      // Skip if this replacement string is used by multiple enabled characters (ambiguous)
      const count = replacementCounts.get(replacement.replacement) || 0;
      if (count > 1) {
        if (plugin) {
          verboseLog(
            plugin,
            `[CHAR-REVERSAL] Skipping "${replacement.replacement}" → "${originalChar}" (duplicate, count=${count})`
          );
        }
        continue;
      }
      result = options?.restoreTrimmedSpacing
        ? restoreWithTrimmedSpacing(
            result,
            replacement.replacement,
            originalChar,
            replacement.trimLeft,
            replacement.trimRight
          )
        : result.replaceAll(replacement.replacement, originalChar);
    }
  }

  if (plugin && result !== text) {
    verboseLog(plugin, `[CHAR-REVERSAL] Result: "${text}" → "${result}"`);
  }

  return result;
}

/**
 * Builds the equality key used to detect duplicate folder entries
 * - Trims whitespace
 * - Removes leading and trailing slashes (except preserves root "/")
 * - Converts to lowercase for case-insensitive comparison
 *
 * Case-folding is what separates this from `normalizeFolderPathForMatching` in
 * utils/file-exclusions.ts, which preserves case because it matches real paths.
 */
function folderPathComparisonKey(path: string): string {
  if (isRootFolderPath(path)) {
    return '/';
  }
  return path
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
}

/**
 * Cleans a folder path for storage (preserves case)
 * - Trims whitespace
 * - Removes leading and trailing slashes (except preserves root "/")
 */
function cleanFolderPath(path: string): string {
  if (isRootFolderPath(path)) {
    return '/';
  }
  return path.trim().replace(/^\/+|\/+$/g, '');
}

/**
 * Normalizes a tag for duplicate comparison
 * - Trims whitespace
 * - Converts to lowercase for case-insensitive comparison
 */
function normalizeTagName(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * Cleans a tag for storage (preserves case)
 * - Trims whitespace
 */
function cleanTag(tag: string): string {
  return tag.trim();
}

/**
 * Normalizes a property key or value for duplicate comparison
 * - Trims whitespace
 * - Converts to lowercase for case-insensitive comparison
 */
function normalizePropertyText(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Cleans a property key or value for storage (preserves case)
 * - Trims whitespace
 */
function cleanPropertyText(text: string): string {
  return text.trim();
}

/**
 * Normalizes the exclusion lists in plugin settings: drops blank entries, cleans
 * entry text, and deduplicates folders, tags and properties
 * Keeps the last occurrence of each duplicate (removes earlier ones)
 * Normalization rules:
 * - Folders: case-insensitive, leading/trailing slashes removed
 * - Tags: case-insensitive
 * - Properties: both key and value must match (case-insensitive)
 * File name exclusions are only pruned of blanks, never deduplicated — their
 * per-entry flags make equality ambiguous.
 *
 * @param settings - Plugin settings object to normalize
 * @returns true if any entries were removed or cleaned, false otherwise
 */
export function normalizeExclusionLists(settings: PluginSettings): boolean {
  let hasChanges = false;

  // Deduplicate folders
  // Each list is read through `?? []`: this also runs on settings imported from a file,
  // which can omit any list entirely despite what the types promise
  const excludedFolders = settings.exclusions.excludedFolders ?? [];
  const originalFolderCount = excludedFolders.length;
  const folderMap = new Map<string, number>(); // normalized -> last index

  excludedFolders.forEach((folder, index) => {
    const normalized = folderPathComparisonKey(folder);
    if (normalized !== '') {
      folderMap.set(normalized, index);
    }
  });

  // Blank entries are never recorded in folderMap, so they drop out here
  const keepFolderIndices = new Set(folderMap.values());
  settings.exclusions.excludedFolders = excludedFolders.filter((_, index) =>
    keepFolderIndices.has(index)
  );

  if (settings.exclusions.excludedFolders.length !== originalFolderCount) {
    hasChanges = true;
  }

  // Clean folder paths (strip leading/trailing slashes, preserve case)
  settings.exclusions.excludedFolders = settings.exclusions.excludedFolders.map(
    (folder) => {
      const cleaned = cleanFolderPath(folder);
      if (cleaned !== folder) {
        hasChanges = true;
      }
      return cleaned;
    }
  );

  // Deduplicate tags
  const excludedTags = settings.exclusions.excludedTags ?? [];
  const originalTagCount = excludedTags.length;
  const tagMap = new Map<string, number>(); // normalized -> last index

  excludedTags.forEach((tag, index) => {
    const normalized = normalizeTagName(tag);
    if (normalized !== '') {
      tagMap.set(normalized, index);
    }
  });

  // Blank entries are never recorded in tagMap, so they drop out here
  const keepTagIndices = new Set(tagMap.values());
  settings.exclusions.excludedTags = excludedTags.filter((_, index) =>
    keepTagIndices.has(index)
  );

  if (settings.exclusions.excludedTags.length !== originalTagCount) {
    hasChanges = true;
  }

  // Clean tags (trim whitespace, preserve case)
  settings.exclusions.excludedTags = settings.exclusions.excludedTags.map(
    (tag) => {
      const cleaned = cleanTag(tag);
      if (cleaned !== tag) {
        hasChanges = true;
      }
      return cleaned;
    }
  );

  // Deduplicate properties (both key AND value must match)
  const excludedProperties = settings.exclusions.excludedProperties ?? [];
  const originalPropertyCount = excludedProperties.length;
  const propertyMap = new Map<string, number>(); // [key, value] -> last index

  excludedProperties.forEach((prop, index) => {
    const normalizedKey = normalizePropertyText(prop.key);
    const normalizedValue = normalizePropertyText(prop.value);
    // A value without a key can never match: every consumer filters on a non-blank key,
    // so keeping it would render a live-looking rule that does nothing
    if (normalizedKey !== '') {
      // JSON encoding keeps "a:b"/"" distinct from "a"/"b", which a ":" join collapses
      const composite = JSON.stringify([normalizedKey, normalizedValue]);
      propertyMap.set(composite, index);
    }
  });

  // Entries with a blank key are never recorded in propertyMap, so they drop out here
  const keepPropertyIndices = new Set(propertyMap.values());
  settings.exclusions.excludedProperties = excludedProperties.filter(
    (_, index) => keepPropertyIndices.has(index)
  );

  if (settings.exclusions.excludedProperties.length !== originalPropertyCount) {
    hasChanges = true;
  }

  // Clean property keys and values (trim whitespace, preserve case)
  settings.exclusions.excludedProperties =
    settings.exclusions.excludedProperties.map((prop) => {
      const cleanedKey = cleanPropertyText(prop.key);
      const cleanedValue = cleanPropertyText(prop.value);
      if (cleanedKey !== prop.key || cleanedValue !== prop.value) {
        hasChanges = true;
      }
      return { key: cleanedKey, value: cleanedValue };
    });

  // Drop blank file name exclusions; they are not deduplicated because their
  // per-entry flags make two same-text entries meaningfully different
  const excludedFileNames = settings.exclusions.excludedFileNames ?? [];
  const originalFileNameCount = excludedFileNames.length;
  settings.exclusions.excludedFileNames = excludedFileNames.filter(
    (exclusion) => exclusion.text.trim() !== ''
  );

  if (settings.exclusions.excludedFileNames.length !== originalFileNameCount) {
    hasChanges = true;
  }

  return hasChanges;
}
