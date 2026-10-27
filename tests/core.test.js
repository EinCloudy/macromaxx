import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { initialState, makeKey, makeAction, duplicateKey, validateState, visibleKeys } from '../shared/model.js';
import { Store } from '../electron/store.js';
import { Actions } from '../electron/actions.js';
import { parseKeys } from '../plugins/native/keyboard/service.js';
import { Plugins } from '../electron/plugins.js';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { create as createOBS } from '../plugins/native/obs/index.js';

test('Workspace round-trip preserves nested folders, icons and long press actions', () => {
  const state = initialState(); const folder = state.profiles[0].keys[4];
  folder.children = [makeKey('webhook')]; folder.children[0].longActions = [makeAction('delay')];
  folder.children[0].image = 'data:image/png;base64,aGVsbG8=';
  const restored = validateState(JSON.parse(JSON.stringify(state)));
  assert.equal(visibleKeys(restored, [4])[0].longActions[0].ms, 500);
  assert.equal(visibleKeys(restored, [4])[0].image, folder.children[0].image);
  state.profiles[0].keys[5] = duplicateKey(folder);
  assert.notEqual(state.profiles[0].keys[5].children[0].id, folder.children[0].id);
  assert.doesNotThrow(() => validateState(state));
});

test('Malformed imports are rejected, including duplicate IDs and unsafe images', () => {
  const state = initialState(); state.profiles[0].keys[0].image = 'https://example.com/icon.svg';
  assert.throws(() => validateState(state), /key image/);
  state.profiles[0].keys[0].image = '';
  state.profiles[0].keys[5] = structuredClone(state.profiles[0].keys[0]);
  assert.throws(() => validateState(state), /Invalid key/);
  state.profiles[0].keys[5] = null; delete state.profiles[0].keys[0].longActions;
  assert.throws(() => validateState(state), /action chain/);
});

test('Serialized atomic saves recover from a corrupted primary file', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'macromaxx-store-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const store = new Store(dir); const first = await store.load(); await store.save(first);
  const second = structuredClone(first); second.profiles[0].name = 'Zweites Profil';
  await Promise.all([store.save(second), store.save(first), store.save(second)]);
  assert.equal((await store.load()).profiles[0].name, 'Zweites Profil');
  await fs.writeFile(store.file, '{broken');
  assert.deepEqual(await store.load(), first);
  assert.ok(store.recovery);
});

function engine(overrides = {}) {
  const events = []; const calls = [];
  const actions = new Actions({ native: { handles: type => type === 'hotkey', execute: async action => calls.push(action.keys) }, plugins: {}, shell: {}, getState: initialState, navigate: () => {}, log: (...args) => events.push(args), updateKey: () => {}, status: () => {}, ...overrides });
  return { actions, events, calls };
}

test('Chains execute in order, honor long press and stop on error', async () => {
  const { actions, events, calls } = engine(); const key = makeKey('hotkey'); key.actions = [{ type: 'hotkey', keys: 'CTRL+A' }, { type: 'hotkey', keys: 'CTRL+C' }];
  await actions.execute(key); assert.deepEqual(calls, ['CTRL+A', 'CTRL+C']);
  key.longActions = [{ type: 'hotkey', keys: 'CTRL+V' }]; await actions.execute(key, true); assert.equal(calls.at(-1), 'CTRL+V');
  key.actions = [{ type: 'unknown' }, { type: 'hotkey', keys: 'CTRL+Z' }]; await actions.execute(key); assert.notEqual(calls.at(-1), 'CTRL+Z');
  key.stopOnError = false; await actions.execute(key); assert.equal(calls.at(-1), 'CTRL+Z'); assert.ok(events.some(e => e[0] === 'error'));
});

test('Triggering a running chain cancels its delay and prevents subsequent steps', async () => {
  const { actions, calls } = engine(); const key = makeKey('delay'); key.actions = [{ type: 'delay', ms: 10000 }, { type: 'hotkey', keys: 'CTRL+A' }];
  const running = actions.execute(key); await actions.execute(key); await running;
  assert.equal(calls.length, 0); assert.equal(actions.running.size, 0);
});

test('Webhook sends real HTTP headers and body and reports failures', async t => {
  let received;
  const server = http.createServer(async (req, res) => { let body = ''; for await (const chunk of req) body += chunk; received = { method: req.method, header: req.headers['x-macro'], body }; res.writeHead(req.url === '/fail' ? 500 : 204); res.end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const { actions } = engine(); const url = `http://127.0.0.1:${server.address().port}`;
  const result = await actions.run({ type: 'webhook', method: 'POST', url, headers: '{"x-macro":"test"}', body: '{"hello":true}' }, new AbortController().signal);
  assert.match(result.message, /204/); assert.deepEqual(received, { method: 'POST', header: 'test', body: '{"hello":true}' });
  await assert.rejects(() => actions.run({ type: 'webhook', url: url + '/fail', method: 'GET' }, new AbortController().signal), /HTTP 500/);
});

test('Plugin executes in an isolated process and returns dynamic key feedback', async () => {
  const plugins = new Plugins([fileURLToPath(new URL('../plugins', import.meta.url))]);
  const list = await plugins.scan(); assert.equal(list[0].id, 'hello');
  const result = await plugins.execute('hello', { name: 'Test' }, new AbortController().signal);
  assert.equal(result.label, 'Hi Test!'); assert.equal(result.color, '#86efac'); plugins.close();
});

test('Hotkeys parse modifiers, function and navigation keys, and reject invalid keys', () => {
  assert.deepEqual(parseKeys('Ctrl+Shift+F12').map(k => k.code), [0xffe3, 0xffe1, 0xffc9]);
  assert.equal(parseKeys('ALT+LEFT')[1].code, 0xff51);
  assert.equal(parseKeys('CTRL+PLUS')[1].code, 43);
  assert.throws(() => parseKeys('CTRL+invalid'), /Unknown key/);
});

test('OBS connects, requests studio state, executes actions and reflects live events', { timeout: 15000 }, async t => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise(resolve => server.on('listening', resolve));
  let socket; const requests = [];
  server.on('connection', client => {
    socket = client; client.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: '5.5.0', rpcVersion: 1 } }));
    client.on('message', raw => {
      const msg = JSON.parse(raw);
      if (msg.op === 1) client.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
      if (msg.op === 6) {
        const { requestType, requestId, requestData } = msg.d; requests.push([requestType, requestData]);
        const results = { GetSceneList: { currentProgramSceneName: 'Desktop', scenes: [{ sceneName: 'Desktop' }, { sceneName: 'Kamera' }] }, GetInputList: { inputs: [{ inputName: 'Mic/Aux' }] }, GetInputMute: { inputMuted: false }, GetRecordStatus: { outputActive: false }, GetStreamStatus: { outputActive: false } };
        client.send(JSON.stringify({ op: 7, d: { requestType, requestId, requestStatus: { result: true, code: 100 }, responseData: results[requestType] || {} } }));
        if (requestType === 'SetCurrentProgramScene') client.send(JSON.stringify({ op: 5, d: { eventType: 'CurrentProgramSceneChanged', eventIntent: 4, eventData: { sceneName: requestData.sceneName } } }));
      }
    });
  });
  const state = initialState(); state.settings.obsUrl = `ws://127.0.0.1:${server.address().port}`;
  const plugin = await createOBS({ getState: () => state, changed: () => {} });
  const { actions } = engine({ native: { handles: type => type === 'obs', execute: action => plugin.actions.obs(action) } });
  t.after(async () => { await plugin.close(); socket?.terminate(); await new Promise(resolve => server.close(resolve)); });
  await plugin.operations.connect(); assert.equal(plugin.status().obs.connected, true); assert.deepEqual(plugin.status().obs.scenes, ['Desktop', 'Kamera']);
  await actions.run({ type: 'obs', command: 'scene', scene: 'Kamera' });
  await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(plugin.status().obs.scene, 'Kamera');
  await actions.run({ type: 'obs', command: 'mute', input: 'Mic/Aux' });
  assert.ok(requests.some(([type, data]) => type === 'ToggleInputMute' && data.inputName === 'Mic/Aux'));
});
