import { OBSStudio, obsVisual } from './service.js';

export async function create(ctx) {
  const obs = ctx.obsFactory ? ctx.obsFactory() : new OBSStudio(ctx.changed);
  return {
    services: { obs },
    capabilities: () => ({ 'obs.control': { available: true, ready: obs.state.connected, features: { scenes: true, recording: true, streaming: true, mute: true } } }),
    actions: { obs: action => obs.execute(action) },
    operations: { connect: () => obs.connect(ctx.getState().settings), disconnect: () => obs.disconnect() },
    status: () => ({ obs: obs.state }),
    visual: key => obsVisual(key, obs.state),
    suspend: () => obs.disconnect(), close: () => obs.close(),
  };
}
