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
import {
  isExcludedByFileName,
  shouldProcessFile,
} from '../utils/file-exclusions';
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
  decisionPath: string; // e.g., "feature-enabled:Y → folder-excluded:N → content-excluded:N → name-excluded:N → tag-property-exclusions:N → features:title → content-below-yaml:N"
}

/** Decision-tree node names, recorded into `decisionPath`. Names rather than numbers: nothing
 * outside this file decodes them, and numbering decayed into gaps and letter suffixes as nodes
 * were inserted. */
type DecisionNode =
  | 'feature-enabled'
  | 'folder-excluded'
  | 'content-excluded'
  | 'name-excluded'
  | 'tag-property-exclusions'
  | 'templater-enabled'
  | 'templater-trigger'
  | 'in-template-folder'
  | 'folder-templates-mode'
  | 'folder-template-matches'
  | 'regex-templates-mode'
  | 'regex-template-matches'
  | 'templater-event'
  | 'template-excluded'
  | 'name-excluded-after-template'
  | 'features'
  | 'content-below-yaml'
  | 'cursor-at-end';

type DecisionOutcome = 'Y' | 'N' | 'title' | 'cursor' | 'both';

/**
 * Coordinates file creation behavior: decides whether to move the cursor and/or
 * insert a title when a note is created.
 *
 * The node names below are the sole definition of the tree — they are not
 * shorthand for an external diagram — and they are load-bearing: every branch
 * appends `<node>:<outcome>` to `decisionPath`, which is what debug reports are
 * read against. Renaming a node invalidates every previously captured path.
 *
 * Gates, in order (each falls through to the next unless it returns):
 * - feature-enabled: Either feature enabled? No → do nothing.
 * - folder-excluded: Folder excluded? Yes → do nothing.
 * - content-excluded: Tag/property/disable-renaming excluded, judged on real-time content? Yes → do nothing.
 * - name-excluded: File name excluded? Yes → do nothing.
 * - tag-property-exclusions: Any tag or property exclusions configured? No → settings hub.
 * - templater-enabled: Templater loaded? No → settings hub.
 * - templater-trigger: Templater's trigger on file creation on? No → settings hub.
 * - in-template-folder: File sits in Templater's template folder? Yes → settings hub.
 * - folder-templates-mode: Folder templates on? Yes → folder-template-matches, else regex-templates-mode.
 * - folder-template-matches: A folder template matches this path? Yes → Templater wait, No → settings hub.
 * - regex-templates-mode: File regex templates on? No → settings hub.
 * - regex-template-matches: A file regex matches this path? Yes → Templater wait, No → settings hub.
 * - templater-event: Templater event arrived within the timeout? No → settings hub.
 * - template-excluded: Template carries an excluded tag/property? Yes → do nothing, No → settings hub.
 * - name-excluded-after-template: File name excluded once the template has run? Yes → do nothing.
 *
 * Settings hub (features, cursor-at-end, content-below-yaml) then maps the
 * enabled features onto the final actions: `features:title`, `features:cursor`
 * or `features:both`, with `content-below-yaml` checking for existing content
 * below the YAML and `cursor-at-end` reading "Place cursor at line end".
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

    // feature-enabled: Is either feature enabled?
    const featuresEnabled = this.isFeatureEnabled();
    if (featuresEnabled === 'neither') {
      this.recordDecisionAndLogOutcome(
        'feature-enabled',
        'N',
        'Do nothing (both features disabled)'
      );
      return this.noActions(this.pathString());
    }
    this.recordDecision('feature-enabled', 'Y');

    // folder-excluded runs before content-excluded because a path prefix test is far cheaper than the content gate, which parses YAML and reads the metadata cache
    // folder-excluded: Is folder excluded?
    if (this.isFolderExcluded(file)) {
      this.recordDecisionAndLogOutcome(
        'folder-excluded',
        'Y',
        'Do nothing (folder excluded)'
      );
      return this.noActions(this.pathString());
    }
    this.recordDecision('folder-excluded', 'N');

    // content-excluded: Is file excluded by tag/property/disable-renaming (content-based, real-time)?
    if (this.isContentExcluded(file, context.initialContent)) {
      this.recordDecisionAndLogOutcome(
        'content-excluded',
        'Y',
        'Do nothing (tag/property/disable-renaming excluded)'
      );
      return this.noActions(this.pathString());
    }
    this.recordDecision('content-excluded', 'N');

    // name-excluded: Is the file name excluded? Kept after content-excluded because the suite pins the content gate firing before the name check; the extra cost — the content-gate evaluation, not the name test — is paid only by name-excluded files.
    if (this.isFileNameExcluded(file)) {
      this.recordDecisionAndLogOutcome(
        'name-excluded',
        'Y',
        'Do nothing (file name excluded)'
      );
      return this.noActions(this.pathString());
    }
    this.recordDecision('name-excluded', 'N');

    // tag-property-exclusions: Are there exclusions configured?
    if (this.hasExclusions()) {
      this.recordDecision('tag-property-exclusions', 'Y');

      // templater-enabled: Is Templater enabled?
      if (!this.isTemplaterOn()) {
        this.recordDecision('templater-enabled', 'N');
        return this.proceedToSettingsHub(file, context, this.pathString());
      }
      this.recordDecision('templater-enabled', 'Y');

      // templater-trigger: Is Templater trigger on file creation enabled?
      if (!this.isTemplaterTriggerOn()) {
        this.recordDecision('templater-trigger', 'N');
        return this.proceedToSettingsHub(file, context, this.pathString());
      }
      this.recordDecision('templater-trigger', 'Y');

      // in-template-folder: Does path match Template folder location?
      if (this.isInTemplateFolder(file)) {
        this.recordDecision('in-template-folder', 'Y');
        return this.proceedToSettingsHub(file, context, this.pathString());
      }
      this.recordDecision('in-template-folder', 'N');

      // folder-templates-mode: Is Enable folder templates ON?
      if (this.isFolderTemplatesEnabled()) {
        this.recordDecision('folder-templates-mode', 'Y');

        // folder-template-matches: Do any Folder fields match current path?
        if (this.folderTemplateMatches(file)) {
          this.recordDecision('folder-template-matches', 'Y');
          // Wait for Templater event (templater-event)
          return await this.handleTemplaterEvent(
            file,
            context,
            this.pathString()
          );
        }
        this.recordDecision('folder-template-matches', 'N');
        // folder-template-matches:N skips regex-templates-mode: once folder templates are on, Templater resolves the folder template and never falls back to a file regex, so there is nothing left to match
        return this.proceedToSettingsHub(file, context, this.pathString());
      }
      this.recordDecision('folder-templates-mode', 'N');

      // regex-templates-mode: Is Enable file regex templates ON? (only reached if folder-templates-mode:N)
      if (this.isFileRegexEnabled()) {
        this.recordDecision('regex-templates-mode', 'Y');

        // regex-template-matches: Do any File regex fields match?
        if (this.fileRegexMatches(file)) {
          this.recordDecision('regex-template-matches', 'Y');
          // Wait for Templater event (templater-event)
          return await this.handleTemplaterEvent(
            file,
            context,
            this.pathString()
          );
        }
        this.recordDecision('regex-template-matches', 'N');
      } else {
        this.recordDecision('regex-templates-mode', 'N');
      }

      // No Templater template matched - proceed to settings hub
      return this.proceedToSettingsHub(file, context, this.pathString());
    } else {
      // tag-property-exclusions: No exclusions
      this.recordDecision('tag-property-exclusions', 'N');
      return this.proceedToSettingsHub(file, context, this.pathString());
    }
  }

  /**
   * templater-event, template-excluded: Handle Templater event and template exclusion check
   */
  private async handleTemplaterEvent(
    file: TFile,
    context: FileCreationContext,
    pathSoFar: string
  ): Promise<FileCreationActions> {
    // templater-event: Wait for Templater event
    const eventFired = await this.waitForTemplaterEvent(
      file,
      TIMING.TEMPLATER_EVENT_TIMEOUT_MS,
      file.stat.ctime
    );

    if (!eventFired) {
      this.recordDecision('templater-event', 'N');
      return this.proceedToSettingsHub(
        file,
        context,
        pathSoFar + ' → templater-event:N'
      );
    }
    this.recordDecision('templater-event', 'Y');

    // template-excluded: Does template have excluded tag/property?
    if (this.templateHasExclusions(file)) {
      this.recordDecisionAndLogOutcome(
        'template-excluded',
        'Y',
        'Do nothing (template has exclusions)'
      );
      return this.noActions(
        pathSoFar + ' → templater-event:Y → template-excluded:Y'
      );
    }
    this.recordDecision('template-excluded', 'N');

    // name-excluded-after-template: Templater can rename across the exclusion boundary during the templater-event wait, so the name that name-excluded cleared may no longer be the file's.
    // Not folded into template-excluded:Y: captured debug paths have to keep telling the two causes apart. The mirror case — excluded at creation, cleared by the template — is deliberately not re-opened, since name-excluded returns before the wait ever starts.
    if (this.isFileNameExcluded(file)) {
      this.recordDecisionAndLogOutcome(
        'name-excluded-after-template',
        'Y',
        'Do nothing (file name excluded after template)'
      );
      return this.noActions(
        pathSoFar +
          ' → templater-event:Y → template-excluded:N → name-excluded-after-template:Y'
      );
    }
    this.recordDecision('name-excluded-after-template', 'N');

    return this.proceedToSettingsHub(
      file,
      context,
      pathSoFar +
        ' → templater-event:Y → template-excluded:N → name-excluded-after-template:N'
    );
  }

  /**
   * features, content-below-yaml, cursor-at-end: Process settings hub and determine final actions
   */
  private proceedToSettingsHub(
    file: TFile,
    context: FileCreationContext,
    pathSoFar: string
  ): FileCreationActions {
    const featuresEnabled = this.isFeatureEnabled();

    if (featuresEnabled === 'title') {
      // Title only
      this.recordDecision('features', 'title');

      // content-below-yaml: Has content below YAML?
      if (this.hasContentBelowYaml(context.initialContent)) {
        this.recordDecisionAndLogOutcome(
          'content-below-yaml',
          'Y',
          'Do nothing (has content)'
        );
        return this.noActions(
          pathSoFar + ' → features:title → content-below-yaml:Y'
        );
      }
      this.recordDecisionAndLogOutcome(
        'content-below-yaml',
        'N',
        'Insert title'
      );
      return {
        shouldMoveCursor: false,
        shouldInsertTitle: true,
        placeCursorAtEnd: false,
        decisionPath: pathSoFar + ' → features:title → content-below-yaml:N',
      };
    } else if (featuresEnabled === 'cursor') {
      // Cursor only
      this.recordDecision('features', 'cursor');

      // cursor-at-end: Is Place cursor at line end ON?
      if (this.isPlaceCursorAtEndEnabled()) {
        this.recordDecisionAndLogOutcome(
          'cursor-at-end',
          'Y',
          'Move cursor + Place at end'
        );
        return {
          shouldMoveCursor: true,
          shouldInsertTitle: false,
          placeCursorAtEnd: true,
          decisionPath: pathSoFar + ' → features:cursor → cursor-at-end:Y',
        };
      } else {
        this.recordDecisionAndLogOutcome('cursor-at-end', 'N', 'Move cursor');
        return {
          shouldMoveCursor: true,
          shouldInsertTitle: false,
          placeCursorAtEnd: false,
          decisionPath: pathSoFar + ' → features:cursor → cursor-at-end:N',
        };
      }
    } else {
      // Both features enabled
      this.recordDecision('features', 'both');

      // cursor-at-end: Is Place cursor at line end ON?
      if (this.isPlaceCursorAtEndEnabled()) {
        this.recordDecision('cursor-at-end', 'Y');

        // content-below-yaml: Has content below YAML?
        if (this.hasContentBelowYaml(context.initialContent)) {
          this.recordDecisionAndLogOutcome(
            'content-below-yaml',
            'Y',
            'Move cursor + Place at end'
          );
          return {
            shouldMoveCursor: true,
            shouldInsertTitle: false,
            placeCursorAtEnd: true,
            decisionPath:
              pathSoFar +
              ' → features:both → cursor-at-end:Y → content-below-yaml:Y',
          };
        } else {
          this.recordDecisionAndLogOutcome(
            'content-below-yaml',
            'N',
            'Insert title + Move cursor + Place at end'
          );
          return {
            shouldMoveCursor: true,
            shouldInsertTitle: true,
            placeCursorAtEnd: true,
            decisionPath:
              pathSoFar +
              ' → features:both → cursor-at-end:Y → content-below-yaml:N',
          };
        }
      } else {
        this.recordDecisionAndLogOutcome(
          'cursor-at-end',
          'N',
          'Insert title + Move cursor'
        );
        return {
          shouldMoveCursor: true,
          shouldInsertTitle: true,
          placeCursorAtEnd: false,
          decisionPath: pathSoFar + ' → features:both → cursor-at-end:N',
        };
      }
    }
  }

  // ============================================================================
  // Decision Node Implementations (Private Methods)
  // ============================================================================

  /**
   * feature-enabled: Check which features are enabled
   */
  private isFeatureEnabled(): 'both' | 'cursor' | 'title' | 'neither' {
    const moveCursor = this.plugin.settings.core.moveCursorToFirstLine;
    const insertTitle = this.plugin.settings.core.insertTitle;

    if (moveCursor && insertTitle) return 'both';
    if (moveCursor) return 'cursor';
    if (insertTitle) return 'title';
    return 'neither';
  }

  /**
   * folder-excluded: Check if folder is excluded
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
   * content-excluded: Check tag/property/disable-renaming exclusion using real-time content.
   * Runs the same evaluation the rename path runs, so the title is inserted and the cursor
   * moved exactly when renaming is allowed for this file, and not otherwise.
   */
  private isContentExcluded(file: TFile, initialContent: string): boolean {
    return this.plugin.fileOperations.isFileExcludedForCursorPositioning(
      file,
      initialContent,
      // folder-excluded already ran this same folder check through this same gate: an optimization, not a semantic difference
      { ignoreFolder: true }
    );
  }

  /**
   * name-excluded, name-excluded-after-template: Check file-name exclusions, the same ones the rename path enforces in rename-engine.ts.
   */
  private isFileNameExcluded(file: TFile): boolean {
    return isExcludedByFileName(file.name, this.plugin.settings);
  }

  /**
   * tag-property-exclusions: Check if any tags or properties are configured in Exclusions
   * Note: Folders are checked separately in folder-excluded
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
   * templater-enabled: Check if Templater plugin is installed and enabled
   */
  private isTemplaterOn(): boolean {
    return 'templater-obsidian' in this.plugin.app.plugins.plugins;
  }

  /**
   * templater-trigger: Check if Templater's "Trigger on new file creation" is enabled
   */
  private isTemplaterTriggerOn(): boolean {
    return this.getTemplaterSettings()?.trigger_on_file_creation === true;
  }

  /**
   * in-template-folder: Check if file path matches Templater's template folder location
   */
  private isInTemplateFolder(file: TFile): boolean {
    const templateFolder =
      (this.getTemplaterSettings()?.templates_folder as string) || '';

    if (!templateFolder || templateFolder === '/') return false;

    return file.path.startsWith(templateFolder + '/');
  }

  /**
   * folder-templates-mode: Check if Templater's "Enable folder templates" is ON
   */
  private isFolderTemplatesEnabled(): boolean {
    return this.getTemplaterSettings()?.enable_folder_templates === true;
  }

  /**
   * folder-template-matches: Check if any Templater folder template matches current path
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
   * regex-templates-mode: Check if Templater's "Enable file regex templates" is ON
   */
  private isFileRegexEnabled(): boolean {
    return this.getTemplaterSettings()?.enable_file_templates === true;
  }

  /**
   * regex-template-matches: Check if any Templater file regex matches current path
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
   * templater-event: Wait for Templater event with timeout
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
   * template-excluded: Check if template itself has excluded tags/properties.
   * Re-checks after Templater expansion, which can add tags or properties the file did not carry at content-excluded.
   */
  private templateHasExclusions(file: TFile): boolean {
    try {
      const cache = this.plugin.app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter;
      const exclusions = this.plugin.settings.exclusions;
      const listedTags = filterNonEmpty(exclusions.excludedTags);
      // template-excluded gates on the property key alone; configured values are not part of the template rule
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
   * template-excluded whitelist half: does the template carry any tags at all, within the configured scope?
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
   * content-below-yaml: Check if file has content below YAML (excluding bare heading syntax)
   */
  private hasContentBelowYaml(content: string): boolean {
    const fmInfo = getFrontMatterInfo(content);
    const contentBelowYaml = content.substring(fmInfo.contentStart).trim();
    const isBareHeading = /^#{1,6}\s*$/.test(contentBelowYaml);

    return contentBelowYaml !== '' && !isBareHeading;
  }

  /**
   * cursor-at-end: Check if "Place cursor at line end" setting is enabled
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
  private recordDecision(node: DecisionNode, outcome: DecisionOutcome): void {
    this.decisionPath.push(`${node}:${outcome}`);
  }

  /**
   * Append a decision node result and log the path it resolved to. Reserved for
   * branches that settle the outcome, so one file creation logs one line.
   */
  private recordDecisionAndLogOutcome(
    node: DecisionNode,
    outcome: DecisionOutcome,
    resolution: string
  ): void {
    this.recordDecision(node, outcome);
    verboseLog(
      this.plugin,
      `[FileCreation] Decision path: ${this.pathString()} → ${resolution}`
    );
  }

  /**
   * Get current decision path as string
   */
  private pathString(): string {
    return this.decisionPath.join(' → ');
  }
}
