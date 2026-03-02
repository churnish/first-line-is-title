# Test suite

## Structure

```
test/
├── README.md           # This file
├── mockObsidian.ts     # Mock implementation of Obsidian API
├── setup.ts            # Test environment setup
├── testUtils.ts        # Helper functions for tests
├── core/               # Core module tests
│   ├── cache-manager.test.ts
│   ├── rate-limiter.test.ts
│   └── rename-engine.test.ts
├── utils/              # Utility module tests
│   ├── content-reader.test.ts
│   ├── debug.test.ts
│   ├── file-exclusions.test.ts
│   ├── string-processing.test.ts
│   └── tag-utils.test.ts
├── i18n.test.ts
└── utils.test.ts
```

## Running tests

```bash
npm test                                    # all tests
npm run test:watch                          # watch mode
npm run test:coverage                       # with coverage
npm test -- string-processing.test.ts       # specific file
npm test -- -t "should handle forbidden"    # pattern match
npm test -- --reporter=verbose              # verbose output
```

### CI/CD

Tests run automatically on push via GitHub Actions (Node 18 & 20).

---

## Coverage

### Core modules

| Module        | Tests | Coverage                                                                                           |
| ------------- | ----- | -------------------------------------------------------------------------------------------------- |
| Rename Engine | 60    | Rate limiting, frontmatter stripping, title extraction, cache management, editor change processing |
| Cache Manager | 52    | LRU cache, path reservation, file existence cache, lock management                                 |
| Rate Limiter  | 60    | Per-key/global limits, time windows, expiration, performance                                       |
| i18n          | 80    | Locale switching, translations, variable replacement, English/Russian plurals                      |

### Utility modules

| Module            | Tests | Coverage                                                                    |
| ----------------- | ----- | --------------------------------------------------------------------------- |
| String Processing | 45    | Forbidden chars, replacements, safe links, maxLength                        |
| File Exclusions   | 85    | Folders (+subfolders), tags (frontmatter + inline), properties, strategies  |
| Tag Utilities     | 63    | Normalization, YAML parsing, frontmatter stripping, child tag matching      |
| Content Reader    | 48    | All read strategies (Editor/Cache/File), workspace search, popover handling |
| Core Utilities    | 42    | Logging, headings, safewords, disable properties                            |
| Debug Utilities   | 41    | Setting logs, content output, dumps                                         |

**Total: 490+ tests**

### Not yet tested

- Alias Manager (frontmatter manipulation)
- Property Manager
- File Operations (batch operations)
- Title Insertion (editor integration)
- Link Manager
- Settings UI / Modals / Context Menus

---

## Writing tests

### Basic structure

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { functionToTest } from '../src/module';
import { createTestSettings } from './testUtils';

describe('module-name', () => {
  let settings: PluginSettings;

  beforeEach(() => {
    settings = createTestSettings();
  });

  it('should do something', () => {
    const result = functionToTest('input', settings);
    expect(result).toBe('expected');
  });
});
```

### Using mock Obsidian API

```typescript
import { TFile, App } from './mockObsidian';
import { createMockFile, createMockApp } from './testUtils';

const file = createMockFile('test.md');
const app = createMockApp();

// Mock vault methods
app.vault.read = vi.fn().mockResolvedValue('file content');
app.vault.rename = vi.fn().mockResolvedValue(undefined);

// Mock metadata cache
app.metadataCache.getFileCache = vi.fn().mockReturnValue({
  frontmatter: { tags: ['test'] },
});
```

### Async functions

```typescript
it('should handle async operations', async () => {
  app.vault.read = vi.fn().mockResolvedValue('content');
  const result = await readFileContent(plugin, file);
  expect(result).toBe('content');
});
```

### Error handling

```typescript
it('should handle errors', async () => {
  app.vault.read = vi.fn().mockRejectedValue(new Error('Read failed'));
  await expect(readFileContent(plugin, file)).rejects.toThrow('Read failed');
});
```

---

## Test utilities

### `createTestSettings(overrides?)`

```typescript
const settings = createTestSettings({
  core: { renameNotes: 'manually' },
});
```

### `createMockFile(path)`

```typescript
const file = createMockFile('folder/note.md');
// file.path = 'folder/note.md'
// file.basename = 'note'
// file.extension = 'md'
```

### `createMockApp()`

```typescript
const app = createMockApp();
// Includes vault, metadataCache, workspace, fileManager
```

### `createMockFolder(path)`

```typescript
const folder = createMockFolder('Notes');
```

---

## Best practices

1. **Naming**: Use `.test.ts` suffix
2. **Descriptive names**: Clear `describe` and `it` descriptions
3. **Arrange-Act-Assert**: Setup, execution, verification
4. **Focused tests**: One assertion per test when possible
5. **Mock external deps**: Use mocks for Obsidian API
6. **Test edge cases**: Empty strings, null, undefined, errors
7. **Fresh state**: Use `beforeEach` for consistent test state

### Good test

```typescript
it('should replace slash with dash when enabled', () => {
  settings.replaceCharacters.charReplacements.slash.enabled = true;
  settings.replaceCharacters.charReplacements.slash.replacement = '-';

  const result = processForbiddenChars('hello/world', settings);

  expect(result).toBe('hello-world');
});
```

### Bad test

```typescript
it('should work', () => {
  const result = processForbiddenChars('hello/world', settings);
  expect(result).toBeTruthy(); // Too vague
});
```

---

## Common pitfalls

**Forgetting async/await**

```typescript
// Wrong
const result = readFileContent(plugin, file);

// Correct
const result = await readFileContent(plugin, file);
```

**Not mocking API calls**

```typescript
// Will fail - no mock
const cache = app.metadataCache.getFileCache(file);

// Correct
app.metadataCache.getFileCache = vi.fn().mockReturnValue({...});
```

**Shared state between tests**

```typescript
// Wrong - mutates shared object
let settings = createTestSettings();
it('test 1', () => {
  settings.core.renameNotes = 'manually';
});
it('test 2', () => {
  /* settings is mutated */
});

// Correct - fresh state
let settings: PluginSettings;
beforeEach(() => {
  settings = createTestSettings();
});
```

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Obsidian API](https://github.com/obsidianmd/obsidian-api)
