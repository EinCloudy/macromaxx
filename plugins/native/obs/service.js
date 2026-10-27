import OBSWebSocket from 'obs-websocket-js/json';

export const disconnectedOBS = () => ({ connected: false, scene: '', recording: false, streaming: false, inputs: [], scenes: [], muted: {} });
async function limit(promise, ms = 10000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('OBS did not respond (request timed out).')), ms); })]); }
  finally { clearTimeout(timer); }
}

export class OBSStudio {
  constructor(changed, socket = new OBSWebSocket()) {
    this.changed = changed; this.socket = socket; this.state = disconnectedOBS();
    socket.on('ConnectionClosed', () => { this.state = disconnectedOBS(); changed(); });
    socket.on('CurrentProgramSceneChanged', e => { this.state.scene = e.sceneName; changed(); });
    socket.on('RecordStateChanged', e => { this.state.recording = e.outputActive; changed(); });
    socket.on('StreamStateChanged', e => { this.state.streaming = e.outputActive; changed(); });
    socket.on('InputMuteStateChanged', e => { this.state.muted[e.inputName] = e.inputMuted; changed(); });
  }
  async connect({ obsUrl, obsPassword }) {
    if (this.closed) throw new Error('OBS plugin is closing.');
    if (this.connecting) throw new Error('An OBS connection is already in progress.');
    if (!/^wss?:\/\//.test(obsUrl)) throw new Error('The OBS address must start with ws:// or wss://.');
    this.connecting = true;
    try {
      await this.disconnect();
      if (this.closed) throw new Error('OBS plugin is closing.');
      await limit(this.socket.connect(obsUrl, obsPassword || undefined));
      const [scenes, inputs, rec, stream] = await Promise.all([this.call('GetSceneList'), this.call('GetInputList'), this.call('GetRecordStatus'), this.call('GetStreamStatus')]);
      const muted = {};
      await Promise.all(inputs.inputs.map(async ({ inputName }) => { try { muted[inputName] = (await this.call('GetInputMute', { inputName })).inputMuted; } catch { /* non-audio inputs have no mute state */ } }));
      if (this.closed) throw new Error('OBS plugin is closing.');
      this.state = { connected: true, scene: scenes.currentProgramSceneName, scenes: scenes.scenes.map(s => s.sceneName), inputs: inputs.inputs.map(i => i.inputName), recording: rec.outputActive, streaming: stream.outputActive, muted };
      this.changed(); return this.state;
    } catch (error) { await this.disconnect().catch(() => {}); throw error; }
    finally { this.connecting = false; }
  }
  call(type, data) { return limit(this.socket.call(type, data)); }
  async execute(action) {
    if (!this.state.connected) throw new Error('OBS is not connected. Open Plugins → OBS Studio → Details.');
    if (action.command === 'scene') return this.call('SetCurrentProgramScene', { sceneName: action.scene });
    if (action.command === 'record') return this.call('ToggleRecord');
    if (action.command === 'stream') return this.call('ToggleStream');
    if (action.command === 'mute') return this.call('ToggleInputMute', { inputName: action.input });
    throw new Error('Unknown OBS command.');
  }
  async disconnect() { this.state = disconnectedOBS(); this.changed(); await this.socket.disconnect(); }
  async close() { this.closed = true; await this.disconnect(); }
}

export function obsVisual(key, obs) {
  const action = key.actions?.find(action => action.type === 'obs');
  if (!action) return null;
  return { active: !!obs.connected && (action.command === 'scene' ? obs.scene === action.scene : action.command === 'record' ? !!obs.recording : action.command === 'stream' ? !!obs.streaming : action.command === 'mute' && !!obs.muted[action.input]) };
}
