/*
 * Adapted from Notebook Navigator (https://github.com/johansan/notebook-navigator)
 * Copyright (c) 2025-2026 Johan Sanneblad
 * Modified 2026 for First Line is Title.
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later version.
 */

import {
  App,
  ButtonComponent,
  ConfirmationModal,
  Modal,
  Notice,
  PluginSettingTab,
  Setting,
} from 'obsidian';
import { t } from '../i18n';
import { evaluateSettingsImport } from '../settings/import-guard';
import { FirstLineIsTitlePlugin } from '../settings/settings-base';
import {
  applySettingsTransfer,
  createSettingsTransferFilename,
  createSettingsTransferJson,
  SettingsTransfer,
} from '../settings/transfer';

const JSON_MIME_TYPE = 'application/json';

/** Message for a notice, without leaking `[object Object]` from a non-Error throw. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function showWarningNotice(message: string): void {
  const notice = new Notice(message);
  notice.containerEl.addClass('mod-warning');
}

function showSuccessNotice(message: string): void {
  const notice = new Notice(message);
  notice.containerEl.addClass('mod-success');
}

/**
 * The JSON editor both modals are built around. Monospace and resizable via the
 * stylesheet; spellcheck off because every "word" in it is a settings key.
 */
function createTransferEditor(
  parent: HTMLElement,
  options: { value?: string; placeholder?: string }
): HTMLTextAreaElement {
  const editorEl = parent.createEl('textarea', {
    cls: 'flit-settings-transfer-editor',
  });
  editorEl.spellcheck = false;
  if (options.value !== undefined) editorEl.value = options.value;
  if (options.placeholder !== undefined) {
    editorEl.placeholder = options.placeholder;
  }
  return editorEl;
}

function createButtonRow(parent: HTMLElement): HTMLElement {
  return parent.createDiv({
    cls: 'modal-button-container flit-modal-button-container',
  });
}

/**
 * Shows the current settings as transfer JSON, to copy to the clipboard or save as a file.
 *
 * The JSON stays editable: Copy and Download both read the textarea, so a user can trim
 * the payload before taking it anywhere.
 */
export class SettingsExportModal extends Modal {
  private readonly plugin: FirstLineIsTitlePlugin;

  constructor(app: App, plugin: FirstLineIsTitlePlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass('flit-settings-transfer');
    this.setTitle(t('modals.settingsTransfer.export.title'));

    new Setting(contentEl)
      .setName(t('modals.settingsTransfer.export.editor.name'))
      .setDesc(t('modals.settingsTransfer.export.editor.desc'));

    const editorEl = createTransferEditor(contentEl, {
      value: createSettingsTransferJson(this.plugin.settings),
    });

    const buttonRow = createButtonRow(contentEl);

    const copyButton = buttonRow.createEl('button', {
      text: t('modals.settingsTransfer.export.copy'),
    });
    copyButton.onclick = () => {
      void this.copyToClipboard(editorEl.value);
    };

    const downloadButton = buttonRow.createEl('button', {
      text: t('modals.settingsTransfer.export.download'),
    });
    downloadButton.addClass('mod-cta');
    downloadButton.onclick = () => {
      void this.downloadTransfer(editorEl.value);
    };

    // Deferred because Modal moves focus to the first focusable child after onOpen();
    // selecting the payload makes a manual copy a single keystroke.
    window.setTimeout(() => editorEl.select(), 0);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async copyToClipboard(contents: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(contents);
      showSuccessNotice(t('modals.settingsTransfer.export.copied'));
    } catch (error) {
      showWarningNotice(
        t('modals.settingsTransfer.export.errors.copyFailed', {
          message: describeError(error),
        })
      );
    }
  }

  /**
   * Shares the payload as a file where the platform supports it, falling back to an
   * object-URL download.
   *
   * The share path is kept for mobile: blob-anchor downloads are unreliable in Capacitor
   * webviews. The anchor is created on `activeDocument`, never the bare `document` — with
   * settings open in a popout window the two are different documents, and an anchor in the
   * wrong one is what broke the old file picker.
   */
  private async downloadTransfer(contents: string): Promise<void> {
    const fileName = createSettingsTransferFilename(new Date());

    if (navigator.share && navigator.canShare) {
      try {
        const file = new File([contents], fileName, { type: JSON_MIME_TYPE });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: t('modals.settingsTransfer.export.title'),
          });
          return;
        }
      } catch (error) {
        console.error('Settings export share failed:', error);
      }
    }

    const url = URL.createObjectURL(
      new Blob([contents], { type: JSON_MIME_TYPE })
    );
    const anchorEl = activeDocument.body.createEl('a', {
      attr: { download: fileName, href: url },
    });
    anchorEl.click();
    anchorEl.remove();
    // Revoking synchronously can cancel the download the click just started.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * Fills a JSON editor from a file or a paste, then applies it over the defaults.
 *
 * The file input is created on the modal's own `contentEl` and attached, so the picker
 * belongs to whichever window the settings are open in.
 */
export class SettingsImportModal extends Modal {
  private readonly plugin: FirstLineIsTitlePlugin;
  private readonly tab: PluginSettingTab;

  private fileInputEl: HTMLInputElement;
  private editorEl: HTMLTextAreaElement;
  private chooseFileButton?: ButtonComponent;
  private importButtonEl?: HTMLButtonElement;

  constructor(app: App, plugin: FirstLineIsTitlePlugin, tab: PluginSettingTab) {
    super(app);
    this.plugin = plugin;
    this.tab = tab;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass('flit-settings-transfer');
    this.setTitle(t('modals.settingsTransfer.import.title'));

    // Element-scoped and attached: the global `createEl` binds to the main window's
    // document, so a detached input built there raises no picker from a settings popout.
    this.fileInputEl = contentEl.createEl('input', {
      type: 'file',
      cls: 'flit-settings-transfer-file-input',
    });
    this.fileInputEl.accept = '.json,application/json,text/json';
    this.fileInputEl.addEventListener('change', () => {
      void this.loadSelectedFile();
    });

    new Setting(contentEl)
      .setName(t('modals.settingsTransfer.import.file.name'))
      .setDesc(t('modals.settingsTransfer.import.file.desc'))
      .addButton((button) => {
        this.chooseFileButton = button;
        button
          .setButtonText(t('modals.settingsTransfer.import.file.button'))
          .onClick(() => this.fileInputEl.click());
      });

    new Setting(contentEl)
      .setName(t('modals.settingsTransfer.import.editor.name'))
      .setDesc(t('modals.settingsTransfer.import.editor.desc'));

    this.editorEl = createTransferEditor(contentEl, {
      placeholder: t('modals.settingsTransfer.import.editor.placeholder'),
    });

    const buttonRow = createButtonRow(contentEl);

    this.importButtonEl = buttonRow.createEl('button', {
      text: t('modals.settingsTransfer.import.button'),
    });
    this.importButtonEl.addClass('mod-cta');
    this.importButtonEl.onclick = () => this.confirmImport();

    const cancelButtonEl = buttonRow.createEl('button', {
      text: t('modals.buttons.cancel'),
    });
    cancelButtonEl.onclick = () => this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  /** Disables both entry points while a read or a save is in flight. */
  private setBusy(isBusy: boolean): void {
    this.chooseFileButton?.setDisabled(isBusy);
    if (this.importButtonEl) this.importButtonEl.disabled = isBusy;
  }

  private async loadSelectedFile(): Promise<void> {
    const selectedFile = this.fileInputEl.files?.[0];
    if (!selectedFile) return;

    this.setBusy(true);
    try {
      this.editorEl.value = await selectedFile.text();
    } catch (error) {
      showWarningNotice(
        t('modals.settingsTransfer.import.errors.readFailed', {
          message: describeError(error),
        })
      );
    } finally {
      this.setBusy(false);
      // Clearing the value lets the same file be picked again — `change` fires only when
      // the selection differs from the last one.
      this.fileInputEl.value = '';
    }
  }

  private confirmImport(): void {
    const verdict = evaluateSettingsImport(this.editorEl.value);

    if (verdict.kind === 'unreadable') {
      showWarningNotice(t('notifications.invalidImportFile'));
      return;
    }

    if (verdict.kind === 'incompatible-schema') {
      showWarningNotice(t('settings.errors.importIncompatible'));
      return;
    }

    const transfer = verdict.settings;
    const body = createFragment((frag) => {
      frag.createEl('p', {
        text: t('modals.settingsTransfer.import.confirm.message'),
        cls: 'mod-warning',
      });
    });

    new ConfirmationModal(this.app)
      .setTitle(t('modals.settingsTransfer.import.confirm.title'))
      .setContent(body)
      .addButton((btn) =>
        btn
          .setButtonText(t('modals.settingsTransfer.import.confirm.button'))
          .setCta()
          .onClick(() => {
            void this.applyTransfer(transfer);
          })
      )
      .addCancelButton()
      .open();
  }

  private async applyTransfer(transfer: SettingsTransfer): Promise<void> {
    this.setBusy(true);
    try {
      // Unconditional: an import replaces every setting, so the outgoing state is written
      // out first whether or not the user thought to export it.
      await this.plugin.writeSettingsBackup(
        createSettingsTransferJson(this.plugin.settings)
      );

      // Snapshot rather than a reference: rollback must survive any in-place mutation of
      // the live settings object between here and the save completing.
      const previousSettings = structuredClone(this.plugin.settings);

      this.plugin.settings = applySettingsTransfer(transfer);
      try {
        await this.plugin.saveSettings();
      } catch {
        this.plugin.settings = previousSettings;
        showWarningNotice(t('settings.errors.saveFailed'));
        return;
      }

      showSuccessNotice(t('notifications.settingsImported'));
      this.tab.update();
      this.close();
    } finally {
      this.setBusy(false);
    }
  }
}
