/**
 * Test utilities and helper functions
 */

import { vi, type MockedFunction } from 'vitest';
import { TFile, TFolder, App } from './mockObsidian';
import { DeepPartial, PluginSettings } from '../src/types';
import { DEFAULT_SETTINGS } from '../src/constants';
// Imported from the leaf module, not the utils barrel: several suites `vi.mock` the
// barrel, which would strip deepMerge out from under every fixture built here.
import { deepMerge } from '../src/utils/deep-merge';

/**
 * Create a mock TFile for testing
 */
export function createMockFile(path: string = 'test.md'): TFile {
  return new TFile(path);
}

/**
 * Create a mock TFolder for testing
 */
export function createMockFolder(path: string = 'test-folder'): TFolder {
  return new TFolder(path);
}

/**
 * Create a mock App instance for testing
 */
export function createMockApp(): App {
  return new App();
}

/**
 * Create test settings with optional overrides
 */
export function createTestSettings(
  overrides: DeepPartial<PluginSettings> = {}
): PluginSettings {
  // deepMerge deep-clones its defaults, so no nested branch (exclusions, core, ...) ever
  // aliases DEFAULT_SETTINGS — one test mutating settings.exclusions.excludedFolders
  // cannot leak into another. Overrides merge per leaf, so a caller can name a single
  // key without restating its siblings.
  return deepMerge(DEFAULT_SETTINGS, overrides);
}

/**
 * Create a TFile with specific properties
 */
export function createFileWithProperties(
  path: string,
  basename: string,
  extension: string = 'md'
): TFile {
  const file = new TFile(path);
  file.basename = basename;
  file.extension = extension;
  file.name = `${basename}.${extension}`;
  return file;
}

/**
 * Create a TFolder with children
 */
export function createFolderWithChildren(
  path: string,
  children: (TFile | TFolder)[] = []
): TFolder {
  const folder = new TFolder(path);
  folder.children = children;
  children.forEach((child) => {
    child.parent = folder;
  });
  return folder;
}

/**
 * Mock file content for testing
 */
export const mockFileContent = {
  simple: 'Simple Title\n\nBody content',
  withMarkdown: '# Heading Title\n\nBody with **bold** and *italic*',
  withForbiddenChars: 'Title/with:forbidden*chars\n\nBody',
  withFrontmatter:
    '---\ntitle: Frontmatter Title\n---\n\nFirst Line Title\n\nBody',
  empty: '',
  onlyWhitespace: '   \n\n  \t  \n',
  multiline: 'First Line\nSecond Line\nThird Line',
  withHeading: '## Heading 2\n\nContent below',
  withCode: '`inline code` in title\n\nBody',
  withLinks: '[[Internal Link]] in title\n\nBody',
  withTags: '#tag in title\n\nBody',
};

/**
 * Wait for a promise to resolve (useful for async tests)
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** What a rendered menu item asked its MenuItem for. */
export interface CapturedMenuItem {
  title: string;
  icon: string;
  click: () => void | Promise<void>;
}

/**
 * Read back the items a menu rendered, in menu order.
 *
 * Obsidian's Menu keeps its MenuItem instances private and so does the mock, so
 * the only way to see what an item was configured with is to replay the recorded
 * callback against a stand-in. Safe because menu callbacks only describe an item
 * - they never act on the menu itself.
 *
 * @param addItem The `addItem` spy the menu recorded the callbacks on
 */
export function captureMenuItems(addItem: {
  mock: { calls: unknown[][] };
}): CapturedMenuItem[] {
  return addItem.mock.calls.map((call) => {
    const configure = call[0] as (item: unknown) => void;

    const captured: CapturedMenuItem = {
      title: '',
      icon: '',
      click: () => {},
    };

    const standInItem = {
      setTitle: (title: string) => {
        captured.title = title;
        return standInItem;
      },
      setIcon: (icon: string) => {
        captured.icon = icon;
        return standInItem;
      },
      onClick: (handler: () => void | Promise<void>) => {
        captured.click = handler;
        return standInItem;
      },
    };

    configure(standInItem);
    return captured;
  });
}

/**
 * Create a spy function that can be used to track calls
 */
export function createSpy<
  T extends (...args: any[]) => any,
>(): MockedFunction<T> {
  return vi.fn() as MockedFunction<T>;
}

/**
 * Assert that a value is defined (not null or undefined)
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message?: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message || 'Value is null or undefined');
  }
}
