import { describe, it, expect } from 'vitest';
import { createTestSettings } from './testUtils';
import { DEFAULT_SETTINGS } from '../src/constants';

describe('createTestSettings', () => {
  it('should isolate nested state from DEFAULT_SETTINGS and from other instances', () => {
    // Captured before any mutation so the assertions compare against the pristine
    // defaults rather than whatever the mutation may have leaked into them.
    const pristineExcludedFolders = [
      ...DEFAULT_SETTINGS.exclusions.excludedFolders,
    ];
    const pristineFileNameExclusionCount =
      DEFAULT_SETTINGS.exclusions.excludedFileNames.length;

    const first = createTestSettings();
    const second = createTestSettings();

    expect(first.exclusions).not.toBe(DEFAULT_SETTINGS.exclusions);
    expect(first.exclusions).not.toBe(second.exclusions);
    expect(first.core).not.toBe(DEFAULT_SETTINGS.core);
    expect(first.core).not.toBe(second.core);

    first.exclusions.excludedFolders = ['Notes'];
    first.exclusions.excludedFileNames.push({
      text: 'draft',
      onlyAtStart: false,
      onlyWholeLine: false,
      enabled: true,
      caseSensitive: false,
    });

    expect(DEFAULT_SETTINGS.exclusions.excludedFolders).toEqual(
      pristineExcludedFolders
    );
    expect(DEFAULT_SETTINGS.exclusions.excludedFileNames).toHaveLength(
      pristineFileNameExclusionCount
    );
    expect(second.exclusions.excludedFolders).toEqual(pristineExcludedFolders);
    expect(second.exclusions.excludedFileNames).toHaveLength(
      pristineFileNameExclusionCount
    );
  });

  it('should merge overrides per leaf, keeping untouched siblings at their defaults', () => {
    const settings = createTestSettings({
      core: {
        insertTitle: true,
      },
    });

    expect(settings.core.insertTitle).toBe(true);
    expect(settings.core.renameAutomatically).toBe(
      DEFAULT_SETTINGS.core.renameAutomatically
    );
    expect(settings.core.charCount).toBe(DEFAULT_SETTINGS.core.charCount);
    expect(settings.exclusions).not.toBe(DEFAULT_SETTINGS.exclusions);
  });

  it('should replace arrays wholesale rather than merging them item by item', () => {
    const settings = createTestSettings({
      exclusions: {
        excludedFolders: ['Notes', 'Archive'],
      },
    });

    expect(settings.exclusions.excludedFolders).toEqual(['Notes', 'Archive']);
    expect(settings.exclusions.matchSubfolders).toBe(
      DEFAULT_SETTINGS.exclusions.matchSubfolders
    );
  });
});
