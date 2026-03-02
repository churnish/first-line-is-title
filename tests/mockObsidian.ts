/**
 * Mock implementation of Obsidian API for testing
 * This file replaces the 'obsidian' module in tests
 */

import { vi } from 'vitest';

// Mock TFile class
export class TFile {
  path: string;
  basename: string;
  extension: string;
  name: string;
  stat: { mtime: number; ctime: number; size: number };
  vault: any;
  parent: TFolder | null;

  constructor(path: string = 'test.md') {
    this.path = path;
    this.basename =
      path
        .replace(/\.[^/.]+$/, '')
        .split('/')
        .pop() || '';
    this.extension = path.split('.').pop() || 'md';
    this.name = path.split('/').pop() || '';
    this.stat = { mtime: Date.now(), ctime: Date.now(), size: 0 };
    this.vault = null;
    this.parent = null;
  }
}

// Mock TFolder class
export class TFolder {
  path: string;
  name: string;
  children: (TFile | TFolder)[];
  parent: TFolder | null;
  vault: any;

  constructor(path: string = 'test-folder') {
    this.path = path;
    this.name = path.split('/').pop() || '';
    this.children = [];
    this.parent = null;
    this.vault = null;
  }

  isRoot(): boolean {
    return this.path === '/';
  }
}

// Mock Vault class
export class Vault {
  adapter: any;
  configDir: string;

  constructor() {
    this.adapter = {
      getName: vi.fn().mockReturnValue('mock-vault'),
      exists: vi.fn().mockResolvedValue(true),
      read: vi.fn().mockResolvedValue(''),
      write: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
    };
    this.configDir = '.obsidian';
  }

  read = vi.fn().mockResolvedValue('');
  cachedRead = vi.fn().mockResolvedValue('');
  modify = vi.fn().mockResolvedValue(undefined);
  rename = vi.fn().mockResolvedValue(undefined);
  delete = vi.fn().mockResolvedValue(undefined);
  trash = vi.fn().mockResolvedValue(undefined);
  create = vi.fn().mockResolvedValue(new TFile());
  copy = vi.fn().mockResolvedValue(new TFile());
  getAbstractFileByPath = vi.fn((path: string) => {
    if (path.endsWith('.md')) return new TFile(path);
    return new TFolder(path);
  });
  getName = vi.fn().mockReturnValue('mock-vault');
  getRoot = vi.fn().mockReturnValue(new TFolder('/'));
  getFileByPath = vi.fn((path: string) =>
    path.endsWith('.md') ? new TFile(path) : null
  );
  getFolderByPath = vi.fn((path: string) => new TFolder(path));
  getAllLoadedFiles = vi.fn().mockReturnValue([]);
  getMarkdownFiles = vi.fn().mockReturnValue([]);
  getFiles = vi.fn().mockReturnValue([]);
  on = vi.fn();
  off = vi.fn();
}

// Mock FileManager class
export class FileManager {
  vault: Vault;

  constructor(vault: Vault) {
    this.vault = vault;
  }

  renameFile = vi.fn().mockResolvedValue(undefined);
  generateMarkdownLink = vi.fn((file: TFile) => `[[${file.basename}]]`);
  processFrontMatter = vi.fn(async (file: TFile, fn: (fm: any) => void) => {
    const frontmatter = {};
    fn(frontmatter);
  });
  getNewFileParent = vi.fn((path: string) => new TFolder());
}

// Mock MetadataCache class
export class MetadataCache {
  getFileCache = vi.fn((file: TFile) => ({
    frontmatter: {},
    sections: [],
    headings: [],
    links: [],
    tags: [],
  }));
  getCache = vi.fn((path: string) => ({
    frontmatter: {},
    sections: [],
    headings: [],
    links: [],
    tags: [],
  }));
  on = vi.fn();
  off = vi.fn();
  trigger = vi.fn();
  getFirstLinkpathDest = vi.fn().mockReturnValue(null);
  fileToLinktext = vi.fn((file: TFile) => file.basename);
  resolvedLinks: Record<string, Record<string, number>> = {};
  unresolvedLinks: Record<string, Record<string, number>> = {};
}

// Mock Workspace class
export class Workspace {
  activeLeaf: any;
  activeEditor: any;
  leftSplit: any;
  rightSplit: any;
  containerEl: HTMLElement;
  layoutReady: boolean;

  constructor() {
    this.activeLeaf = null;
    this.activeEditor = null;
    this.leftSplit = { collapsed: false };
    this.rightSplit = { collapsed: false };
    this.containerEl = document.createElement('div');
    this.layoutReady = true;
  }

  getActiveFile = vi.fn().mockReturnValue(null);
  getActiveViewOfType = vi.fn().mockReturnValue(null);
  getLeaf = vi.fn();
  getLeavesOfType = vi.fn().mockReturnValue([]);
  getMostRecentLeaf = vi.fn().mockReturnValue(null);
  on = vi.fn();
  off = vi.fn();
  trigger = vi.fn();
  revealLeaf = vi.fn();
  setActiveLeaf = vi.fn();
  iterateAllLeaves = vi.fn();
  iterateRootLeaves = vi.fn();
  onLayoutReady = vi.fn((callback: () => void) => {
    callback();
  });
}

// Mock App class
export class App {
  vault: Vault;
  metadataCache: MetadataCache;
  workspace: Workspace;
  fileManager: FileManager;
  lastEvent: any;
  keymap: any;
  scope: any;
  commands: any;

  constructor() {
    this.vault = new Vault();
    this.metadataCache = new MetadataCache();
    this.workspace = new Workspace();
    this.fileManager = new FileManager(this.vault);
    this.lastEvent = null;
    this.keymap = {
      pushScope: vi.fn(),
      popScope: vi.fn(),
    };
    this.scope = {
      register: vi.fn(),
      unregister: vi.fn(),
    };
    this.commands = {
      commands: {},
    };
  }

  loadLocalStorage = vi.fn();
  saveLocalStorage = vi.fn();
}

// Mock Editor class
export class Editor {
  getValue = vi.fn().mockReturnValue('');
  setValue = vi.fn();
  getLine = vi.fn((line: number) => '');
  setLine = vi.fn();
  lineCount = vi.fn().mockReturnValue(0);
  lastLine = vi.fn().mockReturnValue(0);
  getSelection = vi.fn().mockReturnValue('');
  replaceSelection = vi.fn();
  replaceRange = vi.fn();
  getCursor = vi.fn().mockReturnValue({ line: 0, ch: 0 });
  setCursor = vi.fn();
  getRange = vi.fn().mockReturnValue('');
  somethingSelected = vi.fn().mockReturnValue(false);
  getDoc = vi.fn();
  refresh = vi.fn();
  focus = vi.fn();
  listSelections = vi
    .fn()
    .mockReturnValue([
      { anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 0 } },
    ]);
  setSelections = vi.fn();
  setSelection = vi.fn();
  posToOffset = vi.fn().mockReturnValue(0);
  offsetToPos = vi.fn().mockReturnValue({ line: 0, ch: 0 });
}

// Mock MarkdownView class
export class MarkdownView {
  app: App;
  file: TFile | null;
  editor: Editor;
  containerEl: HTMLElement;

  constructor(app?: App) {
    this.app = app || new App();
    this.file = null;
    this.editor = new Editor();
    this.containerEl = document.createElement('div');
  }

  getViewType = vi.fn().mockReturnValue('markdown');
  getDisplayText = vi.fn().mockReturnValue('');
  getState = vi.fn().mockReturnValue({});
  setState = vi.fn();
  getEphemeralState = vi.fn().mockReturnValue({});
  setEphemeralState = vi.fn();
  onload = vi.fn();
  onunload = vi.fn();
}

// Mock Plugin class
export class Plugin {
  app: App;
  manifest: any;

  constructor() {
    this.app = new App();
    this.manifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
    };
  }

  loadData = vi.fn().mockResolvedValue({});
  saveData = vi.fn().mockResolvedValue(undefined);
  addCommand = vi.fn();
  addRibbonIcon = vi.fn();
  addStatusBarItem = vi.fn(() => document.createElement('div'));
  addSettingTab = vi.fn();
  registerEvent = vi.fn();
  registerDomEvent = vi.fn();
  registerInterval = vi.fn();
  register = vi.fn();
  onload = vi.fn();
  onunload = vi.fn();
}

// Mock Notice class
export class Notice {
  message: string;
  timeout: number;
  noticeEl: HTMLElement;
  containerEl: HTMLElement;
  messageEl: HTMLElement;

  constructor(message: string | DocumentFragment, timeout?: number) {
    this.noticeEl = document.createElement('div');
    this.containerEl = document.createElement('div');
    this.messageEl = document.createElement('div');
    this.noticeEl.appendChild(this.containerEl);
    this.containerEl.appendChild(this.messageEl);

    if (typeof message === 'string') {
      this.message = message;
      this.messageEl.textContent = message;
    } else {
      this.message = message.textContent || '';
      this.messageEl.appendChild(message);
    }
    this.timeout = timeout || 5000;
  }

  setMessage = vi.fn();
  hide = vi.fn();
}

// Mock Modal class
export class Modal {
  app: App;
  containerEl: HTMLElement;
  modalEl: HTMLElement;
  titleEl: HTMLElement;
  contentEl: HTMLElement;
  scope: {
    register: ReturnType<typeof vi.fn>;
    unregister: ReturnType<typeof vi.fn>;
  };

  constructor(app: App) {
    this.app = app;
    this.containerEl = document.createElement('div');
    this.modalEl = document.createElement('div');
    this.titleEl = document.createElement('div');
    this.contentEl = document.createElement('div');
    this.scope = {
      register: vi.fn(),
      unregister: vi.fn(),
    };
  }

  open = vi.fn();
  close = vi.fn();
  onOpen = vi.fn();
  onClose = vi.fn();

  setTitle = vi.fn((title: string) => {
    this.titleEl.textContent = title;
    return this;
  });
}

// Mock PluginSettingTab class
export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement;
  icon: string;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
    this.icon = '';
  }

  display(): void {}
  hide(): void {}
}

// Mock SettingGroup class
export class SettingGroup {
  containerEl: HTMLElement;
  settingGroupEl: HTMLElement;
  settingItemsEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl;
    // Create wrapper div that mirrors Obsidian's structure
    this.settingGroupEl = document.createElement('div');
    this.settingGroupEl.classList.add('setting-group');
    // Create .setting-items container inside wrapper
    this.settingItemsEl = document.createElement('div');
    this.settingItemsEl.classList.add('setting-items');
    this.settingGroupEl.appendChild(this.settingItemsEl);
    // Append to parent container
    this.containerEl.appendChild(this.settingGroupEl);
  }

  setHeading = vi.fn((heading: string | DocumentFragment) => {
    const headingEl = document.createElement('div');
    headingEl.classList.add('setting-item-heading');
    if (typeof heading === 'string') {
      headingEl.textContent = heading;
    } else {
      headingEl.appendChild(heading);
    }
    this.settingGroupEl.insertBefore(headingEl, this.settingItemsEl);
    return this;
  });

  addClass = vi.fn((className: string) => {
    this.settingGroupEl.classList.add(className);
    return this;
  });

  addSetting = vi.fn((cb: (setting: Setting) => void) => {
    const setting = new Setting(this.settingItemsEl);
    cb(setting);
    return this;
  });
}

// Helper to create mock component with basic properties
function createMockComponent() {
  let value: any = '';
  let disabled = false;
  const component: any = {
    setValue: vi.fn((v: any) => {
      value = v;
      return component;
    }),
    getValue: vi.fn(() => value),
    setDisabled: vi.fn((d: boolean) => {
      disabled = d;
      return component;
    }),
    onChange: vi.fn().mockReturnValue(component),
    setPlaceholder: vi.fn().mockReturnValue(component),
    setButtonText: vi.fn().mockReturnValue(component),
    onClick: vi.fn().mockReturnValue(component),
    setTooltip: vi.fn().mockReturnValue(component),
    setIcon: vi.fn().mockReturnValue(component),
    addOption: vi.fn().mockReturnValue(component),
    addOptions: vi.fn().mockReturnValue(component),
    setLimits: vi.fn().mockReturnValue(component),
    setDynamicTooltip: vi.fn().mockReturnValue(component),
    showTooltip: vi.fn().mockReturnValue(component),
  };
  return component;
}

// Mock Setting class
export class Setting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;
  components: any[] = [];

  constructor(containerEl: HTMLElement) {
    this.settingEl = document.createElement('div');
    this.settingEl.classList.add('setting-item');
    this.infoEl = document.createElement('div');
    this.infoEl.classList.add('setting-item-info');
    this.nameEl = document.createElement('div');
    this.nameEl.classList.add('setting-item-name');
    this.descEl = document.createElement('div');
    this.descEl.classList.add('setting-item-description');
    this.controlEl = document.createElement('div');
    this.controlEl.classList.add('setting-item-control');
    // Build structure
    this.infoEl.appendChild(this.nameEl);
    this.infoEl.appendChild(this.descEl);
    this.settingEl.appendChild(this.infoEl);
    this.settingEl.appendChild(this.controlEl);
    // Append to container
    containerEl.appendChild(this.settingEl);
  }

  setName = vi.fn((name: string | DocumentFragment) => {
    if (typeof name === 'string') {
      this.nameEl.textContent = name;
    } else {
      this.nameEl.textContent = '';
      this.nameEl.appendChild(name);
    }
    return this;
  });

  setDesc = vi.fn((desc: string | DocumentFragment) => {
    if (typeof desc === 'string') {
      this.descEl.textContent = desc;
    } else {
      this.descEl.textContent = '';
      this.descEl.appendChild(desc);
    }
    return this;
  });

  setHeading = vi.fn().mockReturnThis();
  setClass = vi.fn().mockReturnThis();
  setDisabled = vi.fn().mockReturnThis();
  setTooltip = vi.fn().mockReturnThis();

  clear = vi.fn(() => {
    this.components = [];
    this.controlEl.innerHTML = '';
    return this;
  });

  addButton = vi.fn((cb: (component: any) => void) => {
    const component = createMockComponent();
    cb(component);
    this.components.push(component);
    return this;
  });

  addToggle = vi.fn((cb: (component: any) => void) => {
    const component = createMockComponent();
    cb(component);
    this.components.push(component);
    return this;
  });

  addText = vi.fn((cb: (component: any) => void) => {
    const component = createMockComponent();
    cb(component);
    this.components.push(component);
    return this;
  });

  addTextArea = vi.fn((cb: (component: any) => void) => {
    const component = createMockComponent();
    cb(component);
    this.components.push(component);
    return this;
  });

  addDropdown = vi.fn((cb: (component: any) => void) => {
    const component = createMockComponent();
    cb(component);
    this.components.push(component);
    return this;
  });

  addSlider = vi.fn((cb: (component: any) => void) => {
    const component = createMockComponent();
    cb(component);
    this.components.push(component);
    return this;
  });

  addExtraButton = vi.fn((cb: (component: any) => void) => {
    const component = createMockComponent();
    cb(component);
    this.components.push(component);
    return this;
  });

  then = vi.fn().mockReturnThis();
}

// Mock Menu class
export class Menu {
  addItem = vi.fn((cb: (item: any) => void) => {
    const item = {
      setTitle: vi.fn().mockReturnThis(),
      setIcon: vi.fn().mockReturnThis(),
      onClick: vi.fn().mockReturnThis(),
      setDisabled: vi.fn().mockReturnThis(),
      setChecked: vi.fn().mockReturnThis(),
      setSection: vi.fn().mockReturnThis(),
      setWarning: vi.fn().mockReturnThis(),
    };
    cb(item);
    return this;
  });
  addSeparator = vi.fn().mockReturnThis();
  showAtMouseEvent = vi.fn();
  showAtPosition = vi.fn();
  hide = vi.fn();
  close = vi.fn();
  onHide = vi.fn();
}

// Mock AbstractInputSuggest class
export class AbstractInputSuggest<T> {
  app: App;
  inputEl: HTMLInputElement | HTMLDivElement;
  limit: number = 100;

  constructor(app: App, inputEl: HTMLInputElement | HTMLDivElement) {
    this.app = app;
    this.inputEl = inputEl;
  }

  getSuggestions = vi.fn().mockReturnValue([]);
  renderSuggestion = vi.fn();
  selectSuggestion = vi.fn();
  close = vi.fn();
  open = vi.fn();
  setValue = vi.fn();
  getValue = vi.fn().mockReturnValue('');
  onSelect = vi.fn().mockReturnThis();
}

// Mock utility functions
export const normalizePath = vi.fn((path: string) => {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
});

export const setIcon = vi.fn((el: HTMLElement, icon: string) => {
  el.setAttribute('data-icon', icon);
});

export const getFrontMatterInfo = vi.fn(() => {
  // Default: no frontmatter (tests will mock specific return values)
  return {
    exists: false,
    frontmatter: '',
    from: 0,
    to: 0,
    contentStart: 0,
  };
});

export const parseYaml = vi.fn((yaml: string) => {
  try {
    return {};
  } catch {
    return null;
  }
});

export const stringifyYaml = vi.fn((obj: any) => {
  return '';
});

// Mock moment (from moment.js)
export const moment = Object.assign(
  vi.fn((date?: any) => {
    return {
      format: vi.fn().mockReturnValue('2024-01-01'),
      fromNow: vi.fn().mockReturnValue('a few seconds ago'),
      locale: vi.fn().mockReturnThis(),
      isValid: vi.fn().mockReturnValue(true),
    };
  }),
  {
    locale: vi.fn(),
    locales: vi.fn().mockReturnValue([]),
  }
);

// Mock platform detection
export const Platform = {
  isMobile: false,
  isDesktop: true,
  isDesktopApp: true,
  isMobileApp: false,
  isPhone: false,
  isTablet: false,
  isMacOS: false,
  isWin: false,
  isLinux: true,
  isIosApp: false,
  isAndroidApp: false,
  isSafari: false,
};

// Mock getLanguage function (added in Obsidian 1.8.0)
export const getLanguage = vi.fn().mockReturnValue('en');

// Mock requireApiVersion function (checks Obsidian version)
export const requireApiVersion = vi.fn().mockReturnValue(true);

// Mock request for web requests
export const request = vi.fn().mockResolvedValue('');
export const requestUrl = vi.fn().mockResolvedValue({
  status: 200,
  headers: {},
  arrayBuffer: new ArrayBuffer(0),
  json: {},
  text: '',
});

// Helper interface for ViewWithFileEditor
export interface ViewWithFileEditor {
  file: TFile | null;
  editor?: Editor;
}

// Export default mock app instance for convenience
export const mockApp = new App();
