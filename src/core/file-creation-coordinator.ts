import { TFile, getFrontMatterInfo, EventRef } from 'obsidian';
import FirstLineIsTitlePlugin from '../../main';
import { verboseLog } from '../utils';

/**
 * Extended App interface with plugin manager access
 */
interface AppWithPlugins {
  plugins?: {
    plugins?: Record<string, unknown>;
  };
}

/**
 * Extended Workspace interface with custom events
 */
interface WorkspaceWithCustomEvents {
  on(
    name: 'templater:new-note-from-template',
    callback: (data: Record<string, unknown>) => void
  ): EventRef;
  offref(ref: EventRef): void;
}

/**
 * Context information for file creation decisions
 */
export interface FileCreationContext {
  initialContent: string;
  pluginLoadTime: number;
}

/**
 * Actions to perform based on decision tree evaluation
 */
export interface FileCreationActions {
  shouldMoveCursor: boolean;
  shouldInsertTitle: boolean;
  placeCursorAtEnd: boolean;
  decisionPath: string; // e.g., "1Y → 2N → 3N → 14A → 15N"
}

/**
 * Coordinates file creation behavior based on decision tree logic.
 *
 * Implements the decision tree from DEV_DOCS/Architecture/Move cursor to first line.canvas
 * Determines whether to move cursor and/or insert title on file creation.
 *
 * Decision flow:
 * 1. Check if features enabled (guard clause)
 * 2. Check folder/tag/property exclusions
 * 3. Check Templater integration if applicable
 * 4. Determine which settings are active
 * 5. Apply content-based checks for specific combinations
 */
export class FileCreationCoordinator {
  private plugin: FirstLineIsTitlePlugin;
  private decisionPath: string[] = [];

  constructor(plugin: FirstLineIsTitlePlugin) {
    this.plugin = plugin;
  }

  /**
   * Main orchestrator - evaluates decision tree and returns actions to perform
   */
  async determineActions(
    file: TFile,
    context: FileCreationContext
  ): Promise<FileCreationActions> {
    this.decisionPath = [];

    // Node 1: Is either feature enabled?
    const featuresEnabled = this.isFeatureEnabled();
    if (featuresEnabled === 'neither') {
      this.logDecision('1', 'N', 'Do nothing (both features disabled)');
      return this.noActions('1N');
    }
    this.logDecision('1', 'Y');

    // Node 2: Is folder excluded?
    if (this.isFolderExcluded(file)) {
      this.logDecision('2', 'Y', 'Do nothing (folder excluded)');
      return this.noActions('1Y → 2Y');
    }
    this.logDecision('2', 'N');

    // Node 3: Are there exclusions configured?
    if (this.hasExclusions()) {
      this.logDecision('3', 'Y');

      // Node 4: Is Templater enabled?
      if (!this.isTemplaterOn()) {
        this.logDecision('4', 'N');
        return this.proceedToSettingsHub(file, context, this.pathString());
      }
      this.logDecision('4', 'Y');

      // Node 5: Is Templater trigger on file creation enabled?
      if (!this.isTemplaterTriggerOn()) {
        this.logDecision('5', 'N');
        return this.proceedToSettingsHub(file, context, this.pathString());
      }
      this.logDecision('5', 'Y');

      // Node 6: Does path match Template folder location?
      if (this.isInTemplateFolder(file)) {
        this.logDecision('6', 'Y');
        return this.proceedToSettingsHub(file, context, this.pathString());
      }
      this.logDecision('6', 'N');

      // Node 7: Is Enable folder templates ON?
      if (this.isFolderTemplatesEnabled()) {
        this.logDecision('7', 'Y');

        // Node 9: Do any Folder fields match current path?
        if (this.folderTemplateMatches(file)) {
          this.logDecision('9', 'Y');
          // Wait for Templater event (Node 12)
          return await this.handleTemplaterEvent(
            file,
            context,
            this.pathString()
          );
        }
        this.logDecision('9', 'N');
        // Per canvas edge 46: 9N goes directly to settings hub
        return this.proceedToSettingsHub(file, context, this.pathString());
      }
      this.logDecision('7', 'N');

      // Node 10: Is Enable file regex templates ON? (only reached if 7N)
      if (this.isFileRegexEnabled()) {
        this.logDecision('10', 'Y');

        // Node 11: Do any File regex fields match?
        if (this.fileRegexMatches(file)) {
          this.logDecision('11', 'Y');
          // Wait for Templater event (Node 12)
          return await this.handleTemplaterEvent(
            file,
            context,
            this.pathString()
          );
        }
        this.logDecision('11', 'N');
      } else {
        this.logDecision('10', 'N');
      }

      // No Templater template matched - proceed to settings hub
      return this.proceedToSettingsHub(file, context, this.pathString());
    } else {
      // Node 3: No exclusions
      this.logDecision('3', 'N');
      return this.proceedToSettingsHub(file, context, this.pathString());
    }
  }

  /**
   * Node 12-13: Handle Templater event and template exclusion check
   */
  private async handleTemplaterEvent(
    file: TFile,
    context: FileCreationContext,
    pathSoFar: string
  ): Promise<FileCreationActions> {
    // Node 12: Wait for Templater event (2000ms after ctime)
    const eventFired = await this.waitForTemplaterEvent(
      file,
      2000,
      file.stat.ctime
    );

    if (!eventFired) {
      this.logDecision('12', 'N');
      return this.proceedToSettingsHub(file, context, pathSoFar + ' → 12N');
    }
    this.logDecision('12', 'Y');

    // Node 13: Does template have excluded tag/property?
    if (this.templateHasExclusions(file)) {
      this.logDecision('13', 'Y', 'Do nothing (template has exclusions)');
      return this.noActions(pathSoFar + ' → 12Y → 13Y');
    }
    this.logDecision('13', 'N');

    return this.proceedToSettingsHub(file, context, pathSoFar + ' → 12Y → 13N');
  }

  /**
   * Node 14-18: Process settings hub and determine final actions
   */
  private proceedToSettingsHub(
    file: TFile,
    context: FileCreationContext,
    pathSoFar: string
  ): FileCreationActions {
    const featuresEnabled = this.isFeatureEnabled();

    if (featuresEnabled === 'title') {
      // Path A: Title only
      this.logDecision('14', 'A');

      // Node 15: Has content below YAML?
      if (this.hasContentBelowYaml(context.initialContent)) {
        this.logDecision('15', 'Y', 'Do nothing (has content)');
        return this.noActions(pathSoFar + ' → 14A → 15Y');
      }
      this.logDecision('15', 'N', 'Insert title');
      return {
        shouldMoveCursor: false,
        shouldInsertTitle: true,
        placeCursorAtEnd: false,
        decisionPath: pathSoFar + ' → 14A → 15N',
      };
    } else if (featuresEnabled === 'cursor') {
      // Path B: Cursor only
      this.logDecision('14', 'B');

      // Node 16: Is Place cursor at line end ON?
      if (this.isPlaceCursorAtEndEnabled()) {
        this.logDecision('16', 'Y', 'Move cursor + Place at end');
        return {
          shouldMoveCursor: true,
          shouldInsertTitle: false,
          placeCursorAtEnd: true,
          decisionPath: pathSoFar + ' → 14B → 16Y',
        };
      } else {
        this.logDecision('16', 'N', 'Move cursor');
        return {
          shouldMoveCursor: true,
          shouldInsertTitle: false,
          placeCursorAtEnd: false,
          decisionPath: pathSoFar + ' → 14B → 16N',
        };
      }
    } else {
      // Path C: Both features enabled
      this.logDecision('14', 'C');

      // Node 17: Is Place cursor at line end ON?
      if (this.isPlaceCursorAtEndEnabled()) {
        this.logDecision('17', 'Y');

        // Node 18: Has content below YAML?
        if (this.hasContentBelowYaml(context.initialContent)) {
          this.logDecision('18', 'Y', 'Move cursor + Place at end');
          return {
            shouldMoveCursor: true,
            shouldInsertTitle: false,
            placeCursorAtEnd: true,
            decisionPath: pathSoFar + ' → 14C → 17Y → 18Y',
          };
        } else {
          this.logDecision(
            '18',
            'N',
            'Insert title + Move cursor + Place at end'
          );
          return {
            shouldMoveCursor: true,
            shouldInsertTitle: true,
            placeCursorAtEnd: true,
            decisionPath: pathSoFar + ' → 14C → 17Y → 18N',
          };
        }
      } else {
        this.logDecision('17', 'N', 'Insert title + Move cursor');
        return {
          shouldMoveCursor: true,
          shouldInsertTitle: true,
          placeCursorAtEnd: false,
          decisionPath: pathSoFar + ' → 14C → 17N',
        };
      }
    }
  }

  // ============================================================================
  // Decision Node Implementations (Private Methods)
  // ============================================================================

  /**
   * Node 1: Check which features are enabled
   */
  private isFeatureEnabled(): 'both' | 'cursor' | 'title' | 'neither' {
    const moveCursor = this.plugin.settings.core.moveCursorToFirstLine;
    const insertTitle = this.plugin.settings.core.insertTitleOnCreation;

    if (moveCursor && insertTitle) return 'both';
    if (moveCursor) return 'cursor';
    if (insertTitle) return 'title';
    return 'neither';
  }

  /**
   * Node 2: Check if folder is excluded
   */
  private isFolderExcluded(file: TFile): boolean {
    // Obsidian uses "" for root folder, but FLIT stores it as "/"
    const folderPath =
      file.parent?.path === '' ? '/' : file.parent?.path || '/';
    const folderExclusions = this.plugin.settings.exclusions.excludedFolders;
    const folderStrategy = this.plugin.settings.exclusions.folderScopeStrategy;
    const excludeSubfolders = this.plugin.settings.exclusions.excludeSubfolders;
    const includeSubfolders = this.plugin.settings.exclusions.includeSubfolders;

    // If no folders configured, don't exclude anything (regardless of strategy)
    const nonEmptyFolders = folderExclusions.filter((f) => f.trim() !== '');
    if (nonEmptyFolders.length === 0) {
      return false;
    }

    // Check exact match or subfolder match
    let isInList = false;
    for (const exc of nonEmptyFolders) {
      if (exc === folderPath) {
        // Exact match
        isInList = true;
        break;
      }
      // Root folder "/" has no subfolders to check
      if (exc === '/') continue;

      // Check subfolder match based on mode
      if (folderStrategy === 'Exclude all except...') {
        // Whitelist mode: check includeSubfolders
        if (includeSubfolders && folderPath.startsWith(exc + '/')) {
          isInList = true;
          break;
        }
      } else {
        // Blacklist mode: check excludeSubfolders
        if (excludeSubfolders && folderPath.startsWith(exc + '/')) {
          isInList = true;
          break;
        }
      }
    }

    if (folderStrategy === 'Exclude all except...') {
      // Whitelist mode: exclude if NOT in list
      return !isInList;
    } else {
      // Blacklist mode: exclude if in list
      return isInList;
    }
  }

  /**
   * Node 3: Check if any tags or properties are configured in Exclusions
   * Note: Folders are checked separately in Node 2
   */
  private hasExclusions(): boolean {
    const excl = this.plugin.settings.exclusions;
    return (
      excl.excludedTags.some((t) => t.trim() !== '') ||
      excl.excludedProperties.some((p) => p.key?.trim() !== '')
    );
  }

  /**
   * Node 4: Check if Templater plugin is installed and enabled
   */
  private isTemplaterOn(): boolean {
    // Check if Templater plugin exists in app.plugins
    const templater = (this.plugin.app as unknown as AppWithPlugins).plugins
      ?.plugins;
    return (
      templater !== undefined &&
      typeof templater === 'object' &&
      'templater-obsidian' in templater
    );
  }

  /**
   * Node 5: Check if Templater's "Trigger on new file creation" is enabled
   */
  private isTemplaterTriggerOn(): boolean {
    const templater = (this.plugin.app as unknown as AppWithPlugins).plugins
      ?.plugins?.['templater-obsidian'] as Record<string, unknown> | undefined;
    if (!templater) return false;
    const settings = templater.settings as Record<string, unknown> | undefined;
    return settings?.trigger_on_file_creation === true;
  }

  /**
   * Node 6: Check if file path matches Templater's template folder location
   */
  private isInTemplateFolder(file: TFile): boolean {
    const templater = (this.plugin.app as unknown as AppWithPlugins).plugins
      ?.plugins?.['templater-obsidian'] as Record<string, unknown> | undefined;
    if (!templater) return false;
    const settings = templater.settings as Record<string, unknown> | undefined;
    const templateFolder = (settings?.templates_folder as string) || '';

    if (!templateFolder || templateFolder === '/') return false;

    return file.path.startsWith(templateFolder + '/');
  }

  /**
   * Node 7: Check if Templater's "Enable folder templates" is ON
   */
  private isFolderTemplatesEnabled(): boolean {
    const templater = (this.plugin.app as unknown as AppWithPlugins).plugins
      ?.plugins?.['templater-obsidian'] as Record<string, unknown> | undefined;
    if (!templater) return false;
    const settings = templater.settings as Record<string, unknown> | undefined;
    return settings?.enable_folder_templates === true;
  }

  /**
   * Node 9: Check if any Templater folder template matches current path
   * Uses Templater's walk-up algorithm (deepest match wins)
   */
  private folderTemplateMatches(file: TFile): boolean {
    const templater = (this.plugin.app as unknown as AppWithPlugins).plugins
      ?.plugins?.['templater-obsidian'] as Record<string, unknown> | undefined;
    if (!templater) return false;
    const settings = templater.settings as Record<string, unknown> | undefined;
    const folderTemplates = settings?.folder_templates;
    if (!Array.isArray(folderTemplates)) return false;

    let folder = file.parent;
    while (folder) {
      const match = folderTemplates.find(
        (ft: unknown) =>
          ft &&
          typeof ft === 'object' &&
          'folder' in ft &&
          ft.folder === folder!.path
      );
      if (
        match &&
        typeof match === 'object' &&
        'template' in match &&
        match.template
      ) {
        return true;
      }
      folder = folder.parent;
    }

    return false;
  }

  /**
   * Node 10: Check if Templater's "Enable file regex templates" is ON
   */
  private isFileRegexEnabled(): boolean {
    const templater = (this.plugin.app as unknown as AppWithPlugins).plugins
      ?.plugins?.['templater-obsidian'] as Record<string, unknown> | undefined;
    if (!templater) return false;
    const settings = templater.settings as Record<string, unknown> | undefined;
    return settings?.enable_file_templates === true;
  }

  /**
   * Node 11: Check if any Templater file regex matches current path
   */
  private fileRegexMatches(file: TFile): boolean {
    const templater = (this.plugin.app as unknown as AppWithPlugins).plugins
      ?.plugins?.['templater-obsidian'] as Record<string, unknown> | undefined;
    if (!templater) return false;
    const settings = templater.settings as Record<string, unknown> | undefined;
    const fileTemplates = settings?.file_templates;
    if (!Array.isArray(fileTemplates)) return false;

    for (const ft of fileTemplates) {
      if (!ft || typeof ft !== 'object') continue;
      try {
        const regex =
          'regex' in ft && typeof ft.regex === 'string'
            ? new RegExp(ft.regex)
            : null;
        if (regex && regex.test(file.path)) {
          return true;
        }
      } catch {
        // Invalid regex - skip
        continue;
      }
    }

    return false;
  }

  /**
   * Node 12: Wait for Templater event with timeout
   * @param file - The file to wait for
   * @param timeoutMs - Timeout in milliseconds after ctime
   * @param ctime - File creation time (milliseconds since epoch)
   */
  private async waitForTemplaterEvent(
    file: TFile,
    timeoutMs: number,
    ctime: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let eventFired = false;

      // Calculate how much time has already passed since ctime
      const now = Date.now();
      const elapsed = now - ctime;
      const remainingTime = Math.max(0, timeoutMs - elapsed);

      verboseLog(
        this.plugin,
        `Templater event: ${elapsed}ms elapsed since ctime, ${remainingTime}ms remaining for: ${file.path}`
      );

      // If already past timeout, return immediately
      if (remainingTime === 0) {
        verboseLog(
          this.plugin,
          `Templater event timeout already passed (${timeoutMs}ms after ctime) for: ${file.path}`
        );
        resolve(false);
        return;
      }

      const timeout = setTimeout(() => {
        if (!eventFired) {
          verboseLog(
            this.plugin,
            `Templater event timeout (${timeoutMs}ms after ctime) for: ${file.path}`
          );
          resolve(false);
        }
      }, remainingTime);

      // Listen for Templater event
      const eventRef = (
        this.plugin.app.workspace as unknown as WorkspaceWithCustomEvents
      ).on(
        'templater:new-note-from-template',
        (data: Record<string, unknown>) => {
          if (
            data.file &&
            typeof data.file === 'object' &&
            'path' in data.file &&
            data.file.path === file.path
          ) {
            eventFired = true;
            clearTimeout(timeout);
            this.plugin.app.workspace.offref(eventRef);
            verboseLog(this.plugin, `Templater event fired for: ${file.path}`);
            resolve(true);
          }
        }
      );

      // Clean up event listener if timeout occurs
      setTimeout(() => {
        if (!eventFired) {
          this.plugin.app.workspace.offref(eventRef);
        }
      }, remainingTime + 100);
    });
  }

  /**
   * Node 13: Check if template itself has excluded tags/properties
   */
  private templateHasExclusions(file: TFile): boolean {
    try {
      const cache = this.plugin.app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter;
      const excludedTags = this.plugin.settings.exclusions.excludedTags;
      const excludedProps = this.plugin.settings.exclusions.excludedProperties;
      const tagStrategy = this.plugin.settings.exclusions.tagScopeStrategy;
      const propertyStrategy =
        this.plugin.settings.exclusions.propertyScopeStrategy;

      // Check tags (from both frontmatter and body)
      if (excludedTags.length > 0) {
        // Use cache.tags which includes both frontmatter and body tags
        const allTags = cache?.tags?.map((t) => t.tag) || [];
        const hasExcludedTag = allTags.some((tag: string) =>
          excludedTags.includes(tag)
        );

        if (tagStrategy === 'Exclude all except...') {
          // Whitelist mode: has exclusion if template has tags NOT in list
          // This means: if file has any tags, and NONE are in the whitelist, it's excluded
          if (allTags.length > 0 && !hasExcludedTag) {
            return true;
          }
        } else {
          // Blacklist mode: has exclusion if template has tags in list
          if (hasExcludedTag) {
            return true;
          }
        }
      }

      // Check properties
      if (excludedProps.length > 0 && frontmatter) {
        const allPropKeys = Object.keys(frontmatter);
        const whitelistedProps = excludedProps.map((p: unknown) =>
          p && typeof p === 'object' && 'property' in p ? p.property : ''
        );
        const hasWhitelistedProp = allPropKeys.some((key) =>
          whitelistedProps.includes(key)
        );

        if (propertyStrategy === 'Exclude all except...') {
          // Whitelist mode: has exclusion if template has properties, but NONE are whitelisted
          // This matches the tag logic: "has at least one whitelisted item"
          if (allPropKeys.length > 0 && !hasWhitelistedProp) {
            return true;
          }
        } else {
          // Blacklist mode: has exclusion if template has properties in list
          if (hasWhitelistedProp) {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      verboseLog(this.plugin, `Error checking template exclusions: ${error}`);
      return false;
    }
  }

  /**
   * Nodes 15, 18: Check if file has content below YAML (excluding bare heading syntax)
   */
  private hasContentBelowYaml(content: string): boolean {
    const fmInfo = getFrontMatterInfo(content);
    const contentBelowYaml = content.substring(fmInfo.contentStart).trim();
    const isBareHeading = /^#{1,6}\s*$/.test(contentBelowYaml);

    return contentBelowYaml !== '' && !isBareHeading;
  }

  /**
   * Nodes 16, 17: Check if "Place cursor at line end" setting is enabled
   */
  private isPlaceCursorAtEndEnabled(): boolean {
    return this.plugin.settings.core.placeCursorAtLineEnd === true;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Helper to return no-action result
   */
  private noActions(path: string): FileCreationActions {
    return {
      shouldMoveCursor: false,
      shouldInsertTitle: false,
      placeCursorAtEnd: false,
      decisionPath: path,
    };
  }

  /**
   * Log a decision node result
   */
  private logDecision(
    nodeNumber: string,
    branch: string,
    outcome?: string
  ): void {
    const entry = `${nodeNumber}${branch}`;
    this.decisionPath.push(entry);

    if (outcome) {
      verboseLog(
        this.plugin,
        `[FileCreation] Decision path: ${this.pathString()} → ${outcome}`
      );
    }
  }

  /**
   * Get current decision path as string
   */
  private pathString(): string {
    return this.decisionPath.join(' → ');
  }
}
