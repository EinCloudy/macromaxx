import fs from 'node:fs/promises';
import path from 'node:path';
import { Input } from './service.js';
import { run } from '../../../electron/commands.js';

export async function create(ctx) {
  const input = new Input(ctx.changed, { tokenFile: path.join(ctx.dataDirectory, 'keyboard-permission.json'), platform: ctx.platform, environment: ctx.environment, execute: ctx.runCommand });
  let diagnostics = await input.diagnostics();
  const available = () => ctx.platform === 'linux' ? input.wayland ? diagnostics.python : diagnostics.xdotool : ctx.platform === 'win32' ? diagnostics.powershell : diagnostics.osascript;
  input.integrationAvailable = !!available();
  const refresh = async () => { diagnostics = await input.diagnostics(); input.integrationAvailable = !!available(); ctx.changed(); return diagnostics; };
  return {
    services: { input },
    capabilities: () => ({
      'keyboard.hotkey': { available: !!available(), reason: available() ? '' : 'Install the native keyboard dependencies shown below.', features: { hold: ctx.platform !== 'darwin', permissionRequired: input.wayland || ctx.platform === 'darwin' }, ready: input.ready },
      'keyboard.text': { available: !!available(), reason: available() ? '' : 'Native keyboard input is unavailable.' },
    }),
    supports: action => ctx.platform === 'darwin' && action.type === 'hotkey' && action.mode && action.mode !== 'tap' ? { available: false, reason: 'The macOS adapter currently supports press-and-release only.' } : { available: true },
    actions: {
      hotkey: action => input.hotkey(action.keys, action.mode || 'tap'),
      text: async action => { ctx.clipboard.writeText(String(action.text || '')); await input.hotkey(ctx.platform === 'darwin' ? 'CMD+V' : 'CTRL+V'); },
    },
    operations: {
      diagnostics: refresh,
      setup: async () => { try { await input.setup({ persist: ctx.getState().settings.rememberWaylandPermission !== false }); } finally { await refresh(); } return diagnostics; },
      forget: async () => { await input.forget(); return refresh(); },
      installUdev: async () => {
        if (ctx.platform !== 'linux') throw new Error('USB udev setup is only available in the Linux keyboard adapter.');
        const source = path.join(ctx.tempDirectory, '70-macromaxx-streamdeck.rules');
        await fs.writeFile(source, 'SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0fd9", TAG+="uaccess"\n');
        const helper = path.join(ctx.root, 'install-udev.sh').replace(/app\.asar\//, 'app.asar.unpacked/');
        await run('pkexec', ['/bin/sh', helper, source], { timeout: 120000 });
        await ctx.reconnectDevice();
      },
    },
    status: () => ({ inputReady: input.ready, keyboard: { ...diagnostics, ready: input.ready } }),
    start: async () => {
      if (input.wayland && ctx.getState().settings.rememberWaylandPermission !== false) void input.restore().then(refresh).catch(ctx.report);
      else if ((ctx.platform === 'win32' || ctx.platform === 'linux') && available()) await input.setup();
    },
    release: () => input.releaseAll(),
    suspend: () => input.releaseAll(),
    resume: async () => { await input.reset(); if (ctx.getState().settings.rememberWaylandPermission !== false) await input.restore(); await refresh(); },
    close: () => input.close(),
  };
}
