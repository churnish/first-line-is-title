import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventHandlerManager } from '../../src/core/event-handler-manager';

// Minimal mock plugin for EventHandlerManager
// Only includes what's needed for testing the pendingAliasUpdates coordination
function createMockPlugin() {
  return {
    app: {
      workspace: {
        on: vi.fn(),
      },
      vault: {
        on: vi.fn(),
      },
      metadataCache: {
        on: vi.fn(),
      },
    },
    settings: {
      core: {
        enableContextMenus: true,
      },
    },
    registerEvent: vi.fn(),
  } as any;
}

describe('EventHandlerManager', () => {
  let plugin: any;
  let manager: EventHandlerManager;

  beforeEach(() => {
    plugin = createMockPlugin();
    manager = new EventHandlerManager(plugin);
  });

  describe('pendingAliasUpdates coordination', () => {
    it('should initially have no pending updates', () => {
      expect(manager.isAliasUpdatePending('test.md')).toBe(false);
    });

    it('should mark alias update as pending', () => {
      manager.markAliasUpdatePending('test.md');
      expect(manager.isAliasUpdatePending('test.md')).toBe(true);
    });

    it('should clear pending alias update', () => {
      manager.markAliasUpdatePending('test.md');
      manager.clearAliasUpdatePending('test.md');
      expect(manager.isAliasUpdatePending('test.md')).toBe(false);
    });

    it('should handle multiple files independently', () => {
      manager.markAliasUpdatePending('file1.md');
      manager.markAliasUpdatePending('file2.md');

      expect(manager.isAliasUpdatePending('file1.md')).toBe(true);
      expect(manager.isAliasUpdatePending('file2.md')).toBe(true);
      expect(manager.isAliasUpdatePending('file3.md')).toBe(false);

      manager.clearAliasUpdatePending('file1.md');
      expect(manager.isAliasUpdatePending('file1.md')).toBe(false);
      expect(manager.isAliasUpdatePending('file2.md')).toBe(true);
    });

    it('should handle clear on non-existent path', () => {
      expect(() =>
        manager.clearAliasUpdatePending('nonexistent.md')
      ).not.toThrow();
    });

    it('should handle double mark', () => {
      manager.markAliasUpdatePending('test.md');
      manager.markAliasUpdatePending('test.md');
      expect(manager.isAliasUpdatePending('test.md')).toBe(true);
    });

    it('should handle double clear', () => {
      manager.markAliasUpdatePending('test.md');
      manager.clearAliasUpdatePending('test.md');
      manager.clearAliasUpdatePending('test.md');
      expect(manager.isAliasUpdatePending('test.md')).toBe(false);
    });
  });

  describe('constructor', () => {
    it('should initialize with plugin reference', () => {
      const manager = new EventHandlerManager(plugin);
      expect(manager).toBeDefined();
    });
  });

  describe('registerAllHandlers', () => {
    it('should call plugin.registerEvent for each handler type', () => {
      // Mock the workspace and vault event registrations
      plugin.app.workspace.on = vi.fn().mockReturnValue({});
      plugin.app.vault.on = vi.fn().mockReturnValue({});
      plugin.app.metadataCache.on = vi.fn().mockReturnValue({});

      // Additional mocks needed for registerAllHandlers
      plugin.settings = {
        core: {
          enableContextMenus: true,
          renameNotes: 'always',
        },
        aliases: {
          enableAliases: true,
        },
      };
      plugin.contextMenuManager = {
        addFileMenuItems: vi.fn(),
        addFolderMenuItems: vi.fn(),
      };
      plugin.editorLifecycleManager = {
        handleEditorChange: vi.fn(),
      };
      plugin.fileStateManager = {
        isFileInCreationDelay: vi.fn(),
        notifyFileDeleted: vi.fn(),
        getLastEditorContent: vi.fn(),
        setLastEditorContent: vi.fn(),
        notifyFileRenamed: vi.fn(),
        deleteLastEditorContent: vi.fn(),
        setLastSavedContent: vi.fn(),
        getLastSavedContent: vi.fn(),
        isSavedContentStale: vi.fn(),
        setLastAliasUpdateStatus: vi.fn(),
      };
      plugin.aliasManager = {
        updateAliasIfNeeded: vi.fn(),
      };
      plugin.cacheManager = {
        isLocked: vi.fn(),
      };
      plugin.renameEngine = {
        updateTitleRegionCacheKey: vi.fn(),
      };
      plugin.registerDomEvent = vi.fn();
      plugin.register = vi.fn();

      manager.registerAllHandlers();

      // Should register multiple events
      expect(plugin.registerEvent).toHaveBeenCalled();
    });
  });
});
