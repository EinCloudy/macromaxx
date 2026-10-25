import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Desktop } from '../plugins/native/linux-desktop/service.js';
test('KDE exposes only detected shortcuts and invokes the native KWin component', async () => {
  const calls = [];
  const desktop = new Desktop(() => {}, {}, { environment: { XDG_CURRENT_DESKTOP: 'KDE', WAYLAND_DISPLAY: 'wayland-1' }, platform: 'linux', execute: async (_, args) => { calls.push(args); return args.at(-1).endsWith('shortcutNames') ? 'Window Minimize\nWindow Close' : ''; } });
  await desktop.probe(); assert.deepEqual(desktop.state.supported, ['minimize', 'close']);
  await desktop.execute({ command: 'minimize' }); assert.equal(calls.at(-1).at(-1), 'Window Minimize');
  await assert.rejects(desktop.execute({ command: 'next-output' }), /not supported/);
});
test('Unsupported Wayland desktops report capabilities instead of simulating a successful action', async () => {
  const desktop = new Desktop(() => {}, {}, { environment: { XDG_CURRENT_DESKTOP: 'sway', WAYLAND_DISPLAY: 'wayland-1' }, platform: 'linux' });
  await desktop.probe(); assert.equal(desktop.state.available, false);
  await assert.rejects(desktop.execute({ command: 'close' }), /no configured/);
});
