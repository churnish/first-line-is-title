/**
 * Tests for plugin-directory links and the click router that keeps them
 * inside Obsidian.
 *
 * The router is delegated rather than bound per link, so two things are worth
 * pinning: what it binds to, and that teardown removes the exact listener it
 * added — otherwise every re-render of a link-bearing page leaves another
 * handler behind. The host matters because binding to a document silently
 * breaks the feature once Obsidian adopts the row into the settings window.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { Setting } from '../mockObsidian';
import {
  createPluginLink,
  buildPluginLinkRouterGroup,
} from '../../src/settings/plugin-links';

/** Records `createEl` calls without needing a real DOM parent. */
function captureCreateEl() {
  const calls: [string, Record<string, unknown>][] = [];
  const parent = {
    createEl: (tag: string, opts: Record<string, unknown>) => {
      calls.push([tag, opts]);
    },
  } as unknown as HTMLElement;
  return { calls, parent };
}

describe('createPluginLink', () => {
  it('points at the directory entry and tags the link with the plugin id', () => {
    const { calls, parent } = captureCreateEl();

    createPluginLink(parent, 'auto-card-link', 'Auto Card Link');

    expect(calls).toHaveLength(1);
    const [tag, opts] = calls[0];
    expect(tag).toBe('a');
    expect(opts.href).toBe(
      'https://community.obsidian.md/plugins/auto-card-link'
    );
    expect(opts.text).toBe('Auto Card Link');
    expect(opts.attr).toEqual({ 'data-flit-plugin-link': 'auto-card-link' });
  });
});

describe('buildPluginLinkRouterGroup', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is a hidden group, so the row that arms the router never paints', () => {
    const group = buildPluginLinkRouterGroup({} as never);

    expect(group.type).toBe('group');
    expect((group.visible as () => boolean)()).toBe(false);
    expect(group.items).toHaveLength(1);
  });

  it('keeps its single row out of the settings search index', () => {
    const [row] = buildPluginLinkRouterGroup({} as never).items as unknown as [
      { name: string; searchable: boolean },
    ];

    expect(row.name).toBe('');
    expect(row.searchable).toBe(false);
  });

  it('binds to the enclosing page container, not to the document', () => {
    const [row] = buildPluginLinkRouterGroup({} as never).items as unknown as [
      { render: (setting: never) => () => void },
    ];

    const page = document.createElement('div');
    page.className = 'setting-page-content';
    document.body.appendChild(page);
    const setting = new Setting(page);

    const addToPage = vi.spyOn(page, 'addEventListener');
    const removeFromPage = vi.spyOn(page, 'removeEventListener');
    const addToDoc = vi.spyOn(document, 'addEventListener');

    const cleanup = row.render(setting as never);
    expect(addToPage).toHaveBeenCalledWith('click', expect.any(Function));
    // Binding to the document is the bug this guards: Obsidian adopts the row
    // into the settings window afterwards, which strips document listeners.
    // Scoped to `click` because the mock Setting registers hover listeners.
    expect(addToDoc).not.toHaveBeenCalledWith('click', expect.any(Function));

    cleanup();
    expect(removeFromPage).toHaveBeenCalledWith(
      'click',
      addToPage.mock.calls[0][1]
    );
    page.remove();
  });

  it('falls back to the document when no container encloses the row', () => {
    const [row] = buildPluginLinkRouterGroup({} as never).items as unknown as [
      { render: (setting: never) => () => void },
    ];

    const setting = new Setting(document.createElement('div'));
    const doc = setting.settingEl.ownerDocument;
    const addListener = vi.spyOn(doc, 'addEventListener');
    const removeListener = vi.spyOn(doc, 'removeEventListener');

    const cleanup = row.render(setting as never);
    expect(addListener).toHaveBeenCalledWith('click', expect.any(Function));

    cleanup();
    expect(removeListener).toHaveBeenCalledWith(
      'click',
      addListener.mock.calls[0][1]
    );
  });
});
