import { fileURLToPath } from 'node:url';
import { NativeWorker } from '../worker-client.js';
import { parseKeys } from './service.js';
const modifiers = { CTRL: 'control', CONTROL: 'control', SHIFT: 'shift', ALT: 'alt', CMD: 'command', COMMAND: 'command', META: 'command', SUPER: 'command' };
const names = { ENTER: 'enter', RETURN: 'enter', ESC: 'escape', ESCAPE: 'escape', TAB: 'tab', SPACE: 'space', BACKSPACE: 'backspace', DELETE: 'delete', HOME: 'home', END: 'end', PAGEUP: 'pageup', PAGEDOWN: 'pagedown', LEFT: 'left', RIGHT: 'right', UP: 'up', DOWN: 'down', PLUS: '+', MINUS: '-', COMMA: ',', PERIOD: '.', SLASH: '/', PLAYPAUSE: 'audio_play', NEXT: 'audio_next', PREVIOUS: 'audio_prev', STOP: 'audio_stop', MUTE: 'audio_mute', VOLUMEUP: 'audio_vol_up', VOLUMEDOWN: 'audio_vol_down' };
export function robotChord(value, platform) {
  const keys = parseKeys(value).map(key => key.key);
  const primary = keys.filter(key => !modifiers[key]);
  if (primary.length > 1) return null;
  const last = primary[0] || keys.at(-1);
  if (platform === 'darwin' && (last === 'STOP' || /^F(2[1-4])$/.test(last))) return null;
  const key = names[last] || modifiers[last] || (/^F\d+$/.test(last) ? last.toLowerCase() : /^[\x21-\x7e]$/.test(last) ? last.toLowerCase() : null);
  if (!key) return null;
  return { key, modifiers: [...new Set(keys.filter(item => item !== last && modifiers[item]).map(item => modifiers[item]))] };
}
export class RobotKeyboard {
  constructor({ platform, environment = process.env, changed = () => {}, makeWorker, allowSimulated = false }) {
    Object.assign(this, { platform, environment, changed }); this.held = new Map();
    this.eligible = (allowSimulated || platform === process.platform) && !(platform === 'linux' && environment.WAYLAND_DISPLAY);
    this.makeWorker = makeWorker || (() => new NativeWorker(fileURLToPath(new URL('./robot-worker.js', import.meta.url)), changed));
    this.state = { available: false, reason: this.eligible ? '' : platform !== process.platform && !allowSimulated ? 'Backend probe skipped for a simulated OS.' : 'Native Wayland uses portal/EIS; X11-only injection is deliberately not used.' };
  }
  async probe() {
    if (!this.eligible) return this.state;
    if (!this.worker || this.worker.closed) this.worker = this.makeWorker();
    try { await this.worker.start(); this.state = this.worker.state; }
    catch (error) { this.state = { available: false, reason: error.message }; }
    this.changed(); return this.state;
  }
  get available() { return this.eligible && !!this.worker?.state.available; }
  canHandle(value) { return !!robotChord(value, this.platform); }
  async hotkey(value, mode = 'tap') {
    if (!['tap', 'down', 'up'].includes(mode)) throw new Error('Invalid hotkey behavior.');
    const chord = robotChord(value, this.platform); if (!chord) throw new Error('Combination is not supported by the shared keyboard backend.');
    const id = JSON.stringify(chord);
    if (mode === 'down') this.held.set(id, chord);
    await this.worker.request('keys', { chord, mode });
    if (mode === 'up') this.held.delete(id);
  }
  async releaseAll() {
    for (const chord of [...this.held.values()].reverse()) { if (this.available) await this.worker.request('keys', { chord, mode: 'up' }).catch(() => {}); }
    this.held.clear();
  }
  async close() { await this.releaseAll(); await this.worker?.close(); }
}
