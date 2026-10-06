import { EXCLUSION_STRATEGY, PluginSettings } from './types';

/**
 * Schema version of the settings this build understands. Bump it whenever the stored
 * shape changes in a way that is not worth migrating: `loadSettings()` discards any
 * data.json carrying a different version and starts from `DEFAULT_SETTINGS`.
 */
export const CURRENT_DATA_SCHEMA_VERSION = 4;

export const DEFAULT_SETTINGS: PluginSettings = {
  dataSchemaVersion: CURRENT_DATA_SCHEMA_VERSION,
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
    contentReadMethod: 'Editor',

    // New file handling
    // On by default: a fresh install does nothing visible otherwise. Existing
    // users keep a stored `false` — main.ts merges loaded data over these, so
    // only keys absent from data.json pick up a changed default.
    insertTitle: true,
    convertReplacementChars: true,
    formatAsHeading: false,
    moveCursorToFirstLine: true,
    placeCursorAtLineEnd: true,
    newNoteDelay: 0,

    // UI visibility
    enableContextMenus: true,
    enableSearchCommands: true,

    // Context menu command groups
    enableFileCommands: true,
    enableFolderCommands: true,
    enableTagCommands: true,

    // Internal state and debugging
    debug: false,
    debugOutputFullContent: false,
    debugEnabledTimestamp: '',
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
        includeSubtags: true,
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
        includeSubtags: true,
      },
    },
  },
  exclusions: {
    folderScopeStrategy: EXCLUSION_STRATEGY.ONLY_EXCLUDE,
    tagScopeStrategy: EXCLUSION_STRATEGY.ONLY_EXCLUDE,
    propertyScopeStrategy: EXCLUSION_STRATEGY.ONLY_EXCLUDE,
    fileNameScopeStrategy: EXCLUSION_STRATEGY.ONLY_EXCLUDE,
    // Empty, not a seeded blank row: deepMerge replaces arrays wholesale, so a seeded
    // entry would materialise a dead rule on every fresh install. The lists render
    // their own empty state.
    excludedFolders: [],
    excludedTags: [],
    excludedProperties: [],
    matchSubfolders: true,
    tagMatchingMode: 'In Properties and note body',
    matchSubtags: true,
    disableRenamingKey: 'no rename',
    disableRenamingValue: 'true',
    excludedFileNames: [],
  },
  characterReplacements: {
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
  customReplacements: {
    enableCustomReplacements: false,
    rules: [
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
    applyAfterForbiddenChars: false,
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
    applyCustomReplacementsInAlias: false,
    applyCustomReplacementsAfterMarkupStripping: false,
  },
  aliases: {
    enableAliases: false,
    truncateAlias: false,
    addAliasOnlyIfTitleDiffers: false,
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
