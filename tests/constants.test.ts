/**
 * Pins the shipped defaults.
 *
 * Every other test clones DEFAULT_SETTINGS as a fixture base, so a changed
 * default alters behaviour for every new install without moving a single
 * assertion. These are meant to fail loudly on a deliberate change — that is
 * the point of them.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/constants';

describe('shipped defaults', () => {
  it('renames automatically out of the box', () => {
    expect(DEFAULT_SETTINGS.core.renameAutomatically).toBe(true);
  });

  it('inserts the title into new notes and moves the cursor there', () => {
    // Both were off historically; turning them on changes what happens on
    // every note creation, including for users upgrading without a stored value.
    expect(DEFAULT_SETTINGS.core.insertTitleOnCreation).toBe(true);
    expect(DEFAULT_SETTINGS.core.moveCursorToFirstLine).toBe(true);
  });

  it('leaves the opt-in transforms off', () => {
    // These amplify title insertion; both staying off is what keeps the
    // default-on insertion behaviour conservative.
    expect(
      DEFAULT_SETTINGS.replaceCharacters.enableForbiddenCharReplacements
    ).toBe(false);
    expect(DEFAULT_SETTINGS.markupStripping.addHeadingToTitle).toBe(false);
    expect(DEFAULT_SETTINGS.customRules.enableCustomReplacements).toBe(false);
  });

  it('does not delay or throttle note processing by default', () => {
    expect(DEFAULT_SETTINGS.core.newNoteDelay).toBe(0);
    expect(DEFAULT_SETTINGS.core.checkInterval).toBe(0);
  });

  it('keeps rename-on-focus off, since it is gated behind automatic renaming', () => {
    expect(DEFAULT_SETTINGS.core.renameOnFocus).toBe(false);
  });
});
