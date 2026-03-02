import { AbstractInputSuggest, TFolder, App } from 'obsidian';

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
  private inputEl: HTMLInputElement;
  private onSelectCallback: (value: string) => void;
  private excludedPaths: Set<string>;

  constructor(
    app: App,
    inputEl: HTMLInputElement,
    onSelectCallback: (value: string) => void,
    currentExclusions: string[] = []
  ) {
    super(app, inputEl);
    this.inputEl = inputEl;
    this.onSelectCallback = onSelectCallback;
    this.excludedPaths = new Set(
      currentExclusions.map((path) => path.trim()).filter((path) => path !== '')
    );
  }

  getSuggestions(query: string): TFolder[] {
    const folders = this.app.vault
      .getAllLoadedFiles()
      .filter((file): file is TFolder => file instanceof TFolder)
      .filter((folder) => !this.excludedPaths.has(folder.path));

    if (!query) {
      return folders.slice(0, 10);
    }

    const lowerQuery = query.toLowerCase();
    return folders
      .filter((folder) => folder.path.toLowerCase().includes(lowerQuery))
      .slice(0, 10);
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path);
  }

  selectSuggestion(folder: TFolder, _evt: MouseEvent | KeyboardEvent): void {
    // Execute callback first to handle the setting change
    this.onSelectCallback(folder.path);

    // Update the input value
    this.inputEl.value = folder.path;

    // Use jQuery-style trigger which Obsidian expects
    this.inputEl.trigger('input');

    // Close the suggestion popup
    this.close();
  }
}

export class TagSuggest extends AbstractInputSuggest<string> {
  private inputEl: HTMLInputElement;
  private onSelectCallback: (value: string) => void;
  private excludedTags: Set<string>;

  constructor(
    app: App,
    inputEl: HTMLInputElement,
    onSelectCallback: (value: string) => void,
    currentExclusions: string[] = []
  ) {
    super(app, inputEl);
    this.inputEl = inputEl;
    this.onSelectCallback = onSelectCallback;
    this.excludedTags = new Set(
      currentExclusions.map((tag) => tag.trim()).filter((tag) => tag !== '')
    );
  }

  getSuggestions(query: string): string[] {
    // Get all tags from the vault
    const allTags = Object.keys(this.app.metadataCache.getTags()).filter(
      (tag) => !this.excludedTags.has(tag)
    );

    if (!query) {
      return allTags.slice(0, 10);
    }

    const lowerQuery = query.toLowerCase();
    return allTags
      .filter((tag) => tag.toLowerCase().includes(lowerQuery))
      .slice(0, 10);
  }

  renderSuggestion(tag: string, el: HTMLElement): void {
    el.setText(tag);
  }

  selectSuggestion(tag: string, _evt: MouseEvent | KeyboardEvent): void {
    // Execute callback first to handle the setting change
    this.onSelectCallback(tag);

    // Update the input value
    this.inputEl.value = tag;

    // Use jQuery-style trigger which Obsidian expects
    this.inputEl.trigger('input');

    // Close the suggestion popup
    this.close();
  }
}
