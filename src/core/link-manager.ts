import { Notice } from 'obsidian';
import FirstLineIsTitle from '../../main';
import { generateSafeLinkTarget, reverseSafeLinkTarget } from '../utils';
import { InternalLinkModal } from '../modals';
import { t } from '../i18n';

export class LinkManager {
  private plugin: FirstLineIsTitle;

  constructor(plugin: FirstLineIsTitle) {
    this.plugin = plugin;
  }

  addSafeInternalLink(): void {
    // Try to get active editor from any view type (Markdown, canvas, etc.)
    const activeEditor = this.plugin.app.workspace.activeEditor?.editor;
    if (!activeEditor) {
      new Notice(t('notifications.errorNoActiveNote'));
      return;
    }

    const selections = activeEditor.listSelections();

    // Check if any selection has content (anchor != head means text is selected)
    const hasSelection = selections.some(
      (sel) =>
        sel.anchor.line !== sel.head.line || sel.anchor.ch !== sel.head.ch
    );

    if (hasSelection) {
      // Step 1: Capture all selection data (positions + text) before modifying document
      const selectionData = selections.map((sel) => {
        // Normalize selection range (anchor might be after head)
        const from =
          sel.anchor.line < sel.head.line ||
          (sel.anchor.line === sel.head.line && sel.anchor.ch <= sel.head.ch)
            ? sel.anchor
            : sel.head;
        const to = from === sel.anchor ? sel.head : sel.anchor;

        const text = activeEditor.getRange(from, to);
        return { from, to, text };
      });

      // Step 2: Sort by START position in reverse (bottom-to-top, right-to-left)
      selectionData.sort((a, b) => {
        if (a.from.line !== b.from.line) {
          return b.from.line - a.from.line; // Reverse line order
        }
        return b.from.ch - a.from.ch; // Reverse character order
      });

      // Step 3: Process each selection using captured text (not re-reading from document)
      for (const { from, to, text } of selectionData) {
        if (text.trim()) {
          const trimmedSelection = text.trim();
          let replacement: string;

          // Check if selection is a wikilink - if so, toggle it off
          if (
            trimmedSelection.startsWith('[[') &&
            trimmedSelection.endsWith(']]')
          ) {
            const linkContent = trimmedSelection.slice(2, -2);
            const pipeIndex = linkContent.indexOf('|');

            if (pipeIndex !== -1) {
              // Has display text: [[target|display text]] → display text
              replacement = linkContent.slice(pipeIndex + 1);
            } else {
              // No display text: [[target]] → reverse(target)
              replacement = reverseSafeLinkTarget(
                linkContent,
                this.plugin.settings
              );
            }
          } else {
            // Plain text: text → [[safe(text)]]
            const safeLinkTarget = generateSafeLinkTarget(
              text,
              this.plugin.settings
            );
            replacement = `[[${safeLinkTarget}]]`;
          }

          activeEditor.replaceRange(replacement, from, to);
        }
      }
    } else {
      // No selection - show modal
      const modal = new InternalLinkModal(
        this.plugin.app,
        this.plugin,
        (linkTarget: string) => {
          const safeLinkTarget = generateSafeLinkTarget(
            linkTarget,
            this.plugin.settings
          );
          const wikiLink = `[[${safeLinkTarget}]]`;
          activeEditor.replaceSelection(wikiLink);
        }
      );
      modal.open();
    }
  }

  addSafeInternalLinkWithDisplayText(): void {
    // Try to get active editor from any view type (Markdown, canvas, etc.)
    const activeEditor = this.plugin.app.workspace.activeEditor?.editor;
    if (!activeEditor) {
      new Notice(t('notifications.errorNoActiveNote'));
      return;
    }

    const selections = activeEditor.listSelections();

    // Check if any selection has content (anchor != head means text is selected)
    const hasSelection = selections.some(
      (sel) =>
        sel.anchor.line !== sel.head.line || sel.anchor.ch !== sel.head.ch
    );

    if (hasSelection) {
      // Step 1: Capture all selection data (positions + text) before modifying document
      const selectionData = selections.map((sel) => {
        // Normalize selection range (anchor might be after head)
        const from =
          sel.anchor.line < sel.head.line ||
          (sel.anchor.line === sel.head.line && sel.anchor.ch <= sel.head.ch)
            ? sel.anchor
            : sel.head;
        const to = from === sel.anchor ? sel.head : sel.anchor;

        const text = activeEditor.getRange(from, to);
        return { from, to, text };
      });

      // Step 2: Sort by START position in reverse (bottom-to-top, right-to-left)
      selectionData.sort((a, b) => {
        if (a.from.line !== b.from.line) {
          return b.from.line - a.from.line; // Reverse line order
        }
        return b.from.ch - a.from.ch; // Reverse character order
      });

      // Step 3: Process each selection using captured text (not re-reading from document)
      for (const { from, to, text } of selectionData) {
        if (text.trim()) {
          const trimmedSelection = text.trim();
          let replacement: string;

          // Check if selection is a wikilink
          if (
            trimmedSelection.startsWith('[[') &&
            trimmedSelection.endsWith(']]')
          ) {
            const linkContent = trimmedSelection.slice(2, -2);
            const pipeIndex = linkContent.indexOf('|');

            if (pipeIndex !== -1) {
              // Has display text: [[target|display text]]
              const target = linkContent.slice(0, pipeIndex);
              const displayText = linkContent.slice(pipeIndex + 1);
              const reversedTarget = reverseSafeLinkTarget(
                target,
                this.plugin.settings
              );

              if (reversedTarget === displayText) {
                // [[Heyˆ|Hey^]] → Hey^ (strip when display text matches reversed target)
                replacement = displayText;
              } else {
                // [[Heyˆ|Bye]] → [[Heyˆ|Hey^]] (update display text to reversed target)
                replacement = `[[${target}|${reversedTarget}]]`;
              }
            } else {
              // No display text: [[Heyˆ]] → [[Heyˆ|Hey^]] (add display text as reversed target)
              const reversedTarget = reverseSafeLinkTarget(
                linkContent,
                this.plugin.settings
              );
              replacement = `[[${linkContent}|${reversedTarget}]]`;
            }
          } else {
            // Plain text: Hey^ → [[Heyˆ|Hey^]]
            const safeLinkTarget = generateSafeLinkTarget(
              text,
              this.plugin.settings
            );
            replacement = `[[${safeLinkTarget}|${text}]]`;
          }

          activeEditor.replaceRange(replacement, from, to);
        }
      }
    } else {
      // No selection - show modal
      const modal = new InternalLinkModal(
        this.plugin.app,
        this.plugin,
        (linkTarget: string, linkDisplayText?: string) => {
          const safeLinkTarget = generateSafeLinkTarget(
            linkTarget,
            this.plugin.settings
          );
          let wikiLink: string;
          if (linkDisplayText && linkDisplayText.trim()) {
            wikiLink = `[[${safeLinkTarget}|${linkDisplayText}]]`;
          } else {
            wikiLink = `[[${safeLinkTarget}|${linkTarget}]]`;
          }
          activeEditor.replaceSelection(wikiLink);
        },
        true
      ); // true for withDisplayText
      modal.open();
    }
  }

  addInternalLinkWithDisplayTextAndCustomTarget(): void {
    // Try to get active editor from any view type (Markdown, canvas, etc.)
    const activeEditor = this.plugin.app.workspace.activeEditor?.editor;
    if (!activeEditor) {
      new Notice(t('notifications.errorNoActiveNote'));
      return;
    }

    const selections = activeEditor.listSelections();

    // Check if any selection has content (anchor != head means text is selected)
    const hasSelection = selections.some(
      (sel) =>
        sel.anchor.line !== sel.head.line || sel.anchor.ch !== sel.head.ch
    );

    if (hasSelection) {
      // Step 1: Capture all selection data (positions + text) before modifying document
      const selectionData = selections.map((sel) => {
        // Normalize selection range (anchor might be after head)
        const from =
          sel.anchor.line < sel.head.line ||
          (sel.anchor.line === sel.head.line && sel.anchor.ch <= sel.head.ch)
            ? sel.anchor
            : sel.head;
        const to = from === sel.anchor ? sel.head : sel.anchor;

        const text = activeEditor.getRange(from, to);
        return { from, to, text };
      });

      // Step 2: Sort by START position in reverse (bottom-to-top, right-to-left)
      selectionData.sort((a, b) => {
        if (a.from.line !== b.from.line) {
          return b.from.line - a.from.line; // Reverse line order
        }
        return b.from.ch - a.from.ch; // Reverse character order
      });

      // Step 3: Process each selection, track final cursor position
      let finalCursorPos: { line: number; ch: number } | null = null;

      for (const { from, to, text } of selectionData) {
        if (text.trim()) {
          // Replace selection with [[|text]] (empty target, text as display text)
          const replacement = `[[|${text}]]`;
          activeEditor.replaceRange(replacement, from, to);

          // Track cursor position for last (topmost) selection
          // Cursor goes right after [[
          finalCursorPos = { line: from.line, ch: from.ch + 2 };
        }
      }

      // Position cursor after [[ to trigger link suggester (only if we processed any)
      if (finalCursorPos) {
        activeEditor.setCursor(finalCursorPos);
      }
    } else {
      // No selection - show modal
      const modal = new InternalLinkModal(
        this.plugin.app,
        this.plugin,
        (linkTarget: string) => {
          // Insert [[|linkTarget]] with cursor positioned after [[
          const wikiLink = `[[|${linkTarget}]]`;
          const cursor = activeEditor.getCursor();
          activeEditor.replaceSelection(wikiLink);
          // Position cursor after [[
          activeEditor.setCursor({ line: cursor.line, ch: cursor.ch + 2 });
        }
      );
      modal.open();
    }
  }
}
