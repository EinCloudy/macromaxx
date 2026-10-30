import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initialState, makeKey, makeAction, makeProfile, duplicateProfile, validateState } from '../shared/model.js';
import {
  createWorkspaceExport, missingWorkspaceCredentials, restoreWorkspaceCredential,
  hasMissingCredentials, clearCredentialFields,
} from '../shared/workspace-credentials.js';
import { Actions } from '../electron/actions.js';
import { NativePlugins } from '../electron/native-plugins.js';
import { Store } from '../electron/store.js';
import { create as createOBS } from '../plugins/native/obs/index.js';

function fixture() {
  const state = initialState();
  state.settings.obsPassword = 'OBS_SECRET_123';
  const folder = state.profiles[0].keys[4];
  const key = makeKey('webhook', 'Private webhook', {
    url: 'https://example.com/api/webhooks/42/PATH_SECRET_123',
    method: 'POST', headers: '{"Content-Type":"application/json","X-Unusual":"HEADER_SECRET_123"}',
    body: '{"arbitraryName":"BODY_SECRET_123"}',
  });
  key.longActions = [makeAction('plugin', { pluginId: 'hello', config: '{"nested":{"arbitrary":"PLUGIN_SECRET_123"}}' })];
  folder.children = [null, key];
  const second = makeProfile('Second profile');
  second.keys[0] = makeKey('app', 'Launch', { path: '/bin/example', args: '["--safe"]', env: '{"UNUSUAL":"ENV_SECRET_123"}' });
  second.keys[1] = makeKey('script', 'Script', { script: 'echo hello', env: '{"TOKEN":"SCRIPT_SECRET_123"}' });
  second.keys[2] = makeKey('url', 'Private website', { url: 'https://user:URL_SECRET_123@example.com/?code=QUERY_SECRET_123#FRAGMENT_SECRET_123' });
  state.profiles.push(second);
  return state;
}

test('Exports omit credentials throughout all profiles, nested folders and both action chains without mutating local data', () => {
  const state = fixture(), before = structuredClone(state);
  state.profiles[0].keys[4].children[1].image = 'data:image/png;base64,aGVsbG8=';
  before.profiles[0].keys[4].children[1].image = state.profiles[0].keys[4].children[1].image;
  const exported = validateState(createWorkspaceExport(state));
  assert.deepEqual(state, before);
  const serialized = JSON.stringify(exported);
  assert.doesNotMatch(serialized, /(?:OBS|PATH|HEADER|BODY|PLUGIN|ENV|SCRIPT|URL|QUERY|FRAGMENT)_SECRET_123/);
  assert.equal(exported.settings.obsPassword, '');
  assert.equal(exported.settings.obsUrl, state.settings.obsUrl);
  assert.equal(exported.profiles[0].keys[4].children[1].image, before.profiles[0].keys[4].children[1].image);
  assert.equal(exported.profiles[1].keys[0].actions[0].args, '["--safe"]');
  assert.equal(exported.profiles[1].keys[1].actions[0].script, 'echo hello');
  assert.equal(missingWorkspaceCredentials(exported).length, 8);
  const header = missingWorkspaceCredentials(exported).find(entry => entry.field === 'headers');
  assert.match(header.context, /My Workspace \/ Workflows \/ Private webhook/);
  assert.equal(header.container.headers, '{}');
});

test('Capability URLs, unusual header names and malformed opaque fields cannot leak credentials', () => {
  const state = initialState();
  state.profiles[0].keys[0] = makeKey('webhook', 'Webhook', {
    url: 'https://hooks.example.com/opaque-private-path',
    headers: 'malformed SECRET_HEADER', body: 'raw SECRET_BODY',
  });
  state.profiles[0].keys[1] = makeKey('plugin', 'Plugin', { config: 'malformed SECRET_CONFIG' });
  state.profiles[0].keys[2] = makeKey('app', 'App', { env: 'malformed SECRET_ENV' });
  const output = createWorkspaceExport(state);
  assert.doesNotMatch(JSON.stringify(output), /SECRET_|opaque-private-path/);
  assert.equal(output.profiles[0].keys[0].actions[0].url, '');
  assert.equal(missingWorkspaceCredentials(output).length, 5);
});

test('Export with credentials explicitly preserves all stored values without mutating the workspace', () => {
  const state = fixture(), before = structuredClone(state);
  const exported = validateState(createWorkspaceExport(state, { includeCredentials: true }));
  assert.deepEqual(exported, before);
  assert.notEqual(exported, state);
  assert.notEqual(exported.settings, state.settings);
  assert.equal(exported.settings.obsPassword, 'OBS_SECRET_123');
  assert.match(JSON.stringify(exported), /HEADER_SECRET_123/);
  assert.equal(missingWorkspaceCredentials(exported).length, 0);
  assert.deepEqual(state, before);
});

test('Credential omission remains the default and requires explicit opt-in to bypass', () => {
  for (const options of [undefined, {}, { includeCredentials: false }, { includeCredentials: 'true' }]) {
    const exported = createWorkspaceExport(fixture(), options);
    assert.equal(exported.settings.obsPassword, '');
    assert.equal(missingWorkspaceCredentials(exported).length, 8);
  }
});

test('Export with credentials cannot recover previously omitted values or remove their missing-field markers', () => {
  const shared = createWorkspaceExport(fixture());
  const exported = validateState(createWorkspaceExport(shared, { includeCredentials: true }));
  assert.deepEqual(exported, shared);
  assert.equal(missingWorkspaceCredentials(exported).length, 8);
  assert.doesNotMatch(JSON.stringify(exported), /OBS_SECRET_123|HEADER_SECRET_123/);
});

test('Credential-named action/settings fields are omitted irrespective of case or separators', () => {
  const state = initialState();
  state.settings.api_key = 'CUSTOM_API_SECRET';
  state.settings.accessToken = 'CUSTOM_ACCESS_SECRET';
  const action = state.profiles[0].keys[0].actions[0];
  Object.assign(action, { CLIENT_SECRET: 'CUSTOM_CLIENT_SECRET', passphrase: 'CUSTOM_PHRASE_SECRET', Authorization: 'CUSTOM_AUTH_SECRET' });
  const output = validateState(createWorkspaceExport(state));
  assert.doesNotMatch(JSON.stringify(output), /CUSTOM_/);
  assert.equal(missingWorkspaceCredentials(output).length, 5);
});

test('Empty values and non-sensitive URLs/settings keep working without spurious missing fields', () => {
  const state = initialState();
  state.profiles[0].keys[5] = makeKey('webhook', 'Empty', { headers: '{ }', body: '{}' });
  state.profiles[0].keys[6] = makeKey('plugin', 'Empty plugin', { config: '{ }' });
  state.profiles[0].keys[7] = makeKey('script', 'Empty env', { env: '{}' });
  const output = createWorkspaceExport(state);
  assert.deepEqual(output, state);
  assert.equal(missingWorkspaceCredentials(output).length, 0);
});

test('OBS addresses and website URLs with embedded auth, queries, fragments or invalid syntax are omitted', () => {
  for (const url of ['ws://user:secret@localhost:4455', 'ws://localhost:4455?token=secret', 'ws://localhost:4455#secret', 'invalid secret']) {
    const state = initialState(); state.settings.obsUrl = url;
    const output = validateState(createWorkspaceExport(state));
    assert.equal(output.settings.obsUrl, '');
    assert.deepEqual(output.settings.missingCredentials, ['obsUrl']);
  }
  for (const url of ['https://user:secret@example.com', 'https://example.com?code=secret', 'https://example.com#secret', 'invalid secret']) {
    const state = initialState(); state.profiles[0].keys[1].actions[0].url = url;
    assert.equal(createWorkspaceExport(state).profiles[0].keys[1].actions[0].url, '');
  }
});

test('Missing markers survive JSON, repeated export and duplication, and never retain original values', () => {
  const first = createWorkspaceExport(fixture());
  const second = validateState(JSON.parse(JSON.stringify(createWorkspaceExport(first))));
  assert.deepEqual(second, first);
  const copy = duplicateProfile(second.profiles[0]);
  second.profiles.push(copy);
  const entries = missingWorkspaceCredentials(second);
  assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length);
  const copyField = entries.find(entry => entry.context.startsWith(copy.name) && entry.field === 'url');
  restoreWorkspaceCredential(second, copyField.id, 'https://new.example.com');
  assert.equal(second.profiles[0].keys[4].children[1].actions[0].url, '');
  assert.ok(hasMissingCredentials(second.profiles[0].keys[4].children[1].actions[0]));
  assert.doesNotThrow(() => validateState(second));
});

test('Explicit completion restores one field at a time and subsequent exports omit the new values', () => {
  const state = createWorkspaceExport(fixture());
  const count = missingWorkspaceCredentials(state).length;
  const obs = missingWorkspaceCredentials(state).find(entry => entry.field === 'obsPassword');
  restoreWorkspaceCredential(state, obs.id, 'MY_NEW_SECRET');
  assert.equal(state.settings.obsPassword, 'MY_NEW_SECRET');
  assert.equal(hasMissingCredentials(state.settings), false);
  assert.equal(missingWorkspaceCredentials(state).length, count - 1);
  assert.ok(hasMissingCredentials(state.profiles[0].keys[4].children[1].actions[0]));
  assert.doesNotMatch(JSON.stringify(createWorkspaceExport(state)), /MY_NEW_SECRET/);
  const config = missingWorkspaceCredentials(state).find(entry => entry.field === 'config');
  restoreWorkspaceCredential(state, config.id, '{}');
  assert.equal(hasMissingCredentials(config.container), false);
  assert.doesNotThrow(() => validateState(state));
});

test('Completion rejects bad JSON, unsupported URLs, empty input and forged identifiers without changing the workspace', () => {
  const state = createWorkspaceExport(fixture());
  const before = structuredClone(state);
  const headers = missingWorkspaceCredentials(state).find(entry => entry.field === 'headers');
  for (const value of ['{bad', '[]', 'null', '{"Authorization":42}'])
    assert.throws(() => restoreWorkspaceCredential(state, headers.id, value), /JSON object|must be strings/);
  const endpoint = missingWorkspaceCredentials(state).find(entry => entry.field === 'url');
  for (const value of ['not a url', 'javascript:alert(1)', 'file:///etc/passwd'])
    assert.throws(() => restoreWorkspaceCredential(state, endpoint.id, value), /URL/);
  assert.throws(() => restoreWorkspaceCredential(state, endpoint.id, ''), /missing value/);
  assert.throws(() => restoreWorkspaceCredential(state, '["__proto__","polluted"]', 'secret'), /no longer exists/);
  assert.deepEqual(state, before);
  assert.equal({}.polluted, undefined);
});

test('Untrusted missing-field metadata is validated, including structural and prototype properties', () => {
  for (const fields of [true, 'password', [null], ['obsPassword', 'obsPassword'], ['absent'], ['__proto__'], ['constructor'], ['missingCredentials'], Array(101).fill('obsPassword')]) {
    const state = initialState(); state.settings.missingCredentials = fields;
    assert.throws(() => validateState(state), /missing-credential/);
  }
  for (const field of ['id', 'type']) {
    const state = initialState(); state.profiles[0].keys[0].actions[0].missingCredentials = [field];
    assert.throws(() => validateState(state), /missing-credential/);
  }
  const state = initialState(); state.settings.missingCredentials = ['brightness'];
  assert.throws(() => validateState(state), /missing-credential/);
});

test('Normal editor updates can explicitly clear only the field they replace', () => {
  const action = { url: '', headers: '{}', missingCredentials: ['url', 'headers'] };
  clearCredentialFields(action, ['url']);
  assert.deepEqual(action.missingCredentials, ['headers']);
  clearCredentialFields(action, ['headers']);
  assert.equal(Object.hasOwn(action, 'missingCredentials'), false);
});

test('Whitespace-only passwords are still credentials, not empty values', () => {
  const state = initialState(); state.settings.obsPassword = '   ';
  const output = createWorkspaceExport(state);
  assert.equal(output.settings.obsPassword, '');
  assert.deepEqual(output.settings.missingCredentials, ['obsPassword']);
  restoreWorkspaceCredential(output, missingWorkspaceCredentials(output)[0].id, '   ');
  assert.equal(output.settings.obsPassword, '   ');
  assert.equal(hasMissingCredentials(output.settings), false);
});

test('Affected actions are blocked before any network, plugin, shell or native dispatch, including long presses', async () => {
  const state = createWorkspaceExport(fixture());
  const calls = [], errors = [];
  const actions = new Actions({ getState: () => state, native: { handles: () => { calls.push('native'); return true; }, execute: () => calls.push('execute') },
    shell: { openExternal: () => calls.push('shell') }, plugins: { execute: () => calls.push('plugin') }, status: () => {},
    log: (level, title, message) => errors.push(message), updateKey: () => {} });
  for (const entry of missingWorkspaceCredentials(state).filter(entry => entry.container.type))
    await assert.rejects(actions.run(entry.container), /Missing credentials/);
  await assert.rejects(actions.run(makeAction('obs')), /Missing credentials/);
  const key = state.profiles[0].keys[4].children[1];
  await actions.execute(key); await actions.execute(key, true);
  assert.ok(errors.every(error => error.includes('Missing credentials')));
  assert.deepEqual(calls, []);
});

test('Native dispatch and physical holds cannot bypass missing-field protection', async () => {
  const calls = [];
  const host = new NativePlugins('', { getState: initialState });
  host.records = [{ state: 'loaded', manifest: { id: 'keyboard', actions: { hotkey: 'keyboard.input' } }, instance: {
    capabilities: () => ({ 'keyboard.input': { available: true } }), isHold: () => true,
    actions: { hotkey: () => calls.push('execute') }, beginHold: () => calls.push('hold'),
  } }];
  const action = { type: 'hotkey', keys: '', missingCredentials: ['keys'] };
  await assert.rejects(host.execute(action), /Missing credentials/);
  await assert.rejects(host.beginHold(action), /Missing credentials/);
  assert.deepEqual(calls, []);
});

test('OBS connect and control reject missing credentials and settings changes drop a previous authorized session', async () => {
  const state = createWorkspaceExport(fixture()), calls = [];
  const plugin = await createOBS({ getState: () => state, obsFactory: () => ({ state: {},
    connect: () => calls.push('connect'), execute: () => calls.push('execute'), disconnect: () => calls.push('disconnect'),
  }) });
  assert.throws(() => plugin.operations.connect(), /Missing credentials/);
  assert.throws(() => plugin.actions.obs({ type: 'obs' }), /Missing credentials/);
  assert.deepEqual(calls, []);
  await plugin.beforeSettings(fixture().settings, state.settings);
  assert.deepEqual(calls, ['disconnect']);
  const field = missingWorkspaceCredentials(state).find(entry => entry.field === 'obsPassword');
  restoreWorkspaceCredential(state, field.id, 'my-password');
  await plugin.operations.connect();
  assert.equal(calls.at(-1), 'connect');
});

test('Restart preserves missing markers and legacy version-1 workspaces remain compatible', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'macro-credentials-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const store = new Store(dir), exported = createWorkspaceExport(fixture());
  await store.save(exported);
  const restored = await new Store(dir).load();
  assert.deepEqual(restored, exported);
  assert.equal(missingWorkspaceCredentials(restored).length, 8);
  const legacy = fixture();
  assert.equal(validateState(legacy), legacy);
  assert.equal(missingWorkspaceCredentials(legacy).length, 0);
  assert.equal(legacy.settings.obsPassword, 'OBS_SECRET_123');
  assert.doesNotMatch(JSON.stringify(createWorkspaceExport(legacy)), /OBS_SECRET_123/);
});
