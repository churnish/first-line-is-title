// This file is byte-identical across every plugin in the workspace and must stay generic: capability gates are feature-detected rather than hardcoded, so the same bytes work in the JS-only plugins.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { basename, dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const run = (command) => execSync(command, { stdio: 'inherit' });
const capture = (command) => execSync(command, { encoding: 'utf8' }).trim();
const captureLines = (command) => capture(command).split('\n').filter(Boolean);
const gitAdd = (path) => run(`git add "${path}"`);
const commandSucceeds = (command) => {
  try {
    execSync(command, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const isPreflight = process.argv.includes('--preflight');
const targetVersion = process.env.npm_package_version;

// GitHub is the source of truth for these: they are edited through the web UI, so their content is taken from origin whole rather than reconciled hunk by hunk. Local edits to them are expected to be overwritten — edit them in the web editor, not here.
const WEB_EDITED_DOCS = ['README', 'CONTRIBUTING'];

function isMergeInProgress() {
  return commandSucceeds('git rev-parse -q --verify MERGE_HEAD');
}

// `resolveFromOrigin` is every prefix-matching path in origin's tree, conflicted or not: the release takes these docs from origin whole, and the checkout doubles as the conflict resolution.
export function classifyConflicts(conflicted, originFiles, prefixes) {
  const matchesPrefix = (file) =>
    prefixes.some((prefix) => file.startsWith(prefix));
  return {
    resolveFromOrigin: originFiles.filter(matchesPrefix),
    unexpected: conflicted.filter((file) => !matchesPrefix(file)),
  };
}

function abortOnUnexpectedConflicts(unexpected) {
  if (unexpected.length === 0) return;
  run('git merge --abort');
  console.error(
    `\n⚠ Unexpected merge conflicts: ${unexpected.join(', ')}. The merge has been aborted; resolve manually before releasing.\n`
  );
  process.exit(1);
}

function mergeOriginMain() {
  // Matches npm's own clean check (`git status --porcelain=v1 -uno`), which ignores untracked files. Using the stricter default would skip the merge on a stray scratch file, and the release would then fail at postversion with a non-fast-forward push.
  const dirty = capture('git status --porcelain -uno');
  if (dirty) {
    console.warn(
      '\n⚠ Working tree is not clean; skipping the origin/main merge.\n'
    );
    return;
  }

  // Only the fetch is allowed to fail softly — an offline release can still proceed, but every step after it leaves repository state behind and must surface.
  try {
    run('git fetch origin');
  } catch (err) {
    console.warn(`\n⚠ Could not fetch origin: ${err.message}\n`);
    return;
  }

  // Merging rather than copying keeps the web-edit commits in local history, which is what lets postversion fast-forward instead of force-pushing over them.
  try {
    run('git merge origin/main --no-commit --no-ff');
  } catch {
    // Expected whenever both sides touched these files; resolved just below.
  }

  const conflicted = captureLines('git diff --name-only --diff-filter=U');
  // Read before the abort decision because the classification needs both lists. ls-tree is read-only and reads the origin tree, so it works mid-merge.
  // Filtered rather than pathspec'd: ls-tree does not support glob pathspecs and returns an empty list for one instead of failing, which would silently stop syncing both files.
  const originFiles = captureLines('git ls-tree --name-only origin/main');

  // A conflict anywhere else means the histories diverged in a way this script has no business resolving unattended.
  const { resolveFromOrigin, unexpected } = classifyConflicts(
    conflicted,
    originFiles,
    WEB_EDITED_DOCS
  );
  abortOnUnexpectedConflicts(unexpected);

  // `git checkout <tree-ish> -- <path>` writes the index as well as the worktree, resolving a conflicted path outright, so no separate `git add` is needed.
  for (const file of resolveFromOrigin) {
    run(`git checkout origin/main -- "${file}"`);
    console.log(`Updated ${file} from GitHub`);
  }

  // MERGE_HEAD is absent when origin had nothing new. Committing here keeps the merge as its own commit rather than folding it into npm's version commit.
  if (isMergeInProgress()) {
    run('git commit --no-edit');
    console.log('Merged origin/main');
  }

  // A conflict git could not stage — "deleted by them", say — leaves the merge live without ever appearing in the unexpected list. Releasing from that state strands a half-merged tree with no tag.
  if (isMergeInProgress()) {
    console.error(
      '\n⚠ A merge is still in progress after resolution. Resolve it manually before releasing.\n'
    );
    process.exit(1);
  }
}

// Classifies `npm outdated --json` output. 'unknown' means the probe itself failed — a registry or network error exits non-zero exactly like a real "outdated" result does.
export function readOutdated(stdout, packageName) {
  let info;
  try {
    const entry = JSON.parse(stdout)[packageName];
    // npm emits an array under a package key when one name has several outdated entries.
    info = Array.isArray(entry) ? entry[0] : entry;
  } catch {
    return { status: 'unknown' };
  }
  // An absent key means npm found nothing outdated for this package, not that the probe failed.
  if (!info) return { status: 'current' };
  return {
    status: info.current === info.latest ? 'current' : 'outdated',
    info,
  };
}

// release.yml installs with no lockfile, so CI resolves the newest version inside every range. The gates have to run against that same tree — gating a staler local one is what let 82 lint errors reach CI after the tag was already pushed.
// npm resolves upward to the workspace root from here, so these commands reify the shared tree — the AGENTS.md prohibition carves this out explicitly.
function updateDependencies() {
  // Everything else moves within its declared range, which is what CI's fresh install resolves to anyway. An interactive confirmation prompt was removed from here: it ran after the gates, so nothing re-checked what it changed, and it blocked on stdin.
  console.log('\n▶ Updating dependencies');
  run('npm update');

  let outdated = { status: 'current' };
  // `npm outdated` exits non-zero when something IS outdated, so the catch is the normal path and the try body's value is discarded. `encoding` is what makes err.stdout a parseable string rather than a Buffer.
  try {
    capture('npm outdated eslint-plugin-obsidianmd --json');
  } catch (err) {
    outdated = readOutdated(err.stdout, 'eslint-plugin-obsidianmd');
    if (outdated.status === 'unknown') {
      console.warn(
        `\n⚠ Could not read npm outdated; the eslint-plugin freshness check did not run.\n${err.stderr || ''}`
      );
    }
  }

  if (outdated.status === 'outdated') {
    const { info } = outdated;
    console.log(
      `\nUpdating eslint-plugin-obsidianmd: ${info.current} → ${info.latest}`
    );
    // Not `npm update`: that is capped by the declared range, and a caret on a 0.x version admits patch bumps only — so it can never cross the minor bumps that are this package's release cadence.
    // `--no-save` keeps package.json clean so a failed gate leaves no dirty tree to block the retry — `npm version` refuses to start on one. The version phase writes the range from the installed copy. Runs after `npm update` because that would otherwise pull the install back inside the declared range.
    run('npm install --save-dev eslint-plugin-obsidianmd@latest --no-save');
  }
}

// Both npm commands above reify the hoisted workspace, not just this plugin, so a failure after them has left the other members and the root lockfile changed.
function warnWorkspaceMutated() {
  console.error(
    'Dependencies were already updated: the shared workspace node_modules and the root package-lock.json have changed.\n'
  );
}

// ── Pre-flight checks ──

function runPreflight() {
  // postversion pushes `main` by name, so releasing from anywhere else tags a commit that main does not contain and pushes a stale main alongside it.
  const branch = capture('git rev-parse --abbrev-ref HEAD');
  if (branch !== 'main') {
    console.error(`\n⚠ On branch ${branch}. Releases must be cut from main.\n`);
    process.exit(1);
  }

  // Merge before the gates so they run against exactly what gets tagged. This is the only point in the lifecycle with a clean tree — once the `version` script runs, npm has already rewritten package.json and git merge refuses to overwrite it.
  mergeOriginMain();

  // Refresh before gating, never after: the gates must judge the tree that will actually be built.
  updateDependencies();

  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

  // Applied here rather than in eslint.config.js so console.log stays available during development but never ships in a release.
  const releaseLintRule =
    'no-console: ["error", {"allow": ["warn","error","debug"]}]';

  // release.yml re-runs these, but only once postversion has pushed the tag — and a failure there strands a tag with no release attached. Gating here fails the bump while there is still nothing to roll back.
  const gates = [
    {
      label: 'ESLint',
      command: `npx eslint . --rule '${releaseLintRule}'`,
      hint: 'Fix lint errors (or ungated console.log) before releasing.',
    },
    // esbuild strips types without checking them, so nothing else catches a type error before it ships. JS-only plugins carry no tsconfig.
    ...(existsSync('tsconfig.json')
      ? [{ label: 'Typecheck', command: 'npx tsc --noEmit' }]
      : []),
    // Only two plugins carry a test suite.
    ...(pkg.scripts?.test ? [{ label: 'Tests', command: 'npm test' }] : []),
    { label: 'Build', command: 'npm run build' },
  ];

  for (const gate of gates) {
    console.log(`\n▶ ${gate.label}`);
    try {
      run(gate.command);
    } catch {
      console.error(
        `\n⚠ ${gate.label} failed.${gate.hint ? ` ${gate.hint}` : ''}\n`
      );
      warnWorkspaceMutated();
      process.exit(1);
    }
  }

  // No `process.exit(0)` on the success path: returning lets Node exit naturally and flush stdout, which a pipe would otherwise truncate.
  console.log('\n✓ All pre-flight gates passed.\n');
}

// ── Version phase ──

// Runs only after npm has rewritten package.json's version field.
function runVersionPhase() {
  if (!targetVersion) {
    console.error('\n⚠ npm_package_version is not set. Run via npm version.\n');
    process.exit(1);
  }

  // ── Sync shared docs ──

  const __dirname = dirname(fileURLToPath(import.meta.url));
  // Source of truth for docs copied verbatim into every plugin. Not the odkb repo: these describe this workspace's own release machinery, not shared Obsidian knowledge.
  const sharedDocsDir = join(__dirname, '..', 'local');

  const sharedDocs = ['release-guide.md'];
  for (const doc of sharedDocs) {
    const src = join(sharedDocsDir, doc);
    if (existsSync(src)) {
      const dest = join('docs', doc);
      writeFileSync(dest, readFileSync(src, 'utf8'));
      gitAdd(dest);
      console.log(`Synced ${doc} from local/`);
    } else {
      console.warn(`Skipping ${doc}: not found at ${src}`);
    }
  }

  // npm hoists most packages to the workspace root and nests only what cannot hoist, so look upward rather than assuming either location.
  function installedVersion(packageName) {
    let dir = process.cwd();
    for (;;) {
      const candidate = join(dir, 'node_modules', packageName, 'package.json');
      if (existsSync(candidate)) {
        return JSON.parse(readFileSync(candidate, 'utf8')).version;
      }
      const parent = dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }

  // Applied here because preflight installs with `--no-save`, keeping the tree clean through the gates; this phase persists the range from the installed copy.
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const installed = installedVersion('eslint-plugin-obsidianmd');
  const declared = pkg.devDependencies?.['eslint-plugin-obsidianmd'];
  if (installed && declared && declared !== `^${installed}`) {
    pkg.devDependencies['eslint-plugin-obsidianmd'] = `^${installed}`;
    writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    gitAdd('package.json');
    console.log(`Updated eslint-plugin-obsidianmd range to ^${installed}`);
  }

  const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
  manifest.version = targetVersion;
  writeFileSync('manifest.json', JSON.stringify(manifest, null, '\t') + '\n');
  gitAdd('manifest.json');

  const versions = existsSync('versions.json')
    ? JSON.parse(readFileSync('versions.json', 'utf8'))
    : {};
  const lastMinVersion = Object.values(versions).pop();
  if (lastMinVersion !== manifest.minAppVersion) {
    versions[targetVersion] = manifest.minAppVersion;
    writeFileSync('versions.json', JSON.stringify(versions, null, '\t') + '\n');
    gitAdd('versions.json');
    console.log(`Updated versions.json for ${targetVersion}`);
  }

  console.log(`Updated manifest.json to version ${targetVersion}`);

  const pluginName = basename(__dirname);
  const deepwikiPlugins = ['dynamic-views', 'first-line-is-title'];
  if (deepwikiPlugins.includes(pluginName)) {
    console.log(
      `\n🔄 After release, refresh the wiki: https://deepwiki.com/churnish/${pluginName}\n`
    );
  }
}

// Dispatch only when executed directly: importing the module for its predicates must not run a release. `npm test` sets npm_package_version, so an unguarded dispatch would have a vitest worker execute the version phase for real.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (isPreflight) runPreflight();
  else runVersionPhase();
}
