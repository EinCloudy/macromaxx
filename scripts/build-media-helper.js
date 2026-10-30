import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// MediaRemote is restricted to Apple-entitled processes since macOS 15.4.
// Bundle the BSD-licensed adapter used via /usr/bin/perl instead of loading
// MediaRemote directly into Electron. End users need no Homebrew or compiler.
const revision = '0e82bf1c44ec39554fbfc402ec88a48c6ae2a0fd';
const checksum = '9e31b154dc7be207a42b7bb1ba1b161bfdee541a15d692cba1c37740f13b23e2';

if (process.platform === 'darwin') {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const output = `${root}build/mediaremote`;
  const marker = `${output}/revision`;
  const prepared = await Promise.all([
    readFile(marker, 'utf8').then(value => value === revision).catch(() => false),
    access(`${output}/MediaRemoteAdapter.framework/MediaRemoteAdapter`).then(() => true).catch(() => false),
    access(`${output}/mediaremote-adapter.pl`).then(() => true).catch(() => false),
  ]);
  if (!prepared.every(Boolean)) {
    const source = `${root}build/mediaremote-source-${revision}`;
    await mkdir(source, { recursive: true });
    const archive = `${source}/source.tar.gz`;
    let bytes = await readFile(archive).catch(() => null);
    if (!bytes || createHash('sha256').update(bytes).digest('hex') !== checksum) {
      const response = await fetch(`https://codeload.github.com/ungive/mediaremote-adapter/tar.gz/${revision}`, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`MediaRemote source download failed: ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
      if (createHash('sha256').update(bytes).digest('hex') !== checksum) throw new Error('MediaRemote source checksum mismatch.');
      await writeFile(archive, bytes);
    }
    execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', source], { stdio: 'inherit' });
    execFileSync('cmake', ['-S', source, '-B', `${source}/out`, '-DCMAKE_BUILD_TYPE=Release', '-DCMAKE_OSX_DEPLOYMENT_TARGET=11.0'], { stdio: 'inherit' });
    execFileSync('cmake', ['--build', `${source}/out`, '--target', 'MediaRemoteAdapter', '--config', 'Release'], { stdio: 'inherit' });
    await mkdir(output, { recursive: true });
    await cp(`${source}/out/MediaRemoteAdapter.framework`, `${output}/MediaRemoteAdapter.framework`, { recursive: true, verbatimSymlinks: true });
    await cp(`${source}/bin/mediaremote-adapter.pl`, `${output}/mediaremote-adapter.pl`);
    await cp(`${source}/LICENSE`, `${output}/LICENSE`);
    await writeFile(marker, revision);
  }
}
