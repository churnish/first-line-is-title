import { App, Setting, SettingDefinitionRender, TFile } from 'obsidian';
import { PluginSettings } from '../types';
import { UNIVERSAL_FORBIDDEN_CHARS, WINDOWS_ANDROID_CHARS } from '../constants';
import { detectOS } from '../utils';
import { getCurrentLocale, t } from '../i18n';

export interface FirstLineIsTitlePlugin {
  app: App;
  settings: PluginSettings;
  saveSettings(): Promise<void>;
  debugLog(settingName: string, value: unknown): void;
  editorLifecycle?: { initializeCheckingSystem(): void };
  renameEngine?: {
    processFile(
      file: TFile,
      noDelay: boolean,
      showNotices: boolean,
      providedContent?: string,
      isBatchOperation?: boolean,
      exclusionOverrides?: Record<string, boolean>
    ): Promise<{ success: boolean; reason?: string }>;
  };
  propertyManager?: { ensurePropertyTypeIsCheckbox(): Promise<void> };
  updatePropertyVisibility?: () => void;
  getCurrentTimestamp?: () => string;
  outputAllSettings?: () => void;
  getTodayDateString?: () => string;
  cacheManager?: {
    clearReservedPaths(): void;
  };
}

/**
 * Updates accessibility for disabled rows (removes them from tab order)
 * @param container - The container element to search for disabled rows
 */
export function updateDisabledRowsAccessibility(container: HTMLElement): void {
  const disabledRows = container.querySelectorAll('.flit-row-disabled');
  disabledRows.forEach((row: HTMLElement) => {
    const interactiveElements = row.querySelectorAll(
      'input, button, a, select, .dropdown, textarea'
    );
    interactiveElements.forEach((el: HTMLElement) => {
      // Skip enable column toggles and action buttons (they should remain interactive)
      if (
        el.closest('.flit-enable-column') ||
        el.closest('.flit-actions-column')
      ) {
        return;
      }
      el.tabIndex = -1;
      el.setAttribute('aria-disabled', 'true');
    });
  });
}

export function addForbiddenCharProtection(
  inputElement: HTMLInputElement,
  forceWindowsAndroidProtection: boolean = false
): void {
  inputElement.addEventListener('input', (e) => {
    const inputEl = e.target as HTMLInputElement;
    let value = inputEl.value;

    const universalForbidden = UNIVERSAL_FORBIDDEN_CHARS;
    const windowsAndroidForbidden = WINDOWS_ANDROID_CHARS;

    let forbiddenChars = [...universalForbidden];

    // Add Windows/Android chars if forced (for Windows/Android section) or if current OS requires it
    if (forceWindowsAndroidProtection) {
      forbiddenChars.push(...windowsAndroidForbidden);
    } else {
      const currentOS = detectOS();
      if (currentOS === 'Windows') {
        forbiddenChars.push(...windowsAndroidForbidden);
      }
    }

    let filteredValue = '';
    for (let i = 0; i < value.length; i++) {
      const char = value[i];

      // Special case for dot: forbidden only at start
      if (char === '.' && i === 0) {
        continue;
      }
      if (forbiddenChars.includes(char)) {
        continue;
      }

      filteredValue += char;
    }
    if (filteredValue !== value) {
      inputEl.value = filteredValue;
      const cursorPos = Math.min(
        inputEl.selectionStart || 0,
        filteredValue.length
      );
      inputEl.setSelectionRange(cursorPos, cursorPos);
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}

/**
 * Mounts a container for legacy imperative markup inside a declarative setting
 * row, carrying the `.flit-settings-page` class the pre-migration stylesheet is
 * scoped to.
 *
 * Must be used instead of appending to `settingEl` directly. Obsidian reuses the
 * same row element across re-renders and only rebuilds the info/control
 * children, so anything appended straight to `settingEl` survives and would
 * accumulate one copy per render. Clearing `settingEl` wholesale is not an
 * option either — that drops the name element and silently removes the row from
 * settings search.
 */
export function mountLegacyHost(settingEl: HTMLElement): HTMLElement {
  settingEl
    .querySelectorAll(':scope > .flit-settings-page')
    .forEach((stale) => stale.remove());
  // Marks the row as a legacy host so the stylesheet can widen it without a
  // :has() selector, which Obsidian's CSS lint flags for invalidation cost.
  settingEl.addClass('flit-settings-page-host');
  return settingEl.createDiv({ cls: 'flit-settings-page' });
}

/**
 * Wraps a UI label quoted in running text, the way settings descriptions refer
 * to controls elsewhere in the interface.
 *
 * Quotation marks rather than bold: bold competes with the row's own name for
 * attention, and Russian typography quotes where English would embolden — so
 * the two locales differ only in which pair of marks they use.
 */
export function quoteLabel(text: string): string {
  return getCurrentLocale() === 'ru' ? `«${text}»` : `“${text}”`;
}

/**
 * Appends a UI label quoted per locale; see `quoteLabel`.
 */
export function appendEmphasis(
  parent: HTMLElement | DocumentFragment,
  localeKey: string
): void {
  parent.appendText(quoteLabel(t(localeKey)));
}

/**
 * Appends an already-resolved term quoted per locale; see `quoteLabel`. The
 * counterpart to `appendEmphasis` for text that is not itself a locale key.
 */
export function appendEmphasisedTerm(
  parent: HTMLElement | DocumentFragment,
  text: string
): void {
  parent.appendText(quoteLabel(text));
}

/**
 * Appends a sequence of bare newline-separated lines (no bullet markup),
 * joined with `<br>` rather than a `<ul>`/`<li>` list.
 */
export function appendLines(
  parent: HTMLElement | DocumentFragment,
  lines: Array<(target: HTMLElement | DocumentFragment) => void>
): void {
  lines.forEach((appendLine, index) => {
    appendLine(parent);
    if (index < lines.length - 1) parent.createEl('br');
  });
}

/**
 * Description-only row (no name, control, or action). The framework's item
 * filter keeps only definitions with a truthy `name`, `render`, `control`,
 * or `action` — `desc` alone doesn't count, so a bare `{ name: '', desc }`
 * item is silently dropped before rendering. The no-op `render` is never
 * called for its own sake; it exists only to satisfy the filter, since the
 * framework applies `desc` to the row before invoking `render`.
 */
export function buildDescRow(
  desc: string | DocumentFragment,
  options?: { visible?: () => boolean }
): SettingDefinitionRender {
  return {
    name: '',
    desc,
    searchable: false,
    visible: options?.visible,
    render: () => {},
  };
}

/**
 * A single button to mount via `buildButtonRow`. `onClick` receives the
 * row's `Setting` instance for call sites that need it (e.g. resolving the
 * owner window for a popout-safe `window.open`). `destructive` gives the red
 * tint (`setDestructive()`) without the filled-CTA treatment — for secondary
 * destructive actions. A destructive *primary* action
 * (`setDestructive().setCta()`) has no call site yet, so this helper does
 * not expose `setCta()`.
 */
export interface ButtonRowButton {
  text: string;
  onClick: (setting: Setting) => void;
  destructive?: boolean;
}

/**
 * Builds the `render` callback for the "name + desc + button" row shape
 * hand-rolled across the settings tabs — one or more buttons and nothing
 * else. Callers still declare `name`/`desc`/`visible` on the surrounding
 * definition themselves; this only replaces the repeated
 * `addButton().setButtonText().onClick()` chain.
 */
export function buildButtonRow(
  buttons: ButtonRowButton | ButtonRowButton[]
): (setting: Setting) => void {
  const buttonList = Array.isArray(buttons) ? buttons : [buttons];
  return (setting: Setting) => {
    buttonList.forEach(({ text, onClick, destructive }) => {
      setting.addButton((button) => {
        button.setButtonText(text);
        if (destructive) button.setDestructive();
        button.onClick(() => onClick(setting));
      });
    });
  };
}
