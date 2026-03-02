import { TFile, App, normalizePath } from 'obsidian';
import { PluginSettings } from '../types';
import { filterNonEmpty } from './string-processing';
import { fileHasTargetTags, normalizeTag } from './tag-utils';

/**
 * Normalize folder path, preserving root folder "/"
 * Obsidian's normalizePath strips leading/trailing slashes, turning "/" into ""
 * But FLIT stores root as "/", while Obsidian uses "" for root folder paths
 */
function normalizeFolderPath(folder: string): string {
  // Preserve root folder
  if (folder === '/') {
    return '/';
  }
  return normalizePath(folder);
}

/**
 * Check if file is in any of the configured folders
 * Supports subfolder checking if enabled in settings
 */
export function isFileInConfiguredFolders(
  file: TFile,
  settings: PluginSettings
): boolean {
  // Filter out empty strings and normalize paths
  const nonEmptyFolders = filterNonEmpty(
    settings.exclusions.excludedFolders
  ).map((folder) => normalizeFolderPath(folder));
  if (nonEmptyFolders.length === 0) return false;

  // Obsidian uses "" for root folder, but FLIT stores it as "/"
  const filePath =
    file.parent?.path === '' ? '/' : (file.parent?.path as string);
  if (nonEmptyFolders.includes(filePath)) {
    return true;
  }

  // Check subfolders if enabled
  if (settings.exclusions.excludeSubfolders) {
    for (const folder of nonEmptyFolders) {
      // Root folder "/" has no subfolders to check
      if (folder === '/') continue;

      if (filePath && filePath.startsWith(folder + '/')) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if file has any of the excluded properties
 */
export function fileHasExcludedProperties(
  file: TFile,
  settings: PluginSettings,
  app: App
): boolean {
  const nonEmptyProperties = settings.exclusions.excludedProperties.filter(
    (prop) => prop.key.trim() !== ''
  );
  if (nonEmptyProperties.length === 0) return false;

  const fileCache = app.metadataCache.getFileCache(file);
  if (!fileCache || !fileCache.frontmatter) return false;

  const frontmatter = fileCache.frontmatter;

  for (const excludedProp of nonEmptyProperties) {
    const propKey = excludedProp.key.trim();
    const propValue = excludedProp.value.trim();

    if (propKey in frontmatter) {
      if (propValue === '') {
        return true;
      }

      const frontmatterValue = frontmatter[propKey];

      if (typeof frontmatterValue === 'string') {
        if (frontmatterValue === propValue) {
          return true;
        }
      } else if (Array.isArray(frontmatterValue)) {
        if (frontmatterValue.some((val) => String(val) === propValue)) {
          return true;
        }
      } else if (frontmatterValue != null) {
        if (String(frontmatterValue) === propValue) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Determines whether a file should be processed based on the include/exclude strategy
 *
 * Logic summary:
 * - "Only exclude...": Process all files EXCEPT those in target folders/tags/properties
 *   - If no targets specified: Process ALL files (default enabled)
 *   - If targets specified: Process files NOT in targets (traditional exclude)
 *
 * - "Exclude all except...": Process ONLY files in target folders/tags/properties
 *   - If no targets specified: Process NO files (default disabled)
 *   - If targets specified: Process ONLY files in targets (include-only mode)
 *
 * @param file The file to check
 * @param settings Plugin settings containing strategy, folders, tags, and properties
 * @param app The Obsidian app instance
 * @param content Optional file content (string) for real-time checking
 * @param exclusionOverrides Optional overrides to skip folder/tag/property checks
 * @returns true if the file should be processed, false otherwise
 */
export function shouldProcessFile(
  file: TFile,
  settings: PluginSettings,
  app: App,
  content?: string,
  exclusionOverrides?: {
    ignoreFolder?: boolean;
    ignoreTag?: boolean;
    ignoreProperty?: boolean;
  },
  plugin?: { settings: PluginSettings }
): boolean {
  const isInTargetFolders = isFileInConfiguredFolders(file, settings);
  const hasTargetTags = fileHasTargetTags(file, settings, app, content);
  const hasTargetProperties = fileHasExcludedProperties(file, settings, app);

  // Helper function to apply strategy logic for a single exclusion type
  // Returns TRUE if file should be EXCLUDED (don't process)
  const applyStrategy = (
    isTargeted: boolean,
    hasTargets: boolean,
    strategy: string
  ): boolean => {
    if (strategy === 'Only exclude...') {
      // Only exclude: exclude files matching the targets
      // If no targets specified, don't exclude anything (process all)
      return hasTargets ? isTargeted : false;
    } else {
      // 'Exclude all except...'
      // Exclude all except: exclude files NOT matching the targets
      // If no targets specified, exclude everything (process none)
      return hasTargets ? !isTargeted : true;
    }
  };

  // Apply strategy for each exclusion type independently, respecting overrides
  const shouldExcludeFromFolders = exclusionOverrides?.ignoreFolder
    ? false
    : applyStrategy(
        isInTargetFolders,
        settings.exclusions.excludedFolders.some(
          (folder) => folder.trim() !== ''
        ),
        settings.exclusions.folderScopeStrategy
      );

  const shouldExcludeFromTags = exclusionOverrides?.ignoreTag
    ? false
    : applyStrategy(
        hasTargetTags,
        settings.exclusions.excludedTags.some((tag) => tag.trim() !== ''),
        settings.exclusions.tagScopeStrategy
      );

  const shouldExcludeFromProperties = exclusionOverrides?.ignoreProperty
    ? false
    : applyStrategy(
        hasTargetProperties,
        settings.exclusions.excludedProperties.some(
          (prop) => prop.key.trim() !== ''
        ),
        settings.exclusions.propertyScopeStrategy
      );

  // Log exclusion reasons if verbose logging enabled
  if (plugin?.settings.core.verboseLogging) {
    const reasons: string[] = [];
    if (shouldExcludeFromFolders)
      reasons.push(`folder (${settings.exclusions.folderScopeStrategy})`);
    if (shouldExcludeFromTags)
      reasons.push(`tags (${settings.exclusions.tagScopeStrategy})`);
    if (shouldExcludeFromProperties)
      reasons.push(`properties (${settings.exclusions.propertyScopeStrategy})`);

    if (reasons.length > 0) {
      console.debug(`File excluded by ${reasons.join(', ')}: ${file.path}`);
    }
  }

  // A file should be processed if it doesn't meet the exclusion criteria for ANY exclusion type
  // OR logic: if ANY exclusion type says "exclude" (returns true), then we exclude
  return !(
    shouldExcludeFromFolders ||
    shouldExcludeFromTags ||
    shouldExcludeFromProperties
  );
}

export function isFileExcluded(
  file: TFile,
  settings: PluginSettings,
  app: App,
  _content?: string
): boolean {
  // Check property exclusions
  if (fileHasExcludedProperties(file, settings, app)) {
    return true;
  }

  // Check folder exclusions
  if (isFileInConfiguredFolders(file, settings)) {
    return true;
  }

  // Check tag exclusions
  const nonEmptyTags = filterNonEmpty(settings.exclusions.excludedTags);
  if (nonEmptyTags.length > 0) {
    const fileCache = app.metadataCache.getFileCache(file);

    // Check YAML frontmatter tags (unless mode is 'In note body only')
    if (
      settings.exclusions.tagMatchingMode !== 'In note body only' &&
      fileCache &&
      fileCache.frontmatter &&
      fileCache.frontmatter.tags
    ) {
      const frontmatterTags = fileCache.frontmatter.tags;
      // Handle both string arrays and single strings
      const fileTags = Array.isArray(frontmatterTags)
        ? frontmatterTags
        : [frontmatterTags];
      for (const excludedTag of nonEmptyTags) {
        // Normalize both sides: remove # prefix for comparison
        const normalizedExcludedTag = normalizeTag(excludedTag);

        for (const fileTag of fileTags) {
          const normalizedFileTag = normalizeTag(String(fileTag));

          // Exact match
          if (normalizedFileTag === normalizedExcludedTag) {
            return true;
          }

          // Check child tags if enabled (default true)
          if (settings.exclusions.excludeChildTags) {
            // If file has child tag and excluded tag is parent
            if (normalizedFileTag.startsWith(normalizedExcludedTag + '/')) {
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

      for (const excludedTag of nonEmptyTags) {
        // Normalize excluded tag: remove # prefix for comparison
        const normalizedExcludedTag = normalizeTag(excludedTag);

        for (const inlineTag of inlineTagsInContent) {
          // Exact match
          if (inlineTag === normalizedExcludedTag) {
            return true;
          }

          // Check child tags if enabled (default true)
          if (settings.exclusions.excludeChildTags) {
            // If file has child tag and excluded tag is parent
            if (inlineTag.startsWith(normalizedExcludedTag + '/')) {
              return true;
            }
          }
        }
      }
    }
  }

  return false;
}
