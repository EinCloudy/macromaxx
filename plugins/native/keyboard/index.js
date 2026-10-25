import fs from 'node:fs/promises';
import path from 'node:path';
import { Input } from './service.js';
import { RobotKeyboard } from './robot.js';
import { run } from '../../../electron/commands.js';

export async function create(ctx) {
  const input = new Input(ctx.changed, { tokenFile: path.join(ctx.dataDirectory, 'keyboard-permission.json'), platform: ctx.platform, environment: ctx.environment, execute: ctx.runCommand });
  const robot = ctx.robotFactory ? ctx.robotFactory() : new RobotKeyboard({ platform: ctx.platform, environment: ctx.environment, changed: ctx.changed });
  await robot.probe();
  let diagnostics = await input.diagnostics();
  const legacyAvailable = () => ctx.platform === 'linux' ? input.wayland ? diagnostics.python : diagnostics.xdotool : ctx.platform === 'win32' ? diagnostics.powershell : diagnostics.osascript;
  const trusted = () => ctx.platform !== 'darwin' || !!ctx.systemPreferences?.isTrustedAccessibilityClient(false);
  const available = () => robot.available || !!legacyAvailable();
  const ready = () => robot.available ? trusted() : input.ready;
  const hotkey = (keys, mode = 'tap') => {
    if (robot.available && robot.canHandle(keys)) {
      if (!trusted()) throw new Error('Grant MacroMaxx Accessibility permission in macOS System Settings first.');
      return robot.hotkey(keys, mode);
    }
    return input.hotkey(keys, mode);
  };
  const facade = {
    hotkey,
    get integrationAvailable() { return available(); },
    get ready() { return ready(); },
    get mediaCommands() {
      const supported = ['playpause', 'next', 'previous', 'mute', 'volumeup', 'volumedown'];
      if (robot.available) return ctx.platform === 'darwin' ? supported : [...supported, 'stop'];
      return ctx.platform === 'win32' && legacyAvailable() || ctx.platform === 'linux' && legacyAvailable() ? [...supported, 'stop'] : [];
    },
  };
  const view = () => ({ ...diagnostics, ready: ready(), backend: robot.available ? 'Shared RobotJS input' : diagnostics.backend, shared: { library: '@jitsi/robotjs', available: robot.available, reason: (robot.worker?.state || robot.state).reason } });
  const refresh = async () => { diagnostics = await input.diagnostics(); ctx.changed(); return view(); };
  const release = async () => { await Promise.allSettled([robot.releaseAll(), input.releaseAll()]); };
  return {
    services: { input: facade },
    capabilities: () => ({
      'keyboard.hotkey': { available: available(), reason: available() ? '' : 'The shared library and native keyboard fallback are unavailable.', features: { hold: robot.available || ctx.platform !== 'darwin', permissionRequired: input.wayland || ctx.platform === 'darwin', sharedLibrary: robot.available }, ready: ready() },
      'keyboard.text': { available: available(), reason: available() ? '' : 'Native keyboard input is unavailable.' },
    }),
    supports: action => ctx.platform === 'darwin' && !robot.available && action.type === 'hotkey' && action.mode && action.mode !== 'tap' ? { available: false, reason: 'Separate hold/release requires the shared RobotJS backend on macOS.' } : { available: true },
    actions: {
      hotkey: action => hotkey(action.keys, action.mode || 'tap'),
      text: async action => { ctx.clipboard.writeText(String(action.text || '')); await hotkey(ctx.platform === 'darwin' ? 'CMD+V' : 'CTRL+V'); },
    },
    operations: {
      diagnostics: async () => { if (!robot.available) await robot.probe(); return refresh(); },
      setup: async () => {
        if (robot.available) {
          if (ctx.platform === 'darwin' && !ctx.systemPreferences?.isTrustedAccessibilityClient(true)) throw new Error('Allow MacroMaxx in macOS Accessibility settings, then check dependencies again.');
        } else await input.setup({ persist: ctx.getState().settings.rememberWaylandPermission !== false });
        return refresh();
      },
      forget: async () => { await release(); await input.forget(); return refresh(); },
      installUdev: async () => {
        if (ctx.platform !== 'linux') throw new Error('USB udev setup is only available in the Linux keyboard adapter.');
        const source = path.join(ctx.tempDirectory, '70-macromaxx-streamdeck.rules');
        await fs.writeFile(source, 'SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0fd9", TAG+="uaccess"\n');
        const helper = path.join(ctx.root, 'install-udev.sh').replace(/app\.asar\//, 'app.asar.unpacked/');
        await run('pkexec', ['/bin/sh', helper, source], { timeout: 120000 }); await ctx.reconnectDevice();
      },
    },
    status: () => ({ inputReady: ready(), keyboard: view() }),
    start: async () => {
      if (input.wayland && ctx.getState().settings.rememberWaylandPermission !== false) void input.restore().then(refresh).catch(ctx.report);
      else if (!robot.available && (ctx.platform === 'win32' || ctx.platform === 'linux') && legacyAvailable()) await input.setup();
    },
    release, suspend: release,
    resume: async () => { await release(); await input.reset(); await robot.close(); await robot.probe(); if (input.wayland && ctx.getState().settings.rememberWaylandPermission !== false) await input.restore(); await refresh(); },
    close: async () => { await robot.close(); await input.close(); },
  };
}
