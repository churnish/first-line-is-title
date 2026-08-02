import {
  Notice,
  PluginSettingTab,
  Setting,
  SettingDefinitionPage,
  setIcon,
} from 'obsidian';
import {
  updateInteractiveState,
  addForbiddenCharProtection,
  FirstLineIsTitlePlugin,
  mountLegacyHost,
} from './settings-base';
import { DEFAULT_SETTINGS } from '../constants';
import { t, getCurrentLocale } from '../i18n';
import {
  CharKey,
  PRIMARY_CHAR_KEYS,
  WINDOWS_ANDROID_CHAR_KEYS,
} from '../types/char-replacement';

/**
 * Sub-key under `settings.replaceCharacters.characters` holding each
 * character's display label. Two keys differ from the setting key itself.
 */
const CHAR_LABEL_KEYS: Record<CharKey, string> = {
  leftBracket: 'leftBracket',
  rightBracket: 'rightBracket',
  hash: 'hash',
  caret: 'caret',
  pipe: 'pipe',
  backslash: 'backslash',
  slash: 'forwardSlash',
  colon: 'colon',
  dot: 'dot',
  asterisk: 'asterisk',
  quote: 'quote',
  lessThan: 'lessThan',
  greaterThan: 'greaterThan',
  question: 'questionMark',
};

/** Characters that carry a clarifying note beneath their label. */
const CHAR_NOTE_KEYS: Partial<Record<CharKey, string>> = {
  dot: 'dotNote',
};

interface CharTableConfig {
  wrapper: HTMLElement;
  chars: CharKey[];
  /** Masks stored per-character values until the section has been enabled once. */
  isEnabled: () => boolean;
  isWindowsAndroid: boolean;
}

async function persistSettings(plugin: FirstLineIsTitlePlugin): Promise<void> {
  try {
    await plugin.saveSettings();
  } catch {
    new Notice(t('settings.errors.saveFailed'));
  }
}

function renderTableHeader(wrapper: HTMLElement): void {
  const headerRow = wrapper.createDiv({
    cls: 'flit-char-replacement-header',
  });

  const enableHeader = headerRow.createDiv({ cls: 'flit-enable-column' });
  enableHeader.textContent = t('settings.replaceCharacters.headers.enable');

  const charNameHeader = headerRow.createDiv({ cls: 'flit-char-name-column' });
  charNameHeader.textContent = t(
    'settings.replaceCharacters.headers.character'
  );

  const inputHeader = headerRow.createDiv({
    cls: 'flit-char-text-input-container',
  });
  inputHeader.textContent = t('settings.replaceCharacters.headers.replaceWith');

  const trimLeftHeader = headerRow.createDiv({
    cls: 'flit-toggle-column center',
  });
  const trimLeftLine1 = trimLeftHeader.createDiv();
  trimLeftLine1.textContent = t('settings.replaceCharacters.headers.trimLeft');

  const trimRightHeader = headerRow.createDiv({
    cls: 'flit-toggle-column center',
  });
  const trimRightLine1 = trimRightHeader.createDiv();
  trimRightLine1.textContent = t(
    'settings.replaceCharacters.headers.trimRight'
  );
}

function renderCharacterRows(
  plugin: FirstLineIsTitlePlugin,
  config: CharTableConfig
): void {
  config.chars.forEach((key) => {
    const charConfig = plugin.settings.replaceCharacters.charReplacements[key];
    const rowEl = config.wrapper.createDiv({
      cls: 'flit-char-replacement-setting',
    });

    const updateRowAppearance = () => {
      rowEl.classList.toggle('flit-row-disabled', !charConfig.enabled);
    };

    const toggleContainer = rowEl.createDiv({ cls: 'flit-enable-column' });
    const toggleSetting = new Setting(createDiv());
    toggleSetting.addToggle((toggle) => {
      toggle
        .setValue(config.isEnabled() ? charConfig.enabled : false)
        .onChange(async (value) => {
          charConfig.enabled = value;
          plugin.debugLog(`charReplacements.${String(key)}.enabled`, value);
          await persistSettings(plugin);
          updateRowAppearance();
        });
      toggle.toggleEl.classList.add('flit-margin-0');
      toggleContainer.appendChild(toggle.toggleEl);
    });

    const nameContainer = rowEl.createDiv({
      cls: 'flit-char-name-column',
    });
    nameContainer.createDiv({
      text: t(`settings.replaceCharacters.characters.${CHAR_LABEL_KEYS[key]}`),
      cls: 'setting-item-name',
    });
    const noteKey = CHAR_NOTE_KEYS[key];
    if (noteKey) {
      const descEl = nameContainer.createDiv({
        cls: 'setting-item-description',
      });
      descEl.textContent = t(
        `settings.replaceCharacters.characters.${noteKey}`
      );
    }

    const inputContainer = rowEl.createDiv({
      cls: 'flit-char-text-input-container',
    });

    const restoreButton = inputContainer.createDiv({
      cls: 'clickable-icon extra-setting-button',
      attr: {
        'aria-label': t('settings.replaceCharacters.restoreDefault'),
      },
    });
    setIcon(restoreButton, 'rotate-ccw');
    restoreButton.addEventListener('click', () => {
      void (async () => {
        const defaultReplacement =
          DEFAULT_SETTINGS.replaceCharacters.charReplacements[key].replacement;
        charConfig.replacement = defaultReplacement;
        textInput.value = defaultReplacement;
        await persistSettings(plugin);
      })();
    });

    const textInput = inputContainer.createEl('input', {
      type: 'text',
      cls: 'flit-char-text-input flit-width-120',
    });
    textInput.placeholder = t('settings.replaceCharacters.emptyPlaceholder');
    textInput.value = charConfig.replacement;
    textInput.addEventListener('input', (e) => {
      void (async () => {
        charConfig.replacement = (e.target as HTMLInputElement).value;
        plugin.debugLog(
          `charReplacements.${String(key)}.replacement`,
          charConfig.replacement
        );
        await persistSettings(plugin);
      })();
    });

    addForbiddenCharProtection(textInput, config.isWindowsAndroid);

    const trimLeftContainer = rowEl.createDiv({
      cls: 'flit-toggle-column center',
    });
    const trimLeftSetting = new Setting(createDiv());
    trimLeftSetting.addToggle((toggle) => {
      toggle
        .setValue(config.isEnabled() ? charConfig.trimLeft : false)
        .onChange(async (value) => {
          charConfig.trimLeft = value;
          plugin.debugLog(`charReplacements.${String(key)}.trimLeft`, value);
          await persistSettings(plugin);
        });
      toggle.toggleEl.classList.add('flit-margin-0');
      trimLeftContainer.appendChild(toggle.toggleEl);
    });

    const trimRightContainer = rowEl.createDiv({
      cls: 'flit-toggle-column center',
    });
    const trimRightSetting = new Setting(createDiv());
    trimRightSetting.addToggle((toggle) => {
      toggle
        .setValue(config.isEnabled() ? charConfig.trimRight : false)
        .onChange(async (value) => {
          charConfig.trimRight = value;
          plugin.debugLog(`charReplacements.${String(key)}.trimRight`, value);
          await persistSettings(plugin);
        });
      toggle.toggleEl.classList.add('flit-margin-0');
      trimRightContainer.appendChild(toggle.toggleEl);
    });

    updateRowAppearance();
  });
}

/** Builds the "All OSes" trim-left/trim-right explanatory note. */
function appendAllOsesNote(parent: HTMLElement | DocumentFragment): void {
  const locale = getCurrentLocale();
  const appendEmphasis = (localeKey: string) => {
    if (locale === 'ru') {
      parent.appendText('«' + t(localeKey) + '»');
    } else {
      parent.createEl('strong', { text: t(localeKey) });
    }
  };

  parent.appendText(t('settings.replaceCharacters.allOSes.note.part1'));
  appendEmphasis('settings.replaceCharacters.allOSes.note.trimLeft');
  parent.appendText(t('settings.replaceCharacters.allOSes.note.part2'));
  appendEmphasis('settings.replaceCharacters.allOSes.note.trimRight');
  parent.appendText(t('settings.replaceCharacters.allOSes.note.part3'));
}

/**
 * Character replacements sub-page.
 *
 * The two character tables stay imperative: they are fixed-size grids with
 * per-row restore buttons that the declarative control types cannot express.
 * Both mount into a `.flit-settings-page` host (variant C) so the existing
 * table CSS keeps applying without capturing Obsidian's own row chrome.
 */
export function buildCharacterReplacementsPage(
  plugin: FirstLineIsTitlePlugin,
  tab: PluginSettingTab
): SettingDefinitionPage {
  const mountTable = (
    setting: Setting,
    chars: CharKey[],
    isEnabled: () => boolean,
    isWindowsAndroid: boolean
  ) => {
    const host = mountLegacyHost(setting.settingEl);
    const tableContainer = host.createDiv({
      cls: isWindowsAndroid
        ? 'flit-table-container flit-windows-android-table'
        : 'flit-table-container',
    });
    const tableWrapper = tableContainer.createDiv({
      cls: 'flit-table-wrapper',
    });

    renderTableHeader(tableWrapper);
    renderCharacterRows(plugin, {
      wrapper: tableWrapper,
      chars,
      isEnabled,
      isWindowsAndroid,
    });

    const masterEnabled =
      plugin.settings.replaceCharacters.enableForbiddenCharReplacements;
    updateInteractiveState(host, masterEnabled);
    tableContainer.classList.toggle('flit-master-disabled', !masterEnabled);
  };

  return {
    type: 'page',
    name: t('settings.tabs.replaceCharacters'),
    desc: t('settings.replaceCharacters.desc'),
    items: [
      {
        name: t('settings.replaceCharacters.name'),
        desc: t('settings.replaceCharacters.desc'),
        control: {
          type: 'toggle',
          key: 'replaceCharacters.enableForbiddenCharReplacements',
        },
      },
      {
        name: t('settings.replaceCharacters.allOSes.title'),
        desc: createFragment((frag) => {
          frag.appendText(t('settings.replaceCharacters.allOSes.desc'));
          const note = frag.createDiv({ cls: 'flit-margin-top-15' });
          appendAllOsesNote(note);
        }),
        render: (setting) => {
          mountTable(
            setting,
            PRIMARY_CHAR_KEYS,
            () => plugin.settings.core.hasEnabledForbiddenChars,
            false
          );
        },
      },
      {
        name: t('settings.replaceCharacters.windowsAndroid.title'),
        desc: t('settings.replaceCharacters.windowsAndroid.desc'),
        control: {
          type: 'toggle',
          key: 'replaceCharacters.windowsAndroidEnabled',
          disabled: () =>
            !plugin.settings.replaceCharacters.enableForbiddenCharReplacements,
        },
      },
      {
        // The toggle row directly above already carries the section label.
        name: '',
        searchable: false,
        visible: () => plugin.settings.replaceCharacters.windowsAndroidEnabled,
        render: (setting) => {
          mountTable(
            setting,
            WINDOWS_ANDROID_CHAR_KEYS,
            () =>
              plugin.settings.core.hasEnabledForbiddenChars &&
              plugin.settings.core.hasEnabledWindowsAndroid,
            true
          );
        },
      },
    ],
  };
}
