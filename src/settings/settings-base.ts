import { App, SettingDefinitionRender, TFile } from 'obsidian';
import { PluginSettings } from '../types';
import { UNIVERSAL_FORBIDDEN_CHARS, WINDOWS_ANDROID_CHARS } from '../constants';
import { detectOS } from '../utils';
import { getCurrentLocale } from '../i18n';

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
 * Localizes the default file-name exclusion example to the current locale.
 * Only touches it while it's still the untouched default text, so a user's
 * own edit to that entry is never overwritten. Shared by initial settings
 * load and "Clear settings", the two places a fresh default can appear.
 */
export function applyLocalizedDefaults(settings: PluginSettings): void {
  if (
    settings.exclusions.fileNameExclusions.length > 0 &&
    ['To do', 'Задачи'].includes(settings.exclusions.fileNameExclusions[0].text)
  ) {
    const locale = getCurrentLocale();
    settings.exclusions.fileNameExclusions[0].text =
      locale === 'ru' ? 'Задачи' : 'To do';
  }
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
 * Appends a sequence of bare newline-separated lines (no bullet markup),
 * joined with `<br>` rather than a `<ul>`/`<li>` list.
 */
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
