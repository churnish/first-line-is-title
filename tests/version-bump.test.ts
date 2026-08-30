import { describe, it, expect } from 'vitest';
import { classifyConflicts, readOutdated } from '../version-bump.mjs';

// Mirrors WEB_EDITED_DOCS in version-bump.mjs. Passed in rather than imported so the predicate stays pure.
const PREFIXES = ['README', 'CONTRIBUTING'];

describe('classifyConflicts', () => {
  it('flags a nested path as unexpected because prefix matching is not path-aware', () => {
    const { unexpected } = classifyConflicts(['docs/README.md'], [], PREFIXES);
    expect(unexpected).toEqual(['docs/README.md']);
  });

  it('tolerates a prefix-matching sibling name and checks it out', () => {
    const { resolveFromOrigin, unexpected } = classifyConflicts(
      ['README-dev.md'],
      ['README-dev.md'],
      PREFIXES
    );
    expect(unexpected).toEqual([]);
    expect(resolveFromOrigin).toEqual(['README-dev.md']);
  });

  it('puts a conflicted doc that origin no longer tracks in neither list', () => {
    const { resolveFromOrigin, unexpected } = classifyConflicts(
      ['README.md'],
      [],
      PREFIXES
    );
    expect(unexpected).toEqual([]);
    expect(resolveFromOrigin).toEqual([]);
  });

  it('takes every prefix-matching origin path regardless of conflict state', () => {
    const { resolveFromOrigin } = classifyConflicts(
      [],
      ['README.md', 'CONTRIBUTING.md', 'main.ts'],
      PREFIXES
    );
    expect(resolveFromOrigin).toEqual(['README.md', 'CONTRIBUTING.md']);
  });

  it('returns empty lists for empty input', () => {
    expect(classifyConflicts([], [], PREFIXES)).toEqual({
      resolveFromOrigin: [],
      unexpected: [],
    });
  });
});

describe('readOutdated', () => {
  const PACKAGE = 'eslint-plugin-obsidianmd';

  it('reports outdated for an object entry', () => {
    const result = readOutdated(
      JSON.stringify({ [PACKAGE]: { current: '1.0.0', latest: '2.0.0' } }),
      PACKAGE
    );
    expect(result.status).toBe('outdated');
    expect(result.info.latest).toBe('2.0.0');
  });

  it('takes the first entry when npm emits an array under one package key', () => {
    const result = readOutdated(
      JSON.stringify({
        [PACKAGE]: [
          { current: '1.0.0', latest: '2.0.0' },
          { current: '1.5.0', latest: '2.0.0' },
        ],
      }),
      PACKAGE
    );
    expect(result.status).toBe('outdated');
    expect(result.info.current).toBe('1.0.0');
  });

  it('reports current when the installed version is already the latest', () => {
    const result = readOutdated(
      JSON.stringify({ [PACKAGE]: { current: '2.0.0', latest: '2.0.0' } }),
      PACKAGE
    );
    expect(result.status).toBe('current');
  });

  it('reports current, not unknown, when valid JSON omits the package', () => {
    const result = readOutdated(
      JSON.stringify({
        'other-package': { current: '1.0.0', latest: '2.0.0' },
      }),
      PACKAGE
    );
    expect(result.status).toBe('current');
  });

  it('reports unknown for empty output', () => {
    expect(readOutdated('', PACKAGE).status).toBe('unknown');
  });

  it('reports unknown for non-JSON output', () => {
    expect(readOutdated('npm ERR! network timeout', PACKAGE).status).toBe(
      'unknown'
    );
  });
});
