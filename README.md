English • [Русский](https://github.com/greetclammy/first-line-is-title/blob/main/README_RU.md)

# First Line is Title

Automatically set the first line as note title, just like in Apple Notes! Forget about manual file name entry or nondescript timestamps.

![](https://github.com/user-attachments/assets/eed638e0-f695-4fdd-a0a6-2ace66585d58)

> [!TIP]
> The plugin is best used with the tab title bar and/or inline title enabled in Obsidian settings > Appearance > Interface.

## Key features

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
- Command to convert selection containing forbidden characters into valid internal link, with original text preserved in link caption.

## File integrity

- Only notes that are currently open in the editor are processed, along with any notes you explicitly select for batch operations (like renaming all notes in a folder).
- By default, note modification time is preserved on rename.
- Multiple safeguards are in place to prevent unintended changes but **regular [backups](https://help.obsidian.md/backup) remain your ultimate safety net**.

## Install

Until _First Line is Title_ is [made available](https://github.com/obsidianmd/obsidian-releases/pull/7429) in the plugin directory, follow the steps below to install it:

1. Download and enable the community plugin [BRAT](https://obsidian.md/plugins?id=obsidian42-brat).
2. Run _Add a beta plugin for testing_ in Command palette.
3. Paste https://github.com/greetclammy/first-line-is-title in the text field.
4. Select _Latest version_.
5. Check _Enable after installing the plugin_.
6. Press _Add Plugin_.

<details><summary>Install manually</summary>

Note: to get updates for _First Line is Title_, you will have to check for and install them manually.

1. Download `first-line-is-title.zip` in the `Assets` of the [latest release](https://github.com/greetclammy/first-line-is-title/releases).
2. Unzip the folder and place it in the `.obsidian/plugins` folder (hidden on most OSes) at the root of your vault.
3. Reload plugins or app.
4. Enable _First Line is Title_ in Obsidian settings > Community plugins > Installed plugins.

</details>

## Commands

### Ribbon

| Command | Description |
|---------|-------------|
| <a href="#ribbon"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/file-pen-dark.svg"><img src=".github/icons/file-pen.svg" width="15" height="15"></picture></a>&nbsp;Put first line in title | Rename active note, even if in excluded folder or with excluded tag or property. |
| <a href="#ribbon"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/files-dark.svg"><img src=".github/icons/files.svg" width="15" height="15"></picture></a>&nbsp;Put first line in title in all notes | Rename all notes in vault except if in excluded folder or with excluded tag or property. |
| <a href="#ribbon"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/file-cog-dark.svg"><img src=".github/icons/file-cog.svg" width="15" height="15"></picture></a>&nbsp;Toggle automatic renaming | Toggle the *Rename notes* setting between *Automatically* and *Manually*. |

### Command palette

| Command | Description |
|---------|-------------|
| <a href="#command-palette"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/file-pen-dark.svg"><img src=".github/icons/file-pen.svg" width="15" height="15"></picture></a>&nbsp;Put first line in title | Rename active note, even if in excluded folder or with excluded tag or property. |
| <a href="#command-palette"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/file-pen-dark.svg"><img src=".github/icons/file-pen.svg" width="15" height="15"></picture></a>&nbsp;Put first line in title (unless excluded) | Rename active note except if in excluded folder or with excluded tag or property. |
| <a href="#command-palette"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/file-stack-dark.svg"><img src=".github/icons/file-stack.svg" width="15" height="15"></picture></a>&nbsp;Put first line in title in all notes | Rename all notes in vault except if in excluded folder or with excluded tag or property. |
| <a href="#command-palette"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/file-cog-dark.svg"><img src=".github/icons/file-cog.svg" width="15" height="15"></picture></a>&nbsp;Toggle automatic renaming | Toggle the *Rename notes* setting between *Automatically* and *Manually*. |
| <a href="#command-palette"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/square-x-dark.svg"><img src=".github/icons/square-x.svg" width="15" height="15"></picture></a>&nbsp;Disable renaming for note | Exclude active note from renaming. |
| <a href="#command-palette"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/square-check-dark.svg"><img src=".github/icons/square-check.svg" width="15" height="15"></picture></a>&nbsp;Enable renaming for note | Stop excluding active note from renaming. |
| <a href="#command-palette"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/link-dark.svg"><img src=".github/icons/link.svg" width="15" height="15"></picture></a>&nbsp;Add safe internal link | Create internal link with forbidden characters handled as set in *Replace characters*. |
| <a href="#command-palette"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/link-dark.svg"><img src=".github/icons/link.svg" width="15" height="15"></picture></a>&nbsp;Add safe internal link with caption | Create internal link with forbidden characters handled as set in *Replace characters*, and with original text in caption. |
| <a href="#command-palette"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/link-dark.svg"><img src=".github/icons/link.svg" width="15" height="15"></picture></a>&nbsp;Add internal link with caption and custom target | Create internal link with selected text in caption. Set link path manually. |
| <a href="#command-palette"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/clipboard-type-dark.svg"><img src=".github/icons/clipboard-type.svg" width="15" height="15"></picture></a>&nbsp;Insert file name at cursor position | Insert current file name at cursor position. Convert forbidden character replacements back to their original forms, as set in *Replace characters*. |

### File, folder, tag and vault search context menu

| Command | Description |
|---------|-------------|
| <a href="#file-folder-tag-and-vault-search-context-menu"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/file-pen-dark.svg"><img src=".github/icons/file-pen.svg" width="15" height="15"></picture></a>&nbsp;Put first line in title | Rename selected note(s). |
| <a href="#file-folder-tag-and-vault-search-context-menu"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/square-x-dark.svg"><img src=".github/icons/square-x.svg" width="15" height="15"></picture></a>&nbsp;Disable renaming | Exclude selected note(s), folder(s) or tag from renaming. |
| <a href="#file-folder-tag-and-vault-search-context-menu"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/icons/square-check-dark.svg"><img src=".github/icons/square-check.svg" width="15" height="15"></picture></a>&nbsp;Enable renaming | Stop excluding selected note(s), folder(s) or tag from renaming. |

## Support

- Please [open an issue](https://github.com/greetclammy/first-line-is-title/issues) if you run into any problems. 
- Feature requests considered but not prioritized; further development focused on stability. PRs welcome.
