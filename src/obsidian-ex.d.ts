/**
 * Extended type definitions for Obsidian API
 * These extend the official API with unofficial/undocumented properties
 */

import { Command, TFile, Editor, Menu, View, Setting } from 'obsidian';

declare module 'obsidian' {
  export class SettingGroup {
    settingEl: HTMLElement;
    constructor(containerEl: HTMLElement);
    setHeading(text: string | DocumentFragment): this;
    addClass(cls: string): this;
    addSetting(cb: (setting: Setting) => void): this;
  }
  interface MetadataCache {
    /**
     * Get all tags in the vault (undocumented)
     */
    getTags(): Record<string, number>;
  }

  interface App {
    commands: {
      commands: Record<string, Command>;
      executeCommandById(id: string): boolean;
    };
    plugins: {
      enabledPlugins: Set<string>;
      getPlugin(id: string): unknown;
    };
  }

  interface WorkspaceLeaf {
    /**
     * Internal leaf ID (undocumented)
     */
    id?: string;
  }

  interface Event {
    /**
     * Obsidian context menu cache (undocumented)
     */
    obsidian_contextmenu?: Menu;
  }

  /**
   * Helper type for accessing undocumented properties on leaf views
   * At runtime, leaf.view may be a FileView or MarkdownView with these properties
   */
  type ViewWithFileEditor = View & {
    file?: TFile | null;
    editor?: Editor | null;
    hoverPopover?: {
      targetEl?: HTMLElement;
      editor?: Editor;
      file?: TFile;
    } | null;
  };
}

// Error type extensions
export interface NodeError extends Error {
  code?: string;
}

// Global Window interface extensions
declare global {
  interface Window {
    FLIT?: {
      debug: {
        enable: () => Promise<void>;
        disable: () => Promise<void>;
      };
    };
    DEBUG?: {
      enable: (namespace?: string) => Promise<void>;
      disable: (namespace?: string) => Promise<void>;
    };
  }
}
