import { CharReplacements } from './types/char-replacement';

export interface CustomReplacement {
  searchText: string;
  replaceText: string;
  onlyAtStart: boolean;
  onlyWholeLine: boolean;
  enabled: boolean;
}

export interface Safeword {
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
export type ExclusionStrategy = 'Only exclude...' | 'Exclude all except...';
export type TagPropertyExclusionStrategy =
  | 'Only exclude...'
  | 'Exclude all except...';
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
  renameNotes: 'automatically' | 'manually';
  titleCase: 'preserve' | 'uppercase' | 'lowercase';
  renameOnFocus: boolean;
  renameOnSave: boolean;
  onlyRenameIfHeading: boolean;
  manualNotificationMode: NotificationMode;
  preserveModificationDate: boolean;
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
  commandVisibility: {
    folderPutFirstLineInTitle: boolean;
    folderExclude: boolean;
    folderStopExcluding: boolean;
    filePutFirstLineInTitle: boolean;
    fileExclude: boolean;
    fileStopExcluding: boolean;
    tagPutFirstLineInTitle: boolean;
    tagExclude: boolean;
    tagStopExcluding: boolean;
  };
  vaultSearchContextMenuVisibility: {
    putFirstLineInTitle: boolean;
    disable: boolean;
    enable: boolean;
  };

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
  hasSetPropertyType: boolean;
  lastUsageDate: string;
  currentSettingsTab: string;
  hasEnabledForbiddenChars: boolean;
  hasEnabledWindowsAndroid: boolean;
  hasEnabledCustomReplacements: boolean;
  hasEnabledSafewords: boolean;
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
  tagScopeStrategy: TagPropertyExclusionStrategy;
  propertyScopeStrategy: TagPropertyExclusionStrategy;
  excludedFolders: string[];
  excludedTags: string[];
  excludedProperties: ExcludedProperty[];
  excludeSubfolders: boolean;
  includeSubfolders: boolean;
  includeBodyTags: boolean;
  includeNestedTags: boolean;
  tagMatchingMode: TagMatchingMode;
  excludeChildTags: boolean;
  disableRenamingKey: string;
  disableRenamingValue: string;
}

/**
 * Replace characters settings (forbidden chars)
 */
export interface ReplaceCharactersSettings {
  enableForbiddenCharReplacements: boolean;
  windowsAndroidEnabled: boolean;
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
 * Safewords settings
 */
export interface SafewordsSettings {
  enableSafewords: boolean;
  safewords: Safeword[];
}

/**
 * Markup stripping and content processing settings
 */
export interface MarkupStrippingSettings {
  enableStripMarkup: boolean;
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
  omitHtmlTags: boolean;
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
  safewords: SafewordsSettings;
  markupStripping: MarkupStrippingSettings;
  aliases: AliasSettings;
}
