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
export type FileReadMethod = 'Editor' | 'Cache' | 'File';

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
  fileReadMethod: FileReadMethod;

  // New file handling
  insertTitleOnCreation: boolean;
  convertReplacementCharactersInTitle: boolean;
  moveCursorToFirstLine: boolean;
  placeCursorAtLineEnd: boolean;
  newNoteDelay: number;

  // UI visibility
  enableContextMenus: boolean;
  enableVaultSearchContextMenu: boolean;

  // Context menu command groups
  enableFileCommands: boolean;
  enableFolderCommands: boolean;
  enableTagCommands: boolean;

  // Internal state and debugging
  verboseLogging: boolean;
  debugOutputFullContent: boolean;
  debugEnabledTimestamp: string;
  hasShownFirstTimeNotice: boolean;
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
      includeChildTags: boolean;
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
      includeChildTags: boolean;
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
  excludedFolders: string[];
  excludedTags: string[];
  excludedProperties: ExcludedProperty[];
  excludeSubfolders: boolean;
  tagMatchingMode: TagMatchingMode;
  excludeChildTags: boolean;
  disableRenamingKey: string;
  disableRenamingValue: string;
  fileNameExclusions: FileNameExclusion[];
}

/**
 * Replace characters settings (forbidden chars)
 */
export interface ReplaceCharactersSettings {
  enableForbiddenCharReplacements: boolean;
  osPreset: OSPreset;
  charReplacements: CharReplacements;
}

/**
 * Custom rules settings
 */
export interface CustomRulesSettings {
  enableCustomReplacements: boolean;
  customReplacements: CustomReplacement[];
  applyCustomRulesAfterForbiddenChars: boolean;
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
  applyCustomRulesInAlias: boolean;
  applyCustomRulesAfterMarkupStripping: boolean;
  addHeadingToTitle: boolean;
}

/**
 * Alias management settings
 */
export interface AliasSettings {
  enableAliases: boolean;
  truncateAlias: boolean;
  addAliasOnlyIfFirstLineDiffers: boolean;
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
  core: CoreSettings;
  exclusions: ExclusionSettings;
  replaceCharacters: ReplaceCharactersSettings;
  customRules: CustomRulesSettings;
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
