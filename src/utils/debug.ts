import { TFile } from 'obsidian';
import { PluginSettings } from '../types';
import FirstLineIsTitle from '../../main';

export class DebugUtils {
  constructor(private plugin: FirstLineIsTitle) {}

  get app() {
    return this.plugin.app;
  }

  get settings(): PluginSettings {
    return this.plugin.settings;
  }

  /**
   * Logs setting changes to console when debug mode is enabled
   * @param settingName The name of the setting that changed
   * @param value The new value of the setting
   */
  debugLog(settingName: string, value: unknown): void {
    if (this.settings.core.verboseLogging) {
      console.debug(
        `Setting changed: ${settingName} = ${JSON.stringify(value)}`
      );
    }
  }

  /**
   * Outputs complete file content for debugging purposes
   * @param file The file to output content for
   * @param action The action being performed (e.g., "MODIFIED", "CREATED")
   * @param editorContent Optional editor content to output directly
   */
  outputDebugFileContent(
    file: TFile,
    action: string,
    editorContent?: string
  ): void {
    if (
      !this.settings.core.verboseLogging ||
      !this.settings.core.debugOutputFullContent
    ) {
      return;
    }

    try {
      const content = editorContent ?? 'N/A (no editor content available)';

      console.debug(`CONTENT [${action}] ${file.path}:`);
      console.debug('--- FILE CONTENT START ---');
      console.debug(content);
      console.debug('--- FILE CONTENT END ---');
    } catch (error) {
      console.debug(
        `CONTENT [${action}] ${file.path}: Failed to read file:`,
        error
      );
    }
  }

  /**
   * Outputs complete plugin settings for debugging purposes
   */
  outputAllSettings(): void {
    if (!this.settings.core.verboseLogging) {
      return;
    }

    console.debug('SETTINGS: Complete configuration dump:');
    console.debug('--- SETTINGS START ---');
    console.debug(JSON.stringify(this.settings, null, 2));
    console.debug('--- SETTINGS END ---');
  }
}
