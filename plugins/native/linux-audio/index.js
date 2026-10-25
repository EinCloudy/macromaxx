import { Audio } from './service.js';
export async function create(ctx) {
  const audio = new Audio(ctx.changed); await audio.refresh();
  return {
    services: { audio },
    capabilities: () => ({ 'audio.mixer': { available: audio.state.available, reason: audio.state.error, features: { microphoneHolds: true, devices: true, applicationVolume: true } } }),
    actions: { audio: action => audio.execute(action) },
    operations: { refresh: () => audio.refresh() },
    status: () => ({ audio: audio.state }),
    isHold: action => ['ptt', 'ptm'].includes(action.command),
    beginHold: async action => { const token = await audio.startHold(action); return () => audio.releaseHold(token); },
    visual: key => {
      const action = key.actions?.find(a => a.type === 'audio'); if (!action || !audio.state.available) return null;
      try { return { active: !!audio.resolve(action).matches[0].mute }; } catch { return { active: false }; }
    },
    start: () => audio.start(), release: () => audio.releaseAll(), resume: () => audio.refresh(), close: () => audio.close(),
  };
}
