import test from 'node:test';
import assert from 'node:assert/strict';
import { actionLibrary, libraryAction, libraryKey } from '../shared/action-library.js';
import { initialState, validateState } from '../shared/model.js';

test('Built-in actions use functional categories independently of their native provider', () => {
  const library = actionLibrary([], { native: { plugins: [{ id: 'adapter', name: 'Keyboard adapter' }, { id: 'backend', name: 'Hidden backend', actions: [] }], actionTypes: { hotkey: { provider: 'adapter', available: false, reason: 'Permission missing', defaults: { keys: 'ALT+A' } } } } });
  const hotkey = library.find(item => item.key === 'hotkey');
  assert.equal(hotkey.group, 'Keyboard & text');
  assert.equal(hotkey.availability.available, false);
  assert.equal(hotkey.defaults.keys, 'ALT+A');
  assert.equal(library.find(item => item.key === 'url').group, 'Connections');
  assert.equal(library.find(item => item.key === 'text').group, hotkey.group);
  for (const type of ['media', 'audio', 'sound']) assert.equal(library.find(item => item.key === type).group, 'Media & audio');
  assert.deepEqual([...new Set(library.map(item => item.group))], ['Keyboard & text', 'Media & audio', 'Apps & system', 'Connections', 'Organization', 'Workflows']);
  assert.ok(!library.some(item => item.group.includes('Hidden backend')));
  assert.ok(!library.some(item => item.key === 'plugin'));
});

test('Functional categories include every built-in action exactly once', async () => {
  const { catalog } = await import('../shared/model.js');
  assert.deepEqual(actionLibrary([]).map(item => item.type).sort(), catalog.filter(item => item.type !== 'plugin').map(item => item.type).sort());
});

test('Each user plugin has its own assignable entry, with defaults and portable saved actions', () => {
  const library = actionLibrary([{ id: 'hotkey', name: 'Custom shortcut', fields: [{ key: 'name', default: 'World' }, { key: 'empty' }] }, { id: 'other', name: 'Another plugin' }]);
  const item = library.find(item => item.key === 'user:hotkey');
  assert.equal(item.name, 'Custom shortcut');
  const key = libraryKey(item);
  assert.equal(key.label, 'Custom shortcut');
  assert.equal(key.icon, 'Puzzle');
  assert.equal(key.actions[0].type, 'plugin');
  assert.equal(key.actions[0].pluginId, 'hotkey');
  assert.deepEqual(JSON.parse(key.actions[0].config), { name: 'World' });
  key.longActions.push(libraryAction(item));
  assert.notEqual(key.actions[0].id, key.longActions[0].id);
  const state = initialState();
  state.profiles[0].keys[0] = key;
  assert.equal(validateState(state), state);
  assert.ok(library.some(item => item.key === 'hotkey'));
  assert.ok(library.some(item => item.key === 'user:other'));
});
