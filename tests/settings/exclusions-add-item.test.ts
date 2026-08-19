/**
 * Tests for the Exclusions page's native list `addItem` affordances.
 *
 * `settings-main.test.ts` mocks this module wholesale, so the blank-entry guard
 * and the focus-after-add follow-up are pinned here or nowhere. Both survived
 * the move off the hand-rolled add button and are the reason `addItem.action`
 * is more than a one-line push.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PluginSettingTab, SettingDefinitionList } from 'obsidian';

vi.mock('../../src/i18n', () => ({
  t: vi.fn((key: string) => key),
  getCurrentLocale: vi.fn(() => 'en'),
}));

import { buildExclusionsPage } from '../../src/settings/exclusions';
import type { FirstLineIsTitlePlugin } from '../../src/settings/settings-base';
import { DEFAULT_SETTINGS } from '../../src/constants';

/** Mirrors the framework's DOM: the affordance sits inside the list's group. */
function mountListGroup(): { group: HTMLElement; affordance: HTMLElement } {
  const group = document.createElement('div');
  group.className = 'setting-group mod-list';
  document.body.appendChild(group);

  const heading = document.createElement('div');
  heading.className = 'setting-item setting-item-heading';
  group.appendChild(heading);

  const affordance = document.createElement('div');
  affordance.className = 'clickable-icon extra-setting-button';
  heading.appendChild(affordance);

  return { group, affordance };
}

/** Appends one rendered entry row, returning the input the add button targets. */
function appendRow(group: HTMLElement, inputCls?: string): HTMLInputElement {
  const row = document.createElement('div');
  row.className = 'setting-item flit-exclusion-item-setting';
  group.appendChild(row);

  const input = document.createElement('input');
  input.type = 'text';
  if (inputCls) input.className = inputCls;
  row.appendChild(input);
  return input;
}

/** Lets the awaited `onAdd` settle and the deferred focus timer fire. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

interface Harness {
  exclusions: typeof DEFAULT_SETTINGS.exclusions;
  update: ReturnType<typeof vi.fn>;
  lists: SettingDefinitionList[];
}

function buildHarness(): Harness {
  const exclusions = structuredClone(DEFAULT_SETTINGS.exclusions);
  const plugin = {
    settings: { exclusions },
    saveSettings: vi.fn().mockResolvedValue(undefined),
    debugLog: vi.fn(),
  } as unknown as FirstLineIsTitlePlugin;

  const update = vi.fn();
  const tab = { update } as unknown as PluginSettingTab;

  const page = buildExclusionsPage(plugin, tab);
  const lists = (page.items ?? []).filter(
    (item): item is SettingDefinitionList =>
      (item as { type?: string }).type === 'list'
  );

  return { exclusions, update, lists };
}

describe('Exclusions list add affordances', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('gives every list a native addItem rather than a sibling add row', () => {
    const { lists } = buildHarness();

    expect(lists).toHaveLength(4);
    expect(lists.map((list) => list.addItem?.name)).toEqual([
      'settings.exclusions.folders.addButton',
      'settings.exclusions.tags.addButton',
      'settings.exclusions.properties.addButton',
      'settings.exclusions.fileNames.addButton',
    ]);
  });

  describe.each([
    { label: 'folders', index: 0, key: 'excludedFolders' as const },
    { label: 'tags', index: 1, key: 'excludedTags' as const },
  ])('$label', ({ index, key }) => {
    let harness: Harness;

    beforeEach(() => {
      harness = buildHarness();
    });

    it('appends an entry and focuses its input', async () => {
      const { group, affordance } = mountListGroup();
      harness.exclusions[key] = ['already here'];
      appendRow(group);
      // The new row only exists after the re-render, so the stand-in for
      // `tab.update()` is what mounts it.
      harness.update.mockImplementation(() => appendRow(group));

      harness.lists[index].addItem?.action(affordance);
      await flush();

      expect(harness.exclusions[key]).toEqual(['already here', '']);
      expect(harness.update).toHaveBeenCalled();
      expect(document.activeElement).toBe(group.querySelectorAll('input')[1]);
    });

    it('refuses to stack a second blank entry, focusing the existing one', () => {
      const { group, affordance } = mountListGroup();
      harness.exclusions[key] = ['already here', ''];
      appendRow(group);
      const blankInput = appendRow(group);

      harness.lists[index].addItem?.action(affordance);

      expect(harness.exclusions[key]).toEqual(['already here', '']);
      expect(harness.update).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(blankInput);
    });
  });

  describe('properties', () => {
    let harness: Harness;

    beforeEach(() => {
      harness = buildHarness();
    });

    it('appends a pair and focuses the new key input', async () => {
      const { group, affordance } = mountListGroup();
      harness.exclusions.excludedProperties = [{ key: 'a', value: 'b' }];
      appendRow(group, 'flit-property-key-input');
      harness.update.mockImplementation(() =>
        appendRow(group, 'flit-property-key-input')
      );

      harness.lists[2].addItem?.action(affordance);
      await flush();

      expect(harness.exclusions.excludedProperties).toEqual([
        { key: 'a', value: 'b' },
        { key: '', value: '' },
      ]);
      expect(document.activeElement).toBe(
        group.querySelectorAll('.flit-property-key-input')[1]
      );
    });

    it('treats a pair blank in both halves as the entry to focus', () => {
      const { group, affordance } = mountListGroup();
      harness.exclusions.excludedProperties = [{ key: '', value: '' }];
      const blankInput = appendRow(group, 'flit-property-key-input');

      harness.lists[2].addItem?.action(affordance);

      expect(harness.exclusions.excludedProperties).toHaveLength(1);
      expect(harness.update).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(blankInput);
    });

    it('still appends when only the value half is filled', async () => {
      const { affordance } = mountListGroup();
      harness.exclusions.excludedProperties = [{ key: '', value: 'set' }];

      harness.lists[2].addItem?.action(affordance);
      await flush();

      expect(harness.exclusions.excludedProperties).toHaveLength(2);
    });
  });

  describe('file names', () => {
    const entry = {
      text: 'draft',
      onlyAtStart: false,
      onlyWholeLine: false,
      enabled: true,
      caseSensitive: false,
    };
    let harness: Harness;

    beforeEach(() => {
      harness = buildHarness();
    });

    it('appends an entry', async () => {
      const { affordance } = mountListGroup();
      harness.exclusions.excludedFileNames = [{ ...entry }];

      harness.lists[3].addItem?.action(affordance);
      await flush();

      expect(harness.exclusions.excludedFileNames).toHaveLength(2);
      expect(harness.exclusions.excludedFileNames[1].text).toBe('');
      expect(harness.update).toHaveBeenCalled();
    });

    it('refuses to stack a second blank entry', () => {
      const { affordance } = mountListGroup();
      harness.exclusions.excludedFileNames = [{ ...entry, text: '' }];

      harness.lists[3].addItem?.action(affordance);

      expect(harness.exclusions.excludedFileNames).toHaveLength(1);
      expect(harness.update).not.toHaveBeenCalled();
    });
  });

  it('skips the focus follow-up when the affordance has no list group', async () => {
    const harness = buildHarness();
    // Detached from any `.setting-group`: the add must still land the entry.
    const orphan = document.createElement('div');
    document.body.appendChild(orphan);

    harness.lists[0].addItem?.action(orphan);
    await flush();

    expect(harness.exclusions.excludedFolders).toEqual(['']);
  });
});
