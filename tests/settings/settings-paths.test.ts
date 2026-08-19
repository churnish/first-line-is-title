import { describe, it, expect } from 'vitest';
import { getPath, setPath } from '../../src/settings/settings-paths';

describe('settings-paths', () => {
  describe('getPath', () => {
    it('reads a top-level key', () => {
      expect(getPath({ a: 1 }, 'a')).toBe(1);
    });

    it('reads a nested dot-path', () => {
      expect(
        getPath({ core: { renameOnSave: true } }, 'core.renameOnSave')
      ).toBe(true);
    });

    it('reads a deeply nested dot-path', () => {
      const obj = { a: { b: { c: { d: 'deep' } } } };
      expect(getPath(obj, 'a.b.c.d')).toBe('deep');
    });

    it('returns undefined for a missing leaf', () => {
      expect(getPath({ core: {} }, 'core.missing')).toBeUndefined();
    });

    it('returns undefined when an intermediate segment is missing', () => {
      expect(getPath({}, 'core.renameOnSave')).toBeUndefined();
    });

    it('returns undefined rather than throwing when a segment is a primitive', () => {
      expect(getPath({ core: 5 }, 'core.renameOnSave')).toBeUndefined();
    });

    it('returns undefined when a segment is null', () => {
      expect(getPath({ core: null }, 'core.renameOnSave')).toBeUndefined();
    });

    it('preserves falsy leaf values', () => {
      expect(getPath({ core: { flag: false } }, 'core.flag')).toBe(false);
      expect(getPath({ core: { count: 0 } }, 'core.count')).toBe(0);
      expect(getPath({ core: { text: '' } }, 'core.text')).toBe('');
    });
  });

  describe('setPath', () => {
    it('writes a top-level key', () => {
      const obj: Record<string, unknown> = {};
      setPath(obj, 'a', 1);
      expect(obj.a).toBe(1);
    });

    it('writes a nested dot-path', () => {
      const obj: Record<string, unknown> = { core: { renameOnSave: false } };
      setPath(obj, 'core.renameOnSave', true);
      expect((obj.core as Record<string, unknown>).renameOnSave).toBe(true);
    });

    it('creates missing intermediate objects', () => {
      const obj: Record<string, unknown> = {};
      setPath(obj, 'a.b.c', 'value');
      expect(getPath(obj, 'a.b.c')).toBe('value');
    });

    it('replaces a primitive intermediate rather than throwing', () => {
      const obj: Record<string, unknown> = { core: 5 };
      setPath(obj, 'core.flag', true);
      expect(getPath(obj, 'core.flag')).toBe(true);
    });

    it('replaces a null intermediate', () => {
      const obj: Record<string, unknown> = { core: null };
      setPath(obj, 'core.flag', true);
      expect(getPath(obj, 'core.flag')).toBe(true);
    });

    it('leaves sibling keys untouched', () => {
      const obj: Record<string, unknown> = {
        core: { a: 1, b: 2 },
        other: { c: 3 },
      };
      setPath(obj, 'core.a', 99);
      expect(obj).toEqual({ core: { a: 99, b: 2 }, other: { c: 3 } });
    });

    it('is a no-op for an empty path', () => {
      const obj: Record<string, unknown> = { a: 1 };
      setPath(obj, '', undefined);
      expect(obj.a).toBe(1);
    });

    it('round-trips with getPath', () => {
      const obj: Record<string, unknown> = {};
      setPath(obj, 'exclusions.excludedFileNames', ['x']);
      expect(getPath(obj, 'exclusions.excludedFileNames')).toEqual(['x']);
    });
  });
});
