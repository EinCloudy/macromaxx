import { spawn } from 'node:child_process';
import { run } from '../../../electron/commands.js';

const percentage = volume => Math.round(Object.values(volume || {}).reduce((sum, v) => sum + (Number.parseFloat(v.value_percent) || 0), 0) / Math.max(1, Object.keys(volume || {}).length));
export function normalizeAudio(info, sinks, sources, streams) {
  const devices = items => items.map(item => ({ id: item.name, index: item.index, name: item.description || item.name, mute: !!item.mute, volume: percentage(item.volume) }));
  return {
    available: true, error: '', defaultOutput: info.default_sink_name, defaultInput: info.default_source_name,
    outputs: devices(sinks), inputs: devices(sources.filter(s => s.monitor_of_sink === null || s.monitor_of_sink === 4294967295 || !s.name.endsWith('.monitor'))),
    applications: streams.map(item => ({ id: item.properties?.['application.process.binary'] || item.properties?.['application.name'] || String(item.index), index: item.index, name: item.properties?.['application.name'] || item.name || String(item.index), mute: !!item.mute, volume: percentage(item.volume) })),
  };
}

export class Audio {
  constructor(onStatus, execute = run) {
    this.onStatus = onStatus; this.run = execute; this.queue = Promise.resolve(); this.holds = new Map(); this.tokens = new Map();
    this.state = { available: false, error: '', inputs: [], outputs: [], applications: [] };
  }
  async refresh() {
    if (process.platform !== 'linux' || this.closed) return this.state;
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const [info, outputs, inputs, applications] = await Promise.all(['info', 'list sinks', 'list sources', 'list sink-inputs'].map(command => this.run('pactl', ['-f', 'json', ...command.split(' ')]).then(JSON.parse)));
        const next = normalizeAudio(info, outputs, inputs, applications);
        if (JSON.stringify(next) !== JSON.stringify(this.state)) { this.state = next; this.onStatus(); }
      } catch (error) { this.state = { ...this.state, available: false, error: 'Audio unavailable. Install pactl and enable PipeWire-Pulse (or PulseAudio). ' + error.message }; this.onStatus(); }
      return this.state;
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  start() {
    if (process.platform !== 'linux') return;
    this.refresh(); this.timer = setInterval(() => this.refresh(), 3000);
    this.subscription = spawn('pactl', ['subscribe'], { stdio: ['ignore', 'pipe', 'ignore'] });
    this.subscription.on('error', () => {});
    this.subscription.stdout.on('data', () => { clearTimeout(this.debounce); this.debounce = setTimeout(() => this.refresh(), 100); });
  }
  serial(fn) { const task = this.queue.catch(() => {}).then(fn); this.queue = task; return task; }
  resolve(action) {
    if (!this.state.available) throw new Error(this.state.error || 'Audio server is not available.');
    const kind = action.kind || 'input';
    const list = kind === 'input' ? this.state.inputs : kind === 'output' ? this.state.outputs : this.state.applications;
    const id = action.target && action.target !== 'default' ? action.target : kind === 'input' ? this.state.defaultInput : this.state.defaultOutput;
    const matches = list.filter(d => d.id === id);
    if (!matches.length) throw new Error('Audio target is no longer available. Choose a connected device or application.');
    return { kind, matches, prefix: kind === 'input' ? 'source' : kind === 'output' ? 'sink' : 'sink-input' };
  }
  async setMute(target, mute) { for (const item of target.matches) await this.run('pactl', [`set-${target.prefix}-mute`, String(target.kind === 'application' ? item.index : item.id), mute ? '1' : '0']); }
  async execute(action) {
    return this.serial(async () => {
      await this.refresh(); const target = this.resolve(action);
      const command = action.command || 'mute';
      if (['ptt', 'ptm'].includes(command)) throw new Error('Hold the physical key to use push-to-talk or push-to-mute.');
      if (command === 'mute') await this.setMute(target, !target.matches[0].mute);
      else if (command === 'default') {
        if (target.kind === 'application') throw new Error('Choose an input or output device.');
        await this.run('pactl', [`set-default-${target.prefix}`, target.matches[0].id]);
      } else if (['volume', 'volumeup', 'volumedown'].includes(command)) {
        const value = Number(action.volume ?? 5);
        if (!Number.isFinite(value) || value < 0 || value > 150) throw new Error('Volume must be between 0 and 150%.');
        for (const item of target.matches) {
          const next = command === 'volume' ? value : Math.max(0, Math.min(150, item.volume + (command === 'volumeup' ? value : -value)));
          await this.run('pactl', [`set-${target.prefix}-volume`, String(target.kind === 'application' ? item.index : item.id), `${next}%`]);
        }
      } else if (command === 'move') {
        if (target.kind !== 'application' || !this.state.outputs.some(d => d.id === action.output)) throw new Error('Choose an application and a connected output.');
        for (const item of target.matches) await this.run('pactl', ['move-sink-input', String(item.index), action.output]);
      } else throw new Error('Unknown audio command.');
      await this.refresh();
    });
  }
  startHold(action) {
    return this.serial(async () => {
      if (this.closed) throw new Error('Audio service is closing.');
      await this.refresh();
      const target = this.resolve({ ...action, kind: 'input' });
      const id = target.matches[0].id, token = crypto.randomUUID();
      const hold = this.holds.get(id) || { target, original: target.matches[0].mute, active: new Map() };
      hold.active.set(token, action.command === 'ptm');
      try { await this.setMute(target, action.command === 'ptm'); }
      catch (error) { hold.active.delete(token); throw error; }
      this.holds.set(id, hold); this.tokens.set(token, id); await this.refresh(); return token;
    });
  }
  releaseHold(token) {
    return this.serial(async () => {
      const id = this.tokens.get(token), hold = this.holds.get(id);
      if (!hold) return;
      this.tokens.delete(token); hold.active.delete(token);
      if (!hold.active.size) this.holds.delete(id);
      await this.setMute(hold.target, hold.active.size ? [...hold.active.values()].at(-1) : hold.original);
      await this.refresh();
    });
  }
  releaseAll() {
    return this.serial(async () => {
      const holds = [...this.holds.values()]; this.holds.clear(); this.tokens.clear();
      await Promise.allSettled(holds.map(hold => this.setMute(hold.target, hold.original))); await this.refresh();
    });
  }
  async close() { clearInterval(this.timer); clearTimeout(this.debounce); this.subscription?.kill(); this.closed = true; await this.releaseAll(); }
}
