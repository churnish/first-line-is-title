import { App, Notice, TFile } from 'obsidian';
import { verboseLog } from '../utils';
import { PluginSettings } from '../types';
import { RenameEngine } from '../core/rename-engine';
import { t } from '../i18n';

export class TagOperations {
  constructor(
    private app: App,
    public settings: PluginSettings,
    private renameEngine: RenameEngine,
    private saveSettings: () => Promise<void>,
    private debugLog: (settingName: string, value: unknown) => void
  ) {}

  async putFirstLineInTitleForTag(
    tagName: string,
    omitBodyTags: boolean = false,
    omitNestedTags: boolean = false
  ): Promise<void> {
    const tagToFind = tagName.startsWith('#') ? tagName : `#${tagName}`;
    const files = this.app.vault.getMarkdownFiles();
    const matchingFiles: TFile[] = [];

    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      let hasTag = false;
      let tagFoundInBody = false;

      if (cache?.frontmatter?.tags) {
        const frontmatterTags = Array.isArray(cache.frontmatter.tags)
          ? cache.frontmatter.tags
          : [cache.frontmatter.tags];

        hasTag = frontmatterTags.some((tag: string) => {
          if (omitNestedTags) {
            // Exact match only
            return tag === tagName || tag === tagToFind;
          } else {
            // Include nested tags
            return (
              tag === tagName ||
              tag === tagToFind ||
              tag.startsWith(tagName + '/') ||
              tag.startsWith(tagToFind + '/')
            );
          }
        });
      }

      // Check metadata cache tags (includes both frontmatter and body tags)
      if (!hasTag && cache?.tags) {
        cache.tags.forEach(
          (tagCache: {
            tag: string;
            position: { start: { line: number }; end: { line: number } };
          }) => {
            const cacheTag = tagCache.tag;
            let tagMatches = false;

            if (omitNestedTags) {
              // Exact match only
              tagMatches = cacheTag === tagToFind || cacheTag === `#${tagName}`;
            } else {
              // Include nested tags
              tagMatches =
                cacheTag === tagToFind ||
                cacheTag === `#${tagName}` ||
                cacheTag.startsWith(tagToFind + '/') ||
                cacheTag.startsWith(`#${tagName}/`);
            }

            if (tagMatches) {
              hasTag = true;
              if (tagCache.position.start.line > 0) {
                // If the tag is found after line 0, it's likely in the body
                // We need to check if there's frontmatter to be more precise
                if (cache.frontmatterPosition) {
                  // If tag is after frontmatter, it's in body
                  if (
                    tagCache.position.start.line >
                    cache.frontmatterPosition.end.line
                  ) {
                    tagFoundInBody = true;
                  }
                } else {
                  // No frontmatter, so any tag after line 0 is in body
                  tagFoundInBody = true;
                }
              }
            }
          }
        );
      }

      if (hasTag && omitBodyTags && tagFoundInBody) {
        // Skip this file because it has the tag in the body and we want to omit such files
        continue;
      }

      if (hasTag) {
        matchingFiles.push(file);
      }
    }

    if (matchingFiles.length === 0) {
      verboseLog(this, `Showing notice: No files found with tag ${tagToFind}.`);
      new Notice(
        t('notifications.noNotesFoundWithTag').replace('{{tag}}', tagToFind)
      );
      return;
    }

    verboseLog(
      this,
      `Showing notice: Renaming ${matchingFiles.length} files with tag ${tagToFind}...`
    );
    new Notice(
      t('notifications.renamingNNotes').replace(
        '{{count}}',
        String(matchingFiles.length)
      )
    );

    let processedCount = 0;
    let errorCount = 0;

    const exclusionOverrides = {
      ignoreFolder: true,
      ignoreTag: true,
      ignoreProperty: true,
    };

    for (const file of matchingFiles) {
      try {
        await this.renameEngine.processFile(
          file,
          true,
          false,
          undefined,
          true,
          exclusionOverrides
        );
        processedCount++;
      } catch (error) {
        console.error(`Error processing file ${file.path}:`, error);
        errorCount++;
      }
    }

    if (errorCount > 0) {
      verboseLog(
        this,
        `Showing notice: Renamed ${processedCount}/${matchingFiles.length} notes with ${errorCount} errors. Check console for details.`
      );
      new Notice(
        t('notifications.renamedNotesWithErrors')
          .replace('{{renamed}}', String(processedCount))
          .replace('{{total}}', String(matchingFiles.length))
          .replace('{{errors}}', String(errorCount)),
        0
      );
    } else {
      verboseLog(
        this,
        `Showing notice: Successfully processed ${processedCount} files with tag ${tagToFind}.`
      );
      new Notice(
        t('notifications.renamedNotes')
          .replace('{{renamed}}', String(processedCount))
          .replace('{{total}}', String(matchingFiles.length)),
        0
      );
    }
  }

  async toggleTagExclusion(tagName: string): Promise<void> {
    const tagToFind = tagName.startsWith('#') ? tagName : `#${tagName}`;
    const isInList = this.settings.exclusions.excludedTags.includes(tagToFind);
    const isInverted =
      this.settings.exclusions.tagScopeStrategy === 'Exclude all except...';

    if (isInList) {
      this.settings.exclusions.excludedTags =
        this.settings.exclusions.excludedTags.filter(
          (tag) => tag !== tagToFind
        );
      // Ensure there's always at least one entry (even if empty)
      if (this.settings.exclusions.excludedTags.length === 0) {
        this.settings.exclusions.excludedTags.push('');
      }

      if (isInverted) {
        // In inverted mode, removing from list = disabling renaming
        verboseLog(this, `Showing notice: Renaming disabled for ${tagToFind}`);
        new Notice(
          t('notifications.disabledRenamingFor', { filename: tagToFind })
        );
      } else {
        // In normal mode, removing from list = enabling renaming
        verboseLog(this, `Showing notice: Renaming enabled for ${tagToFind}`);
        new Notice(
          t('notifications.enabledRenamingFor', { filename: tagToFind })
        );
      }
    } else {
      if (
        this.settings.exclusions.excludedTags.length === 1 &&
        this.settings.exclusions.excludedTags[0] === ''
      ) {
        this.settings.exclusions.excludedTags[0] = tagToFind;
      } else {
        this.settings.exclusions.excludedTags.push(tagToFind);
      }

      if (isInverted) {
        // In inverted mode, adding to list = enabling renaming
        verboseLog(this, `Showing notice: Renaming enabled for ${tagToFind}`);
        new Notice(
          t('notifications.enabledRenamingFor', { filename: tagToFind })
        );
      } else {
        // In normal mode, adding to list = disabling renaming
        verboseLog(this, `Showing notice: Renaming disabled for ${tagToFind}`);
        new Notice(
          t('notifications.disabledRenamingFor', { filename: tagToFind })
        );
      }
    }

    this.debugLog('excludedTags', this.settings.exclusions.excludedTags);
    await this.saveSettings();
    verboseLog(this, `Tag exclusion toggled for: ${tagToFind}`, {
      isNowInList: !isInList,
    });
  }
}
