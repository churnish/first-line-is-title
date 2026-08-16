import { EXCLUSION_STRATEGY, PluginSettings, TagMatchingMode } from './types';

export const DEFAULT_SETTINGS: PluginSettings = {
  core: {
    // Rename behavior
    renameAutomatically: true,
    titleCase: 'preserve',
    renameOnFocus: false,
    renameOnSave: false,
    onlyRenameIfHeading: false,
    manualNotificationMode: 'Always',
    charCount: 100,
    checkInterval: 0,
    fileReadMethod: 'Editor',

    // New file handling
    // On by default: a fresh install does nothing visible otherwise. Existing
    // users keep a stored `false` — main.ts merges loaded data over these, so
    // only keys absent from data.json pick up a changed default.
    insertTitleOnCreation: true,
    convertReplacementCharactersInTitle: true,
    moveCursorToFirstLine: true,
    placeCursorAtLineEnd: true,
    newNoteDelay: 0,

    // UI visibility
    enableContextMenus: true,
    enableVaultSearchContextMenu: true,

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
    lastUsageDate: '',
    hasEnabledForbiddenChars: false,
    hasEnabledCustomReplacements: false,
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
    folderScopeStrategy: EXCLUSION_STRATEGY.ONLY_EXCLUDE,
    tagScopeStrategy: EXCLUSION_STRATEGY.ONLY_EXCLUDE,
    propertyScopeStrategy: EXCLUSION_STRATEGY.ONLY_EXCLUDE,
    // Empty, not a seeded blank row: deepMerge replaces arrays wholesale, so a seeded
    // entry would materialise a dead rule on every fresh install. The lists render
    // their own empty state.
    excludedFolders: [],
    excludedTags: [],
    excludedProperties: [],
    excludeSubfolders: true,
    tagMatchingMode: 'In Properties and note body' as TagMatchingMode,
    excludeChildTags: true,
    disableRenamingKey: 'no rename',
    disableRenamingValue: 'true',
    fileNameExclusions: [
      {
        text: 'To do',
        onlyAtStart: false,
        onlyWholeLine: false,
        enabled: false,
        caseSensitive: false,
      },
    ],
  },
  replaceCharacters: {
    enableForbiddenCharReplacements: false,
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
        replacement: '？',
        enabled: false,
        trimLeft: false,
        trimRight: true,
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
  markupStripping: {
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
