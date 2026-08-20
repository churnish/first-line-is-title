import { CharReplacements } from './types/char-replacement';

export interface CustomReplacement {
  searchText: string;
  replaceText: string;
  onlyAtStart: boolean;
  onlyWholeLine: boolean;
  enabled: boolean;
}

export interface FileNameExclusion {
  text: string;
  onlyAtStart: boolean;
  onlyWholeLine: boolean;
  enabled: boolean;
  caseSensitive: boolean;
}

export interface ExcludedProperty {
  key: string;
  value: string;
}

export interface TitleRegionCache {
  firstNonEmptyLine: string;
  titleSourceLine: string;
  lastUpdated: number;
}

/** Every outcome `RenameEngine.processFile` can report. */
export type RenameOutcomeReason =
  | 'renamed'
  | 'no-rename-needed'
  | 'empty-content-retained'
  | 'already-processing'
  | 'error'
  | 'excluded'
  | 'file-name-exclusion'
  | 'file-not-found'
  | 'footnote-popover-edit'
  | 'global-rate-limited'
  | 'max-conflicts-exceeded'
  | 'not-heading'
  | 'not-markdown'
  | 'property-disabled'
  | 'read-error'
  | 'recently-renamed'
  | 'self-referential'
  | 'time-rate-limited';

// `reason` is required, not optional: the alias gate in `processFile` matches on it, and the
// successful-rename path used to omit it, so the gate silently skipped the one outcome that
// renames a file. Requiring it makes any future drift a compile error.
export interface RenameOutcome {
  success: boolean;
  reason: RenameOutcomeReason;
}

export type OSPreset = 'macOS' | 'Windows' | 'Linux';
export type NotificationMode = 'Always' | 'On title change' | 'Never';
/**
 * Canonical exclusion-strategy values. Persisted verbatim in data.json and used as
 * settings-dropdown option keys — the literal text, including the trailing three-period
 * ellipsis, must never change or every existing user's exclusion strategy silently resets.
 */
export const EXCLUSION_STRATEGY = {
  ONLY_EXCLUDE: 'Only exclude...',
  EXCLUDE_ALL_EXCEPT: 'Exclude all except...',
} as const;
export type ExclusionStrategy =
  (typeof EXCLUSION_STRATEGY)[keyof typeof EXCLUSION_STRATEGY];
export type TagMatchingMode =
  | 'In Properties and note body'
  | 'In Properties only'
  | 'In note body only';
export type ContentReadMethod = 'Editor' | 'Cache' | 'File';

export type PropertyHidingOption = 'never' | 'always' | 'when_empty';

/**
 * Core plugin settings (General + Other tabs)
 */
export interface CoreSettings {
  // Rename behavior
  renameAutomatically: boolean;
  titleCase: 'preserve' | 'uppercase' | 'lowercase';
  renameOnFocus: boolean;
  renameOnSave: boolean;
  onlyRenameIfHeading: boolean;
  manualNotificationMode: NotificationMode;
  charCount: number;
  checkInterval: number;
  contentReadMethod: ContentReadMethod;

  // New file handling
  insertTitle: boolean;
  convertReplacementChars: boolean;
  formatAsHeading: boolean;
  moveCursorToFirstLine: boolean;
  placeCursorAtLineEnd: boolean;
  newNoteDelay: number;

  // UI visibility
  enableContextMenus: boolean;
  enableSearchCommands: boolean;

  // Context menu command groups
  enableFileCommands: boolean;
  enableFolderCommands: boolean;
  enableTagCommands: boolean;

  // Internal state and debugging
  debug: boolean;
  debugOutputFullContent: boolean;
  debugEnabledTimestamp: string;
  hasSetupExclusions: boolean;
  lastUsageDate: string;
  hasEnabledForbiddenChars: boolean;
  hasEnabledCustomReplacements: boolean;
  hasEnabledAliases: boolean;
  modalCheckboxStates: {
    folderRename: {
      includeSubfolders: boolean;
      renameExcludedFolders: boolean;
      renameExcludedTags: boolean;
      renameExcludedProperties: boolean;
    };
    tagRename: {
      includeSubtags: boolean;
      renameExcludedFolders: boolean;
      renameExcludedTags: boolean;
      renameExcludedProperties: boolean;
    };
    searchRename: {
      renameExcludedFolders: boolean;
      renameExcludedTags: boolean;
      renameExcludedProperties: boolean;
    };
    folderDisable: {
      includeSubfolders: boolean;
    };
    tagDisable: {
      includeSubtags: boolean;
    };
  };
}

/**
 * Exclusion and scoping settings
 */
export interface ExclusionSettings {
  folderScopeStrategy: ExclusionStrategy;
  tagScopeStrategy: ExclusionStrategy;
  propertyScopeStrategy: ExclusionStrategy;
  fileNameScopeStrategy: ExclusionStrategy;
  excludedFolders: string[];
  excludedTags: string[];
  excludedProperties: ExcludedProperty[];
  matchSubfolders: boolean;
  tagMatchingMode: TagMatchingMode;
  matchSubtags: boolean;
  disableRenamingKey: string;
  disableRenamingValue: string;
  excludedFileNames: FileNameExclusion[];
}

/**
 * Character replacements settings (forbidden chars)
 */
export interface CharacterReplacementsSettings {
  enableForbiddenCharReplacements: boolean;
  osPreset: OSPreset;
  charReplacements: CharReplacements;
}

/**
 * Custom replacements settings
 */
export interface CustomReplacementsSettings {
  enableCustomReplacements: boolean;
  rules: CustomReplacement[];
  applyAfterForbiddenChars: boolean;
}

/**
 * Markup stripping and content processing settings
 */
export interface MarkupStrippingSettings {
  stripMarkupSettings: {
    headings: boolean;
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    highlight: boolean;
    wikilinks: boolean;
    markdownLinks: boolean;
    quote: boolean;
    callouts: boolean;
    unorderedLists: boolean;
    orderedLists: boolean;
    taskLists: boolean;
    code: boolean;
    codeBlocks: boolean;
    footnotes: boolean;
    comments: boolean;
    htmlTags: boolean;
  };
  stripMarkupInAlias: boolean;
  stripCommentsEntirely: boolean;
  stripTemplaterSyntax: boolean;
  stripTableMarkup: boolean;
  stripHorizontalRuleMarkup: boolean;
  stripInlineMathMarkup: boolean;
  stripMathBlockMarkup: boolean;
  detectDiagrams: boolean;
  grabTitleFromCardLink: boolean;
  applyCustomReplacementsInAlias: boolean;
  applyCustomReplacementsAfterMarkupStripping: boolean;
}

/**
 * Alias management settings
 */
export interface AliasSettings {
  enableAliases: boolean;
  truncateAlias: boolean;
  addAliasOnlyIfTitleDiffers: boolean;
  aliasPropertyKey: string;
  hideAliasProperty: PropertyHidingOption;
  hideAliasInSidebar: boolean;
  keepEmptyAliasProperty: boolean;
  placeAliasLast: boolean;
}

/**
 * Structured plugin settings organized by feature
 */
export interface PluginSettings {
  /**
   * Schema version of the persisted data.json. Stored data whose version does not
   * match `CURRENT_DATA_SCHEMA_VERSION` is discarded and replaced with the defaults
   * rather than migrated key by key — see `loadSettings()` in `main.ts`.
   */
  dataSchemaVersion: number;
  core: CoreSettings;
  exclusions: ExclusionSettings;
  characterReplacements: CharacterReplacementsSettings;
  customReplacements: CustomReplacementsSettings;
  markupStripping: MarkupStrippingSettings;
  aliases: AliasSettings;
}

/**
 * Recursive `Partial`. Settings are deeply nested, so a plain `Partial` would force a
 * caller overriding one leaf to restate every sibling key of the branch it lives in.
 *
 * The object branch must not be narrowed to `Record<string, unknown>`: interfaces carry
 * no implicit index signature, so `PluginSettings` would fail that check and the whole
 * type would collapse back to `T`.
 */
export type DeepPartial<T> = T extends (infer _U)[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;
