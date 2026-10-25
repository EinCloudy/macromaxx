import fs from 'node:fs/promises';
import path from 'node:path';

export function desktopQuote(value) { return '"' + value.replace(/%/g, '%%').replace(/["`$\\]/g, '\\$&') + '"'; }
export function launchCommand(executable, appPath, packaged) { return packaged ? desktopQuote(executable) : `${desktopQuote(executable)} ${desktopQuote(appPath)}`; }

export class Background {
  constructor({ app, shortcuts, show, onStatus, home = app.getPath('home'), executable = process.env.APPIMAGE || process.execPath, platform = process.platform }) {
    Object.assign(this, { app, shortcuts, show, onStatus, home, executable, platform });
    this.state = { launcherInstalled: false, shortcut: '', error: '' };
  }
  command() { return launchCommand(this.executable, this.app.getAppPath(), this.app.isPackaged); }
  async refresh() {
    this.state.launcherInstalled = await fs.access(path.join(this.home, '.local/share/applications/macromaxx-local.desktop')).then(() => true).catch(() => false);
    this.onStatus(); return this.state;
  }
  async installLauncher() {
    if (this.platform !== 'linux') throw new Error('The local desktop launcher installer is for Linux.');
    const directory = path.join(this.home, '.local/share/applications'); await fs.mkdir(directory, { recursive: true });
    const icons = path.join(this.home, '.local/share/icons/hicolor/512x512/apps'); await fs.mkdir(icons, { recursive: true });
    const icon = path.join(icons, 'macromaxx-local.png');
    const copied = await fs.copyFile(path.join(this.app.getAppPath(), 'build/icon.png'), icon).then(() => true).catch(() => false);
    const command = this.command();
    await fs.writeFile(path.join(directory, 'macromaxx-local.desktop'), `[Desktop Entry]\nType=Application\nName=MacroMaxx\nComment=Stream Deck control center\nExec=${command} --show\nIcon=${copied ? icon : 'applications-utilities'}\nTerminal=false\nCategories=Utility;\nStartupWMClass=macromaxx\nActions=Show;Quit;\n\n[Desktop Action Show]\nName=Open MacroMaxx\nExec=${command} --show\n\n[Desktop Action Quit]\nName=Quit MacroMaxx\nExec=${command} --quit\n`);
    return this.refresh();
  }
  async autostart(enabled, hidden = true) {
    if (this.platform !== 'linux') { this.app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: hidden }); return; }
    const directory = path.join(this.home, '.config/autostart'); await fs.mkdir(directory, { recursive: true });
    const file = path.join(directory, 'macromaxx.desktop');
    if (!enabled) { await fs.unlink(file).catch(e => { if (e.code !== 'ENOENT') throw e; }); return; }
    await fs.writeFile(file, `[Desktop Entry]\nType=Application\nName=MacroMaxx\nExec=${this.command()}${hidden ? ' --background' : ''}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`);
  }
  shortcut(value = '') {
    if (value === this.state.shortcut) return true;
    if (value) {
      try { if (!this.shortcuts.register(value, this.show)) throw new Error('The shortcut is already in use or was not granted by the desktop.'); }
      catch (error) { this.state.error = error.message; this.onStatus(); return false; }
    }
    if (this.state.shortcut) this.shortcuts.unregister(this.state.shortcut);
    this.state.shortcut = value; this.state.error = ''; this.onStatus(); return true;
  }
  close() { if (this.state.shortcut) this.shortcuts.unregister(this.state.shortcut); }
}
