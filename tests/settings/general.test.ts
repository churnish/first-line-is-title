/**
 * Tests for the general settings builders.
 *
 * These run against the REAL builders. `settings-main.test.ts` mocks this
 * module wholesale, so any assertion about definition shape made over there
 * only re-reads its own fixture — the shape has to be pinned here or nowhere.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../src/i18n', () => ({
  t: vi.fn((key: string) => key),
  getCurrentLocale: vi.fn(() => 'en'),
}));

import {
  buildFooterDefinitions,
  buildNewNotesGroup,
  buildSupportGroup,
} from '../../src/settings/general';

/** Drives a `render` callback without pulling in a real Setting. */
function captureButton(render: (setting: never) => void) {
  const button = {
    text: '',
    clickHandler: undefined as undefined | (() => void),
    setButtonText(value: string) {
      button.text = value;
      return button;
    },
    setDestructive() {
      return button;
    },
    onClick(handler: () => void) {
      button.clickHandler = handler;
      return button;
    },
  };
  const setting = {
    // Owned by the main document, so the button's `getOwnerWindow` call lands
    // on `window` and the spy below sees the opened URL.
    settingEl: document.createElement('div'),
    addButton(cb: (b: typeof button) => unknown) {
      cb(button);
      return setting;
    },
  };
  render(setting as never);
  return button;
}

describe('buildSupportGroup', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns a Support group holding both outbound rows', () => {
    const group = buildSupportGroup();
    expect(group.type).toBe('group');
    expect(group.heading).toBe('settings.sections.supportGroup');
    expect(group.items).toHaveLength(2);
  });

  // Order is load-bearing: self-serve help before the escalation path.
  it('names both rows, which is what keeps them in the settings search index', () => {
    const rows = buildSupportGroup().items as unknown as { name?: string }[];
    expect(rows.map((row) => row.name)).toEqual([
      'settings.general.help.name',
      'settings.general.sendFeedback.name',
    ]);
  });

  it('opens the discussions board when the help button is clicked', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const [row] = buildSupportGroup().items as unknown as [
      { render: (s: never) => void },
    ];

    const button = captureButton(row.render);
    expect(button.text).toBe('settings.general.help.button');

    button.clickHandler?.();
    expect(open).toHaveBeenCalledWith(
      'https://github.com/churnish/first-line-is-title/discussions',
      '_blank'
    );
  });

  it('opens the plugin issue tracker when the feedback button is clicked', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const [, row] = buildSupportGroup().items as unknown as [
      unknown,
      { render: (s: never) => void },
    ];

    const button = captureButton(row.render);
    expect(button.text).toBe('settings.general.sendFeedback.button');

    button.clickHandler?.();
    expect(open).toHaveBeenCalledWith(
      'https://github.com/churnish/first-line-is-title/issues',
      '_blank'
    );
  });
});

describe('buildNewNotesGroup', () => {
  it('groups the five creation-time settings under the New notes heading', () => {
    // `visible` predicates are lazy, so no settings are read at build time
    const group = buildNewNotesGroup({} as never);

    expect(group.type).toBe('group');
    expect(group.heading).toBe('settings.sections.newNotesGroup');
    expect(
      (group.items as unknown as { name?: string }[]).map((item) => item.name)
    ).toEqual([
      'settings.general.moveCursorToFirstLine.name',
      'settings.general.placeCursorAtLineEnd.name',
      'settings.general.insertTitle.name',
      'settings.general.convertReplacementChars.name',
      'settings.general.formatAsHeading.name',
    ]);
  });
});

describe('buildFooterDefinitions', () => {
  it('no longer carries the feedback row, which moved to its own group', () => {
    const plugin = { app: {} } as never;
    const names = buildFooterDefinitions(plugin).map(
      (def) => (def as { name?: string }).name
    );
    expect(names).toEqual(['settings.general.renameAllNotes.name']);
  });
});
