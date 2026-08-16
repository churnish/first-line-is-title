import {
  TFile,
  CachedMetadata,
  EventRef,
  getAllTags,
  getFrontMatterInfo,
} from 'obsidian';
import FirstLineIsTitlePlugin from '../../main';
import { TIMING } from '../constants/timing';
import { verboseLog } from '../utils';
// Leaf modules, not the '../utils' barrel: the coordinator suite mocks the barrel down to verboseLog
import { shouldProcessFile } from '../utils/file-exclusions';
import {
  fileHasTargetTags,
  getFrontmatterTagsFromCache,
} from '../utils/tag-utils';
import { filterNonEmpty } from '../utils/string-processing';
import { EXCLUSION_STRATEGY } from '../types';

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
 * Coordinates file creation behavior: decides whether to move the cursor and/or
 * insert a title when a note is created.
 *
 * The node numbers below are the sole definition of the tree — they are not
 * shorthand for an external diagram — and they are load-bearing: every branch
 * appends `<node><branch>` to `decisionPath`, which is what debug reports are
 * read against. Renumbering invalidates every previously captured path.
 *
 * Gates, in order (each falls through to the next unless it returns):
 * - 1  Either feature enabled? No → do nothing.
 * - 2  Folder excluded? Yes → do nothing.
 * - 2b Tag/property/disable-renaming excluded, judged on real-time content? Yes → do nothing.
 * - 3  Any tag or property exclusions configured? No → settings hub.
 * - 4  Templater installed? No → settings hub.
 * - 5  Templater's trigger on file creation on? No → settings hub.
 * - 6  File sits in Templater's template folder? Yes → settings hub.
 * - 7  Folder templates on? Yes → node 9, else node 10.
 * - 9  A folder template matches this path? Yes → Templater wait, No → settings hub.
 * - 10 File regex templates on? No → settings hub.
 * - 11 A file regex matches this path? Yes → Templater wait, No → settings hub.
 * - 12 Templater event arrived within the timeout? No → settings hub.
 * - 13 Template carries an excluded tag/property? Yes → do nothing, No → settings hub.
 *
 * Settings hub (nodes 14-18) then maps the enabled features onto the final
 * actions: 14A title only, 14B cursor only, 14C both, with nodes 15/18 checking
 * for existing content below the YAML and 16/17 reading "Place cursor at line
 * end". The numbering skips 8: no such node exists, and the gap is kept rather
 * than closed so existing decision paths stay comparable.
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
      this.recordDecisionAndLogOutcome(
        '1',
        'N',
        'Do nothing (both features disabled)'
      );
      return this.noActions('1N');
    }
    this.recordDecision('1', 'Y');

    // Node 2 runs before Node 2b because a path prefix test is far cheaper than the content gate, which parses YAML and reads the metadata cache
    // Node 2: Is folder excluded?
    if (this.isFolderExcluded(file)) {
      this.recordDecisionAndLogOutcome(
        '2',
        'Y',
        'Do nothing (folder excluded)'
      );
      return this.noActions('1Y → 2Y');
    }
    this.recordDecision('2', 'N');

    // Node 2b: Is file excluded by tag/property/disable-renaming (content-based, real-time)?
    if (this.isContentExcluded(file, context.initialContent)) {
      this.recordDecisionAndLogOutcome(
        '2b',
        'Y',
        'Do nothing (tag/property/disable-renaming excluded)'
      );
      return this.noActions('1Y → 2N → 2bY');
    }
    this.recordDecision('2b', 'N');

    // Node 3: Are there exclusions configured?
    if (this.hasExclusions()) {
      this.recordDecision('3', 'Y');

      // Node 4: Is Templater enabled?
      if (!this.isTemplaterOn()) {
        this.recordDecision('4', 'N');
        return this.proceedToSettingsHub(file, context, this.pathString());
      }
      this.recordDecision('4', 'Y');

      // Node 5: Is Templater trigger on file creation enabled?
      if (!this.isTemplaterTriggerOn()) {
        this.recordDecision('5', 'N');
        return this.proceedToSettingsHub(file, context, this.pathString());
      }
      this.recordDecision('5', 'Y');

      // Node 6: Does path match Template folder location?
      if (this.isInTemplateFolder(file)) {
        this.recordDecision('6', 'Y');
        return this.proceedToSettingsHub(file, context, this.pathString());
      }
      this.recordDecision('6', 'N');

      // Node 7: Is Enable folder templates ON?
      if (this.isFolderTemplatesEnabled()) {
        this.recordDecision('7', 'Y');

        // Node 9: Do any Folder fields match current path?
        if (this.folderTemplateMatches(file)) {
          this.recordDecision('9', 'Y');
          // Wait for Templater event (Node 12)
          return await this.handleTemplaterEvent(
            file,
            context,
            this.pathString()
          );
        }
        this.recordDecision('9', 'N');
        // 9N skips node 10: once folder templates are on, Templater resolves the folder template and never falls back to a file regex, so there is nothing left to match
        return this.proceedToSettingsHub(file, context, this.pathString());
      }
      this.recordDecision('7', 'N');

      // Node 10: Is Enable file regex templates ON? (only reached if 7N)
      if (this.isFileRegexEnabled()) {
        this.recordDecision('10', 'Y');

        // Node 11: Do any File regex fields match?
        if (this.fileRegexMatches(file)) {
          this.recordDecision('11', 'Y');
          // Wait for Templater event (Node 12)
          return await this.handleTemplaterEvent(
            file,
            context,
            this.pathString()
          );
        }
        this.recordDecision('11', 'N');
      } else {
        this.recordDecision('10', 'N');
      }

      // No Templater template matched - proceed to settings hub
      return this.proceedToSettingsHub(file, context, this.pathString());
    } else {
      // Node 3: No exclusions
      this.recordDecision('3', 'N');
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
    // Node 12: Wait for Templater event
    const eventFired = await this.waitForTemplaterEvent(
      file,
      TIMING.TEMPLATER_EVENT_TIMEOUT_MS,
      file.stat.ctime
    );

    if (!eventFired) {
      this.recordDecision('12', 'N');
      return this.proceedToSettingsHub(file, context, pathSoFar + ' → 12N');
    }
    this.recordDecision('12', 'Y');

    // Node 13: Does template have excluded tag/property?
    if (this.templateHasExclusions(file)) {
      this.recordDecisionAndLogOutcome(
        '13',
        'Y',
        'Do nothing (template has exclusions)'
      );
      return this.noActions(pathSoFar + ' → 12Y → 13Y');
    }
    this.recordDecision('13', 'N');

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
      this.recordDecision('14', 'A');

      // Node 15: Has content below YAML?
      if (this.hasContentBelowYaml(context.initialContent)) {
        this.recordDecisionAndLogOutcome('15', 'Y', 'Do nothing (has content)');
        return this.noActions(pathSoFar + ' → 14A → 15Y');
      }
      this.recordDecisionAndLogOutcome('15', 'N', 'Insert title');
      return {
        shouldMoveCursor: false,
        shouldInsertTitle: true,
        placeCursorAtEnd: false,
        decisionPath: pathSoFar + ' → 14A → 15N',
      };
    } else if (featuresEnabled === 'cursor') {
      // Path B: Cursor only
      this.recordDecision('14', 'B');

      // Node 16: Is Place cursor at line end ON?
      if (this.isPlaceCursorAtEndEnabled()) {
        this.recordDecisionAndLogOutcome(
          '16',
          'Y',
          'Move cursor + Place at end'
        );
        return {
          shouldMoveCursor: true,
          shouldInsertTitle: false,
          placeCursorAtEnd: true,
          decisionPath: pathSoFar + ' → 14B → 16Y',
        };
      } else {
        this.recordDecisionAndLogOutcome('16', 'N', 'Move cursor');
        return {
          shouldMoveCursor: true,
          shouldInsertTitle: false,
          placeCursorAtEnd: false,
          decisionPath: pathSoFar + ' → 14B → 16N',
        };
      }
    } else {
      // Path C: Both features enabled
      this.recordDecision('14', 'C');

      // Node 17: Is Place cursor at line end ON?
      if (this.isPlaceCursorAtEndEnabled()) {
        this.recordDecision('17', 'Y');

        // Node 18: Has content below YAML?
        if (this.hasContentBelowYaml(context.initialContent)) {
          this.recordDecisionAndLogOutcome(
            '18',
            'Y',
            'Move cursor + Place at end'
          );
          return {
            shouldMoveCursor: true,
            shouldInsertTitle: false,
            placeCursorAtEnd: true,
            decisionPath: pathSoFar + ' → 14C → 17Y → 18Y',
          };
        } else {
          this.recordDecisionAndLogOutcome(
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
        this.recordDecisionAndLogOutcome(
          '17',
          'N',
          'Insert title + Move cursor'
        );
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
    // Folder-only overrides on the shared gate: a local matcher drifted from it before
    return !shouldProcessFile(
      file,
      this.plugin.settings,
      this.plugin.app,
      undefined,
      { ignoreTag: true, ignoreProperty: true },
      this.plugin
    );
  }

  /**
   * Node 2b: Check tag/property/disable-renaming exclusion using real-time content.
   * Runs the same evaluation the rename path runs, so the title is inserted and the cursor
   * moved exactly when renaming is allowed for this file, and not otherwise.
   */
  private isContentExcluded(file: TFile, initialContent: string): boolean {
    return this.plugin.fileOperations.isFileExcludedForCursorPositioning(
      file,
      initialContent,
      // Node 2 already ran this same folder check through this same gate: an optimization, not a semantic difference
      { ignoreFolder: true }
    );
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
   * Templater's settings object, or undefined when Templater isn't loaded.
   */
  private getTemplaterSettings(): Record<string, unknown> | undefined {
    const templater = this.plugin.app.plugins.plugins['templater-obsidian'] as
      | Record<string, unknown>
      | undefined;
    return templater?.settings as Record<string, unknown> | undefined;
  }

  /**
   * Node 4: Check if Templater plugin is installed and enabled
   */
  private isTemplaterOn(): boolean {
    return 'templater-obsidian' in this.plugin.app.plugins.plugins;
  }

  /**
   * Node 5: Check if Templater's "Trigger on new file creation" is enabled
   */
  private isTemplaterTriggerOn(): boolean {
    return this.getTemplaterSettings()?.trigger_on_file_creation === true;
  }

  /**
   * Node 6: Check if file path matches Templater's template folder location
   */
  private isInTemplateFolder(file: TFile): boolean {
    const templateFolder =
      (this.getTemplaterSettings()?.templates_folder as string) || '';

    if (!templateFolder || templateFolder === '/') return false;

    return file.path.startsWith(templateFolder + '/');
  }

  /**
   * Node 7: Check if Templater's "Enable folder templates" is ON
   */
  private isFolderTemplatesEnabled(): boolean {
    return this.getTemplaterSettings()?.enable_folder_templates === true;
  }

  /**
   * Node 9: Check if any Templater folder template matches current path
   * Uses Templater's walk-up algorithm (deepest match wins)
   */
  private folderTemplateMatches(file: TFile): boolean {
    const folderTemplates = this.getTemplaterSettings()?.folder_templates;
    if (!Array.isArray(folderTemplates)) return false;

    let folder = file.parent;
    while (folder) {
      const match = (folderTemplates as unknown[]).find(
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
    return this.getTemplaterSettings()?.enable_file_templates === true;
  }

  /**
   * Node 11: Check if any Templater file regex matches current path
   */
  private fileRegexMatches(file: TFile): boolean {
    const fileTemplates = this.getTemplaterSettings()?.file_templates;
    if (!Array.isArray(fileTemplates)) return false;

    for (const ft of fileTemplates as unknown[]) {
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

      const timeout = window.setTimeout(() => {
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
            window.clearTimeout(timeout);
            this.plugin.app.workspace.offref(eventRef);
            verboseLog(this.plugin, `Templater event fired for: ${file.path}`);
            resolve(true);
          }
        }
      );

      // Clean up event listener if timeout occurs
      // Must outlast the resolve timer above, hence the grace period on top of the same remainingTime
      window.setTimeout(() => {
        if (!eventFired) {
          this.plugin.app.workspace.offref(eventRef);
        }
      }, remainingTime + TIMING.TEMPLATER_EVENT_CLEANUP_GRACE_MS);
    });
  }

  /**
   * Node 13: Check if template itself has excluded tags/properties.
   * Re-checks after Templater expansion, which can add tags or properties the file did not carry at Node 2b.
   */
  private templateHasExclusions(file: TFile): boolean {
    try {
      const cache = this.plugin.app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter;
      const exclusions = this.plugin.settings.exclusions;
      const listedTags = filterNonEmpty(exclusions.excludedTags);
      // Node 13 gates on the property key alone; configured values are not part of the template rule
      const listedPropKeys = exclusions.excludedProperties
        .map((p) => p.key.trim().toLowerCase())
        .filter((key) => key !== '');

      if (listedTags.length > 0) {
        const hasListedTag = fileHasTargetTags(
          file,
          this.plugin.settings,
          this.plugin.app
        );

        if (
          exclusions.tagScopeStrategy === EXCLUSION_STRATEGY.EXCLUDE_ALL_EXCEPT
        ) {
          // Whitelist mode: a template that carries tags but none of the listed ones is excluded
          if (this.templateHasAnyTagInScope(cache) && !hasListedTag) {
            return true;
          }
        } else if (hasListedTag) {
          return true;
        }
      }

      if (listedPropKeys.length > 0 && frontmatter) {
        const allPropKeys = Object.keys(frontmatter).map((key) =>
          key.toLowerCase()
        );
        const hasListedProp = allPropKeys.some((key) =>
          listedPropKeys.includes(key)
        );

        if (
          exclusions.propertyScopeStrategy ===
          EXCLUSION_STRATEGY.EXCLUDE_ALL_EXCEPT
        ) {
          // Whitelist mode: a template that carries properties but none of the listed ones is excluded
          if (allPropKeys.length > 0 && !hasListedProp) {
            return true;
          }
        } else if (hasListedProp) {
          return true;
        }
      }

      return false;
    } catch (error) {
      verboseLog(this.plugin, `Error checking template exclusions: ${error}`);
      return false;
    }
  }

  /**
   * Node 13 whitelist half: does the template carry any tags at all, within the configured scope?
   * getAllTags combines frontmatter and inline tags; cache.tags is inline-only, so the narrower
   * scopes have to be read from their own source rather than filtered out of the combined list.
   */
  private templateHasAnyTagInScope(cache: CachedMetadata | null): boolean {
    if (!cache) return false;

    const mode = this.plugin.settings.exclusions.tagMatchingMode;
    if (mode === 'In note body only') {
      return (cache.tags?.length ?? 0) > 0;
    }
    if (mode === 'In Properties only') {
      return getFrontmatterTagsFromCache(cache).length > 0;
    }
    return (getAllTags(cache)?.length ?? 0) > 0;
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
   * Append a decision node result to the breadcrumb. Silent by design: the
   * intermediate gates are only meaningful as part of a full path.
   */
  private recordDecision(nodeNumber: string, branch: string): void {
    this.decisionPath.push(`${nodeNumber}${branch}`);
  }

  /**
   * Append a decision node result and log the path it resolved to. Reserved for
   * branches that settle the outcome, so one file creation logs one line.
   */
  private recordDecisionAndLogOutcome(
    nodeNumber: string,
    branch: string,
    outcome: string
  ): void {
    this.recordDecision(nodeNumber, branch);
    verboseLog(
      this.plugin,
      `[FileCreation] Decision path: ${this.pathString()} → ${outcome}`
    );
  }

  /**
   * Get current decision path as string
   */
  private pathString(): string {
    return this.decisionPath.join(' → ');
  }
}
