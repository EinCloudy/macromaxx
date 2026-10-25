import { Soundboard } from './service.js';
export async function create(ctx) {
  const soundboard = new Soundboard(ctx.changed, ctx.report); await soundboard.probe();
  const refreshAudio = () => ctx.service('audio')?.refresh();
  return {
    services: { soundRouting: soundboard },
    capabilities: () => ({ 'sound.routing': { available: soundboard.state.available, reason: soundboard.state.error, features: { routes: ['output', 'virtual', 'both'], virtualMicrophone: soundboard.state.virtualReady } } }),
    supports: action => action.command !== 'stop-all' && ['virtual', 'both'].includes(action.route) && !soundboard.state.virtualReady ? { available: false, reason: 'Set up the virtual microphone in this plugin’s settings first.' } : { available: true },
    actions: {},
    operations: {
      setup: async options => { const result = await soundboard.setupVirtual(options || {}); await refreshAudio(); return result; },
      stop: () => soundboard.stopAll(),
      remove: async () => { soundboard.stopAll(); await soundboard.teardown(); await refreshAudio(); },
    },
    status: () => ({ soundRouting: soundboard.state }),
    release: () => soundboard.stopAll(), resume: () => soundboard.probe(), close: () => soundboard.close(),
  };
}
export function soundVisual(key, state) { const action = key.actions?.find(a => a.type === 'sound'); return action ? { active: state.playing.some(s => s.actionId === action.id) } : null; }
