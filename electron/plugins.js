import fs from 'node:fs/promises';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export class Plugins {
  constructor(directories) { this.directories = directories; this.items = []; this.children = new Set(); }
  async scan() {
    this.items = [];
    for (const directory of this.directories) {
      await fs.mkdir(directory, { recursive: true }).catch(() => {});
      for (const folder of await fs.readdir(directory).catch(() => [])) {
        try {
          const base = path.join(directory, folder); const manifest = JSON.parse(await fs.readFile(path.join(base, 'manifest.json'), 'utf8'));
          const entry = path.resolve(base, manifest.main || 'index.js');
          if (!entry.startsWith(base + path.sep) || !/^[a-z0-9-]+$/.test(manifest.id) || this.items.some(p => p.id === manifest.id)) continue;
          this.items.push({ ...manifest, entry });
        } catch { /* ignore folders without valid manifest */ }
      }
    }
    return this.items.map(({ entry, ...item }) => item);
  }
  async execute(id, config, signal) {
    const plugin = this.items.find(p => p.id === id); if (!plugin) throw new Error('Plugin nicht gefunden.');
    if (signal?.aborted) throw new Error('Abgebrochen');
    return new Promise((resolve, reject) => {
      const child = fork(fileURLToPath(new URL('./plugin-worker.js', import.meta.url)), [plugin.entry], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: [] });
      this.children.add(child);
      const done = (error, result) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); this.children.delete(child); child.removeAllListeners(); child.kill(); error ? reject(error) : resolve(result); };
      const abort = () => done(new Error('Abgebrochen'));
      const timer = setTimeout(() => done(new Error('Plugin-Zeitlimit überschritten (15 Sekunden).')), 15000);
      signal?.addEventListener('abort', abort, { once: true });
      child.once('error', error => done(error)); child.once('exit', code => done(new Error(`Plugin wurde beendet (${code}).`)));
      child.once('message', msg => done(msg.error ? new Error(msg.error) : null, msg.result)); child.send({ config });
    });
  }
  close() { for (const child of this.children) child.kill(); }
}
