# First Line is Title

English • [Русский](https://github.com/churnish/first-line-is-title/blob/main/README_RU.md)

Automatically set the first line as note title, just like in Apple Notes. Forget about manual file name entry or nondescript timestamps.

![](https://github.com/user-attachments/assets/eed638e0-f695-4fdd-a0a6-2ace66585d58)

> **TIP:** The plugin is best used with the tab title bar enabled in Obsidian settings → Interface.

## Features

- Rename notes automatically or manually.
- Move cursor to first line on note creation.
- Put any first line content in title or headings only.
- Replace characters forbidden in file names with safe alternatives, or omit them entirely.
- Strip Markdown syntax from file names.
- Add custom replacement rules.
- Automatically populate first line alias property — make forbidden characters searchable in Quick switcher and link suggester, or set as note title in plugins like [Quick Switcher++](https://obsidian.md/plugins?id=darlal-switcher-plus), [Omnisearch](https://obsidian.md/plugins?id=omnisearch), [Notebook Navigator](https://obsidian.md/plugins?id=notebook-navigator) and [Front Matter Title](https://obsidian.md/plugins?id=obsidian-front-matter-title-plugin).
- Commands to batch rename all notes in folder, all notes with tag, all search results, or entire vault.
- Automatically insert file name in first line on note creation.
- Exclude select notes, folders, tags, properties or file names from renaming, or only enable renaming in some.
- Command to convert selection containing forbidden characters into valid internal link, with original text preserved as alias.

## File integrity

- Only notes that are currently open in the editor are processed, along with any notes you explicitly select for batch operations (like renaming all notes in a folder).
- By default, note modification time is preserved on rename.
- Multiple safeguards are in place to prevent unintended changes but **regular [backups](https://help.obsidian.md/backup) remain your ultimate safety net**.

## Commands

### Ribbon

| Command                                                                                                                                                                                                                          | Description                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| <a href="#ribbon"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/file-type-dark.svg"><img src=".github/icons/file-type.svg" width="15" height="15"></picture></a>&nbsp;Put first line in title      | Rename active note, even if in excluded folder or with excluded tag or property.         |
| <a href="#ribbon"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/files-dark.svg"><img src=".github/icons/files.svg" width="15" height="15"></picture></a>&nbsp;Put first line in title in all notes | Rename all notes in vault except if in excluded folder or with excluded tag or property. |
| <a href="#ribbon"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/file-cog-dark.svg"><img src=".github/icons/file-cog.svg" width="15" height="15"></picture></a>&nbsp;Toggle automatic renaming      | Toggle the _Rename notes_ setting between _Automatically_ and _Manually_.                |

### Command palette

| Command                                                                                                                                                                                                                                                    | Description                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a href="#command-palette"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/file-type-dark.svg"><img src=".github/icons/file-type.svg" width="15" height="15"></picture></a>&nbsp;Put first line in title                       | Rename active note, even if in excluded folder or with excluded tag or property.                                                                    |
| <a href="#command-palette"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/file-type-dark.svg"><img src=".github/icons/file-type.svg" width="15" height="15"></picture></a>&nbsp;Put first line in title (unless excluded)     | Rename active note except if in excluded folder or with excluded tag or property.                                                                   |
| <a href="#command-palette"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/file-stack-dark.svg"><img src=".github/icons/file-stack.svg" width="15" height="15"></picture></a>&nbsp;Put first line in title in all notes        | Rename all notes in vault except if in excluded folder or with excluded tag or property.                                                            |
| <a href="#command-palette"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/file-cog-dark.svg"><img src=".github/icons/file-cog.svg" width="15" height="15"></picture></a>&nbsp;Toggle automatic renaming                       | Toggle the _Rename notes_ setting between _Automatically_ and _Manually_.                                                                           |
| <a href="#command-palette"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/square-x-dark.svg"><img src=".github/icons/square-x.svg" width="15" height="15"></picture></a>&nbsp;Disable renaming for note                       | Exclude active note from renaming.                                                                                                                  |
| <a href="#command-palette"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/square-check-dark.svg"><img src=".github/icons/square-check.svg" width="15" height="15"></picture></a>&nbsp;Enable renaming for note                | Stop excluding active note from renaming.                                                                                                           |
| <a href="#command-palette"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/link-dark.svg"><img src=".github/icons/link.svg" width="15" height="15"></picture></a>&nbsp;Add safe internal link                                  | Create internal link with forbidden characters handled as set in _Replace characters_.                                                              |
| <a href="#command-palette"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/link-dark.svg"><img src=".github/icons/link.svg" width="15" height="15"></picture></a>&nbsp;Add safe internal link with caption                     | Create internal link with forbidden characters handled as set in _Replace characters_, and with original text in caption.                           |
| <a href="#command-palette"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/link-dark.svg"><img src=".github/icons/link.svg" width="15" height="15"></picture></a>&nbsp;Add internal link with caption and custom target        | Create internal link with selected text in caption. Set link path manually.                                                                         |
| <a href="#command-palette"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/clipboard-type-dark.svg"><img src=".github/icons/clipboard-type.svg" width="15" height="15"></picture></a>&nbsp;Insert file name at cursor position | Insert current file name at cursor position. Convert forbidden character replacements back to their original forms, as set in _Replace characters_. |

### File, folder, tag and vault search context menu

| Command                                                                                                                                                                                                                                                            | Description                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| <a href="#file-folder-tag-and-vault-search-context-menu"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/file-type-dark.svg"><img src=".github/icons/file-type.svg" width="15" height="15"></picture></a>&nbsp;Put first line in title | Rename selected note(s).                                         |
| <a href="#file-folder-tag-and-vault-search-context-menu"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/square-x-dark.svg"><img src=".github/icons/square-x.svg" width="15" height="15"></picture></a>&nbsp;Disable renaming          | Exclude selected note(s), folder(s) or tag from renaming.        |
| <a href="#file-folder-tag-and-vault-search-context-menu"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/square-check-dark.svg"><img src=".github/icons/square-check.svg" width="15" height="15"></picture></a>&nbsp;Enable renaming   | Stop excluding selected note(s), folder(s) or tag from renaming. |

## Installation

Until **First Line is Title** appears in the plugin directory, to install it:

1. Download and enable the [BRAT](https://churnish.github.io/http-protocol-redirector?r=obsidian://show-plugin?id=obsidian42-brat) plugin.
2. [Install via BRAT](https://churnish.github.io/http-protocol-redirector?r=obsidian://brat?plugin=churnish/first-line-is-title).
3. Select **Add plugin**.

<details><summary>Install manually</summary>
<br>
  
**Note:** To get updates for **First Line is Title**, you will have to check for and install them manually.

1. Download `first-line-is-title.zip` from the `Assets` of the [latest release](https://github.com/churnish/first-line-is-title/releases).
2. Open the vault folder in the system file manager.
3. Open your Obsidian configuration folder (`.obsidian` by default, hidden on most OSes).
4. Unzip `first-line-is-title.zip` and place it in the `plugins` folder.
5. Reload plugins or app.
6. Enable **First Line is Title** in Obsidian settings → Community plugins → Installed plugins.

</details>

## Support

- Found a bug or have a feature request? [Open an issue](https://github.com/churnish/first-line-is-title/issues).
- Have a question? [Start a discussion](https://github.com/churnish/first-line-is-title/discussions).
- Contributors welcome.
