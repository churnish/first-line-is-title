import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const targetVersion = process.env.npm_package_version;

// IMPORTANT: When creating git tags, use format "X.Y.Z" NOT "vX.Y.Z"
// The release workflow is configured to ignore v-prefixed tags

// Pull latest README files from GitHub (since they're edited there)
console.log('Pulling latest README files from GitHub...');
try {
  execSync(
    'curl -f -o README.md https://raw.githubusercontent.com/greetclammy/first-line-is-title/main/README.md',
    { stdio: 'inherit' }
  );
  execSync(
    'curl -f -o README_RU.md https://raw.githubusercontent.com/greetclammy/first-line-is-title/main/README_RU.md',
    { stdio: 'inherit' }
  );
  console.log('README files updated from GitHub');
} catch (error) {
  console.warn(
    'Warning: Could not fetch README files from GitHub. Continuing with local versions.'
  );
}

// Update manifest.json
let manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
manifest.version = targetVersion;
writeFileSync('manifest.json', JSON.stringify(manifest, null, '\t') + '\n');

console.log(`Updated manifest.json to version ${targetVersion}`);
