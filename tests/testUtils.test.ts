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
      DEFAULT_SETTINGS.exclusions.fileNameExclusions.length;

    const first = createTestSettings();
    const second = createTestSettings();

    expect(first.exclusions).not.toBe(DEFAULT_SETTINGS.exclusions);
    expect(first.exclusions).not.toBe(second.exclusions);
    expect(first.core).not.toBe(DEFAULT_SETTINGS.core);
    expect(first.core).not.toBe(second.core);

    first.exclusions.excludedFolders = ['Notes'];
    first.exclusions.fileNameExclusions.push({
      text: 'draft',
      onlyAtStart: false,
      onlyWholeLine: false,
      enabled: true,
      caseSensitive: false,
    });

    expect(DEFAULT_SETTINGS.exclusions.excludedFolders).toEqual(
      pristineExcludedFolders
    );
    expect(DEFAULT_SETTINGS.exclusions.fileNameExclusions).toHaveLength(
      pristineFileNameExclusionCount
    );
    expect(second.exclusions.excludedFolders).toEqual(pristineExcludedFolders);
    expect(second.exclusions.fileNameExclusions).toHaveLength(
      pristineFileNameExclusionCount
    );
  });

  it('should keep top-level overrides as a shallow merge that replaces the whole branch', () => {
    const settings = createTestSettings({
      core: {
        ...DEFAULT_SETTINGS.core,
        insertTitleOnCreation: true,
      },
    });

    expect(settings.core.insertTitleOnCreation).toBe(true);
    expect(settings.core.renameAutomatically).toBe(
      DEFAULT_SETTINGS.core.renameAutomatically
    );
    expect(settings.exclusions).not.toBe(DEFAULT_SETTINGS.exclusions);
  });
});
