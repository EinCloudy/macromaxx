import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NativeWorker } from '../plugins/native/worker-client.js';
import { RobotKeyboard, robotChord } from '../plugins/native/keyboard/robot.js';
import { create as createKeyboard } from '../plugins/native/keyboard/index.js';
import { create as createMedia } from '../plugins/native/media/index.js';
import { SharedSoundboard } from '../plugins/native/soundboard/service.js';
import { migrateNativeSettings } from '../plugins/native/migrations.js';
import { initialState } from '../shared/model.js';
import { create as createSoundboard } from '../plugins/native/soundboard/index.js';

test('Shared keyboard mapping keeps modifier semantics and rejects unsupported variants for fallback', () => {
  assert.deepEqual(robotChord('CTRL+SHIFT+M', 'win32'), { key: 'm', modifiers: ['control', 'shift'] });
  assert.deepEqual(robotChord('COMMAND+ESCAPE', 'darwin'), { key: 'escape', modifiers: ['command'] });
  assert.equal(robotChord('PLAYPAUSE', 'darwin').key, 'audio_play');
  assert.equal(robotChord('STOP', 'darwin'), null);
  assert.equal(robotChord('CTRL+A+B', 'linux'), null);
});
test('Native Wayland never starts the shared X11 keyboard backend', async () => {
  const robot = new RobotKeyboard({ platform: 'linux', environment: { WAYLAND_DISPLAY: 'wayland-1' }, allowSimulated: true, makeWorker: () => assert.fail('X11 must not replace Wayland input') });
  await robot.probe(); assert.equal(robot.available, false); assert.match(robot.state.reason, /Wayland/);
});
test('Shared keyboard provides media keys and holds on macOS without sending AppleScript key commands', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'macro-shared-input-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const packets = [], legacy = [];
  const makeWorker = () => ({ state: { available: true, reason: '' }, start: async () => {}, request: async (command, data) => packets.push([command, data]), close: async () => {} });
  const keyboard = await createKeyboard({ platform: 'darwin', dataDirectory: directory, getState: initialState, changed: () => {}, systemPreferences: { isTrustedAccessibilityClient: () => true }, runCommand: async (...args) => { legacy.push(args); return '1'; }, robotFactory: () => new RobotKeyboard({ platform: 'darwin', environment: {}, allowSimulated: true, makeWorker }) });
  assert.equal(keyboard.capabilities()['keyboard.hotkey'].features.hold, true);
  await keyboard.actions.hotkey({ keys: 'CMD+K', mode: 'down' }); await keyboard.release();
  assert.equal(packets[0][1].mode, 'down'); assert.equal(packets[1][1].mode, 'up');
  const calls = [];
  const media = await createMedia({ platform: 'darwin', changed: () => {}, service: () => keyboard.services.input, runCommand: async () => '1', runAction: async action => calls.push(action) });
  assert.equal(media.supports({ command: 'playpause' }).available, true);
  assert.equal(media.capabilities()['media.controls'].features.titles, false);
  await media.actions.media({ command: 'playpause' }); assert.equal(calls[0].keys, 'PLAYPAUSE');
  assert.ok(legacy.every(([, args]) => args[1] === 'return 1'));
  media.close(); await keyboard.close();
});
test('Native worker failures reject pending work without crashing the controller', async () => {
  let child;
  const worker = new NativeWorker('fake.js', () => {}, () => {}, { launch: () => {
    child = new EventEmitter(); child.stderr = new EventEmitter(); child.connected = true; child.exitCode = null; child.signalCode = null;
    child.send = () => {}; child.kill = () => { child.exitCode = 0; queueMicrotask(() => child.emit('exit', 0)); };
    queueMicrotask(() => child.emit('message', { type: 'ready' })); return child;
  } });
  await worker.start();
  const pending = worker.request('play'); await new Promise(resolve => setImmediate(resolve));
  child.emit('exit', 1);
  await assert.rejects(pending, error => error.code === 'NATIVE_BACKEND_UNAVAILABLE');
  assert.equal(worker.state.available, false); await worker.close();
});

test('Closing a native worker during initialization settles the startup request', async () => {
  const worker = new NativeWorker('fake.js', () => {}, () => {}, { launch: () => {
    const child = new EventEmitter(); child.stderr = new EventEmitter(); child.connected = true; child.exitCode = null; child.signalCode = null;
    child.send = () => {}; child.kill = () => { child.exitCode = 0; queueMicrotask(() => child.emit('exit', 0)); }; return child;
  } });
  const starting = assert.rejects(worker.start(), /closed during initialization/);
  await worker.close(); await starting;
});

test('Linux system volume keeps the audio API rather than requiring Wayland key permission', async () => {
  const calls = [], keys = [];
  const instance = await createMedia({ platform: 'linux', changed: () => {}, runCommand: async (_, args) => args[0] === '-l' ? '' : '1', service: name => name === 'input' ? { ready: false, mediaCommands: ['mute', 'volumeup', 'volumedown'] } : { state: { available: true }, execute: async action => calls.push(action) }, runAction: async action => keys.push(action) });
  await instance.actions.media({ command: 'volumeup' });
  assert.equal(calls[0].kind, 'output'); assert.equal(keys.length, 0); instance.close();
});
test('Shared soundboard supports toggle, overlap and stopping without external player processes', async () => {
  const requests = [];
  const sound = new SharedSoundboard(() => {}, () => {}, { workerFactory: () => ({ state: { available: true, reason: '' }, start: async () => {}, request: async (command, data) => { requests.push([command, data]); return { started: true }; }, close: async () => {} }) });
  await sound.probe();
  const action = { id: 'sound', path: '/sample.wav', volume: 20, loop: true, behavior: 'toggle' };
  await sound.play(action); assert.equal(sound.state.playing.length, 1);
  await sound.play(action); assert.equal(sound.state.playing.length, 0);
  await sound.play({ ...action, behavior: 'overlap' }); await sound.play({ ...action, behavior: 'overlap' });
  assert.equal(sound.state.playing.length, 2); sound.stopAll(); assert.equal(sound.state.playing.length, 0);
  assert.ok(requests.some(([command]) => command === 'stop')); await sound.close();
});
test('Splitting shared playback preserves existing disabled sound preferences once', () => {
  const state = initialState(); state.settings.disabledNativePlugins = ['linux-soundboard'];
  migrateNativeSettings(state); assert.ok(state.settings.disabledNativePlugins.includes('soundboard'));
  state.settings.disabledNativePlugins = ['linux-soundboard']; migrateNativeSettings(state);
  assert.deepEqual(state.settings.disabledNativePlugins, ['linux-soundboard']);
});

test('Windows and macOS shared sound providers offer default playback without Linux routing', async () => {
  for (const platform of ['win32', 'darwin']) {
    const played = [];
    const instance = await createSoundboard({ platform, changed: () => {}, report: () => {}, service: () => undefined, soundboardFactory: () => ({
      state: { available: true, playing: [], reason: '' }, probe: async () => {}, play: async action => { played.push(action); return { message: 'shared' }; }, stopAll: () => {}, close: async () => {},
    }) });
    const capability = instance.capabilities()['sound.play']; assert.equal(capability.available, true); assert.deepEqual(capability.features.routes, ['output']);
    await instance.actions.sound({ id: 'sample', command: 'play', path: 'sample.wav', route: 'output', output: 'default' });
    assert.equal(played.length, 1); assert.equal(instance.supports({ route: 'virtual' }).available, false); await instance.close();
  }
});
test('Opt-in shared Web Audio worker decodes and plays a silent WAV without a physical sink', { skip: process.env.MACROMAXX_SHARED_AUDIO_INTEGRATION !== '1', timeout: 12000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'macro-shared-audio-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const pcm = Buffer.alloc(4800 * 4), header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(48000, 24); header.writeUInt32LE(192000, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  const file = path.join(directory, 'silence.wav'); await fs.writeFile(file, Buffer.concat([header, pcm]));
  const errors = [], sound = new SharedSoundboard(() => {}, error => errors.push(error.message), { silent: true }); t.after(() => sound.close());
  await sound.probe(); assert.equal(sound.state.available, true, sound.state.reason);
  await sound.play({ id: 'shared-integration', path: file, volume: 0, loop: false });
  const deadline = Date.now() + 4000; while (sound.sessions.size && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(sound.sessions.size, 0); assert.deepEqual(errors, []);
  await new Promise(resolve => setTimeout(resolve, 180));
  await sound.play({ id: 'shared-replay-after-idle', path: file, volume: 0, loop: false });
  const replayDeadline = Date.now() + 4000; while (sound.sessions.size && Date.now() < replayDeadline) await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(sound.sessions.size, 0); assert.deepEqual(errors, []);
});
