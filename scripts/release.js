import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function releaseNotes(tag, pkg, lock, changelog) {
  assert.match(tag, /^v\d+\.\d+\.\d+$/, 'Release tag must have the form v0.1.0');
  const version = tag.slice(1);
  assert.equal(pkg.version, version, 'Tag and package.json version differ');
  assert.equal(lock.version, version, 'Tag and lockfile version differ');
  assert.equal(lock.packages[''].version, version, 'Tag and lockfile root version differ');
  const heading = `## [${version}]`;
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex(line => line === heading || line.startsWith(`${heading} - `));
  assert.notEqual(start, -1, `Missing changelog section ${heading}`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  const notes = lines.slice(start + 1, end === -1 ? undefined : end).join('\n').trim();
  assert.ok(notes, 'Release notes must not be empty');
  return notes;
}

export function installerNames(version) {
  return [
    `MacroMaxx-${version}-linux-x86_64.AppImage`,
    `MacroMaxx-${version}-windows-x64.exe`,
    `MacroMaxx-${version}-macos-arm64.dmg`,
  ];
}

export async function prepareAssets(directory, version) {
  const names = installerNames(version);
  const actual = await fs.readdir(directory);
  assert.deepEqual(actual.sort(), [...names].sort(), 'Expected exactly one installer per release platform');
  const sums = [];
  for (const name of names) {
    const contents = await fs.readFile(path.join(directory, name));
    assert.ok(contents.length > 0, `Empty installer: ${name}`);
    sums.push(`${createHash('sha256').update(contents).digest('hex')}  ${name}`);
  }
  await fs.writeFile(path.join(directory, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);
}

async function main() {
  const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
  const lock = JSON.parse(await fs.readFile('package-lock.json', 'utf8'));
  const tag = process.env.RELEASE_TAG || `v${pkg.version}`;
  const notes = releaseNotes(tag, pkg, lock, await fs.readFile('CHANGELOG.md', 'utf8'));
  if (process.argv[2] === 'check') {
    // CI must build the tagged commit, not a similarly named branch or moving ref.
    if (process.env.GITHUB_ACTIONS === 'true') {
      const tagged = execFileSync('git', ['rev-parse', `refs/tags/${tag}^{commit}`], { encoding: 'utf8' }).trim();
      const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      assert.equal(head, tagged, 'Checkout does not match the release tag');
    }
    console.log(`Release ${tag}: versions and changelog match.`);
  } else if (process.argv[2] === 'assets') {
    await prepareAssets('release-assets', pkg.version);
    await fs.writeFile('release-notes.md', `${notes}\n`);
  } else {
    throw new Error('Usage: node scripts/release.js check|assets');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
