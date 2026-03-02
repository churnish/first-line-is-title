import { TFile, App, getFrontMatterInfo, parseYaml } from 'obsidian';
import { PluginSettings } from '../types';
import { filterNonEmpty } from './string-processing';

/**
 * Normalize tag by removing leading # if present
 * Ensures consistent tag comparison throughout the codebase
 */
export function normalizeTag(tag: string): string {
  return tag.startsWith('#') ? tag.slice(1) : tag;
}

/**
 * Parse tags from YAML frontmatter
 * Returns array of tag strings (without # prefix)
 */
export function parseTagsFromYAML(content: string): string[] {
  const tags: string[] = [];

  // Get frontmatter info using Obsidian API
  const frontmatterInfo = getFrontMatterInfo(content);
  if (!frontmatterInfo.exists) {
    return tags;
  }

  // Parse YAML using Obsidian API
  let frontmatter: Record<string, unknown>;
  try {
    frontmatter = parseYaml(frontmatterInfo.frontmatter);
  } catch {
    return tags;
  }

  if (!frontmatter || typeof frontmatter !== 'object') {
    return tags;
  }

  // Extract tags property
  const tagsValue = frontmatter.tags;
  if (!tagsValue) {
    return tags;
  }

  // Handle array of tags
  if (Array.isArray(tagsValue)) {
    for (const tag of tagsValue) {
      tags.push(String(tag));
    }
  } else if (typeof tagsValue === 'string' || typeof tagsValue === 'number') {
    // Handle single tag value (string or number)
    tags.push(String(tagsValue));
  }
  // Ignore objects/other types that can't be meaningfully converted to tag strings

  return tags;
}

/**
 * Remove YAML frontmatter from content
 * Returns content after frontmatter
 */
export function stripFrontmatter(content: string): string {
  // Use Obsidian API to get frontmatter info
  const frontmatterInfo = getFrontMatterInfo(content);

  if (!frontmatterInfo.exists) {
    return content;
  }

  // Return content after frontmatter using contentStart offset
  return content.substring(frontmatterInfo.contentStart);
}

/**
 * Check if file has any of the target tags
 * Supports frontmatter and inline tags based on settings
 * @param file The file to check
 * @param settings Plugin settings containing tag list and strategy
 * @param app The Obsidian app instance
 * @param content Optional file content for real-time checking
 * @returns true if file has any of the target tags
 */
export function fileHasTargetTags(
  file: TFile,
  settings: PluginSettings,
  app: App,
  content?: string
): boolean {
  const nonEmptyTags = filterNonEmpty(settings.exclusions.excludedTags);
  if (nonEmptyTags.length === 0) return false;

  const fileCache = app.metadataCache.getFileCache(file);

  // Check YAML frontmatter tags (unless mode is 'In note body only')
  if (settings.exclusions.tagMatchingMode !== 'In note body only') {
    let fileTags: string[] = [];

    // Parse tags from content if provided, otherwise use cache
    if (content) {
      fileTags = parseTagsFromYAML(content);
    } else if (
      fileCache &&
      fileCache.frontmatter &&
      fileCache.frontmatter.tags
    ) {
      const frontmatterTags = fileCache.frontmatter.tags;
      fileTags = Array.isArray(frontmatterTags)
        ? frontmatterTags.map(String)
        : [String(frontmatterTags)];
    }

    for (const targetTag of nonEmptyTags) {
      // Normalize both sides: remove # prefix for comparison
      const normalizedTargetTag = normalizeTag(targetTag);

      for (const fileTag of fileTags) {
        const normalizedFileTag = normalizeTag(String(fileTag));

        // Exact match
        if (normalizedFileTag === normalizedTargetTag) {
          return true;
        }

        // Check child tags if enabled (default true)
        if (settings.exclusions.excludeChildTags) {
          // If file has child tag and target tag is parent
          if (normalizedFileTag.startsWith(normalizedTargetTag + '/')) {
            return true;
          }
        }
      }
    }
  }

  // Check inline tags based on matching mode (using metadata cache to avoid false positives)
  if (settings.exclusions.tagMatchingMode !== 'In Properties only') {
    let inlineTagsInContent: string[] = [];

    // Use metadata cache for accurate tag detection (avoids false positives from code blocks, YAML comments, etc.)
    // Note: fileCache.tags only contains inline tags from markdown body, never from frontmatter
    if (fileCache && fileCache.tags) {
      inlineTagsInContent = fileCache.tags.map((tagCache) =>
        normalizeTag(tagCache.tag)
      );
    }

    for (const targetTag of nonEmptyTags) {
      // Normalize target tag: remove # prefix for comparison
      const normalizedTargetTag = normalizeTag(targetTag);

      for (const inlineTag of inlineTagsInContent) {
        // Exact match
        if (inlineTag === normalizedTargetTag) {
          return true;
        }

        // Check child tags if enabled (default true)
        if (settings.exclusions.excludeChildTags) {
          // If file has child tag and target tag is parent
          if (inlineTag.startsWith(normalizedTargetTag + '/')) {
            return true;
          }
        }
      }
    }
  }

  return false;
}
