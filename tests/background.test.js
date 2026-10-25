import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Background, launchCommand } from '../electron/background.js';
test('Desktop launch commands escape paths and percent field codes', () => {
  assert.equal(launchCommand('/a b/100%/app', '/project here', false), '"/a b/100%%/app" "/project here"');
});
test('Local launcher and autostart support show/quit actions and background startup', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'macro-background-')); t.after(() => fs.rm(home, { recursive: true, force: true }));
  const background = new Background({ app: { isPackaged: true, getAppPath: () => home }, shortcuts: {}, show: () => {}, onStatus: () => {}, home, executable: '/home/me/My App.AppImage', platform: 'linux' });
  await background.installLauncher();
  const entry = await fs.readFile(path.join(home, '.local/share/applications/macromaxx-local.desktop'), 'utf8');
  assert.match(entry, /--show/); assert.match(entry, /--quit/); assert.equal(background.state.launcherInstalled, true);
  await background.autostart(true, true);
  assert.match(await fs.readFile(path.join(home, '.config/autostart/macromaxx.desktop'), 'utf8'), /--background/);
  await background.autostart(false); await assert.rejects(fs.access(path.join(home, '.config/autostart/macromaxx.desktop')));
});
test('Failed shortcut registration preserves the last working shortcut', () => {
  const removed = []; let opened = 0, callback;
  const background = new Background({ app: { getPath: () => '' }, shortcuts: { register: (key, fn) => { callback = fn; return key !== 'bad'; }, unregister: key => removed.push(key) }, show: () => opened++, onStatus: () => {} });
  assert.equal(background.shortcut('Ctrl+Shift+Space'), true); callback(); assert.equal(opened, 1);
  assert.equal(background.shortcut('bad'), false); assert.equal(background.state.shortcut, 'Ctrl+Shift+Space');
  assert.equal(removed.length, 0); background.shortcut(''); assert.deepEqual(removed, ['Ctrl+Shift+Space']);
});
