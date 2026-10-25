import { Launcher } from './service.js';

export async function create(ctx) {
  const launcher = new Launcher(ctx.changed, undefined, { platform: ctx.platform });
  await launcher.scan();
  const modes = ctx.platform === 'linux' ? ['file', 'installed', 'flatpak'] : ['file'];
  const script = ctx.platform !== 'win32';
  return {
    services: { launcher },
    capabilities: () => ({
      'launcher.open': { available: true, features: { modes, terminal: ctx.platform === 'linux', arguments: true, cwd: true, environment: true } },
      'launcher.script': { available: script, reason: script ? '' : 'The bundled script adapter is POSIX-only; a Windows script adapter is not implemented.' },
    }),
    supports: action => {
      if (action.type === 'app' && !modes.includes(action.mode || 'file')) return { available: false, reason: 'Installed desktop entries and Flatpak are Linux-only. Choose a local executable/file on this platform.' };
      if (action.type === 'app' && action.terminal && ctx.platform !== 'linux') return { available: false, reason: 'Terminal mode is currently provided by the Linux launcher adapter only.' };
      return { available: true };
    },
    actions: { app: action => launcher.launch(action, ctx.shell), script: (action, signal) => launcher.script(action, signal) },
    operations: { refresh: () => launcher.scan() },
    status: () => ({ apps: launcher.apps }),
    close: () => launcher.close(),
  };
}
