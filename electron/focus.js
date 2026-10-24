import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { run } from './commands.js';
import { desktopHelper } from './desktop.js';

export class FocusMonitor {
  constructor(directory, desktop, onChange) {
    this.directory = directory; this.desktop = desktop; this.onChange = onChange;
    this.state = { enabled: false, available: false, appId: '', title: '', error: '' };
  }
  publish(patch) { this.state = { ...this.state, ...patch }; this.onChange(this.state); }
  configure(enabled) {
    this.configuration = (this.configuration || Promise.resolve()).catch(() => {}).then(() => this.applyConfiguration(enabled));
    return this.configuration;
  }
  async applyConfiguration(enabled) {
    if (enabled === this.state.enabled && (this.child || this.timer || this.starting)) return;
    await this.stop(); if (!enabled || this.closed) return;
    this.publish({ enabled: true, error: '' });
    this.starting = true;
    try {
      if (!this.desktop.state.available) await this.desktop.probe();
      const backend = this.desktop.state.backend;
      if (backend === 'KDE / KWin') {
        await fs.mkdir(this.directory, { recursive: true });
        const service = `app.macromaxx.Focus.p${process.pid}`;
        const file = path.join(this.directory, 'focus-watch.js');
        await fs.writeFile(file, `function report(w) { callDBus(${JSON.stringify(service)}, '/Focus', 'app.macromaxx.Focus', 'Active', w ? String(w.desktopFileName || w.resourceClass || w.resourceName || '') : '', w ? String(w.caption || '') : ''); }\nworkspace.windowActivated.connect(report);\nreport(workspace.activeWindow);\n`, { mode: 0o600 });
        if (!this.state.enabled || this.closed) return;
        const helper = fileURLToPath(new URL('./focus-watch.py', import.meta.url)).replace(/app\.asar\//, 'app.asar.unpacked/');
        const child = spawn('python3', [helper, file, service], { stdio: ['pipe', 'pipe', 'pipe'] });
        this.child = child; let error = '';
        child.stdin.on('error', () => {});
        child.stderr.on('data', chunk => { error = (error + chunk).slice(-2000); });
        createInterface({ input: child.stdout }).on('line', line => {
          try { const data = JSON.parse(line); this.publish(data.ready ? { available: true, error: '' } : { ...data, available: true, error: '' }); } catch { /* ignore non-protocol messages */ }
        });
        const stopped = message => {
          if (this.child !== child) return; this.child = null;
          if (this.state.enabled && !this.closed) {
            this.publish({ available: false, appId: '', title: '', error: message || error || 'Focus bridge disconnected; retrying.' });
            this.retry = setTimeout(() => this.configure(true), 5000);
          }
        };
        child.on('error', e => stopped(e.message)); child.on('exit', () => stopped());
      } else if (backend === 'GNOME Shell extension' || backend === 'X11 / EWMH') {
        const poll = async () => {
          if (this.polling || !this.state.enabled) return; this.polling = true;
          try {
            const info = backend === 'GNOME Shell extension' ? JSON.parse(await run('python3', [desktopHelper, 'active'])) : { appId: await run('xdotool', ['getactivewindow', 'getwindowclassname']), title: '' };
            if (info.appId !== this.state.appId || !this.state.available) this.publish({ ...info, available: true, error: '' });
          } catch (e) { this.publish({ available: false, appId: '', title: '', error: e.message }); }
          finally { this.polling = false; }
        };
        this.timer = setInterval(poll, 1000); await poll();
      } else throw new Error(this.desktop.state.error || 'Active-application detection is not supported on this desktop.');
    } catch (e) { this.publish({ available: false, error: e.message }); }
    finally { this.starting = false; }
  }
  async stop() {
    clearInterval(this.timer); this.timer = null; clearTimeout(this.retry);
    const child = this.child; this.child = null;
    this.publish({ enabled: false, available: false, appId: '', title: '', error: '' });
    if (child) await new Promise(resolve => { const timeout = setTimeout(() => { child.kill(); resolve(); }, 1500); child.once('exit', () => { clearTimeout(timeout); resolve(); }); child.stdin.end(); });
  }
  async restart() { const enabled = this.state.enabled; await this.configure(false); if (enabled) await this.configure(true); }
  async close() { this.closed = true; await this.configuration?.catch(() => {}); await this.stop(); }
}
