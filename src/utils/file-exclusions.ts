import {
  TFile,
  App,
  getFrontMatterInfo,
  normalizePath,
  parseYaml,
} from 'obsidian';
import {
  EXCLUSION_STRATEGY,
  ExclusionStrategy,
  PluginSettings,
} from '../types';
import { filterNonEmpty, isRootFolderPath } from './string-processing';
import { fileHasTargetTags, normalizeTag } from './tag-utils';

/**
 * Normalize a configured folder path for path matching, preserving case.
 * Distinct from `folderPathComparisonKey` in utils.ts, which folds case for equality.
 */
function normalizeFolderPathForMatching(folder: string): string {
  if (isRootFolderPath(folder)) {
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
  // Filter out empty strings, normalize paths, and fold case so "Notes" and "notes" match the same rule
  const nonEmptyFolders = filterNonEmpty(
    settings.exclusions.excludedFolders
  ).map((folder) => normalizeFolderPathForMatching(folder).toLowerCase());
  if (nonEmptyFolders.length === 0) return false;

  // Obsidian uses "" for root folder, but FLIT stores it as "/"
  const filePath = (
    file.parent?.path === '' ? '/' : file.parent?.path
  )?.toLowerCase();
  if (filePath && nonEmptyFolders.includes(filePath)) {
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
 * Resolve the frontmatter to evaluate property exclusions against.
 *
 * Fails closed: callers can hand over partial editor content (rename-engine passes only the
 * footnote text when a footnote definition is edited), so content without parseable
 * frontmatter falls back to the metadata cache rather than concluding "no properties" and
 * renaming a protected file. A genuinely empty new note has no cached frontmatter either,
 * so the creation path still sees the live content.
 */
function resolveFrontmatterForExclusions(
  file: TFile,
  app: App,
  content?: string
): Record<string, unknown> | null {
  if (content !== undefined) {
    const frontmatterInfo = getFrontMatterInfo(content);
    if (frontmatterInfo.exists) {
      try {
        const parsed = parseYaml(frontmatterInfo.frontmatter) as unknown;
        if (parsed && typeof parsed === 'object') {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // Malformed YAML - fall through to the cache
      }
    }
  }

  const cachedFrontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
  return cachedFrontmatter
    ? (cachedFrontmatter as Record<string, unknown>)
    : null;
}

/**
 * Check if file has any of the excluded properties
 * @param content Optional file content (string) for real-time checking
 */
export function fileHasExcludedProperties(
  file: TFile,
  settings: PluginSettings,
  app: App,
  content?: string
): boolean {
  const nonEmptyProperties = settings.exclusions.excludedProperties.filter(
    (prop) => prop.key.trim() !== ''
  );
  if (nonEmptyProperties.length === 0) return false;

  const frontmatter = resolveFrontmatterForExclusions(file, app, content);
  if (!frontmatter) return false;

  // Property matching folds case, so resolve each configured key against the frontmatter's own casing
  const frontmatterKeysByFoldedCase = new Map<string, string>();
  for (const key of Object.keys(frontmatter)) {
    const foldedKey = key.toLowerCase();
    if (!frontmatterKeysByFoldedCase.has(foldedKey)) {
      frontmatterKeysByFoldedCase.set(foldedKey, key);
    }
  }

  for (const excludedProp of nonEmptyProperties) {
    const propKey = excludedProp.key.trim().toLowerCase();

    // A `tags` rule is written with or without the leading "#" interchangeably, so both
    // sides drop it. Without this, `{key: 'tags', value: 'foo'}` fails to match a note
    // tagged `#foo` and the exclusion silently fails open.
    const isTagsRule = propKey === 'tags';
    const foldValue = (value: unknown): string => {
      const folded = String(value as string | number | boolean).toLowerCase();
      return isTagsRule ? normalizeTag(folded) : folded;
    };

    const rawPropValue = excludedProp.value.trim().toLowerCase();

    const matchedKey = frontmatterKeysByFoldedCase.get(propKey);
    if (matchedKey !== undefined) {
      // A valueless rule matches the key alone, so this is tested before tag folding
      if (rawPropValue === '') {
        return true;
      }

      const propValue = isTagsRule ? normalizeTag(rawPropValue) : rawPropValue;
      const frontmatterValue: unknown = frontmatter[matchedKey];

      if (Array.isArray(frontmatterValue)) {
        if (frontmatterValue.some((val) => foldValue(val) === propValue)) {
          return true;
        }
      } else if (frontmatterValue != null) {
        if (foldValue(frontmatterValue) === propValue) {
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
  // Helper function to apply strategy logic for a single exclusion type
  // Returns TRUE if file should be EXCLUDED (don't process)
  const applyStrategy = (
    isTargeted: boolean,
    hasTargets: boolean,
    strategy: ExclusionStrategy
  ): boolean => {
    if (strategy === EXCLUSION_STRATEGY.ONLY_EXCLUDE) {
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

  // Apply strategy for each exclusion type independently, respecting overrides.
  // Each detector is called inside its branch, not hoisted: the bulk-rename path passes
  // all three overrides, and each detector walks the metadata cache per file.
  const shouldExcludeFromFolders = exclusionOverrides?.ignoreFolder
    ? false
    : applyStrategy(
        isFileInConfiguredFolders(file, settings),
        settings.exclusions.excludedFolders.some(
          (folder) => folder.trim() !== ''
        ),
        settings.exclusions.folderScopeStrategy
      );

  const shouldExcludeFromTags = exclusionOverrides?.ignoreTag
    ? false
    : applyStrategy(
        fileHasTargetTags(file, settings, app, content),
        settings.exclusions.excludedTags.some((tag) => tag.trim() !== ''),
        settings.exclusions.tagScopeStrategy
      );

  const shouldExcludeFromProperties = exclusionOverrides?.ignoreProperty
    ? false
    : applyStrategy(
        fileHasExcludedProperties(file, settings, app, content),
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

export function containsFileNameExclusion(
  filename: string,
  settings: PluginSettings
): boolean {
  // Get filename without extension for comparison
  const filenameWithoutExt = filename.replace(/\.md$/, '');

  for (const exclusion of settings.exclusions.fileNameExclusions) {
    if (!exclusion.enabled || !exclusion.text) continue;

    // Check against both full filename and filename without extension
    const compareFullFilename = exclusion.caseSensitive
      ? filename
      : filename.toLowerCase();
    const compareFilenameWithoutExt = exclusion.caseSensitive
      ? filenameWithoutExt
      : filenameWithoutExt.toLowerCase();
    const compareText = exclusion.caseSensitive
      ? exclusion.text
      : exclusion.text.toLowerCase();

    for (const compareFilename of [
      compareFullFilename,
      compareFilenameWithoutExt,
    ]) {
      if (exclusion.onlyWholeLine) {
        // Only match if the entire filename matches
        if (compareFilename.trim() === compareText.trim()) {
          return true;
        }
      } else if (exclusion.onlyAtStart) {
        if (compareFilename.startsWith(compareText)) {
          return true;
        }
      } else {
        if (compareFilename.includes(compareText)) {
          return true;
        }
      }
    }
  }
  return false;
}
