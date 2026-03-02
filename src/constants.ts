import { PluginSettings, TagMatchingMode } from './types';

export const DEFAULT_SETTINGS: PluginSettings = {
  core: {
    // Rename behavior
    renameNotes: 'automatically',
    titleCase: 'preserve',
    renameOnFocus: false,
    renameOnSave: false,
    onlyRenameIfHeading: false,
    manualNotificationMode: 'Always',
    preserveModificationDate: true,
    charCount: 100,
    checkInterval: 0,
    fileReadMethod: 'Editor',

    // New file handling
    insertTitleOnCreation: false,
    convertReplacementCharactersInTitle: true,
    moveCursorToFirstLine: false,
    placeCursorAtLineEnd: true,
    newNoteDelay: 0,

    // UI visibility
    enableContextMenus: true,
    enableVaultSearchContextMenu: true,
    commandVisibility: {
      folderPutFirstLineInTitle: true,
      folderExclude: true,
      folderStopExcluding: true,
      filePutFirstLineInTitle: true,
      fileExclude: true,
      fileStopExcluding: true,
      tagPutFirstLineInTitle: true,
      tagExclude: true,
      tagStopExcluding: true,
    },
    vaultSearchContextMenuVisibility: {
      putFirstLineInTitle: true,
      disable: true,
      enable: true,
    },

    // Context menu command groups
    enableFileCommands: true,
    enableFolderCommands: true,
    enableTagCommands: true,

    // Internal state and debugging
    verboseLogging: false,
    debugOutputFullContent: false,
    debugEnabledTimestamp: '',
    hasShownFirstTimeNotice: false,
    hasSetupExclusions: false,
    hasSetPropertyType: false,
    lastUsageDate: '',
    currentSettingsTab: 'general',
    hasEnabledForbiddenChars: false,
    hasEnabledWindowsAndroid: false,
    hasEnabledCustomReplacements: false,
    hasEnabledSafewords: false,
    hasEnabledAliases: false,
    modalCheckboxStates: {
      folderRename: {
        includeSubfolders: true,
        renameExcludedFolders: false,
        renameExcludedTags: false,
        renameExcludedProperties: false,
      },
      tagRename: {
        includeChildTags: true,
        renameExcludedFolders: false,
        renameExcludedTags: false,
        renameExcludedProperties: false,
      },
      searchRename: {
        renameExcludedFolders: false,
        renameExcludedTags: false,
        renameExcludedProperties: false,
      },
      folderDisable: {
        includeSubfolders: true,
      },
      tagDisable: {
        includeChildTags: true,
      },
    },
  },
  exclusions: {
    folderScopeStrategy: 'Only exclude...',
    tagScopeStrategy: 'Only exclude...',
    propertyScopeStrategy: 'Only exclude...',
    excludedFolders: [''],
    excludedTags: [''],
    excludedProperties: [],
    excludeSubfolders: true,
    includeSubfolders: true,
    includeBodyTags: true,
    includeNestedTags: true,
    tagMatchingMode: 'In Properties and note body' as TagMatchingMode,
    excludeChildTags: true,
    disableRenamingKey: 'no rename',
    disableRenamingValue: 'true',
  },
  replaceCharacters: {
    enableForbiddenCharReplacements: false,
    windowsAndroidEnabled: false,
    osPreset: 'macOS',
    charReplacements: {
      slash: {
        replacement: ' ∕ ',
        enabled: false,
        trimLeft: false,
        trimRight: false,
      },
      colon: {
        replacement: '։',
        enabled: false,
        trimLeft: false,
        trimRight: false,
      },
      asterisk: {
        replacement: '∗',
        enabled: false,
        trimLeft: false,
        trimRight: false,
      },
      question: {
        replacement: '﹖',
        enabled: false,
        trimLeft: false,
        trimRight: false,
      },
      lessThan: {
        replacement: '‹',
        enabled: false,
        trimLeft: false,
        trimRight: false,
      },
      greaterThan: {
        replacement: '›',
        enabled: false,
        trimLeft: false,
        trimRight: false,
      },
      quote: {
        replacement: "''",
        enabled: false,
        trimLeft: false,
        trimRight: false,
      },
      pipe: {
        replacement: '❘',
        enabled: false,
        trimLeft: false,
        trimRight: false,
      },
      hash: {
        replacement: '＃',
        enabled: false,
        trimLeft: false,
        trimRight: false,
      },
      leftBracket: {
        replacement: '［',
        enabled: false,
        trimLeft: true,
        trimRight: true,
      },
      rightBracket: {
        replacement: '］',
        enabled: false,
        trimLeft: true,
        trimRight: true,
      },
      caret: {
        replacement: 'ˆ',
        enabled: false,
        trimLeft: false,
        trimRight: false,
      },
      backslash: {
        replacement: '⧵',
        enabled: false,
        trimLeft: false,
        trimRight: false,
      },
      dot: {
        replacement: '․',
        enabled: true,
        trimLeft: false,
        trimRight: false,
      },
    },
  },
  customRules: {
    enableCustomReplacements: false,
    customReplacements: [
      {
        searchText: '- [ ] ',
        replaceText: '✔️ ',
        onlyAtStart: true,
        onlyWholeLine: false,
        enabled: false,
      },
      {
        searchText: '- [x] ',
        replaceText: '✅ ',
        onlyAtStart: true,
        onlyWholeLine: false,
        enabled: false,
      },
    ],
    applyCustomRulesAfterForbiddenChars: false,
  },
  safewords: {
    enableSafewords: false,
    safewords: [
      {
        text: 'To do',
        onlyAtStart: false,
        onlyWholeLine: false,
        enabled: false,
        caseSensitive: false,
      },
    ],
  },
  markupStripping: {
    enableStripMarkup: true,
    stripMarkupSettings: {
      headings: true,
      bold: true,
      italic: true,
      strikethrough: true,
      highlight: true,
      wikilinks: true,
      markdownLinks: true,
      quote: true,
      callouts: true,
      unorderedLists: true,
      orderedLists: true,
      taskLists: true,
      code: true,
      codeBlocks: true,
      footnotes: true,
      comments: true,
      htmlTags: true,
    },
    stripMarkupInAlias: false,
    omitHtmlTags: false,
    stripCommentsEntirely: true,
    stripTemplaterSyntax: true,
    stripTableMarkup: true,
    stripHorizontalRuleMarkup: true,
    stripInlineMathMarkup: true,
    stripMathBlockMarkup: true,
    detectDiagrams: true,
    grabTitleFromCardLink: true,
    applyCustomRulesInAlias: false,
    applyCustomRulesAfterMarkupStripping: false,
    addHeadingToTitle: false,
  },
  aliases: {
    enableAliases: false,
    truncateAlias: false,
    addAliasOnlyIfFirstLineDiffers: false,
    aliasPropertyKey: 'aliases',
    hideAliasProperty: 'never' as const,
    hideAliasInSidebar: false,
    keepEmptyAliasProperty: true,
    placeAliasLast: true,
  },
};

// OS-specific forbidden characters
export const UNIVERSAL_FORBIDDEN_CHARS = [
  '/',
  ':',
  '|',
  String.fromCharCode(92),
  '#',
  '[',
  ']',
  '^',
];
export const WINDOWS_ANDROID_CHARS = ['*', '?', '<', '>', '"'];

// Character reversal mapping for title insertion (reverse forbidden char replacements)
export const TITLE_CHAR_REVERSAL_MAP: Record<string, string> = {
  '∕': '/', // Unicode: \u2215 -> slash
  '։': ':', // Unicode: \u0589 -> colon
  '∗': '*', // Unicode: \u2217 -> asterisk
  '﹖': '?', // Unicode: \uFE56 -> question
  '‹': '<', // Unicode: \u2039 -> lessThan
  '›': '>', // Unicode: \u203A -> greaterThan
  '＂': '"', // Unicode: \uFF02 -> quote
  '❘': '|', // Unicode: \u2758 -> pipe
  '＃': '#', // Unicode: \uFF03 -> hash
  '［': '[', // Unicode: \uFF3B -> leftBracket
  '］': ']', // Unicode: \uFF3D -> rightBracket
  ˆ: '^', // Unicode: \u02C6 -> caret
  '⧵': '\\', // Unicode: \u29F5 -> backslash
  '․': '.', // Unicode: \u2024 -> dot
};
