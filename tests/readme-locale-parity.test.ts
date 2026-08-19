/**
 * Guards the READMEs' command tables against drifting from the locale files.
 *
 * README.md and README_RU.md each list every command in three Markdown tables under
 * "## Commands" ("## Команды"), and several of those tables' description cells
 * bold-reference a setting by name (e.g. "Toggle the **Rename automatically** setting.").
 * Both are copies of strings that already live in the locale files, and nothing ties the
 * copies together — a locale rename (a command's name, or a setting's name/tab title)
 * leaves the README describing a command or setting that no longer exists under that
 * name, and nothing else in the suite would notice. That is exactly how audit finding
 * §4.3.2 happened: a setting was renamed from "Rename notes" (a dropdown) to the boolean
 * "Rename automatically" and the README kept describing the old control for a long time.
 *
 * Scope: only the three command tables under "## Commands" are parsed. Each row's first
 * column (the command name) must match a value somewhere under the locale's `commands`
 * tree, and every bold span (`**...**`) found inside those tables must match some value
 * anywhere in the locale file. This deliberately ignores bold text everywhere else in the
 * README — the plugin name, the **TIP:** and **Note:** callouts, install-step button
 * labels borrowed from BRAT's own UI, prose emphasis like the backup warning. Those are
 * not this plugin's UI labels, and checking them would fail the test on unrelated wording
 * instead of on real drift.
 *
 * Does NOT cover: settings named in running prose outside the command tables (e.g. the
 * Features list), non-bold setting references, or wording that paraphrases a locale
 * string rather than quoting it verbatim.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(__dirname, '..');

function loadLocale(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(ROOT, 'locale', `${name}.json`), 'utf-8')
  );
}

function loadReadme(name: string): string {
  // Normalize line endings up front so the heading/table matching below only ever has to
  // reason about "\n" — a CRLF checkout would otherwise leave a stray "\r" glued to every
  // heading and cell, breaking the "^...$" heading match and every cell's trimmed text.
  return readFileSync(join(ROOT, name), 'utf-8').replace(/\r\n/g, '\n');
}

/** Flattens a nested locale object to its leaf string values. */
function leafValues(obj: unknown): string[] {
  if (obj === null || typeof obj !== 'object') {
    return typeof obj === 'string' ? [obj] : [];
  }
  return Object.values(obj as Record<string, unknown>).flatMap(leafValues);
}

/**
 * Slices out the "## Commands" / "## Команды" section (up to the next "## " heading, or
 * end of file) — the three command tables live there and nowhere else in the README.
 */
function commandsSection(readme: string): string {
  const start = readme.search(/^## (Commands|Команды)\s*$/m);
  if (start === -1) return '';
  const rest = readme.slice(start + 1);
  const next = rest.search(/^## /m);
  return next === -1
    ? readme.slice(start)
    : readme.slice(start, start + 1 + next);
}

/**
 * Extracts every table's data rows within `section`. A row is a header — and is skipped,
 * along with the separator line beneath it — exactly when the next line is a
 * `|---|---|`-style separator, which is true for the first row of every Markdown table.
 * That rule alone walks all three tables in one pass without needing to know where one
 * table ends and the next begins.
 */
function tableDataRows(section: string): { name: string; raw: string }[] {
  const lines = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|'));
  const isSeparator = (line: string) => /^\|[\s:|-]+\|$/.test(line);

  const rows: { name: string; raw: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isSeparator(lines[i]) || isSeparator(lines[i + 1] ?? '')) continue;
    rows.push({ name: lines[i].slice(1).split('|')[0].trim(), raw: lines[i] });
  }
  return rows;
}

function boldSpans(text: string): string[] {
  return [...text.matchAll(/\*\*([^*]+)\*\*/g)].map(([, span]) => span);
}

const readmes = [
  { file: 'README.md', locale: 'en' },
  { file: 'README_RU.md', locale: 'ru' },
];

describe('README command tables', () => {
  for (const { file, locale: localeName } of readmes) {
    const rows = tableDataRows(commandsSection(loadReadme(file)));
    const locale = loadLocale(localeName);
    const commandNames = new Set(leafValues(locale.commands));
    const localeValues = new Set(leafValues(locale));

    it(`${file}: has command tables to check`, () => {
      // If the heading text or table shape ever changes enough that extraction finds
      // nothing, the two checks below pass vacuously — this is what actually catches
      // that, instead of the guard quietly going blind.
      expect(rows.length).toBeGreaterThan(0);
    });

    it(`${file}: every command table name matches a locale command`, () => {
      const unmatched = [...new Set(rows.map((row) => row.name))].filter(
        (name) => !commandNames.has(name)
      );
      expect(unmatched).toEqual([]);
    });

    it(`${file}: every bold reference in the command tables matches a locale value`, () => {
      const unmatched = [
        ...new Set(rows.flatMap((row) => boldSpans(row.raw))),
      ].filter((span) => !localeValues.has(span));
      expect(unmatched).toEqual([]);
    });
  }
});
