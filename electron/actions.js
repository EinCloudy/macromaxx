import { setTimeout as sleep } from 'node:timers/promises';
import { hasMissingCredentials, missingCredentialMessage } from '../shared/workspace-credentials.js';
export class Actions {
  constructor({ plugins, shell, getState, navigate, log, updateKey, status, native }) {
    Object.assign(this, { plugins, shell, getState, navigate, log, updateKey, status, native });
    this.running = new Map();
  }
  async execute(key, long = false) {
    if (!key) return;
    if (this.running.has(key.id)) { this.running.get(key.id).abort(); return; }
    const actions = long && key.longActions?.length ? key.longActions : key.actions;
    const controller = new AbortController(); this.running.set(key.id, controller); this.status();
    try {
      for (const action of actions) {
        if (controller.signal.aborted) throw new Error('Canceled');
        try { const result = await this.run(action, controller.signal); if (result?.label || result?.color) this.updateKey(key.id, result); this.log('success', key.label, result?.message || `${action.type} executed`); }
        catch (error) { this.log('error', key.label, error.message); if (key.stopOnError !== false || controller.signal.aborted) break; }
      }
    } finally { this.running.delete(key.id); this.status(); }
  }
  async run(action, signal) {
    if (hasMissingCredentials(action) || (action.type === 'obs' && hasMissingCredentials(this.getState().settings))) throw new Error(missingCredentialMessage);
    if (this.native?.handles(action.type)) return this.native.execute(action, signal);
    switch (action.type) {
      case 'url': { const url = new URL(action.url); if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) throw new Error('Only http, https, and mailto URLs are allowed.'); await this.shell.openExternal(url.href); break; }
      case 'webhook': {
        const url = new URL(action.url); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('An HTTP or HTTPS URL is required.');
        const headers = JSON.parse(action.headers || '{}'); const method = action.method || 'POST';
        const response = await fetch(url, { method, headers, body: ['GET', 'HEAD'].includes(method) ? undefined : action.body, signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
        await response.body?.cancel(); if (!response.ok) throw new Error(`Webhook: HTTP ${response.status} ${response.statusText}`);
        return { message: `Webhook: HTTP ${response.status}` };
      }
      case 'delay': { const ms = Number(action.ms); if (!Number.isFinite(ms) || ms < 0 || ms > 300000) throw new Error('Delay must be between 0 and 300000 ms.'); await sleep(ms, undefined, { signal }); break; }
      case 'folder': this.navigate({ folder: true }); break;
      case 'profile': this.navigate({ profileId: action.profileId }); break;
      case 'plugin': return this.plugins.execute(action.pluginId, JSON.parse(action.config || '{}'), signal);
      default: throw new Error('Unknown action.');
    }
  }
  cancel() { for (const controller of this.running.values()) controller.abort(); }
  close() { this.cancel(); }
}
