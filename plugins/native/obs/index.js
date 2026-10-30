import { OBSStudio, obsVisual } from './service.js';
import { hasMissingCredentials, missingCredentialMessage } from '../../../shared/workspace-credentials.js';

export async function create(ctx) {
  const obs = ctx.obsFactory ? ctx.obsFactory() : new OBSStudio(ctx.changed);
  return {
    services: { obs },
    capabilities: () => ({ 'obs.control': { available: true, ready: obs.state.connected, features: { scenes: true, recording: true, streaming: true, mute: true } } }),
    actions: { obs: action => { if (hasMissingCredentials(ctx.getState().settings)) throw new Error(missingCredentialMessage); return obs.execute(action); } },
    operations: { connect: () => { if (hasMissingCredentials(ctx.getState().settings)) throw new Error(missingCredentialMessage); return obs.connect(ctx.getState().settings); }, disconnect: () => obs.disconnect() },
    status: () => ({ obs: obs.state }),
    visual: key => obsVisual(key, obs.state),
    beforeSettings: (previous, next) => {
      if (previous.obsUrl !== next.obsUrl || previous.obsPassword !== next.obsPassword || hasMissingCredentials(next)) return obs.disconnect();
    },
    suspend: () => obs.disconnect(), close: () => obs.close(),
  };
}
