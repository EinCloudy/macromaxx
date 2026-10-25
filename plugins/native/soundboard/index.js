import { SharedSoundboard } from './service.js';
export async function create(ctx) {
  const shared = ctx.soundboardFactory ? ctx.soundboardFactory() : new SharedSoundboard(ctx.changed, ctx.report); await shared.probe();
  const routing = () => ctx.service('soundRouting');
  const stopAll = () => { shared.stopAll(); routing()?.stopAll(); };
  return {
    services: { sharedSoundboard: shared },
    capabilities: () => ({ 'sound.play': { available: shared.state.available || !!routing()?.state.available, reason: shared.state.reason, features: { sharedBackend: shared.state.available, routes: routing()?.state.available ? ['output', 'virtual', 'both'] : ['output'], namedOutputs: !!routing()?.state.available, virtualMicrophone: !!routing()?.state.virtualReady } } }),
    supports: action => {
      if (action.command === 'stop-all') return { available: true };
      const advanced = action.route && action.route !== 'output' || action.output && action.output !== 'default';
      if (advanced && !routing()?.state.available) return { available: false, reason: 'Named outputs and virtual microphone routing require the Linux routing plugin.' };
      if (['virtual', 'both'].includes(action.route) && !routing()?.state.virtualReady) return { available: false, reason: 'Set up a virtual microphone in the Linux routing plugin first.' };
      return { available: true };
    },
    actions: { sound: async (action, signal) => {
      if (action.command === 'stop-all') { stopAll(); return { message: 'All sounds stopped.' }; }
      const advanced = action.route && action.route !== 'output' || action.output && action.output !== 'default';
      if (advanced || !shared.state.available) {
        if (!routing()?.state.available) throw new Error(shared.state.reason || 'No compatible sound playback backend is available.');
        return routing().play(action);
      }
      try { return await shared.play(action, signal); }
      catch (error) {
        if (['NATIVE_BACKEND_UNAVAILABLE', 'AUDIO_BACKEND_UNAVAILABLE'].includes(error.code) && routing()?.state.available) return routing().play(action);
        throw error;
      }
    } },
    operations: { refresh: () => shared.probe(), stop: stopAll },
    status: () => ({ soundboard: { available: shared.state.available || !!routing()?.state.available, sharedAvailable: shared.state.available, backend: shared.state.available ? 'node-web-audio-api' : routing()?.state.available ? 'PipeWire fallback' : 'Unavailable', error: shared.state.reason, virtualReady: !!routing()?.state.virtualReady, playing: [...shared.state.playing, ...(routing()?.state.playing || [])] } }),
    visual: key => { const action = key.actions?.find(a => a.type === 'sound'); return action ? { active: [...shared.state.playing, ...(routing()?.state.playing || [])].some(entry => entry.actionId === action.id) } : null; },
    release: stopAll,
    resume: async () => { shared.stopAll(); await shared.worker?.close(); await shared.probe(); },
    close: () => shared.close(),
  };
}
