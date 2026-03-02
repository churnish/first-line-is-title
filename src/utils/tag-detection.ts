/**
 * Unified tag detection utilities for context menus.
 * Handles tag extraction from different UI locations (tag pane, YAML, editor).
 */

/**
 * Result from tag detection
 */
export interface TagDetectionResult {
  /** The tag name without # prefix */
  tagName: string;
  /** Where the tag was found */
  location: 'tag-pane' | 'yaml' | 'editor';
}

/**
 * Detect if a DOM element is a tag and extract its name.
 * Uses event delegation - checks clicked element and parents.
 *
 * @param target - The element that was clicked
 * @returns Tag info if found, null otherwise
 */
export function detectTagFromDOM(
  target: HTMLElement
): TagDetectionResult | null {
  // Check for tag pane tag
  const tagPaneElement = target.closest('.tag-pane-tag');
  if (tagPaneElement) {
    // Extract tag name from tag pane using Tag Wrangler's approach
    const tagNameEl = tagPaneElement.querySelector(
      '.tag-pane-tag-text, .tag-pane-tag .tree-item-inner-text'
    );
    const tagText = tagNameEl?.textContent?.trim();

    if (tagText) {
      const tagName = tagText.startsWith('#') ? tagText.slice(1) : tagText;
      return { tagName, location: 'tag-pane' };
    }
  }

  // Check for YAML frontmatter tag
  const yamlTagElement = target.closest(
    '.metadata-property[data-property-key="tags"] .multi-select-pill'
  );
  if (yamlTagElement) {
    const tagText = yamlTagElement.textContent?.trim();
    if (tagText) {
      const tagName = tagText.startsWith('#') ? tagText.slice(1) : tagText;
      return { tagName, location: 'yaml' };
    }
  }

  return null;
}

/**
 * Detect if editor cursor is on a tag and extract its name.
 * Used for editor-menu event handler.
 *
 * @param line - The line content
 * @param cursorPos - Character position in line
 * @returns Tag name with # prefix if found, null otherwise
 */
export function detectTagFromEditor(
  line: string,
  cursorPos: number
): string | null {
  // Find all hashtags in the line
  const tagRegex = /#[\w/-]+/g;
  let match;

  while ((match = tagRegex.exec(line)) !== null) {
    const tagStart = match.index;
    const tagEnd = match.index + match[0].length;

    if (cursorPos >= tagStart && cursorPos <= tagEnd) {
      return match[0]; // Return with # prefix
    }
  }

  return null;
}
