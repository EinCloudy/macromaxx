import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Soundboard, parseModules } from '../plugins/native/linux-soundboard/service.js';
import { soundVisual } from '../plugins/native/linux-soundboard/index.js';
import { isKeyActive } from '../shared/visuals.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run } from '../electron/commands.js';
import { Audio } from '../plugins/native/linux-audio/service.js';
test('Virtual microphone modules are tracked and removed in reverse dependency order without default changes', async () => {
  const calls = [], modules = []; let next = 10;
  const sound = new Soundboard(() => {}, () => {}, { execute: async (_, args) => {
    calls.push(args); if (args[0] === 'load-module') { const id = next++; modules.push({ index: id, name: args[1], argument: args.slice(2).join(' ') }); return String(id); }
    if (args.includes('modules')) return modules.map(module => `${module.index}\t${module.name}\t${module.argument}\t`).join('\n');
    if (args.includes('sinks')) return '[{"name":"speaker"}]';
    if (args.includes('sources')) return '[{"name":"mic"}]'; return '';
  } });
  await sound.setupVirtual({ microphone: 'mic', output: 'speaker' });
  assert.equal(sound.modules.length, 4);
  assert.ok(calls.every(args => !args[0].startsWith('set-default')));
  await sound.close();
  assert.deepEqual(calls.filter(args => args[0] === 'unload-module').map(args => args[1]), ['13', '12', '11', '10']);
});

test('Cleanup does not unload an unrelated module that reused an old server ID', async () => {
  const calls = [];
  const sound = new Soundboard(() => {}, () => {}, { execute: async (_, args) => { calls.push(args); return '10\tmodule-null-sink\tsink_name=someone_else\t'; } });
  sound.modules = ['10']; sound.ownedModules.set('10', { name: 'module-null-sink', identity: ['sink_name=macromaxx_soundboard'] });
  await sound.teardown(); assert.equal(calls.some(args => args[0] === 'unload-module'), false);
});

test('Module IDs are read from the short listing even when native module arguments span multiple lines', () => {
  const result = parseModules('1\tlibpipewire-module-rt\t{\n  rt.prio=88\n}\n536870916\tmodule-null-sink\tsink_name=macromaxx_soundboard\t\n');
  assert.equal(result[1].index, '536870916'); assert.equal(result[1].argument, 'sink_name=macromaxx_soundboard');
});
test('Virtual microphone rejects monitor feedback loops and rolls back failed setup', async () => {
  const sound = new Soundboard(() => {}, () => {}, { execute: async (_, args) => args.includes('sources') ? '[{"name":"macromaxx_microphone"}]' : '[]' });
  await assert.rejects(sound.setupVirtual({ microphone: 'macromaxx_microphone' }), /physical microphone/);
  assert.equal(sound.modules.length, 0);
});
test('Stop-all releases active sound processes and removes their live state', async () => {
  const sound = new Soundboard(() => {}, () => {}); let killed = 0;
  sound.sessions.set('one', { id: 'one', actionId: 'action', path: 'sound.wav', children: [{ kill: () => killed++ }], stopped: false });
  sound.publish();
  const key = { id: 'sound-key', actions: [{ id: 'action', type: 'sound' }] };
  assert.equal(isKeyActive(key, null, { native: { visuals: { [key.id]: soundVisual(key, sound.state) } } }), true);
  await sound.play({ command: 'stop-all' }); assert.equal(killed, 1); assert.equal(sound.state.playing.length, 0);
});

test('Opt-in PipeWire integration plays silence only into a temporary virtual microphone and restores routing', { skip: process.env.MACROMAXX_AUDIO_INTEGRATION !== '1', timeout: 15000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'macro-sound-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const info = JSON.parse(await run('pactl', ['-f', 'json', 'info']));
  const errors = []; const sound = new Soundboard(() => {}, e => errors.push(e.message)); t.after(() => sound.close());
  await sound.setupVirtual({ microphone: 'none', output: 'none' }); assert.equal(sound.state.virtualReady, true);
  const audio = new Audio(() => {}); await audio.refresh();
  const originalMute = audio.state.inputs.find(input => input.id === sound.source).mute;
  const hold = await audio.startHold({ kind: 'input', target: sound.source, command: originalMute ? 'ptt' : 'ptm' });
  assert.equal(audio.state.inputs.find(input => input.id === sound.source).mute, !originalMute);
  await audio.releaseHold(hold);
  assert.equal(audio.state.inputs.find(input => input.id === sound.source).mute, originalMute);
  await audio.close();
  const pcm = Buffer.alloc(4800 * 4), header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(48000, 24); header.writeUInt32LE(192000, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  const file = path.join(dir, 'silence.wav'); await fs.writeFile(file, Buffer.concat([header, pcm]));
  await sound.play({ id: 'integration', path: file, route: 'virtual', volume: 0 });
  const deadline = Date.now() + 6000; while (sound.sessions.size && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(sound.sessions.size, 0); assert.deepEqual(errors, []);
  const owned = [...sound.modules];
  await sound.close();
  const remaining = parseModules(await run('pactl', ['list', 'short', 'modules']));
  assert.ok(owned.every(id => !remaining.some(module => module.index === id)), 'every module created by the test must be removed');
  const after = JSON.parse(await run('pactl', ['-f', 'json', 'info']));
  assert.equal(after.default_sink_name, info.default_sink_name); assert.equal(after.default_source_name, info.default_source_name);
});
