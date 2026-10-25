import path from 'node:path';
import { Desktop } from './service.js';
import { FocusMonitor } from './focus.js';
export async function create(ctx) {
  const desktop = new Desktop(ctx.changed, { hotkey: keys => ctx.runAction({ type: 'hotkey', keys }) }, { platform: ctx.platform });
  await desktop.probe();
  const focus = new FocusMonitor(path.join(ctx.dataDirectory, 'runtime'), desktop, info => { ctx.changed(); ctx.onFocus(info); });
  return {
    services: { desktop, focus },
    capabilities: () => ({
      'desktop.actions': { available: desktop.state.available, reason: desktop.state.error, features: { commands: desktop.state.supported } },
      'desktop.focus': { available: desktop.state.available && (desktop.state.backend !== 'X11 / EWMH' || desktop.state.supported.includes('minimize')), ready: focus.state.available, reason: focus.state.error || desktop.state.error },
    }),
    supports: action => action.command && !desktop.state.supported.includes(action.command) ? { available: false, reason: 'This command is not supported by the detected Linux desktop backend.' } : { available: true },
    actions: { desktop: action => desktop.execute(action) },
    operations: {
      refresh: async () => { await desktop.probe(); if (ctx.getState().settings.autoProfiles) await focus.restart(); return desktop.state; },
      installExtension: () => desktop.installExtension(path.join(ctx.root, 'extensions/macromaxx@macromaxx.local')),
    },
    status: () => ({ desktop: desktop.state, focus: focus.state }),
    start: () => focus.configure(!!ctx.getState().settings.autoProfiles),
    configure: () => focus.configure(!!ctx.getState().settings.autoProfiles),
    suspend: () => focus.stop(),
    resume: async () => { await desktop.probe(); await focus.configure(!!ctx.getState().settings.autoProfiles); },
    close: () => focus.close(),
  };
}
