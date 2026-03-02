// eslint.config.mjs
// Uses obsidianmd recommended config
import tsparser from '@typescript-eslint/parser';
import { defineConfig } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';

export default defineConfig([
  ...obsidianmd.configs.recommended,
  // Disable ban-dependencies for package.json (builtin-modules needed for esbuild)
  {
    files: ['package.json'],
    rules: {
      'depend/ban-dependencies': 'off',
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
      },
      globals: {
        ...globals.browser,
        NodeJS: 'readonly',
      },
    },
    rules: {
      // Disable no-unsafe-* (not in Obsidian scanner, too strict for frontmatter/dynamic property access)
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    ignores: [
      'node_modules/**',
      'main.js',
      '*.config.mjs',
      'version-bump.mjs',
      'tests/**',
      'vitest.config.ts',
    ],
  },
]);
