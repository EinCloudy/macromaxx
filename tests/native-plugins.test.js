import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativePlugins } from '../electron/native-plugins.js';
import { initialState, makeKey, validateState } from '../shared/model.js';
import { nativeActionDefinitions } from '../plugins/native/catalog.js';
import { liveKey, isKeyActive } from '../shared/visuals.js';
import { create as createKeyboard } from '../plugins/native/keyboard/index.js';
import { create as createMedia } from '../plugins/native/media/index.js';
import { create as createLauncher } from '../plugins/native/launcher/index.js';
import { Actions } from '../electron/actions.js';

const directory = fileURLToPath(new URL('../plugins/native', import.meta.url));
function fixture(platform, disabled = [], failId) {
  const state = initialState(); state.settings.disabledNativePlugins = disabled;
  const loaded = [], closed = [], calls = [], errors = [];
  const host = new NativePlugins(directory, { getState: () => state, onStatus: () => {}, log: (...args) => errors.push(args) }, {
    platform,
    loader: async file => {
      const manifest = JSON.parse(await fs.readFile(path.join(path.dirname(file), 'manifest.json'), 'utf8'));
      return { create: async () => {
        loaded.push(manifest.id); if (manifest.id === failId) throw new Error('Missing native dependency');
        return {
          actions: Object.fromEntries(Object.keys(manifest.actions || {}).map(type => [type, async action => calls.push([manifest.id, action.type])])),
          operations: { ping: () => manifest.id },
          capabilities: () => Object.fromEntries(Object.values(manifest.actions || {}).map(id => [id, { available: true }])),
           visual: key => manifest.id === 'media' && key.actions.some(a => ['media', 'tile'].includes(a.type)) ? { active: true, label: 'Live title', image: key.actions.some(a => a.type === 'tile' && a.content === 'track-info') ? '' : 'data:image/png;base64,Y292ZXI=' } : null,
          isHold: action => manifest.id === 'linux-audio' && action.command === 'ptt',
          beginHold: async () => async () => calls.push(['released']),
          close: () => closed.push(manifest.id),
        };
      } };
    },
  });
  return { host, state, loaded, closed, calls, errors };
}

test('Windows and macOS never import Linux-only native plugins', async () => {
  for (const platform of ['win32', 'darwin']) {
    const f = fixture(platform); await f.host.initialize();
    assert.deepEqual(f.loaded, ['keyboard', 'session', 'launcher', 'media', 'soundboard', 'obs', 'discord']);
    for (const id of ['linux-audio', 'linux-desktop']) assert.equal(f.host.records.find(r => r.manifest.id === id).state, 'unsupported');
    await assert.rejects(f.host.execute({ type: 'audio', command: 'mute' }), /Available on linux/);
    assert.equal(f.host.snapshot().native.actionTypes.audio.available, false);
    await f.host.close();
  }
});

test('Optional disabled plugins do not load; required adapters remain available', async () => {
  const f = fixture('linux', ['linux-audio', 'media', 'keyboard', 'launcher']); await f.host.initialize();
  assert.equal(f.loaded.includes('linux-audio'), false);
  for (const id of ['media', 'keyboard', 'launcher']) {
    assert.equal(f.loaded.includes(id), true);
    const plugin = f.host.snapshot().native.plugins.find(plugin => plugin.id === id);
    assert.equal(plugin.builtIn, true);
    assert.equal(plugin.enabled, true);
    assert.equal(plugin.restartRequired, false);
  }
  assert.equal(f.host.availability({ type: 'audio' }).available, false);
  const profile = f.state.profiles[0]; profile.keys[5] = makeKey('audio');
  assert.doesNotThrow(() => validateState(f.state));
  await assert.rejects(f.host.invoke('linux-audio', 'refresh'), /Disabled/);
  await f.host.close();
});

test('Native dispatch, transient visuals, holds, and reverse cleanup use the plugin contract', async () => {
  const f = fixture('linux'); await f.host.initialize();
  await f.host.execute({ type: 'hotkey', keys: 'CTRL+A' }); assert.deepEqual(f.calls[0], ['keyboard', 'hotkey']);
  const key = f.state.profiles[0].keys[3], original = key.label;
   const live = f.host.snapshot(); assert.equal(liveKey(key, live).label, 'Live title'); assert.equal(isKeyActive(key, null, live), true); assert.equal(key.label, original);
   assert.equal(liveKey(key, live).image, 'data:image/png;base64,Y292ZXI=');
   assert.equal(f.host.renderKey(key).image, liveKey(key, live).image);
   assert.equal(key.image, '');
   const tile = makeKey('tile'); tile.actions[0].content = 'track-info'; tile.image = 'data:image/png;base64,b3JpZ2luYWw=';
   assert.equal(f.host.renderKey(tile).image, '');
   assert.notEqual(tile.image, '');
  const release = await f.host.beginHold({ type: 'audio', command: 'ptt' }); await release(); assert.deepEqual(f.calls.at(-1), ['released']);
  await assert.rejects(f.host.invoke('keyboard', 'toString'), /Unknown native plugin operation/);
  assert.equal(await f.host.invoke('keyboard', 'ping'), 'keyboard');
  const closing = f.host.close(); assert.equal(f.host.close(), closing); await closing;
  assert.deepEqual(f.closed, [...f.loaded].reverse());
});

test('An unavailable native dependency leaves the core URL action usable', async () => {
  const f = fixture('linux', [], 'linux-audio'); await f.host.initialize();
  assert.equal(f.host.records.find(r => r.manifest.id === 'linux-audio').state, 'error');
  let opened;
  const actions = new Actions({ native: f.host, shell: { openExternal: async url => { opened = url; } }, status: () => {} });
  await actions.run({ type: 'url', url: 'https://example.com' }, new AbortController().signal);
  assert.equal(opened, 'https://example.com/');
  await assert.rejects(actions.run({ type: 'audio', command: 'mute' }), /Missing native dependency/);
  await f.host.close();
});

test('Native entry points cannot escape their bundled directory', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'macro-native-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'bundle')); await fs.mkdir(path.join(root, 'bundle/escape'));
  await fs.writeFile(path.join(root, 'outside.js'), 'throw new Error("must not load");');
  await fs.writeFile(path.join(root, 'bundle/escape/manifest.json'), JSON.stringify({ id: 'escape', type: 'bundled-native', apiVersion: 1, platforms: ['linux'], main: '../../outside.js', actions: {} }));
  const host = new NativePlugins(path.join(root, 'bundle'), { getState: initialState, onStatus: () => {} }, { platform: 'linux', loader: async () => assert.fail('external entry must not execute') });
  await host.initialize(); assert.equal(host.records[0].state, 'error'); assert.match(host.records[0].reason, /escapes/);
});

test('Every native action contract has exactly one bundled manifest owner', async () => {
  const f = fixture('linux'); await f.host.initialize();
  for (const action of nativeActionDefinitions) {
    const owners = f.host.records.filter(r => Object.hasOwn(r.manifest.actions || {}, action.type));
    assert.equal(owners.length, 1); assert.equal(owners[0].manifest.id, action.provider);
  }
  await f.host.close();
});

test('Native library discovers the combined audio manifest, guide and legacy routing operations', async () => {
  const f = fixture('linux'); await f.host.initialize();
  const plugins = f.host.snapshot().native.plugins;
  assert.equal(plugins.filter(plugin => plugin.id === 'linux-audio').length, 1);
  assert.equal(plugins.some(plugin => plugin.id === 'linux-soundboard'), false);
  const audio = plugins.find(plugin => plugin.id === 'linux-audio');
  assert.equal(audio.icon, 'Mic'); assert.ok(audio.guide.steps.length >= 6);
  const handlers = f.host.legacyHandlers();
  assert.equal(typeof handlers.setupSoundboard, 'function');
  assert.equal(typeof handlers.removeSoundboard, 'function');
  await f.host.close();
});

test('OBS can be disabled on every supported platform while saved assignments remain portable', async () => {
  for (const platform of ['linux', 'win32', 'darwin']) {
    const f = fixture(platform, ['obs']);
    f.state.profiles[0].keys[5] = makeKey('obs');
    await f.host.initialize();
    assert.equal(f.loaded.includes('obs'), false);
    assert.equal(f.host.snapshot().native.actionTypes.obs.available, false);
    assert.doesNotThrow(() => validateState(f.state));
    await assert.rejects(f.host.execute({ type: 'obs', command: 'record' }), /Disabled/);
    await assert.rejects(f.host.legacyHandlers().connectOBS(), /Disabled/);
    await f.host.close();
  }
});

test('Windows and macOS keyboard adapters use only their own native helpers', async t => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'macro-keyboard-')); t.after(() => fs.rm(data, { recursive: true, force: true }));
  for (const platform of ['win32', 'darwin']) {
    const calls = [];
    const instance = await createKeyboard({ platform, dataDirectory: data, changed: () => {}, getState: initialState, runCommand: async (...args) => { calls.push(args); return '1'; } });
    await instance.actions.hotkey({ keys: platform === 'win32' ? 'CONTROL+RETURN' : 'COMMAND+ESCAPE' });
    assert.ok(calls.every(([command]) => command === (platform === 'win32' ? 'powershell.exe' : 'osascript')));
    if (platform === 'win32') assert.match(calls.at(-1)[1].at(-1), /keybd_event\(13/);
    else { assert.match(calls.at(-1)[1].at(-1), /key code 53/); assert.equal(instance.supports({ type: 'hotkey', mode: 'down' }).available, false); }
    await instance.close();
  }
});

test('OS fallback media adapters distinguish Windows media keys from macOS volume-only support', async () => {
  for (const platform of ['win32', 'darwin']) {
    const calls = [];
    const instance = await createMedia({ platform, changed: () => {}, service: () => ({ integrationAvailable: true }), runCommand: async (...args) => { calls.push(args); return '1'; }, runAction: async action => calls.push(action) });
    const cap = instance.capabilities()['media.controls']; assert.equal(cap.features.players, false); assert.equal(cap.features.titles, false);
    assert.equal(instance.supports({ command: 'player-volume' }).available, false);
    if (platform === 'win32') { await instance.actions.media({ command: 'playpause' }); assert.equal(calls.at(-1).keys, 'PLAYPAUSE'); }
    else { assert.equal(instance.supports({ command: 'playpause' }).available, false); await instance.actions.media({ command: 'volumeup' }); assert.equal(calls.at(-1)[0], 'osascript'); assert.equal(instance.defaults().command, 'volumeup'); }
    instance.close();
  }
});

test('Windows launcher does not scan XDG directories and does not claim POSIX script or Flatpak support', async () => {
  const instance = await createLauncher({ platform: 'win32', changed: () => {}, shell: {} });
  assert.deepEqual(instance.status().apps, []);
  assert.equal(instance.capabilities()['launcher.script'].available, false);
  assert.equal(instance.supports({ type: 'app', mode: 'flatpak' }).available, false);
  assert.deepEqual(instance.capabilities()['launcher.open'].features.modes, ['file']); instance.close();
});

test('Missing Windows keyboard dependencies are not reported as ready', async t => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'macro-keyboard-missing-')); t.after(() => fs.rm(data, { recursive: true, force: true }));
  const instance = await createKeyboard({ platform: 'win32', dataDirectory: data, changed: () => {}, getState: initialState, runCommand: async () => { throw new Error('not installed'); } });
  await instance.start();
  assert.equal(instance.capabilities()['keyboard.hotkey'].available, false);
  assert.equal(instance.status().inputReady, false);
  await instance.close();
});
