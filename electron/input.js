import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
const exec = promisify(execFile);
const symbols = { CTRL: 0xffe3, CONTROL: 0xffe3, SHIFT: 0xffe1, ALT: 0xffe9, META: 0xffeb, SUPER: 0xffeb, CMD: 0xffeb, COMMAND: 0xffeb, ENTER: 0xff0d, RETURN: 0xff0d, TAB: 0xff09, ESC: 0xff1b, ESCAPE: 0xff1b, SPACE: 32, BACKSPACE: 0xff08, DELETE: 0xffff, HOME: 0xff50, END: 0xff57, LEFT: 0xff51, UP: 0xff52, RIGHT: 0xff53, DOWN: 0xff54, PAGEUP: 0xff55, PAGEDOWN: 0xff56, PLAYPAUSE: 0x1008ff14, NEXT: 0x1008ff17, PREVIOUS: 0x1008ff16, MUTE: 0x1008ff12, VOLUMEUP: 0x1008ff13, VOLUMEDOWN: 0x1008ff11 };
export function parseKeys(value) {
  const tokens = String(value).split('+').map(k => k.trim().toUpperCase()).filter(Boolean);
  if (!tokens.length || tokens.length > 8) throw new Error('Ungültige Tastenkombination.');
  return tokens.map(key => {
    const code = symbols[key] || ({ PLUS: 43, MINUS: 45, COMMA: 44, PERIOD: 46, SLASH: 47 }[key]) || (/^F([1-9]|1[0-9]|2[0-4])$/.test(key) ? 0xffbd + Number(key.slice(1)) : key.length === 1 ? key.toLowerCase().codePointAt(0) : 0);
    if (!code) throw new Error(`Unbekannte Taste: ${key}`);
    return { key, code };
  });
}
export class Input {
  constructor(onStatus) { this.onStatus = onStatus; this.pending = new Map(); this.held = new Set(); this.ready = false; this.sequence = 0; this.wayland = process.platform === 'linux' && !!process.env.WAYLAND_DISPLAY; }
  async diagnostics() {
    let python = false, xdotool = false;
    if (process.platform === 'linux') {
      python = await exec('python3', ['-c', 'import dbus; from gi.repository import GLib']).then(() => true).catch(() => false);
      xdotool = await exec('xdotool', ['--version']).then(() => true).catch(() => false);
    }
    return { platform: process.platform, wayland: this.wayland, python, xdotool, ready: this.ready, backend: this.wayland ? 'Wayland / Desktop-Portal' : process.platform === 'linux' ? 'X11 / xdotool' : process.platform === 'win32' ? 'Windows Tastatureingabe' : 'macOS System Events' };
  }
  rpc(command, payload = {}) {
    if (!this.child) {
      this.child = spawn('python3', [fileURLToPath(new URL('./portal.py', import.meta.url)).replace(/app\.asar\//, 'app.asar.unpacked/')], { stdio: ['pipe', 'pipe', 'pipe'] });
      createInterface({ input: this.child.stdout }).on('line', line => {
        try { const msg = JSON.parse(line); if (msg.event === 'closed') { this.ready = false; this.onStatus(); } const pending = this.pending.get(msg.id); if (pending) { clearTimeout(pending.timer); this.pending.delete(msg.id); msg.error ? pending.reject(new Error(msg.error)) : pending.resolve(msg.result); } } catch { /* non-protocol output */ }
      });
      let stderr = '';
      this.child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
      const stopped = error => { this.child = null; this.ready = false; for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error(error?.message || stderr || 'Desktop-Portal beendet.')); } this.pending.clear(); this.onStatus(); };
      this.child.on('error', stopped); this.child.on('exit', () => stopped());
      this.child.stdin.on('error', () => {});
    }
    return new Promise((resolve, reject) => { const id = ++this.sequence; const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Desktop-Portal antwortet nicht.')); }, 125000); this.pending.set(id, { resolve, reject, timer }); this.child.stdin.write(JSON.stringify({ id, command, ...payload }) + '\n'); });
  }
  async setup() { if (this.wayland) { await this.rpc('setup'); this.ready = true; } else if (process.platform === 'darwin') { await exec('osascript', ['-e', 'tell application "System Events" to get name']); this.ready = true; } else { const d = await this.diagnostics(); if (process.platform === 'linux' && !d.xdotool) throw new Error('Bitte xdotool installieren (siehe Einrichtung).'); this.ready = true; } this.onStatus(); return this.diagnostics(); }
  async hotkey(value, mode = 'tap') {
    if (!['tap', 'down', 'up'].includes(mode)) throw new Error('Ungültiges Hotkey-Verhalten.');
    const keys = parseKeys(value);
    await this.sendKeys(value, mode);
    if (mode === 'down') keys.forEach(k => this.held.add(k.key));
    if (mode === 'up') keys.forEach(k => this.held.delete(k.key));
  }
  async sendKeys(value, mode = 'tap') {
    const keys = parseKeys(value);
    if (this.wayland) {
      if (!this.ready) throw new Error('Wayland-Tastatur noch nicht freigegeben. Bitte Einrichtung öffnen.');
      const down = keys.map(k => [k.code, 1]), up = [...keys].reverse().map(k => [k.code, 0]);
      return this.rpc('keys', { events: mode === 'down' ? down : mode === 'up' ? up : [...down, ...up] });
    }
    if (process.platform === 'linux') return exec('xdotool', [mode === 'down' ? 'keydown' : mode === 'up' ? 'keyup' : 'key', keys.map(k => ({ CTRL: 'ctrl', CONTROL: 'ctrl', SHIFT: 'shift', ALT: 'alt', META: 'super', SUPER: 'super', CMD: 'super', COMMAND: 'super', ENTER: 'Return', RETURN: 'Return', ESC: 'Escape', ESCAPE: 'Escape', SPACE: 'space', BACKSPACE: 'BackSpace', DELETE: 'Delete', LEFT: 'Left', UP: 'Up', RIGHT: 'Right', DOWN: 'Down', HOME: 'Home', END: 'End', TAB: 'Tab', PAGEUP: 'Page_Up', PAGEDOWN: 'Page_Down', PLUS: 'plus', MINUS: 'minus', COMMA: 'comma', PERIOD: 'period', SLASH: 'slash' }[k.key] || (k.key.length === 1 ? k.key.toLowerCase() : k.key))).join('+')]);
    if (process.platform === 'darwin') {
      const modifiers = keys.slice(0, -1).map(k => ({ CTRL: 'control down', CONTROL: 'control down', ALT: 'option down', SHIFT: 'shift down', CMD: 'command down', META: 'command down', SUPER: 'command down' }[k.key]));
      if (modifiers.some(m => !m)) throw new Error('Ungültige macOS-Modifikatortaste.');
      if (mode !== 'tap') throw new Error('Gedrückt halten wird unter macOS nicht unterstützt.');
      const last = keys.at(-1).key;
      const codes = { ENTER: 36, TAB: 48, SPACE: 49, BACKSPACE: 51, ESC: 53, DELETE: 117, LEFT: 123, RIGHT: 124, DOWN: 125, UP: 126, F1: 122, F2: 120, F3: 99, F4: 118, F5: 96, F6: 97, F7: 98, F8: 100, F9: 101, F10: 109, F11: 103, F12: 111 };
      if (!codes[last] && last.length !== 1) throw new Error('Diese Taste wird unter macOS noch nicht unterstützt.');
      const key = codes[last] ? `key code ${codes[last]}` : `keystroke ${JSON.stringify(last.toLowerCase())}`;
      return exec('osascript', ['-e', `tell application "System Events" to ${key}${modifiers.length ? ' using {' + modifiers.join(',') + '}' : ''}`]);
    }
    const vk = { CTRL: 17, CONTROL: 17, SHIFT: 16, ALT: 18, META: 91, SUPER: 91, CMD: 91, ENTER: 13, TAB: 9, SPACE: 32, ESC: 27, ESCAPE: 27, BACKSPACE: 8, DELETE: 46, HOME: 36, END: 35, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, PAGEUP: 33, PAGEDOWN: 34, PLAYPAUSE: 179, NEXT: 176, PREVIOUS: 177, MUTE: 173, VOLUMEUP: 175, VOLUMEDOWN: 174 };
    const punctuation = { PLUS: 187, MINUS: 189, COMMA: 188, PERIOD: 190, SLASH: 191, '-': 189, ',': 188, '.': 190, '/': 191 };
    const numbers = keys.map(k => vk[k.key] || punctuation[k.key] || (/^F\d+$/.test(k.key) ? 111 + Number(k.key.slice(1)) : k.key.charCodeAt(0)));
    const down = numbers.map(n => `[MMKeys]::keybd_event(${n},0,0,[UIntPtr]::Zero);`).join('');
    const up = [...numbers].reverse().map(n => `[MMKeys]::keybd_event(${n},0,2,[UIntPtr]::Zero);`).join('');
    return exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class MMKeys{[DllImport("user32.dll")]public static extern void keybd_event(byte b,byte s,uint f,UIntPtr e);}';${mode === 'down' ? down : mode === 'up' ? up : down + up}`], { windowsHide: true });
  }
  async releaseAll() { for (const key of [...this.held].reverse()) await this.hotkey(key, 'up').catch(() => {}); this.held.clear(); }
  async close() { await this.releaseAll(); this.child?.kill(); }
}
