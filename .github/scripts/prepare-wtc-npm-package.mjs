import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const outDir = path.join(repoRoot, 'dist', 'wtc');

const rawVersion = process.env.PACKAGE_VERSION?.trim();
if (!rawVersion) {
  throw new Error('PACKAGE_VERSION is required');
}

const version = rawVersion.replace(/^v/, '');
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid semver version: ${rawVersion}`);
}

const repository = process.env.GITHUB_REPOSITORY || 'MagicalAstrogy/LorebookToolCall';
const packageName = process.env.NPM_PACKAGE_NAME || 'lorebook-tool-call';

const packageJson = {
  name: packageName,
  version,
  description: 'Browser bundle for LorebookToolCall.',
  type: 'module',
  main: './index.js',
  exports: {
    '.': './index.js',
  },
  files: ['index.js', 'index.js.map', 'README.md', 'LICENSE'],
  keywords: ['sillytavern', 'lorebook', 'tool-calling', 'browser-bundle'],
  license: 'SEE LICENSE IN LICENSE',
  repository: {
    type: 'git',
    url: `git+https://github.com/${repository}.git`,
  },
  homepage: `https://github.com/${repository}#readme`,
  bugs: {
    url: `https://github.com/${repository}/issues`,
  },
};

await mkdir(outDir, { recursive: true });
await copyFile(path.join(repoRoot, 'README.npm.md'), path.join(outDir, 'README.md'));
await copyFile(path.join(repoRoot, 'LICENSE'), path.join(outDir, 'LICENSE'));
await writeFile(path.join(outDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);

console.log(`Prepared ${packageName}@${version} in ${outDir}`);
