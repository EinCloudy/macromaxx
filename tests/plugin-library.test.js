import test from 'node:test';
import assert from 'node:assert/strict';
import { pluginLibrary } from '../shared/plugin-library.js';

const native = (patch = {}) => ({ id: 'media', name: 'Media', state: 'loaded', enabled: true, ...patch });

test('Plugin library combines native and user plugins without ID collisions', () => {
  const plugins = pluginLibrary([{ id: 'media', name: 'Custom media', fields: [] }], [native()], {});
  assert.deepEqual(plugins.map(plugin => plugin.key), ['native:media', 'user:media']);
  assert.equal(plugins[1].state, 'installed');
  assert.deepEqual(plugins[1].fields, []);
});

test('Native plugin toggles reflect local settings immediately and undo clears restart notice', () => {
  const get = (settings, plugin = native()) => pluginLibrary([], [plugin], settings)[0];
  assert.equal(get({}).restartRequired, false);
  assert.equal(get({ disabledNativePlugins: ['media'] }).enabled, false);
  assert.equal(get({ disabledNativePlugins: ['media'] }).restartRequired, true);
  assert.equal(get({}, native({ enabled: false, restartRequired: true })).restartRequired, false);
  assert.equal(get({}, native({ state: 'disabled', enabled: false })).restartRequired, true);
  assert.equal(get({ disabledNativePlugins: ['media'] }, native({ state: 'disabled', enabled: false })).restartRequired, false);
});

test('Required and unsupported plugins do not request restarts', () => {
  const items = pluginLibrary([], [native({ required: true }), native({ id: 'linux', state: 'unsupported' })], { disabledNativePlugins: ['media', 'linux'] });
  assert.equal(items[0].enabled, true);
  assert.ok(items.every(plugin => !plugin.restartRequired));
});
