import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installerNames, prepareAssets, releaseNotes } from '../scripts/release.js';

const pkg = { version: '0.1.0' };
const lock = { version: '0.1.0', packages: { '': { version: '0.1.0' } } };
const changelog = '# Changelog\n\n## [0.1.0]\n\nFirst release.\n\n## [0.0.1]\n\nOlder notes.\n';

test('Release validation matches tag, both lockfile versions and the exact changelog section', () => {
  assert.equal(releaseNotes('v0.1.0', pkg, lock, changelog), 'First release.');
  assert.throws(() => releaseNotes('v0.1.0-beta.1', pkg, lock, changelog));
  assert.throws(() => releaseNotes('v0.2.0', pkg, lock, changelog));
  assert.throws(() => releaseNotes('v0.1.0', pkg, { ...lock, version: '0.0.1' }, changelog));
  assert.throws(() => releaseNotes('v0.1.0', pkg, { ...lock, packages: { '': { version: '0.0.1' } } }, changelog));
  assert.throws(() => releaseNotes('v0.1.0', pkg, lock, '## [0.1.01]\nWrong section.'));
  assert.throws(() => releaseNotes('v0.1.0', pkg, lock, '## [0.1.0]\n\n## [0.0.1]\nOlder.'));
});

test('Release assets require exactly three nonempty architecture-specific installers and get SHA-256 sums', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'macro-release-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const names = installerNames('0.1.0');
  await assert.rejects(prepareAssets(directory, '0.1.0'), /exactly one installer/);
  for (const name of names) await fs.writeFile(path.join(directory, name), 'installer');
  await fs.writeFile(path.join(directory, 'unexpected.exe'), 'extra');
  await assert.rejects(prepareAssets(directory, '0.1.0'), /exactly one installer/);
  await fs.unlink(path.join(directory, 'unexpected.exe'));
  await fs.writeFile(path.join(directory, names[0]), '');
  await assert.rejects(prepareAssets(directory, '0.1.0'), /Empty installer/);
  await fs.writeFile(path.join(directory, names[0]), 'installer');
  await prepareAssets(directory, '0.1.0');
  const hash = createHash('sha256').update('installer').digest('hex');
  assert.equal(await fs.readFile(path.join(directory, 'SHA256SUMS.txt'), 'utf8'), names.map(name => `${hash}  ${name}\n`).join(''));
});
