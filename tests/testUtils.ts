/**
 * Test utilities and helper functions
 */

import { vi } from 'vitest';
import { TFile, TFolder, App } from './mockObsidian';
import { PluginSettings } from '../src/types';
import { DEFAULT_SETTINGS } from '../src/constants';

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
  overrides: Partial<PluginSettings> = {}
): PluginSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...overrides,
  };
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

/**
 * Create a spy function that can be used to track calls
 */
export function createSpy<
  T extends (...args: any[]) => any,
>(): jest.MockedFunction<T> {
  return vi.fn() as jest.MockedFunction<T>;
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
