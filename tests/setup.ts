/**
 * Test setup file
 * Runs before all tests to configure the test environment
 */

import { vi } from 'vitest';
import { JSDOM } from 'jsdom';

// Setup DOM environment for tests that need it
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
});

global.document = dom.window.document as any;
global.window = dom.window as any;

// Use defineProperty for navigator since it's read-only in newer Node.js
Object.defineProperty(global, 'navigator', {
  value: dom.window.navigator,
  writable: true,
  configurable: true,
});

global.HTMLElement = dom.window.HTMLElement as any;
global.Element = dom.window.Element as any;
global.Node = dom.window.Node as any;

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
