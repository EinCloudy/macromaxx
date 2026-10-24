import fs from 'node:fs/promises';
import path from 'node:path';
import { initialState, validateState } from '../shared/model.js';
export class Store {
  constructor(directory) { this.file = path.join(directory, 'workspace.json'); this.queue = Promise.resolve(); }
  async load() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    try { return validateState(JSON.parse(await fs.readFile(this.file, 'utf8'))); }
    catch (error) {
      if (error.code === 'ENOENT') return initialState();
      try { const recovered = validateState(JSON.parse(await fs.readFile(this.file + '.bak', 'utf8'))); this.recovery = 'Workspace restored from backup.'; return recovered; }
      catch { throw new Error(`Could not read workspace: ${error.message}. File: ${this.file}`); }
    }
  }
  save(state) {
    const data = JSON.stringify(validateState(state), null, 2);
    const task = this.queue.catch(() => {}).then(async () => {
      await fs.writeFile(this.file + '.tmp', data, { mode: 0o600 });
      await fs.copyFile(this.file, this.file + '.bak').catch(e => { if (e.code !== 'ENOENT') throw e; });
      await fs.rename(this.file + '.tmp', this.file);
    }); this.queue = task; return task;
  }
}
