import { Audio } from './service.js';
import { create as createRouting } from './routing.js';
export async function create(ctx) {
  const audio = ctx.audioFactory ? ctx.audioFactory() : new Audio(ctx.changed); await audio.refresh();
  let routing;
  try { routing = await createRouting({ ...ctx, service: name => name === 'audio' ? audio : ctx.service(name) }); }
  catch (error) { await audio.close(); throw error; }
  return {
    services: { audio, ...routing.services },
    capabilities: () => ({ ...routing.capabilities(), 'audio.mixer': { available: audio.state.available, reason: audio.state.error, features: { microphoneHolds: true, devices: true, applicationVolume: true } } }),
    actions: { audio: action => audio.execute(action) },
    operations: { ...routing.operations, refresh: async () => { await audio.refresh(); await routing.resume(); } },
    status: () => ({ audio: audio.state, ...routing.status() }),
    isHold: action => ['ptt', 'ptm'].includes(action.command),
    beginHold: async action => { const token = await audio.startHold(action); return () => audio.releaseHold(token); },
    visual: key => {
      const action = key.actions?.find(a => a.type === 'audio'); if (!action || !audio.state.available) return null;
      try { return { active: !!audio.resolve(action).matches[0].mute }; } catch { return { active: false }; }
    },
    start: () => audio.start(),
    release: async () => { routing.release(); await audio.releaseAll(); },
    resume: async () => { await audio.refresh(); await routing.resume(); },
    close: async () => { try { await routing.close(); } finally { await audio.close(); } },
  };
}
