import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App, TFile, Editor } from '../mockObsidian';
import { DEFAULT_SETTINGS } from '../../src/constants';

// Mock the i18n module
vi.mock('../../src/i18n', () => ({
  t: vi.fn((key: string) => key),
}));

// Mock the utils module
vi.mock('../../src/utils', () => ({
  verboseLog: vi.fn(),
  reverseCharacterReplacements: vi.fn((str: string) => str),
}));

// Mock the modals module.
// In vitest v4, mockImplementation for a class mock must use a regular function
// (not an arrow function) so the mock is constructable with `new`.
const mockModalOpen = vi.fn();
vi.mock('../../src/modals', () => ({
  RenameAllFilesModal: vi.fn().mockImplementation(function () {
    return { open: mockModalOpen };
  }),
}));

describe('CommandRegistrar', () => {
  let mockPlugin: any;
  let mockApp: App;

  beforeEach(() => {
    vi.clearAllMocks();

    mockApp = new App();
    mockPlugin = {
      app: mockApp,
      settings: { ...DEFAULT_SETTINGS },
      addCommand: vi.fn(),
      renameEngine: {
        processFile: vi.fn().mockResolvedValue(undefined),
      },
      addSafeInternalLink: vi.fn(),
      addSafeInternalLinkWithCaption: vi.fn(),
      addInternalLinkWithCaptionAndCustomTarget: vi.fn(),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      disableRenamingForNote: vi.fn().mockResolvedValue(undefined),
      enableRenamingForNote: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe('registerCommands', () => {
    it('should register all 10 commands', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      registrar.registerCommands();

      expect(mockPlugin.addCommand).toHaveBeenCalledTimes(10);
    });

    it('should register rename-current-file command with correct icon', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      registrar.registerCommands();

      const command = mockPlugin.addCommand.mock.calls.find(
        (call: any[]) => call[0].id === 'rename-current-file'
      );
      expect(command).toBeDefined();
      expect(command[0].icon).toBe('file-type');
    });

    it('should register rename-current-file-unless-excluded command', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      registrar.registerCommands();

      const command = mockPlugin.addCommand.mock.calls.find(
        (call: any[]) => call[0].id === 'rename-current-file-unless-excluded'
      );
      expect(command).toBeDefined();
      expect(command[0].icon).toBe('file-type');
    });

    it('should register rename-all-files command with file-stack icon', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      registrar.registerCommands();

      const command = mockPlugin.addCommand.mock.calls.find(
        (call: any[]) => call[0].id === 'rename-all-files'
      );
      expect(command).toBeDefined();
      expect(command[0].icon).toBe('file-stack');
    });

    it('should register toggle-automatic-renaming command with file-cog icon', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      registrar.registerCommands();

      const command = mockPlugin.addCommand.mock.calls.find(
        (call: any[]) => call[0].id === 'toggle-automatic-renaming'
      );
      expect(command).toBeDefined();
      expect(command[0].icon).toBe('file-cog');
    });
  });

  describe('link commands registration', () => {
    it('should register add-safe-internal-link command', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      registrar.registerCommands();

      const command = mockPlugin.addCommand.mock.calls.find(
        (call: any[]) => call[0].id === 'add-safe-internal-link'
      );
      expect(command).toBeDefined();
      expect(command[0].icon).toBe('link');
    });

    it('should register add-safe-internal-link-with-caption command', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      registrar.registerCommands();

      const command = mockPlugin.addCommand.mock.calls.find(
        (call: any[]) => call[0].id === 'add-safe-internal-link-with-caption'
      );
      expect(command).toBeDefined();
      expect(command[0].icon).toBe('link');
    });

    it('should register add-internal-link-with-caption-and-custom-target command', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      registrar.registerCommands();

      const command = mockPlugin.addCommand.mock.calls.find(
        (call: any[]) =>
          call[0].id === 'add-internal-link-with-caption-and-custom-target'
      );
      expect(command).toBeDefined();
      expect(command[0].icon).toBe('link');
    });

    it('should call plugin.addSafeInternalLink when link command executed', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      registrar.registerCommands();

      const command = mockPlugin.addCommand.mock.calls.find(
        (call: any[]) => call[0].id === 'add-safe-internal-link'
      );

      // Execute the editorCallback
      command[0].editorCallback({}, {});

      expect(mockPlugin.addSafeInternalLink).toHaveBeenCalled();
    });

    it('should call plugin.addSafeInternalLinkWithCaption when command executed', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      registrar.registerCommands();

      const command = mockPlugin.addCommand.mock.calls.find(
        (call: any[]) => call[0].id === 'add-safe-internal-link-with-caption'
      );

      command[0].editorCallback({}, {});

      expect(mockPlugin.addSafeInternalLinkWithCaption).toHaveBeenCalled();
    });

    it('should call plugin.addInternalLinkWithCaptionAndCustomTarget when command executed', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      registrar.registerCommands();

      const command = mockPlugin.addCommand.mock.calls.find(
        (call: any[]) =>
          call[0].id === 'add-internal-link-with-caption-and-custom-target'
      );

      command[0].editorCallback({}, {});

      expect(
        mockPlugin.addInternalLinkWithCaptionAndCustomTarget
      ).toHaveBeenCalled();
    });
  });

  describe('rename-all-files command', () => {
    it('should open RenameAllFilesModal when executed', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      registrar.registerCommands();

      const command = mockPlugin.addCommand.mock.calls.find(
        (call: any[]) => call[0].id === 'rename-all-files'
      );

      // Execute the callback
      command[0].callback();

      expect(mockModalOpen).toHaveBeenCalled();
    });
  });

  describe('executeRenameCurrentFile', () => {
    it('should not call processFile when no active file', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      (mockApp.workspace as any).activeEditor = null;

      await registrar.executeRenameCurrentFile();

      expect(mockPlugin.renameEngine.processFile).not.toHaveBeenCalled();
    });

    it('should call processFile with exclusion overrides for markdown files', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      const mockFile = new TFile('test.md');
      const mockEditor = new Editor();
      (mockApp.workspace as any).activeEditor = {
        file: mockFile,
        editor: mockEditor,
      };

      await registrar.executeRenameCurrentFile();

      expect(mockPlugin.renameEngine.processFile).toHaveBeenCalledWith(
        mockFile,
        true,
        true,
        undefined,
        false,
        { ignoreFolder: true, ignoreTag: true, ignoreProperty: true },
        true,
        mockEditor
      );
    });

    it('should ignore non-markdown files', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      const mockFile = new TFile('test.txt');
      mockFile.extension = 'txt';
      (mockApp.workspace as any).activeEditor = {
        file: mockFile,
        editor: new Editor(),
      };

      await registrar.executeRenameCurrentFile();

      expect(mockPlugin.renameEngine.processFile).not.toHaveBeenCalled();
    });
  });

  describe('executeRenameUnlessExcluded', () => {
    it('should call processFile without exclusion overrides', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      const mockFile = new TFile('test.md');
      const mockEditor = new Editor();
      (mockApp.workspace as any).activeEditor = {
        file: mockFile,
        editor: mockEditor,
      };

      await registrar.executeRenameUnlessExcluded();

      expect(mockPlugin.renameEngine.processFile).toHaveBeenCalledWith(
        mockFile,
        true,
        true,
        undefined,
        false,
        undefined,
        true,
        mockEditor
      );
    });

    it('should not call processFile when no active file', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      (mockApp.workspace as any).activeEditor = null;

      await registrar.executeRenameUnlessExcluded();

      expect(mockPlugin.renameEngine.processFile).not.toHaveBeenCalled();
    });
  });

  describe('executeToggleAutomaticRenaming', () => {
    it('should toggle from automatic to manual', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      mockPlugin.settings.core.renameNotes = 'automatically';

      await registrar.executeToggleAutomaticRenaming();

      expect(mockPlugin.settings.core.renameNotes).toBe('manually');
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    it('should toggle from manual to automatic', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      mockPlugin.settings.core.renameNotes = 'manually';

      await registrar.executeToggleAutomaticRenaming();

      expect(mockPlugin.settings.core.renameNotes).toBe('automatically');
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });
  });

  describe('checkCallback commands', () => {
    it('disable-renaming command should show when property does not exist', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      const mockFile = new TFile('test.md');
      mockApp.workspace.getActiveFile = vi.fn().mockReturnValue(mockFile);
      mockApp.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: {},
      });

      registrar.registerCommands();

      const command = mockPlugin.addCommand.mock.calls.find(
        (call: any[]) => call[0].id === 'disable-renaming-for-note'
      );

      const checkResult = command[0].checkCallback(true);
      expect(checkResult).toBe(true);
    });

    it('disable-renaming command should not show when property exists', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      const mockFile = new TFile('test.md');
      mockApp.workspace.getActiveFile = vi.fn().mockReturnValue(mockFile);
      mockApp.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: {
          [DEFAULT_SETTINGS.exclusions.disableRenamingKey]: true,
        },
      });

      registrar.registerCommands();

      const command = mockPlugin.addCommand.mock.calls.find(
        (call: any[]) => call[0].id === 'disable-renaming-for-note'
      );

      const checkResult = command[0].checkCallback(true);
      expect(checkResult).toBe(false);
    });

    it('enable-renaming command should show when property exists', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      const mockFile = new TFile('test.md');
      mockApp.workspace.getActiveFile = vi.fn().mockReturnValue(mockFile);
      mockApp.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: {
          [DEFAULT_SETTINGS.exclusions.disableRenamingKey]: true,
        },
      });

      registrar.registerCommands();

      const command = mockPlugin.addCommand.mock.calls.find(
        (call: any[]) => call[0].id === 'enable-renaming-for-note'
      );

      const checkResult = command[0].checkCallback(true);
      expect(checkResult).toBe(true);
    });

    it('enable-renaming command should not show when property does not exist', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      const mockFile = new TFile('test.md');
      mockApp.workspace.getActiveFile = vi.fn().mockReturnValue(mockFile);
      mockApp.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: {},
      });

      registrar.registerCommands();

      const command = mockPlugin.addCommand.mock.calls.find(
        (call: any[]) => call[0].id === 'enable-renaming-for-note'
      );

      const checkResult = command[0].checkCallback(true);
      expect(checkResult).toBe(false);
    });

    it('disable-renaming command should call plugin method when executed', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      const mockFile = new TFile('test.md');
      mockApp.workspace.getActiveFile = vi.fn().mockReturnValue(mockFile);
      mockApp.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: {},
      });

      registrar.registerCommands();

      const command = mockPlugin.addCommand.mock.calls.find(
        (call: any[]) => call[0].id === 'disable-renaming-for-note'
      );

      // Execute (not just check)
      command[0].checkCallback(false);

      expect(mockPlugin.disableRenamingForNote).toHaveBeenCalled();
    });

    it('enable-renaming command should call plugin method when executed', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      const mockFile = new TFile('test.md');
      mockApp.workspace.getActiveFile = vi.fn().mockReturnValue(mockFile);
      mockApp.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: {
          [DEFAULT_SETTINGS.exclusions.disableRenamingKey]: true,
        },
      });

      registrar.registerCommands();

      const command = mockPlugin.addCommand.mock.calls.find(
        (call: any[]) => call[0].id === 'enable-renaming-for-note'
      );

      command[0].checkCallback(false);

      expect(mockPlugin.enableRenamingForNote).toHaveBeenCalled();
    });
  });

  describe('insert-filename command', () => {
    it('should register with clipboard-type icon', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      registrar.registerCommands();

      const command = mockPlugin.addCommand.mock.calls.find(
        (call: any[]) => call[0].id === 'insert-filename'
      );
      expect(command).toBeDefined();
      expect(command[0].icon).toBe('clipboard-type');
    });

    it('should return true when checking with markdown file', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      const mockFile = new TFile('test-file.md');
      const mockEditor = new Editor();
      const mockView = { file: mockFile };

      registrar.registerCommands();

      const command = mockPlugin.addCommand.mock.calls.find(
        (call: any[]) => call[0].id === 'insert-filename'
      );

      const checkResult = command[0].editorCheckCallback(
        true,
        mockEditor,
        mockView
      );
      expect(checkResult).toBe(true);
    });

    it('should return false when checking with non-markdown file', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      const mockFile = new TFile('test-file.txt');
      mockFile.extension = 'txt';
      const mockEditor = new Editor();
      const mockView = { file: mockFile };

      registrar.registerCommands();

      const command = mockPlugin.addCommand.mock.calls.find(
        (call: any[]) => call[0].id === 'insert-filename'
      );

      const checkResult = command[0].editorCheckCallback(
        true,
        mockEditor,
        mockView
      );
      expect(checkResult).toBe(false);
    });

    it('should insert filename when executed', async () => {
      const { CommandRegistrar } =
        await import('../../src/core/command-registrar');
      const registrar = new CommandRegistrar(mockPlugin);

      const mockFile = new TFile('test-file.md');
      const mockEditor = new Editor();
      const mockView = { file: mockFile };

      registrar.registerCommands();

      const command = mockPlugin.addCommand.mock.calls.find(
        (call: any[]) => call[0].id === 'insert-filename'
      );

      command[0].editorCheckCallback(false, mockEditor, mockView);
      expect(mockEditor.replaceSelection).toHaveBeenCalled();
    });
  });
});
