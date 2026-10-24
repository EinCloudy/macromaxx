import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import os from 'node:os';
import OBSWebSocket from 'obs-websocket-js/json';
const exec = promisify(execFile);
async function limit(promise, ms = 10000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('OBS did not respond (request timed out).')), ms); })]); }
  finally { clearTimeout(timer); }
}
export class Actions {
  constructor({ input, plugins, shell, clipboard, getState, navigate, log, updateKey, status, audio, launcher }) {
    Object.assign(this, { input, plugins, shell, clipboard, getState, navigate, log, updateKey, status, audio, launcher });
    this.running = new Map(); this.obs = new OBSWebSocket(); this.obsState = { connected: false, scene: '', recording: false, streaming: false, inputs: [], scenes: [], muted: {} };
    this.obs.on('ConnectionClosed', () => { this.obsState.connected = false; status(); });
    this.obs.on('CurrentProgramSceneChanged', e => { this.obsState.scene = e.sceneName; status(); });
    this.obs.on('RecordStateChanged', e => { this.obsState.recording = e.outputActive; status(); });
    this.obs.on('StreamStateChanged', e => { this.obsState.streaming = e.outputActive; status(); });
    this.obs.on('InputMuteStateChanged', e => { this.obsState.muted[e.inputName] = e.inputMuted; status(); });
  }
  async connectOBS() {
    const { obsUrl, obsPassword } = this.getState().settings;
    if (!/^wss?:\/\//.test(obsUrl)) throw new Error('The OBS address must start with ws:// or wss://.');
    await this.obs.disconnect();
    try { await limit(this.obs.connect(obsUrl, obsPassword || undefined)); }
    catch (e) { void this.obs.disconnect(); throw e; }
    this.obsState.connected = true;
    const [scenes, inputs, rec, stream] = await Promise.all([this.callOBS('GetSceneList'), this.callOBS('GetInputList'), this.callOBS('GetRecordStatus'), this.callOBS('GetStreamStatus')]);
    Object.assign(this.obsState, { scene: scenes.currentProgramSceneName, scenes: scenes.scenes.map(s => s.sceneName), inputs: inputs.inputs.map(i => i.inputName), recording: rec.outputActive, streaming: stream.outputActive });
    await Promise.all(this.obsState.inputs.map(async name => { try { this.obsState.muted[name] = (await this.callOBS('GetInputMute', { inputName: name })).inputMuted; } catch { /* input has no audio */ } }));
    this.status(); return this.obsState;
  }
  callOBS(type, data) { return limit(this.obs.call(type, data)); }
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
    switch (action.type) {
      case 'hotkey': await this.input.hotkey(action.keys, action.mode || 'tap'); break;
      case 'audio': if (!this.audio) throw new Error('Audio service unavailable.'); await this.audio.execute(action); break;
      case 'url': { const url = new URL(action.url); if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) throw new Error('Only http, https, and mailto URLs are allowed.'); await this.shell.openExternal(url.href); break; }
      case 'app': {
        if (this.launcher) { await this.launcher.launch(action, this.shell); break; }
        const target = String(action.path || '').replace(/^~(?=$|\/)/, os.homedir());
        if (!target) throw new Error('Choose an application or file first.');
        const stat = await fs.stat(target);
        if (process.platform === 'linux' && target.endsWith('.desktop')) await exec('gio', ['launch', target], { signal });
        else if (process.platform === 'linux' && stat.isFile() && stat.mode & 0o111) {
          await new Promise((resolve, reject) => { const child = spawn(target, [], { detached: true, stdio: 'ignore' }); child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); }); });
        } else { const error = await this.shell.openPath(target); if (error) throw new Error(error); }
        break;
      }
      case 'text': this.clipboard.writeText(String(action.text || '')); await this.input.hotkey(process.platform === 'darwin' ? 'CMD+V' : 'CTRL+V'); break;
      case 'script': if (!this.launcher) throw new Error('Script service unavailable.'); return this.launcher.script(action, signal);
      case 'media': {
        const key = { playpause: 'PLAYPAUSE', next: 'NEXT', previous: 'PREVIOUS', mute: 'MUTE', volumeup: 'VOLUMEUP', volumedown: 'VOLUMEDOWN' }[action.command];
        if (!key) throw new Error('Unknown media command');
        if (process.platform === 'linux' && ['playpause', 'next', 'previous'].includes(action.command)) await exec('playerctl', [action.command === 'playpause' ? 'play-pause' : action.command], { signal });
        else if (process.platform === 'linux') {
          const args = action.command === 'mute' ? ['set-mute', '@DEFAULT_AUDIO_SINK@', 'toggle'] : ['set-volume', '-l', '1.5', '@DEFAULT_AUDIO_SINK@', action.command === 'volumeup' ? '5%+' : '5%-'];
          try { await exec('wpctl', args, { signal }); }
          catch (e) { if (signal.aborted) throw e; await exec('pactl', action.command === 'mute' ? ['set-sink-mute', '@DEFAULT_SINK@', 'toggle'] : ['set-sink-volume', '@DEFAULT_SINK@', action.command === 'volumeup' ? '+5%' : '-5%'], { signal }); }
        }
        else if (process.platform === 'darwin' && ['mute', 'volumeup', 'volumedown'].includes(action.command)) await exec('osascript', ['-e', action.command === 'mute' ? 'set volume output muted not (output muted of (get volume settings))' : `set volume output volume ((output volume of (get volume settings)) ${action.command === 'volumeup' ? '+' : '-'} 5)`], { signal });
        else await this.input.hotkey(key); break;
      }
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
      case 'obs': {
        if (!this.obsState.connected) throw new Error('OBS is not connected. Open Settings → OBS Studio.');
        if (action.command === 'scene') await this.callOBS('SetCurrentProgramScene', { sceneName: action.scene });
        else if (action.command === 'record') await this.callOBS('ToggleRecord');
        else if (action.command === 'stream') await this.callOBS('ToggleStream');
        else if (action.command === 'mute') await this.callOBS('ToggleInputMute', { inputName: action.input });
        else throw new Error('Unknown OBS command.'); break;
      }
      case 'plugin': return this.plugins.execute(action.pluginId, JSON.parse(action.config || '{}'), signal);
      default: throw new Error('Unknown action.');
    }
  }
  cancel() { for (const controller of this.running.values()) controller.abort(); }
  close() { this.cancel(); this.obs.disconnect(); }
}
