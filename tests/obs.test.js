import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { OBSStudio, obsVisual } from '../plugins/native/obs/service.js';
import { create } from '../plugins/native/obs/index.js';

function fixture() {
  const socket = new EventEmitter(), calls = [];
  socket.connect = async (...args) => { calls.push(['connect', ...args]); };
  socket.disconnect = async () => { calls.push(['disconnect']); socket.emit('ConnectionClosed'); };
  socket.call = async (type, data) => {
    calls.push([type, data]);
    return { GetSceneList: { currentProgramSceneName: 'Main', scenes: [{ sceneName: 'Main' }] }, GetInputList: { inputs: [{ inputName: 'Mic' }] }, GetRecordStatus: { outputActive: false }, GetStreamStatus: { outputActive: false }, GetInputMute: { inputMuted: false } }[type] || {};
  };
  return { socket, calls, obs: new OBSStudio(() => {}, socket) };
}
const settings = { obsUrl: 'ws://127.0.0.1:4455', obsPassword: 'secret' };

test('OBS plugin uses saved connection settings and reports live state through the native contract', async () => {
  const { socket, calls, obs } = fixture();
  const plugin = await create({ obsFactory: () => obs, getState: () => ({ settings }) });
  assert.equal(plugin.capabilities()['obs.control'].ready, false);
  await plugin.operations.connect();
  assert.ok(calls.some(([operation, url, password]) => operation === 'connect' && url === settings.obsUrl && password === 'secret'));
  assert.equal(plugin.capabilities()['obs.control'].ready, true);
  socket.emit('RecordStateChanged', { outputActive: true });
  socket.emit('StreamStateChanged', { outputActive: true });
  socket.emit('InputMuteStateChanged', { inputName: 'Mic', inputMuted: true });
  for (const action of [{ command: 'scene', scene: 'Main' }, { command: 'record' }, { command: 'stream' }, { command: 'mute', input: 'Mic' }]) {
    assert.equal(plugin.visual({ actions: [{ type: 'obs', ...action }] }).active, true);
    await plugin.actions.obs(action);
  }
  assert.ok(calls.some(([type]) => type === 'ToggleRecord'));
  assert.ok(calls.some(([type]) => type === 'ToggleStream'));
  await plugin.suspend();
  assert.equal(plugin.status().obs.connected, false);
  assert.equal(plugin.visual({ actions: [{ type: 'obs', command: 'record' }] }).active, false);
  await assert.rejects(plugin.actions.obs({ command: 'record' }), /Plugins → OBS Studio/);
  await plugin.close();
  await assert.rejects(plugin.operations.connect(), /closing/);
});

test('Failed OBS initialization disconnects instead of publishing a partly connected state', async () => {
  const { obs, socket } = fixture();
  socket.call = async () => { throw new Error('Permission denied'); };
  await assert.rejects(obs.connect(settings), /Permission denied/);
  assert.equal(obs.state.connected, false);
  assert.deepEqual(obs.state.scenes, []);
  await obs.close();
});

test('OBS validates addresses, rejects unknown commands, and clears stale state on disconnect', async () => {
  const { obs, socket } = fixture();
  await assert.rejects(obs.connect({ obsUrl: 'https://localhost' }), /ws:\/\//);
  await obs.connect(settings);
  await assert.rejects(obs.execute({ command: 'unknown' }), /Unknown OBS command/);
  socket.emit('ConnectionClosed');
  assert.deepEqual(obs.state.scenes, []);
  assert.equal(obs.state.connected, false);
  assert.equal(obsVisual({ actions: [{ type: 'url' }] }, obs.state), null);
  await obs.close();
});
