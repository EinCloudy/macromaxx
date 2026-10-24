import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Audio } from '../electron/audio.js';
import { isKeyActive } from '../shared/visuals.js';

function fixture(muted = true) {
  const volume = percent => ({ mono: { value_percent: `${percent}%` } });
  const input = { name: 'mic.usb', index: 1, description: 'USB Mic', mute: muted, volume: volume(80) };
  const streams = [2, 3].map(index => ({ index, mute: false, volume: volume(40), properties: { 'application.process.binary': 'player', 'application.name': 'Player' } }));
  const commands = [];
  const run = async (_, args) => {
    if (args[0] === '-f') {
      const name = args.slice(2).join(' ');
      return JSON.stringify({ info: { default_source_name: 'mic.usb', default_sink_name: 'speaker' }, 'list sources': [input], 'list sinks': [{ name: 'speaker', description: 'Speakers', index: 9, mute: false, volume: volume(50) }], 'list sink-inputs': streams }[name]);
    }
    commands.push(args);
    if (args[0] === 'set-source-mute') input.mute = args[2] === '1';
    return '';
  };
  return { audio: new Audio(() => {}, run), input, commands };
}

test('Audio snapshots reflect external changes and use stable names for default devices', async () => {
  const { audio, input, commands } = fixture();
  await audio.refresh(); assert.equal(audio.state.inputs[0].mute, true);
  input.mute = false; await audio.refresh();
  assert.equal(isKeyActive({ actions: [{ type: 'audio', command: 'mute', kind: 'input', target: 'default' }] }, null, { audio: audio.state }), false);
  await audio.execute({ kind: 'input', target: 'default', command: 'mute' });
  assert.deepEqual(commands[0], ['set-source-mute', 'mic.usb', '1']);
});

test('Overlapping PTT holds and fast press/release restore the original microphone state', async () => {
  const { audio, input } = fixture();
  const first = await audio.startHold({ command: 'ptt' });
  const second = await audio.startHold({ command: 'ptt' });
  assert.equal(input.mute, false);
  await audio.releaseHold(first); assert.equal(input.mute, false);
  await audio.releaseHold(second); assert.equal(input.mute, true);
  const fast = audio.startHold({ command: 'ptt' }).then(token => audio.releaseHold(token));
  await fast; assert.equal(input.mute, true);
});

test('Push-to-mute and service shutdown restore prior input state', async () => {
  const { audio, input } = fixture(false);
  await audio.startHold({ command: 'ptm' }); assert.equal(input.mute, true);
  await audio.close(); assert.equal(input.mute, false);
  assert.equal(audio.tokens.size, 0);
});

test('Application volume affects all streams and invalid targets fail explicitly', async () => {
  const { audio, commands } = fixture();
  await audio.execute({ kind: 'application', target: 'player', command: 'volumeup', volume: 5 });
  assert.deepEqual(commands, [['set-sink-input-volume', '2', '45%'], ['set-sink-input-volume', '3', '45%']]);
  await assert.rejects(audio.execute({ kind: 'input', target: 'unplugged', command: 'mute' }), /no longer available/);
});
