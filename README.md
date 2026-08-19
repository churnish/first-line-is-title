# First Line is Title

English • [Русский](https://github.com/churnish/first-line-is-title/blob/main/README_RU.md)

Automatically set the first line as note title, just like in Apple Notes. Forget about manual file name entry or nondescript timestamps.

![](https://github.com/user-attachments/assets/eed638e0-f695-4fdd-a0a6-2ace66585d58)

> **TIP:** The plugin is best used with the tab title bar enabled in **Obsidian settings → Interface**.

## Features

- Rename notes automatically or manually.
- Move cursor to first line on note creation.
- Make any first line a title or headings only.
- Replace characters forbidden in file names with safe alternatives, or omit them entirely.
- Strip Markdown syntax in file name.
- Configure custom text replacements.
- Automatically populate a first line alias property — make forbidden characters searchable in Quick switcher and link suggestions, or set as note title in other plugins.
- Commands to batch rename all notes in a folder, all notes with a tag, all search results, or the entire vault.
- Automatically insert file name in first line on note creation.
- Exclude select notes, folders, tags, properties or file names from renaming, or only enable renaming in some.
- Command to convert selection containing forbidden characters into a valid internal link, with the original text preserved in link alias.

## File integrity

Only notes open in the editor are processed, along with any notes you explicitly select for batch operations (like renaming all notes in a folder).

Multiple safeguards are in place to prevent unintended changes but **regular [backups](https://help.obsidian.md/backup) remain your ultimate safety net**.

## Commands

### Ribbon

| Command                   | Description                                                                      |
| ------------------------- | -------------------------------------------------------------------------------- |
| Put first line in title   | Rename active note, even if in excluded folder or with excluded tag or property. |
| Toggle automatic renaming | Toggle the **Rename automatically** setting.                                     |

### Command palette

| Command                                               | Description                                                                                                                                                    |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Put first line in title                               | Rename active note, even if in excluded folder or with excluded tag or property.                                                                               |
| Put first line in title (unless excluded)             | Rename active note except if in excluded folder or with excluded tag or property.                                                                              |
| Put first line in title in all notes                  | Rename all notes in vault except if in excluded folder or with excluded tag or property.                                                                       |
| Toggle automatic renaming                             | Toggle the **Rename automatically** setting.                                                                                                                   |
| Disable renaming for note                             | Exclude active note from renaming.                                                                                                                             |
| Enable renaming for note                              | Stop excluding active note from renaming.                                                                                                                      |
| Add safe internal link                                | Create internal link with forbidden characters handled as set in **Character replacements**.                                                                   |
| Add safe internal link with display text              | Create internal link with forbidden characters handled as set in **Character replacements**, and with original text as display text.                           |
| Add internal link with display text and custom target | Create internal link with selected text as display text. Set link path manually.                                                                               |
| Insert file name at cursor position                   | Insert current file name at cursor position. Convert replacements for forbidden characters back to their original forms, as set in **Character replacements**. |

### File, folder, tag and vault search context menu

| Command                 | Description                                                      |
| ----------------------- | ---------------------------------------------------------------- |
| Put first line in title | Rename selected note(s).                                         |
| Disable renaming        | Exclude selected note(s), folder(s) or tag from renaming.        |
| Enable renaming         | Stop excluding selected note(s), folder(s) or tag from renaming. |

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
