/**
 * Tests for `buildButtonRow`, the shared helper for the "name + desc +
 * button" row shape used across the settings sections. The page-level builders
 * that consume it (`other.ts`, `general.ts`) are exercised through
 * their own test files; this file pins the helper's own contract —
 * single/multiple buttons, the destructive flag, and that `onClick`
 * receives the row's `Setting` instance.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildButtonRow } from '../../src/settings/settings-base';

/**
 * Fake `Setting` that records every `addButton()` call, in the order made,
 * without pulling in a real Obsidian `Setting`.
 */
function fakeSetting() {
  interface CapturedButton {
    text: string;
    destructive: boolean;
    clickHandler?: () => void;
  }
  const buttons: CapturedButton[] = [];
  const setting = {
    addButton(cb: (b: unknown) => unknown) {
      const record: CapturedButton = { text: '', destructive: false };
      const button = {
        setButtonText(value: string) {
          record.text = value;
          return button;
        },
        setDestructive() {
          record.destructive = true;
          return button;
        },
        onClick(handler: () => void) {
          record.clickHandler = handler;
          return button;
        },
      };
      cb(button);
      buttons.push(record);
      return setting;
    },
  };
  return { setting, buttons };
}

describe('buildButtonRow', () => {
  it('mounts a single button with its text and click handler', () => {
    const onClick = vi.fn();
    const { setting, buttons } = fakeSetting();

    buildButtonRow({ text: 'Do it', onClick })(setting as never);

    expect(buttons).toHaveLength(1);
    expect(buttons[0].text).toBe('Do it');

    buttons[0].clickHandler?.();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("passes the row's Setting instance through to onClick", () => {
    const onClick = vi.fn();
    const { setting, buttons } = fakeSetting();

    buildButtonRow({ text: 'Do it', onClick })(setting as never);
    buttons[0].clickHandler?.();

    // Call sites like the Help/Send feedback rows resolve the owner window
    // from `setting.settingEl`, so the exact instance has to reach them.
    expect(onClick).toHaveBeenCalledWith(setting);
  });

  it('mounts multiple buttons on one row, in order', () => {
    const { setting, buttons } = fakeSetting();

    buildButtonRow([
      { text: 'Import', onClick: () => {} },
      { text: 'Export', onClick: () => {} },
    ])(setting as never);

    expect(buttons.map((b) => b.text)).toEqual(['Import', 'Export']);
  });

  it('applies setDestructive() only when requested', () => {
    const { setting, buttons } = fakeSetting();

    buildButtonRow({ text: 'Clear', onClick: () => {}, destructive: true })(
      setting as never
    );

    expect(buttons[0].destructive).toBe(true);
  });

  it('leaves setDestructive() uncalled by default', () => {
    const { setting, buttons } = fakeSetting();

    buildButtonRow({ text: 'Save', onClick: () => {} })(setting as never);

    expect(buttons[0].destructive).toBe(false);
  });
});
