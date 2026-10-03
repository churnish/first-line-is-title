# first-line-is-title

***

## Guidelines

Per official Obsidian plugin guidelines:

- **No `FileSystemAdapter` cast**: Gate ALL `FileSystemAdapter` usage behind `instanceof` check. Mobile uses `CapacitorAdapter`.
- **No `process.platform`**: Use Obsidian's `Platform` API instead.
- **Settings headings**: ONLY use section headings if there are multiple sections. General settings go at top without heading.
- **No `insertAdjacentHTML`**: Use DOM API or Obsidian helpers (`createEl()`, `createDiv()`, `createSpan()`) instead.
- **Use `el.empty()`**: To clean up HTML element contents.
- **Correct callback type**: `callback` for unconditional, `checkCallback` for conditional, `editorCallback`/`editorCheckCallback` when an active editor is required.
- **No `workspace.activeLeaf`**: Use `getActiveViewOfType()` instead.
- **Null-check `activeEditor`**: Use optional chaining (`activeEditor?.editor`).
- **Editor API for active file**: Prefer over `Vault.modify()` (preserves cursor, selection, folded state).
- **`Vault.process()` for background edits**: Atomic operation, avoids conflicts vs. `Vault.modify()`.
- **`FileManager.processFrontMatter()`**: NEVER parse/modify YAML manually.
- **Vault API over Adapter API**: Better performance (caching) and safety (serial operations).
- **`normalizePath()`**: ALWAYS use for human-defined paths (handles slashes, spaces, Unicode, cross-platform).
- **`updateOptions()`**: To change or reconfigure editor extensions after registration (updates ALL editors).
- **No overriding core styling**: Add own classes and scope styling to them.
- **Obsidian CSS variables**: Use for consistent styling. Create custom variables ONLY if no matching variable exists.
- **CSS variable fallbacks**: ALWAYS include a fallback value for external (Obsidian-provided) CSS variables: `var(--icon-s, 18px)` NOT `var(--icon-s)`. Use default theme values. Plugin-owned and `--size-*` variables are exempt.
- **`instanceof` before casting**: Test before casting to `TFile`, `TFolder`, `FileSystemAdapter`, etc.
- **Optimize load time**: Initial UI setup on `workspace.onLayoutReady()`, NOT in constructor or `onload()`.
- **Deferred views**: Tabs load as `DeferredView` until visible. NEVER assume `leaf.view` is the real view — use `instanceof`. `await revealLeaf(leaf)` or `await leaf.loadIfDeferred()` before access.
- **License**: Include LICENSE file. Comply with original licenses of used code. Attribute in README if required.
- **Trademark**: NEVER use "Obsidian" in a way that suggests the plugin is first-party.

## Settings schema

- **4.0.0 resets stored settings**: `loadSettings()` discards any `data.json` whose `dataSchemaVersion` does not equal `CURRENT_DATA_SCHEMA_VERSION` and starts from `DEFAULT_SETTINGS`. `hasSetupExclusions: false` re-runs exclusion auto-detection and `hasShownFirstTimeNotice: false` re-fires the first-run notice — NEVER special-case either consequence.
- **NEVER write migration code before 4.0.0 ships**: every pre-4.0.0 `data.json` is discarded wholesale, so a migration would have nothing to migrate. Rename or remove the persisted key directly.
- **Rename stale persisted keys while the window is open**: until 4.0.0 ships, renaming a persisted key costs nothing. After it ships, each rename costs either a migration or a `CURRENT_DATA_SCHEMA_VERSION` bump that resets every user's settings.
- **Renaming a key in a vault already stamped with the current version leaves an orphan**: the version still matches, so `deepMerge` runs and copies the stale key forward while the renamed key takes defaults. Clear such test vaults by hand.
- **A persisted-key rename is NOT a symbol rename**: it appears as the interface field, the `DEFAULT_SETTINGS` entry, plain read sites, a dot-path string in the settings control (`key: 'core.insertTitle'`) that no symbol search finds, the locale namespace in both `en.json` and `ru.json`, and test fixtures. Rename long or capitalised names BEFORE short section names, and run `npx tsc --noEmit` between passes — line-wrapped property access and object-literal fixture keys escape a dot-path regex.
