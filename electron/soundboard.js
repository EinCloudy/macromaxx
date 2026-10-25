import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { run } from './commands.js';
export class Soundboard {
  constructor(onStatus, onError, { execute = run, launch = spawn } = {}) {
    this.onStatus = onStatus; this.onError = onError; this.run = execute; this.spawn = launch;
    this.sink = 'macromaxx_soundboard'; this.source = 'macromaxx_microphone'; this.modules = []; this.sessions = new Map();
    this.state = { available: false, virtualReady: false, playing: [], error: '' };
  }
  publish() { this.state.playing = [...this.sessions.values()].map(s => ({ id: s.id, actionId: s.actionId, name: path.basename(s.path), route: s.route })); this.onStatus(); }
  async probe() {
    try {
      if (process.platform !== 'linux') throw new Error('PipeWire soundboard routing currently requires Linux.');
      await Promise.all([this.run('ffmpeg', ['-version']), this.run('pw-play', ['--version'])]);
      const [sources, sinks] = await Promise.all(['sources', 'sinks'].map(kind => this.run('pactl', ['-f', 'json', 'list', kind]).then(JSON.parse).catch(() => [])));
      this.state = { ...this.state, available: true, virtualReady: sources.some(s => s.name === this.source) && sinks.some(s => s.name === this.sink), error: '' };
    } catch (error) { this.state = { ...this.state, available: false, virtualReady: false, error: 'Soundboard requires ffmpeg and PipeWire pw-play. ' + error.message }; }
    this.publish(); return this.state;
  }
  async setupVirtual({ microphone = 'none', output = 'none' } = {}) {
    if (this.closed) throw new Error('Soundboard is closing.');
    if (this.settingUp) throw new Error('Virtual microphone setup is already running.');
    this.settingUp = true;
    try {
      this.stopAll(); await this.teardown();
      const load = async args => {
        const id = await this.run('pactl', ['load-module', ...args]);
        if (!/^\d+$/.test(id)) throw new Error('Audio server returned an invalid module ID.');
        if (this.closed) { await this.run('pactl', ['unload-module', id]).catch(() => {}); throw new Error('Soundboard is closing.'); }
        this.modules.push(id);
      };
      const sinks = JSON.parse(await this.run('pactl', ['-f', 'json', 'list', 'sinks']));
      const sources = JSON.parse(await this.run('pactl', ['-f', 'json', 'list', 'sources']));
      if (microphone !== 'none' && (!sources.some(s => s.name === microphone) || microphone.startsWith('macromaxx_') || microphone.endsWith('.monitor'))) throw new Error('Choose a physical microphone to mix, or None.');
      if (output !== 'none' && (!sinks.some(s => s.name === output) || output === this.sink)) throw new Error('Choose a physical monitor output, or None.');
      if (!sinks.some(s => s.name === this.sink)) await load(['module-null-sink', `sink_name=${this.sink}`, 'sink_properties=device.description=MacroMaxx_Soundboard']);
      if (!sources.some(s => s.name === this.source)) await load(['module-remap-source', `master=${this.sink}.monitor`, `source_name=${this.source}`, 'source_properties=device.description=MacroMaxx_Virtual_Microphone']);
      if (microphone !== 'none') await load(['module-loopback', `source=${microphone}`, `sink=${this.sink}`, 'latency_msec=30', 'source_dont_move=true', 'sink_dont_move=true']);
      if (output !== 'none') await load(['module-loopback', `source=${this.sink}.monitor`, `sink=${output}`, 'latency_msec=30', 'source_dont_move=true', 'sink_dont_move=true']);
      await this.probe(); return this.state;
    } catch (error) { await this.teardown(); this.state.error = error.message; this.publish(); throw error; }
    finally { this.settingUp = false; }
  }
  async teardown() {
    const modules = this.modules.splice(0).reverse();
    for (const id of modules) await this.run('pactl', ['unload-module', id], { timeout: 2000 }).catch(() => {});
    this.state.virtualReady = false; this.publish();
  }
  stop(entry) {
    if (!entry || entry.stopped) return;
    entry.stopped = true; this.sessions.delete(entry.id);
    for (const child of entry.children) { child.stdin?.destroy(); child.kill(); }
    this.publish();
  }
  stopAll() { for (const entry of [...this.sessions.values()]) this.stop(entry); }
  async play(action) {
    if (action.command === 'stop-all') { this.stopAll(); return { message: 'All sounds stopped.' }; }
    if (this.closed) throw new Error('Soundboard is closing.');
    const existing = [...this.sessions.values()].filter(s => s.actionId === action.id);
    if (action.behavior !== 'overlap') existing.forEach(s => this.stop(s));
    if (action.behavior === 'toggle' && existing.length) return { message: 'Sound stopped.' };
    if (!this.state.available) await this.probe();
    if (!this.state.available) throw new Error(this.state.error);
    const file = String(action.path || '').replace(/^~(?=$|\/)/, os.homedir());
    if (!file || !(await fs.stat(file)).isFile()) throw new Error('Choose a readable audio file.');
    const volume = Number(action.volume ?? 80); if (!Number.isFinite(volume) || volume < 0 || volume > 100) throw new Error('Sound volume must be between 0 and 100%.');
    const route = action.route || 'output';
    if (!['output', 'virtual', 'both'].includes(route)) throw new Error('Unknown sound route.');
    if (route !== 'output') { await this.probe(); if (!this.state.virtualReady) throw new Error('Set up the virtual microphone in Settings → Soundboard first.'); }
    if (route !== 'virtual' && action.output && action.output !== 'default') {
      const sinks = JSON.parse(await this.run('pactl', ['-f', 'json', 'list', 'sinks']));
      if (!sinks.some(s => s.name === action.output)) throw new Error('The selected playback output is no longer connected.');
    }
    const outputs = route === 'virtual' ? [this.sink] : route === 'both' ? [action.output || 'default', this.sink] : [action.output || 'default'];
    const entry = { id: crypto.randomUUID(), actionId: action.id, path: file, route, children: [], stopped: false, ended: 0 };
    this.sessions.set(entry.id, entry); this.publish();
    const fail = error => { if (!entry.stopped) { this.onError(error); this.stop(entry); } };
    try {
      for (const output of outputs) {
        const decoder = this.spawn('ffmpeg', ['-nostdin', '-v', 'error', ...(action.loop ? ['-stream_loop', '-1'] : []), '-i', file, '-f', 'f32le', '-ar', '48000', '-ac', '2', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'] });
        const player = this.spawn('pw-play', ['--raw', '--format', 'f32', '--rate', '48000', '--channels', '2', '--volume', String(volume / 100), ...(output !== 'default' ? ['--target', output] : []), '-'], { stdio: ['pipe', 'ignore', 'pipe'] });
        entry.children.push(decoder, player); let stderr = '';
        for (const child of [decoder, player]) {
          child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); }); child.on('error', fail);
        }
        player.stdin.on('error', e => { if (!entry.stopped) fail(e); }); decoder.stdout.on('error', fail);
        decoder.on('close', code => { if (code && !entry.stopped) fail(new Error('Audio decoder failed: ' + stderr)); });
        player.on('close', code => { if (entry.stopped) return; if (code) fail(new Error('PipeWire playback failed: ' + stderr)); else if (++entry.ended === outputs.length) { entry.stopped = true; this.sessions.delete(entry.id); this.publish(); } });
        decoder.stdout.pipe(player.stdin);
        await Promise.all([decoder, player].map(child => new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); })));
      }
    } catch (error) { this.stop(entry); throw error; }
    return { message: `Playing ${path.basename(file)} (${route}).` };
  }
  async close() { this.closed = true; this.stopAll(); await this.teardown(); }
}
