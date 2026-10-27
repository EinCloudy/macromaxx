import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { buildNativeUIRegistry } from '../plugins/native/ui-registry.js';
import { migrateNativeSettings } from '../plugins/native/migrations.js';
import { create } from '../plugins/native/linux-audio/index.js';

test('Native UI registry discovers manifest-defined panels and action editors without hardcoded IDs', () => {
  const Settings = () => {}, Editor = () => {};
  const registry = buildNativeUIRegistry({ './new-plugin/manifest.json': { id: 'new-plugin', ui: { settings: ['Settings'], editors: { audio: 'Editor' } } } }, { './new-plugin/ui.jsx': { Settings, Editor } });
  assert.equal(registry['new-plugin'].settings[0], Settings);
  assert.equal(registry['new-plugin'].editors.audio, Editor);
  assert.throws(() => buildNativeUIRegistry({ './bad/manifest.json': { id: 'bad', ui: { settings: ['Missing'] } } }, {}), /bad: missing UI export Missing/);
  assert.deepEqual(buildNativeUIRegistry({ './headless/manifest.json': { id: 'headless' } }, {}).headless.settings, []);
});

test('Linux audio manifest combines mixer and routing in one guided, optional integration', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../plugins/native/linux-audio/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.platforms, ['linux']);
  assert.ok(!manifest.required);
  assert.deepEqual(manifest.ui.settings, ['AudioSettings', 'SoundSettings']);
  assert.equal(manifest.legacyOperations.setupSoundboard, 'setup');
  assert.ok(manifest.guide.steps.length >= 6);
  await assert.rejects(fs.access(new URL('../plugins/native/linux-soundboard/manifest.json', import.meta.url)), { code: 'ENOENT' });
});

test('Combined audio migration preserves old opt-outs without disabling shared playback for version 2 users', () => {
  for (const disabled of [['linux-audio'], ['linux-soundboard'], ['linux-audio', 'linux-soundboard']]) {
    const state = { settings: { nativePluginSettingsVersion: 2, disabledNativePlugins: disabled } };
    migrateNativeSettings(state);
    assert.deepEqual(state.settings.disabledNativePlugins, ['linux-audio']);
    const saved = structuredClone(state); migrateNativeSettings(state);
    assert.deepEqual(state, saved);
  }
  const old = { settings: { disabledNativePlugins: ['linux-soundboard'] } };
  migrateNativeSettings(old);
  assert.deepEqual(new Set(old.settings.disabledNativePlugins), new Set(['soundboard', 'linux-audio']));
});

test('Combined Linux audio exposes both services, routing operations, holds and cleanup', async () => {
  const calls = [];
  const audio = {
    state: { available: true }, refresh: async () => calls.push('refresh'), start: () => calls.push('start'),
    execute: async action => action.command, startHold: async () => 'token', releaseHold: async token => calls.push(token),
    releaseAll: async () => calls.push('release'), close: async () => calls.push('audio-close'),
  };
  const routing = {
    state: { available: true, virtualReady: false }, probe: async () => calls.push('probe'),
    setupVirtual: async () => { routing.state.virtualReady = true; }, stopAll: () => calls.push('stop'),
    teardown: async () => { routing.state.virtualReady = false; }, close: async () => calls.push('routing-close'),
  };
  const instance = await create({ audioFactory: () => audio, routingFactory: () => routing, service: () => undefined });
  assert.equal(instance.services.audio, audio); assert.equal(instance.services.soundRouting, routing);
  assert.equal(instance.capabilities()['audio.mixer'].available, true);
  assert.equal(instance.capabilities()['sound.routing'].available, true);
  assert.equal(await instance.actions.audio({ command: 'mute' }), 'mute');
  const release = await instance.beginHold({ command: 'ptt' }); await release(); assert.ok(calls.includes('token'));
  await instance.operations.setup({}); assert.equal(instance.status().soundRouting.virtualReady, true);
  await instance.operations.remove(); assert.equal(instance.status().soundRouting.virtualReady, false);
  await instance.operations.refresh(); assert.deepEqual(calls.slice(-2), ['refresh', 'probe']);
  await instance.release(); assert.deepEqual(calls.slice(-2), ['stop', 'release']);
  await instance.close(); assert.deepEqual(calls.slice(-2), ['routing-close', 'audio-close']);
});

test('Missing routing dependencies do not hide a working audio mixer', async () => {
  const instance = await create({
    audioFactory: () => ({ state: { available: true }, refresh: async () => {}, close: async () => {} }),
    routingFactory: () => ({ state: { available: false, error: 'Missing ffmpeg' }, probe: async () => {}, close: async () => {} }),
    service: () => undefined,
  });
  assert.equal(instance.capabilities()['audio.mixer'].available, true);
  assert.equal(instance.capabilities()['sound.routing'].available, false);
  assert.equal(instance.status().soundRouting.error, 'Missing ffmpeg');
  await instance.close();
});
