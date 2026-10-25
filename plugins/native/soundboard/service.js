import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { NativeWorker } from '../worker-client.js';

export class SharedSoundboard {
  constructor(changed, report, { workerFactory, silent = false } = {}) {
    Object.assign(this, { changed, report }); this.sessions = new Map();
    this.workerFactory = workerFactory || ((onChange, onEvent) => new NativeWorker(fileURLToPath(new URL('./audio-worker.js', import.meta.url)), onChange, onEvent, { args: silent ? ['--silent'] : [] }));
    this.state = { available: false, reason: '', playing: [], backend: 'node-web-audio-api' };
  }
  publish() { this.state.playing = [...this.sessions.values()].map(({ id, actionId, path: file }) => ({ id, actionId, name: path.basename(file), route: 'output' })); this.changed(); }
  async probe() {
    if (this.closed) return this.state;
    if (!this.worker || this.worker.closed) this.worker = this.workerFactory(() => {
      this.state.available = this.worker.state.available; this.state.reason = this.worker.state.reason; this.changed();
    }, event => {
      if (event.type === 'ended') { this.sessions.delete(event.sessionId); this.publish(); }
      if (event.type === 'backend-exit') {
        if (this.sessions.size) this.report(new Error(event.error)); this.sessions.clear(); this.publish();
      }
    });
    try { await this.worker.start(); this.state.available = true; this.state.reason = ''; }
    catch (error) { this.state.available = false; this.state.reason = error.message; }
    this.changed(); return this.state;
  }
  stop(entry) {
    if (!entry || !this.sessions.has(entry.id)) return;
    this.sessions.delete(entry.id);
    if (this.worker?.state.available) void this.worker.request('stop', { sessionId: entry.id }).catch(this.report);
    this.publish();
  }
  stopAll() { for (const entry of [...this.sessions.values()]) this.stop(entry); }
  async play(action, signal) {
    if (this.closed) throw new Error('Shared soundboard is closing.');
    if (signal?.aborted) throw new Error('Canceled');
    if (!this.state.available) await this.probe();
    if (!this.state.available) { const error = new Error(this.state.reason); error.code = 'NATIVE_BACKEND_UNAVAILABLE'; throw error; }
    const existing = [...this.sessions.values()].filter(entry => entry.actionId === action.id);
    if (action.behavior !== 'overlap') existing.forEach(entry => this.stop(entry));
    if (action.behavior === 'toggle' && existing.length) return { message: 'Sound stopped.' };
    const volume = Number(action.volume ?? 80);
    if (!Number.isFinite(volume) || volume < 0 || volume > 100) throw new Error('Sound volume must be between 0 and 100%.');
    const file = String(action.path || '').replace(/^~(?=$|\/)/, os.homedir());
    if (!file) throw new Error('Choose an audio file.');
    const entry = { id: crypto.randomUUID(), actionId: action.id, path: file };
    this.sessions.set(entry.id, entry); this.publish();
    const cancel = () => this.stop(entry); signal?.addEventListener('abort', cancel, { once: true });
    try { await this.worker.request('play', { sessionId: entry.id, path: file, volume, loop: !!action.loop }, 30000); }
    catch (error) { this.sessions.delete(entry.id); this.publish(); throw error; }
    finally { signal?.removeEventListener('abort', cancel); }
    return { message: `Playing ${path.basename(file)} (shared default output).` };
  }
  async close() { this.closed = true; this.stopAll(); await this.worker?.close(); this.sessions.clear(); this.publish(); }
}
