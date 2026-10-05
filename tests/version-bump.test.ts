import { execFileSync } from 'child_process';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { classifyMergePaths, readOutdated } from '../version-bump.mjs';

// Representative prefixes matching WEB_EDITED_DOCS in version-bump.mjs. These tests exercise the matching mechanism, not the real list, so they do not need to track it.
const PREFIXES = ['README', 'CONTRIBUTING'];

describe('classifyMergePaths', () => {
  it('flags a nested path as unexpected because prefix matching is not path-aware', () => {
    const { unexpected } = classifyMergePaths(['docs/README.md'], [], PREFIXES);
    expect(unexpected).toEqual(['docs/README.md']);
  });

  it('tolerates a prefix-matching sibling name and syncs it', () => {
    const { syncFromOrigin, unexpected } = classifyMergePaths(
      ['README-dev.md'],
      ['README-dev.md'],
      PREFIXES
    );
    expect(unexpected).toEqual([]);
    expect(syncFromOrigin).toEqual(['README-dev.md']);
  });

  // The deleted-by-them shape. Nothing can check it out, and `git commit` exits 128 on unmerged paths, so it has to abort the release rather than fall through.
  it('reports a conflicted doc that origin no longer tracks as unresolvable', () => {
    const { syncFromOrigin, unexpected, unresolvable } = classifyMergePaths(
      ['README.md'],
      [],
      PREFIXES
    );
    expect(unresolvable).toEqual(['README.md']);
    expect(unexpected).toEqual([]);
    expect(syncFromOrigin).toEqual([]);
  });

  it('does not call a conflicted path unresolvable while origin still tracks it', () => {
    const { unresolvable } = classifyMergePaths(
      ['README.md'],
      ['README.md'],
      PREFIXES
    );
    expect(unresolvable).toEqual([]);
  });

  it('takes every prefix-matching origin path regardless of conflict state', () => {
    const { syncFromOrigin } = classifyMergePaths(
      [],
      ['README.md', 'CONTRIBUTING.md', 'main.ts'],
      PREFIXES
    );
    expect(syncFromOrigin).toEqual(['README.md', 'CONTRIBUTING.md']);
  });

  it('returns empty lists for empty input', () => {
    expect(classifyMergePaths([], [], PREFIXES)).toEqual({
      syncFromOrigin: [],
      unexpected: [],
      unresolvable: [],
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
    expect(result.info?.latest).toBe('2.0.0');
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
    expect(result.info?.current).toBe('1.0.0');
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

  // The shape npm actually emits on a registry failure: exit non-zero, but valid JSON on stdout. Without the error-key check this parses cleanly, finds no package key, and reads as "nothing outdated" — skipping the freshness check in silence.
  it('reports unknown for npm’s registry-error JSON', () => {
    const result = readOutdated(
      JSON.stringify({
        error: { code: 'ECONNREFUSED', summary: 'FetchError: request failed' },
      }),
      PACKAGE
    );
    expect(result.status).toBe('unknown');
  });

  it('reports unknown when stdout is absent, as on a spawn failure', () => {
    expect(readOutdated(undefined, PACKAGE).status).toBe('unknown');
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

describe('main-module dispatch guard', () => {
  // The import direction is covered implicitly: a guard broken to always dispatch would run the version phase inside this worker. This pins the other direction — a guard broken to never dispatch would let `npm version` commit and tag a release whose version script did nothing.
  it('runs the version phase when executed directly', () => {
    // Resolved from the vitest root rather than import.meta.url, which is not a file: URL inside vitest's module graph.
    const script = join(process.cwd(), 'version-bump.mjs');
    const env = { ...process.env };
    delete env.npm_package_version;

    // Exits before any write: the missing-version guard is the first thing the version phase checks.
    expect(() =>
      execFileSync(process.execPath, [script], { env, stdio: 'pipe' })
    ).toThrow(/npm_package_version is not set/);
  });
});
