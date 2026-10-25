import { Background } from './service.js';

export async function create(ctx) {
  const background = new Background({ app: ctx.app, shortcuts: ctx.shortcuts, show: ctx.showWindow, onStatus: ctx.changed, platform: ctx.platform });
  await background.refresh();
  return {
    services: { background },
    capabilities: () => ({ 'session.autostart': { available: true }, 'session.shortcut': { available: true }, 'session.launcher': { available: ctx.platform === 'linux', reason: ctx.platform === 'linux' ? '' : 'Use the operating system app shortcut created by the installer.' } }),
    status: () => ({ background: { ...background.state, windowVisible: ctx.windowVisible() } }),
    operations: { installLauncher: () => background.installLauncher() },
    beforeSettings: async (previous, next) => {
      if (previous.showShortcut !== next.showShortcut && !background.shortcut(next.showShortcut || '')) throw new Error(background.state.error);
      if (previous.autostart !== next.autostart || previous.startInBackground !== next.startInBackground) await background.autostart(next.autostart, next.startInBackground !== false);
    },
    start: async () => {
      try { if (ctx.getState().settings.autostart) await background.autostart(true, ctx.getState().settings.startInBackground !== false); } catch (error) { ctx.report(error); }
      if (!background.shortcut(ctx.getState().settings.showShortcut || '')) ctx.report(new Error(background.state.error));
    },
    shouldStartHidden: () => ctx.platform === 'darwin' && ctx.getState().settings.startInBackground !== false && !!ctx.app.getLoginItemSettings?.().wasOpenedAsHidden,
    close: () => background.close(),
  };
}
