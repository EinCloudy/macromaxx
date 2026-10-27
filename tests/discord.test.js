import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { DiscordRPC, encodeFrame, ipcPaths } from '../plugins/native/discord/rpc.js';
import { authorizeRPC, CLIENT_ID, SCOPES } from '../plugins/native/discord/oauth.js';
import { create, discordVisual } from '../plugins/native/discord/index.js';
import { initialState, makeKey, validateState } from '../shared/model.js';

test('Discord IPC paths support Windows named pipes and deduplicated Unix runtime directories', () => {
  assert.equal(ipcPaths('win32')[0], '\\\\?\\pipe\\discord-ipc-0');
  assert.equal(ipcPaths('win32').length, 10);
  const paths = ipcPaths('linux', { XDG_RUNTIME_DIR: '/run/user/1000', TMPDIR: '/tmp' });
  assert.equal(paths[0], '/run/user/1000/discord-ipc-0');
  assert.equal(paths.length, 20);
  assert.ok(ipcPaths('darwin', { TMPDIR: '/private/temp' }).includes('/private/temp/discord-ipc-0'));
});

class Socket extends EventEmitter {
  constructor() { super(); this.writes = []; this.destroyed = false; }
  write(data) {
    this.writes.push(data);
    if (data.readUInt32LE(0) === 0) queueMicrotask(() => {
      const ready = encodeFrame(1, { evt: 'READY' });
      this.emit('data', ready.subarray(0, 4)); this.emit('data', ready.subarray(4));
    });
  }
  destroy() { if (!this.destroyed) { this.destroyed = true; this.emit('close'); } }
}

test('Discord native AUTHORIZE retains the full voice scopes and exchanges matching PKCE without a secret', async () => {
  let challenge; const stages = [];
  const token = await authorizeRPC({ request: async (command, args, event, options) => {
    assert.equal(command, 'AUTHORIZE');
    assert.equal(args.client_id, CLIENT_ID);
    assert.deepEqual(args.scopes, SCOPES);
    assert.equal(args.code_challenge_method, 'S256');
    assert.equal(args.response_type, 'code');
    assert.equal(Object.hasOwn(args, 'redirect_uri'), false);
    assert.equal(Object.hasOwn(args, 'code_verifier'), false);
    assert.equal(options.timeout, 120000);
    challenge = args.code_challenge;
    return { code: 'native-code' };
  } }, new AbortController().signal, { onStage: value => stages.push(value), fetchImpl: async (url, options) => {
    assert.equal(url, 'https://discord.com/api/oauth2/token');
    assert.equal(options.body.get('code'), 'native-code');
    assert.equal(createHash('sha256').update(options.body.get('code_verifier')).digest('base64url'), challenge);
    assert.equal(options.body.has('client_secret'), false);
    assert.equal(options.body.has('redirect_uri'), false);
    return { ok: true, json: async () => ({ access_token: 'native-token', scope: SCOPES.join(' ') }) };
  } });
  assert.equal(token.access_token, 'native-token');
  assert.deepEqual(stages, ['Local AUTHORIZE / PKCE', 'PKCE token exchange']);
});

test('Discord native authorization rejects invalid codes and cannot exchange after cancellation', async () => {
  const abort = new AbortController(); let exchanges = 0;
  const options = { fetchImpl: async () => { exchanges++; } };
  await assert.rejects(authorizeRPC({ request: async () => ({}) }, abort.signal, options), /valid code/);
  await assert.rejects(authorizeRPC({ request: async () => { abort.abort(); return { code: 'late' }; } }, abort.signal, options), /abort/i);
  assert.equal(exchanges, 0);
});

test('Native token failures report safe OAuth codes and reject missing permissions', async () => {
  const client = { request: async () => ({ code: 'private-code' }) };
  await assert.rejects(authorizeRPC(client, new AbortController().signal, {
    fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_request', error_description: 'Missing code_verifier; private-code private-token' }) }),
  }), error => {
    assert.match(error.message, /HTTP 400, invalid_request, code_verifier reported missing/);
    assert.ok(!/private-code|private-token/.test(error.message));
    return true;
  });
  await assert.rejects(authorizeRPC(client, new AbortController().signal, {
    fetchImpl: async () => ({ ok: true, json: async () => ({ access_token: 'test-only', scope: 'identify' }) }),
  }), /all requested permissions/);
});

test('Discord RPC authorization has a separate consent timeout, abort cleanup and safe OAuth errors', async () => {
  const socket = new Socket(), rpc = new DiscordRPC(CLIENT_ID, { timeout: 1, connect: () => { queueMicrotask(() => socket.emit('connect')); return socket; } });
  await rpc.open();
  const abort = new AbortController();
  const pending = rpc.request('AUTHORIZE', {}, undefined, { timeout: 120000, signal: abort.signal });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(rpc.pending.size, 1);
  abort.abort(); await assert.rejects(pending, /canceled/);
  assert.equal(rpc.pending.size, 0);
  const rejected = rpc.request('AUTHORIZE');
  const nonce = JSON.parse(socket.writes.at(-1).subarray(8)).nonce;
  socket.emit('data', encodeFrame(1, { evt: 'ERROR', nonce, data: { code: 5000, message: 'OAuth2 Error: invalid_scope: secret-callback-data' } }));
  await assert.rejects(rejected, error => {
    assert.match(error.message, /5000, invalid_scope/);
    assert.ok(!error.message.includes('secret-callback-data'));
    return true;
  });
  rpc.close();
});

test('Discord IPC handles fragmented frames, events, pings and pending-request cleanup', async () => {
  const socket = new Socket(), rpc = new DiscordRPC(CLIENT_ID, { timeout: 100, connect: () => { queueMicrotask(() => socket.emit('connect')); return socket; } });
  await rpc.open();
  const events = []; rpc.on('event', (...args) => events.push(args));
  const result = rpc.request('GET_VOICE_SETTINGS');
  const sent = JSON.parse(socket.writes.at(-1).subarray(8));
  socket.emit('data', Buffer.concat([encodeFrame(3, Buffer.from('ping')), encodeFrame(1, { cmd: 'GET_VOICE_SETTINGS', nonce: sent.nonce, data: { mute: true, deaf: false } }), encodeFrame(1, { cmd: 'DISPATCH', evt: 'VOICE_SETTINGS_UPDATE', data: { mute: false } })]));
  assert.deepEqual(await result, { mute: true, deaf: false });
  assert.equal(socket.writes.at(-1).readUInt32LE(0), 4);
  assert.deepEqual(events, [['VOICE_SETTINGS_UPDATE', { mute: false }]]);
  const pending = rpc.request('GET_VOICE_SETTINGS'); rpc.close();
  await assert.rejects(pending, /canceled/); assert.equal(rpc.pending.size, 0);
});

class FakeRPC extends EventEmitter {
  constructor() { super(); this.voice = { mute: false, deaf: false }; this.requests = []; }
  async open() {}
  async request(command, args, event) {
    this.requests.push([command, args, event]);
    if (command === 'SET_VOICE_SETTINGS') Object.assign(this.voice, args);
    return { ...this.voice };
  }
  close() { this.emit('disconnected'); }
}

test('Discord normal login, serialized toggles, external state and workspace compatibility remain intact', async () => {
  const client = new FakeRPC(); let authorizedClient;
  const plugin = await create({ changed() {}, discordRPCFactory: () => client, discordRPCAuthorize: async rpc => { authorizedClient = rpc; return { access_token: 'private-token', expires_in: 60 }; } });
  await assert.rejects(plugin.actions.discord({ command: 'mute' }), /Connect Discord/);
  await plugin.operations.connect();
  assert.equal(authorizedClient, client);
  assert.deepEqual(client.requests.map(([command]) => command), ['AUTHENTICATE', 'SUBSCRIBE', 'GET_VOICE_SETTINGS']);
  assert.deepEqual(Object.keys(plugin.operations).sort(), ['connect', 'disconnect']);
  assert.equal(plugin.status().discord.connected, true);
  assert.ok(!JSON.stringify(plugin.status()).includes('private-token'));
  assert.equal(Object.hasOwn(plugin.status().discord, 'diagnostics'), false);
  assert.equal(Object.hasOwn(plugin.status().discord, 'comparisons'), false);
  await Promise.all([plugin.actions.discord({ command: 'mute' }), plugin.actions.discord({ command: 'mute' })]);
  assert.equal(client.voice.mute, false);
  await plugin.actions.discord({ command: 'deaf', mode: 'on' });
  const key = makeKey('discord'); key.actions[0].command = 'deaf';
  assert.deepEqual(plugin.visual(key), { active: true });
  client.emit('event', 'VOICE_SETTINGS_UPDATE', { deaf: false });
  assert.deepEqual(plugin.visual(key), { active: false });
  await assert.rejects(plugin.actions.discord({ command: 'invalid' }), /Unsupported/);
  await plugin.close();
  assert.equal(plugin.visual(key), null);
  assert.equal(discordVisual(makeKey('url'), { connected: true }), null);
  const state = initialState(); state.profiles[0].keys[0] = key;
  assert.equal(validateState(state), state);
});

test('Discord disconnect cancels a late authorization without authenticating', async () => {
  const client = new FakeRPC(); let finish;
  const plugin = await create({ discordRPCFactory: () => client, discordRPCAuthorize: () => new Promise(resolve => { finish = resolve; }) });
  const connecting = plugin.operations.connect();
  await new Promise(resolve => setImmediate(resolve));
  plugin.operations.disconnect(); finish({ access_token: 'late' }); await connecting;
  assert.equal(plugin.status().discord.connected, false);
  assert.ok(!client.requests.some(([command]) => command === 'AUTHENTICATE'));
});
