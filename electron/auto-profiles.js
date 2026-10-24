import { matchingProfile } from '../shared/profile-rules.js';
export class AutoProfiles {
  constructor(getState, activate, onError) { this.getState = getState; this.activate = activate; this.onError = onError; this.manualId = getState().activeProfileId; this.queue = Promise.resolve(); }
  manual(id) { this.manualId = id; this.manualLatch = this.lastApp; clearTimeout(this.timer); }
  update(focus, force = false) {
    if (this.closed) return;
    const changed = this.lastApp !== focus.appId; this.lastApp = focus.appId;
    if (changed) this.manualLatch = null;
    if (!this.getState().settings.autoProfiles || !focus.available || (!changed && !force)) return;
    if (/macromaxx/i.test(focus.appId)) return;
    if (this.manualLatch === focus.appId) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.queue = this.queue.catch(() => {}).then(() => this.apply(focus.appId)).catch(this.onError); }, 180);
  }
  async apply(appId) {
    const state = this.getState(); if (this.closed || !state.settings.autoProfiles) return;
    const matched = matchingProfile(state, appId);
    const fallback = state.profiles.find(p => p.id === (state.settings.autoProfileFallback || this.manualId)) || state.profiles[0];
    const profile = matched || fallback;
    if (profile && profile.id !== state.activeProfileId) await this.activate(profile.id);
  }
  close() { this.closed = true; clearTimeout(this.timer); }
}
