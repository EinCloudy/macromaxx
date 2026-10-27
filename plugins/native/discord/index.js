import { DiscordRPC } from './rpc.js';
import { authorizeRPC, CLIENT_ID } from './oauth.js';

export function discordVisual(key, state) {
  if (!state.connected) return null;
  const actions = key.actions || [];
  const voice = actions.filter(action => action.type === 'discord');
  if (!voice.length) return null;
  return { active: voice.some(action => action.command === 'deaf' ? state.deaf : state.mute) };
}

export async function create(ctx) {
  const state = { connected: false, connecting: false, mute: false, deaf: false, error: '', stage: '' };
  let rpc, controller, expiry, generation = 0, queue = Promise.resolve();
  const changed = () => ctx.changed?.();
  const disconnect = () => {
    generation++; controller?.abort(); controller = null; clearTimeout(expiry);
    const previous = rpc; rpc = null; previous?.close();
    Object.assign(state, { connected: false, connecting: false, mute: false, deaf: false, stage: '' }); changed();
  };
  const update = data => {
    if (typeof data?.mute === 'boolean') state.mute = data.mute;
    if (typeof data?.deaf === 'boolean') state.deaf = data.deaf;
    changed();
  };
  const connect = async () => {
    disconnect(); state.error = ''; state.connecting = true; changed();
    const attempt = generation, abort = controller = new AbortController();
    let stage = '';
    const onStage = value => { stage = value; if (attempt === generation) { state.stage = value; changed(); } };
    const client = rpc = ctx.discordRPCFactory?.() || new DiscordRPC(CLIENT_ID, { platform: ctx.platform });
    client.on('event', (event, data) => { if (rpc === client && event === 'VOICE_SETTINGS_UPDATE') update(data); });
    client.on('disconnected', () => {
      if (rpc !== client) return;
      abort.abort(); clearTimeout(expiry); Object.assign(state, { connected: false, mute: false, deaf: false }); changed();
    });
    try {
      onStage('IPC handshake'); await client.open();
      if (attempt !== generation) return;
      const token = await (ctx.discordRPCAuthorize || authorizeRPC)(client, abort.signal, { onStage });
      if (attempt !== generation || abort.signal.aborted) return;
      onStage('RPC AUTHENTICATE');
      await client.request('AUTHENTICATE', { access_token: token.access_token }, undefined, { signal: abort.signal });
      if (attempt !== generation || abort.signal.aborted) return;
      onStage('SUBSCRIBE VOICE_SETTINGS_UPDATE');
      await client.request('SUBSCRIBE', {}, 'VOICE_SETTINGS_UPDATE', { signal: abort.signal });
      onStage('GET_VOICE_SETTINGS');
      const voice = await client.request('GET_VOICE_SETTINGS', {}, undefined, { signal: abort.signal });
      if (typeof voice?.mute !== 'boolean' || typeof voice?.deaf !== 'boolean') throw new Error('Discord did not return valid mute/deafen state.');
      if (attempt !== generation || abort.signal.aborted) return;
      update(voice); state.stage = '';
      state.connected = true;
      const seconds = Number(token.expires_in);
      expiry = setTimeout(() => { disconnect(); state.error = 'Discord authorization expired. Connect again.'; changed(); }, Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 3600000, 2147483647));
    } catch (error) {
      if (attempt === generation) {
        const message = `${stage || 'Authorization'}: ${error.message}`;
        disconnect(); state.error = `Full voice access: ${message}`; changed();
        throw new Error(state.error);
      }
    } finally { if (attempt === generation || !controller) { state.connecting = false; changed(); } }
  };
  const execute = action => {
    const run = queue.catch(() => {}).then(async () => {
      if (!state.connected || !rpc) throw new Error('Connect Discord in Plugins → Discord first.');
      if (!['mute', 'deaf'].includes(action.command) || !['toggle', 'on', 'off'].includes(action.mode || 'toggle')) throw new Error('Unsupported Discord voice action.');
      const client = rpc;
      const current = await client.request('GET_VOICE_SETTINGS');
      const field = action.command;
      if (typeof current[field] !== 'boolean') throw new Error('Discord did not report the current voice state.');
      const value = action.mode === 'on' ? true : action.mode === 'off' ? false : !current[field];
      const result = await client.request('SET_VOICE_SETTINGS', { [field]: value });
      if (rpc === client && state.connected) update(result);
    });
    queue = run; return run;
  };
  return {
    capabilities: () => ({ 'discord.voice': { available: true, ready: state.connected, features: { mute: true, deaf: true, experimentalOAuth: true } } }),
    actions: { discord: execute }, operations: { connect, disconnect },
    status: () => ({ discord: { ...state } }), visual: key => discordVisual(key, state),
    suspend: disconnect, close: disconnect,
  };
}
