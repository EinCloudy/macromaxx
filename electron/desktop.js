import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { run } from './commands.js';
import { desktopCommands, kdeShortcuts } from '../shared/desktop-commands.js';
export const desktopHelper = fileURLToPath(new URL('./desktop-bridge.py', import.meta.url)).replace(/app\.asar\//, 'app.asar.unpacked/');
export class Desktop {
  constructor(onStatus, input, { execute = run, environment = process.env, platform = process.platform } = {}) {
    this.onStatus = onStatus; this.input = input; this.run = execute; this.env = environment; this.platform = platform;
    this.state = { backend: 'Not configured', available: false, supported: [], error: '' };
  }
  async probe() {
    try {
      if (this.platform !== 'linux') throw new Error('Use Hotkey actions for window control on this platform.');
      const desktop = this.env.XDG_CURRENT_DESKTOP || '';
      if (/KDE/i.test(desktop)) {
        let names;
        for (const command of ['qdbus6', 'qdbus']) {
          try { names = await this.run(command, ['org.kde.kglobalaccel', '/component/kwin', 'org.kde.kglobalaccel.Component.shortcutNames']); this.qdbus = command; break; } catch { /* try the other Qt version */ }
        }
        if (!names) throw new Error('KDE requires qdbus6 or qdbus and the KWin shortcut service.');
        this.state = { backend: 'KDE / KWin', available: true, error: '', supported: Object.keys(kdeShortcuts).filter(key => names.split('\n').includes(kdeShortcuts[key])) };
      } else if (/GNOME/i.test(desktop) && this.env.WAYLAND_DISPLAY) {
        await this.run('python3', [desktopHelper, 'active']);
        this.state = { backend: 'GNOME Shell extension', available: true, error: '', supported: desktopCommands.map(([id]) => id) };
      } else if (!this.env.WAYLAND_DISPLAY) {
        await this.run('wmctrl', ['-m']);
        const xdotool = await this.run('xdotool', ['--version']).then(() => true).catch(() => false);
        this.state = { backend: 'X11 / EWMH', available: true, error: '', supported: ['workspace-next', 'workspace-previous', 'show-desktop', 'maximize', 'close', 'fullscreen', ...(xdotool ? ['minimize', 'switch-app'] : [])] };
      } else throw new Error('This Wayland compositor has no configured window-control bridge. Use compositor-specific shortcuts.');
    } catch (error) { this.state = { backend: /GNOME/i.test(this.env.XDG_CURRENT_DESKTOP || '') ? 'GNOME (extension required)' : 'Desktop integration unavailable', available: false, supported: [], error: error.message }; }
    this.onStatus(); return this.state;
  }
  async execute(action) {
    if (!this.state.available) await this.probe();
    const command = action.command;
    if (!this.state.supported.includes(command)) throw new Error(this.state.error || 'This desktop action is not supported by the current backend.');
    if (this.state.backend === 'KDE / KWin') return this.run(this.qdbus, ['org.kde.kglobalaccel', '/component/kwin', 'org.kde.kglobalaccel.Component.invokeShortcut', kdeShortcuts[command]]);
    if (this.state.backend === 'GNOME Shell extension') return this.run('python3', [desktopHelper, 'action', command]);
    if (command.startsWith('workspace-')) {
      const desktops = (await this.run('wmctrl', ['-d'])).split('\n').filter(Boolean);
      const current = desktops.findIndex(line => /^\d+\s+\*/.test(line));
      if (!desktops.length || current < 0) throw new Error('Cannot read the current X11 workspace.');
      const index = (current + desktops.length + (command === 'workspace-next' ? 1 : -1)) % desktops.length;
      return this.run('wmctrl', ['-s', desktops[index].split(/\s+/)[0]]);
    }
    if (command === 'minimize') return this.run('xdotool', ['getactivewindow', 'windowminimize']);
    if (command === 'switch-app') return this.input.hotkey('ALT+TAB');
    if (command === 'show-desktop') return this.run('wmctrl', ['-k', 'on']);
    if (command === 'close') return this.run('wmctrl', ['-c', ':ACTIVE:']);
    return this.run('wmctrl', ['-r', ':ACTIVE:', '-b', command === 'fullscreen' ? 'toggle,fullscreen' : 'toggle,maximized_vert,maximized_horz']);
  }
  async installExtension(source) {
    const destination = path.join(os.homedir(), '.local/share/gnome-shell/extensions/macromaxx@macromaxx.local');
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.cp(source, destination, { recursive: true, errorOnExist: true, force: false });
    return destination;
  }
}
