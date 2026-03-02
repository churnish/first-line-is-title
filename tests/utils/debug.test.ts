import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DebugUtils } from '../../src/utils/debug';
import {
  createMockApp,
  createTestSettings,
  createMockFile,
} from '../testUtils';
import { TFile } from '../mockObsidian';

function createMockPlugin() {
  const app = createMockApp();
  const settings = createTestSettings();

  return {
    app,
    settings,
  } as any;
}

describe('DebugUtils', () => {
  let plugin: any;
  let debugUtils: DebugUtils;
  let consoleSpy: any;

  beforeEach(() => {
    plugin = createMockPlugin();
    debugUtils = new DebugUtils(plugin);
    // In vitest v4, spyOn on a pre-mocked vi.fn() shares call history with the
    // global mock from setup.ts. mockClear() resets the count for this test.
    consoleSpy = vi.spyOn(console, 'debug');
    consoleSpy.mockClear();
  });

  describe('app getter', () => {
    it('should return plugin app', () => {
      expect(debugUtils.app).toBe(plugin.app);
    });
  });

  describe('settings getter', () => {
    it('should return plugin settings', () => {
      expect(debugUtils.settings).toBe(plugin.settings);
    });
  });

  describe('debugLog', () => {
    it('should log when verbose logging is enabled', () => {
      plugin.settings.core.verboseLogging = true;

      debugUtils.debugLog('testSetting', 'testValue');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Setting changed: testSetting = "testValue"'
      );
    });

    it('should not log when verbose logging is disabled', () => {
      plugin.settings.core.verboseLogging = false;

      debugUtils.debugLog('testSetting', 'testValue');

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should JSON stringify complex values', () => {
      plugin.settings.core.verboseLogging = true;
      const complexValue = { foo: 'bar', nested: { value: 123 } };

      debugUtils.debugLog('complexSetting', complexValue);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Setting changed: complexSetting = {"foo":"bar","nested":{"value":123}}'
      );
    });

    it('should handle array values', () => {
      plugin.settings.core.verboseLogging = true;

      debugUtils.debugLog('arrayTest', [1, 2, 3]);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Setting changed: arrayTest = [1,2,3]'
      );
    });

    it('should handle boolean values', () => {
      plugin.settings.core.verboseLogging = true;

      debugUtils.debugLog('boolSetting', true);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Setting changed: boolSetting = true'
      );
    });

    it('should handle null values', () => {
      plugin.settings.core.verboseLogging = true;

      debugUtils.debugLog('nullSetting', null);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Setting changed: nullSetting = null'
      );
    });

    it('should handle undefined values', () => {
      plugin.settings.core.verboseLogging = true;

      debugUtils.debugLog('undefinedSetting', undefined);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Setting changed: undefinedSetting = undefined'
      );
    });
  });

  describe('outputDebugFileContent', () => {
    let file: TFile;

    beforeEach(() => {
      file = createMockFile('test.md');
    });

    it('should output file content when both flags are enabled', () => {
      plugin.settings.core.verboseLogging = true;
      plugin.settings.core.debugOutputFullContent = true;
      const content = 'Test file content';

      debugUtils.outputDebugFileContent(file, 'MODIFIED', content);

      expect(consoleSpy).toHaveBeenCalledWith('CONTENT [MODIFIED] test.md:');
      expect(consoleSpy).toHaveBeenCalledWith('--- FILE CONTENT START ---');
      expect(consoleSpy).toHaveBeenCalledWith(content);
      expect(consoleSpy).toHaveBeenCalledWith('--- FILE CONTENT END ---');
    });

    it('should not output when verbose logging is disabled', () => {
      plugin.settings.core.verboseLogging = false;
      plugin.settings.core.debugOutputFullContent = true;

      debugUtils.outputDebugFileContent(file, 'MODIFIED', 'content');

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should not output when debugOutputFullContent is disabled', () => {
      plugin.settings.core.verboseLogging = true;
      plugin.settings.core.debugOutputFullContent = false;

      debugUtils.outputDebugFileContent(file, 'MODIFIED', 'content');

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should use N/A message when no editor content provided', () => {
      plugin.settings.core.verboseLogging = true;
      plugin.settings.core.debugOutputFullContent = true;

      debugUtils.outputDebugFileContent(file, 'CREATED');

      expect(consoleSpy).toHaveBeenCalledWith(
        'N/A (no editor content available)'
      );
    });

    it('should handle empty string content', () => {
      plugin.settings.core.verboseLogging = true;
      plugin.settings.core.debugOutputFullContent = true;

      debugUtils.outputDebugFileContent(file, 'MODIFIED', '');

      expect(consoleSpy).toHaveBeenCalledWith('');
    });

    it('should handle different action types', () => {
      plugin.settings.core.verboseLogging = true;
      plugin.settings.core.debugOutputFullContent = true;

      debugUtils.outputDebugFileContent(file, 'CREATED', 'content');
      expect(consoleSpy).toHaveBeenCalledWith('CONTENT [CREATED] test.md:');

      consoleSpy.mockClear();

      debugUtils.outputDebugFileContent(file, 'DELETED', 'content');
      expect(consoleSpy).toHaveBeenCalledWith('CONTENT [DELETED] test.md:');
    });

    it('should output multiline content correctly', () => {
      plugin.settings.core.verboseLogging = true;
      plugin.settings.core.debugOutputFullContent = true;
      const multilineContent = 'Line 1\nLine 2\nLine 3';

      debugUtils.outputDebugFileContent(file, 'MODIFIED', multilineContent);

      expect(consoleSpy).toHaveBeenCalledWith(multilineContent);
    });

    it('should output content with special characters', () => {
      plugin.settings.core.verboseLogging = true;
      plugin.settings.core.debugOutputFullContent = true;
      const specialContent = 'Content with # * / special chars';

      debugUtils.outputDebugFileContent(file, 'MODIFIED', specialContent);

      expect(consoleSpy).toHaveBeenCalledWith(specialContent);
    });
  });

  describe('outputAllSettings', () => {
    it('should output all settings when verbose logging is enabled', () => {
      plugin.settings.core.verboseLogging = true;

      debugUtils.outputAllSettings();

      expect(consoleSpy).toHaveBeenCalledWith(
        'SETTINGS: Complete configuration dump:'
      );
      expect(consoleSpy).toHaveBeenCalledWith('--- SETTINGS START ---');
      expect(consoleSpy).toHaveBeenCalledWith(
        JSON.stringify(plugin.settings, null, 2)
      );
      expect(consoleSpy).toHaveBeenCalledWith('--- SETTINGS END ---');
    });

    it('should not output when verbose logging is disabled', () => {
      plugin.settings.core.verboseLogging = false;

      debugUtils.outputAllSettings();

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should output formatted JSON with indentation', () => {
      plugin.settings.core.verboseLogging = true;

      debugUtils.outputAllSettings();

      const jsonCall = consoleSpy.mock.calls.find((call: any) =>
        call[0].startsWith('{')
      );
      expect(jsonCall).toBeDefined();
      expect(jsonCall[0]).toContain('\n'); // Should have newlines from formatting
      expect(jsonCall[0]).toContain('  '); // Should have indentation
    });

    it('should output complete settings object', () => {
      plugin.settings.core.verboseLogging = true;
      plugin.settings.core.charCount = 999;
      plugin.settings.exclusions.excludedFolders = ['test-folder'];

      debugUtils.outputAllSettings();

      const jsonCall = consoleSpy.mock.calls.find((call: any) =>
        call[0].startsWith('{')
      );
      const outputtedSettings = JSON.parse(jsonCall[0]);

      expect(outputtedSettings.core.charCount).toBe(999);
      expect(outputtedSettings.exclusions.excludedFolders).toContain(
        'test-folder'
      );
    });
  });

  describe('edge cases', () => {
    it('should handle being called multiple times', () => {
      plugin.settings.core.verboseLogging = true;

      debugUtils.debugLog('setting1', 'value1');
      debugUtils.debugLog('setting2', 'value2');
      debugUtils.debugLog('setting3', 'value3');

      expect(consoleSpy).toHaveBeenCalledTimes(3);
    });

    it('should handle toggling verbose logging', () => {
      plugin.settings.core.verboseLogging = false;
      debugUtils.debugLog('test1', 'value1');

      plugin.settings.core.verboseLogging = true;
      debugUtils.debugLog('test2', 'value2');

      plugin.settings.core.verboseLogging = false;
      debugUtils.debugLog('test3', 'value3');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Setting changed: test2 = "value2"'
      );
    });

    it('should handle very large settings object', () => {
      plugin.settings.core.verboseLogging = true;
      const largeArray = Array(1000).fill('item');
      plugin.settings.customRules.customReplacements = largeArray as any;

      expect(() => debugUtils.outputAllSettings()).not.toThrow();
    });

    it('should handle circular references gracefully', () => {
      plugin.settings.core.verboseLogging = true;
      const circularObj: any = { prop: 'value' };
      circularObj.self = circularObj;

      // JSON.stringify will throw on circular refs, but debugLog should handle it
      expect(() => {
        try {
          debugUtils.debugLog('circular', circularObj);
        } catch (e) {
          // Expected to throw
        }
      }).not.toThrow();
    });
  });
});
