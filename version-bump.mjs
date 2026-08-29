// This file is byte-identical across every plugin in the workspace and must stay generic: capability gates are feature-detected rather than hardcoded, so the same bytes work in the JS-only plugins.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const isPreflight = process.argv.includes('--preflight');
const targetVersion = process.env.npm_package_version;

// GitHub is the source of truth for these: they are edited through the web UI, so their content is taken from origin whole rather than reconciled hunk by hunk. Local edits to them are expected to be overwritten — edit them in the web editor, not here.
const WEB_EDITED_DOCS = ['README', 'CONTRIBUTING'];

function isMergeInProgress() {
  try {
    execSync('git rev-parse -q --verify MERGE_HEAD', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function mergeOriginMain() {
  // Matches npm's own clean check (`git status --porcelain=v1 -uno`), which ignores untracked files. Using the stricter default would skip the merge on a stray scratch file, and the release would then fail at postversion with a non-fast-forward push.
  const dirty = execSync('git status --porcelain -uno', {
    encoding: 'utf8',
  }).trim();
  if (dirty) {
    console.warn(
      '\n⚠ Working tree is not clean; skipping the origin/main merge.\n'
    );
    return;
  }

  // Only the fetch is allowed to fail softly — an offline release can still proceed, but every step after it leaves repository state behind and must surface.
  try {
    execSync('git fetch origin', { stdio: 'inherit' });
  } catch (err) {
    console.warn(`\n⚠ Could not fetch origin: ${err.message}\n`);
    return;
  }

  // Merging rather than copying keeps the web-edit commits in local history, which is what lets postversion fast-forward instead of force-pushing over them.
  try {
    execSync('git merge origin/main --no-commit --no-ff', { stdio: 'inherit' });
  } catch {
    // Expected whenever both sides touched these files; resolved just below.
  }

  const conflicted = execSync('git diff --name-only --diff-filter=U', {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);

  // A conflict anywhere else means the histories diverged in a way this script has no business resolving unattended.
  const unexpected = conflicted.filter(
    (f) => !WEB_EDITED_DOCS.some((prefix) => f.startsWith(prefix))
  );
  if (unexpected.length > 0) {
    execSync('git merge --abort', { stdio: 'inherit' });
    console.error(
      `\n⚠ Unexpected merge conflicts: ${unexpected.join(', ')}. The merge has been aborted; resolve manually before releasing.\n`
    );
    process.exit(1);
  }

  // `git checkout <tree-ish> -- <path>` writes the index as well as the worktree, resolving a conflicted path outright, so no separate `git add` is needed.
  // Filtered here rather than by a pathspec: ls-tree does not support glob pathspecs and returns an empty list for one instead of failing, which would silently stop syncing both files.
  const files = execSync('git ls-tree --name-only origin/main', {
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => WEB_EDITED_DOCS.some((prefix) => f.startsWith(prefix)));
  for (const file of files) {
    execSync(`git checkout origin/main -- "${file}"`, { stdio: 'inherit' });
    console.log(`Updated ${file} from GitHub`);
  }

  // MERGE_HEAD is absent when origin had nothing new. Committing here keeps the merge as its own commit rather than folding it into npm's version commit.
  if (isMergeInProgress()) {
    execSync('git commit --no-edit', { stdio: 'inherit' });
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

// release.yml installs with no lockfile, so CI resolves the newest version inside every range. The gates have to run against that same tree — gating a staler local one is what let 82 lint errors reach CI after the tag was already pushed.
function updateDependencies() {
  let info;
  let probeFailed = false;
  // `npm outdated` exits non-zero when something IS outdated, so the catch is the normal path and the try body's value is discarded. `encoding` is what makes err.stdout a parseable string rather than a Buffer.
  try {
    execSync('npm outdated eslint-plugin-obsidianmd --json', {
      encoding: 'utf8',
    });
  } catch (err) {
    try {
      const entry = JSON.parse(err.stdout)['eslint-plugin-obsidianmd'];
      // npm emits an array under a package key when one name has several outdated entries.
      info = Array.isArray(entry) ? entry[0] : entry;
    } catch {
      // A registry or network failure exits non-zero too, and would otherwise be indistinguishable from "nothing outdated".
      probeFailed = true;
      console.warn(
        `\n⚠ Could not read npm outdated; the eslint-plugin freshness check did not run.\n${err.stderr || ''}`
      );
    }
  }

  if (!probeFailed && info && info.current !== info.latest) {
    console.log(
      `\nUpdating eslint-plugin-obsidianmd: ${info.current} → ${info.latest}`
    );
    // Not `npm update`: that is capped by the declared range, and a caret on a 0.x version admits patch bumps only — so it can never cross the minor bumps that are this package's release cadence.
    // The declared range is deliberately NOT staged here. npm snapshots package.json before preversion and writes that snapshot back afterwards, so any edit made now is discarded — the version phase re-applies it instead.
    execSync('npm install --save-dev eslint-plugin-obsidianmd@latest', {
      stdio: 'inherit',
    });
  }

  // Everything else moves within its declared range, which is what CI's fresh install resolves to anyway. An interactive confirmation prompt was removed from here: it ran after the gates, so nothing re-checked what it changed, and it blocked on stdin.
  console.log('\n▶ Updating dependencies');
  execSync('npm update', { stdio: 'inherit' });
}

// Both npm commands above reify the hoisted workspace, not just this plugin, so a failure after them has left the other members and the root lockfile changed.
function warnWorkspaceMutated() {
  console.error(
    'Dependencies were already updated: the shared workspace node_modules and the root package-lock.json have changed.\n'
  );
}

// ── Pre-flight checks ──

if (isPreflight) {
  // postversion pushes `main` by name, so releasing from anywhere else tags a commit that main does not contain and pushes a stale main alongside it.
  const branch = execSync('git rev-parse --abbrev-ref HEAD', {
    encoding: 'utf8',
  }).trim();
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
      execSync(gate.command, { stdio: 'inherit' });
    } catch {
      console.error(
        `\n⚠ ${gate.label} failed.${gate.hint ? ` ${gate.hint}` : ''}\n`
      );
      warnWorkspaceMutated();
      process.exit(1);
    }
  }

  console.log('\n✓ All pre-flight gates passed.\n');
  // Pre-flight ends here. Everything below runs only in the `version` phase, after npm has rewritten package.json's version field.
  process.exit(0);
}

// ── Version phase ──

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
    execSync(`git add "${dest}"`, { stdio: 'inherit' });
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

// Re-applied here because npm discarded the range preflight installed: it snapshots package.json before preversion and writes that snapshot back before running this phase.
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const installed = installedVersion('eslint-plugin-obsidianmd');
const declared = pkg.devDependencies?.['eslint-plugin-obsidianmd'];
if (installed && declared && declared !== `^${installed}`) {
  pkg.devDependencies['eslint-plugin-obsidianmd'] = `^${installed}`;
  writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  execSync('git add package.json', { stdio: 'inherit' });
  console.log(`Updated eslint-plugin-obsidianmd range to ^${installed}`);
}

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
manifest.version = targetVersion;
writeFileSync('manifest.json', JSON.stringify(manifest, null, '\t') + '\n');
execSync('git add manifest.json', { stdio: 'inherit' });

const versions = existsSync('versions.json')
  ? JSON.parse(readFileSync('versions.json', 'utf8'))
  : {};
const lastMinVersion = Object.values(versions).pop();
if (lastMinVersion !== manifest.minAppVersion) {
  versions[targetVersion] = manifest.minAppVersion;
  writeFileSync('versions.json', JSON.stringify(versions, null, '\t') + '\n');
  execSync('git add versions.json', { stdio: 'inherit' });
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
