import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { readPermission, writePermission, forgetPermission } from './permissions.js';
const exec = promisify(execFile);
const symbols = { CTRL: 0xffe3, CONTROL: 0xffe3, SHIFT: 0xffe1, ALT: 0xffe9, META: 0xffeb, SUPER: 0xffeb, CMD: 0xffeb, COMMAND: 0xffeb, ENTER: 0xff0d, RETURN: 0xff0d, TAB: 0xff09, ESC: 0xff1b, ESCAPE: 0xff1b, SPACE: 32, BACKSPACE: 0xff08, DELETE: 0xffff, HOME: 0xff50, END: 0xff57, LEFT: 0xff51, UP: 0xff52, RIGHT: 0xff53, DOWN: 0xff54, PAGEUP: 0xff55, PAGEDOWN: 0xff56, PLAYPAUSE: 0x1008ff14, NEXT: 0x1008ff17, PREVIOUS: 0x1008ff16, MUTE: 0x1008ff12, VOLUMEUP: 0x1008ff13, VOLUMEDOWN: 0x1008ff11 };
symbols.STOP = 0x1008ff15;
export function parseKeys(value) {
  const tokens = String(value).split('+').map(k => k.trim().toUpperCase()).filter(Boolean);
  if (!tokens.length || tokens.length > 8) throw new Error('Invalid key combination.');
  return tokens.map(key => {
    const code = symbols[key] || ({ PLUS: 43, MINUS: 45, COMMA: 44, PERIOD: 46, SLASH: 47 }[key]) || (/^F([1-9]|1[0-9]|2[0-4])$/.test(key) ? 0xffbd + Number(key.slice(1)) : key.length === 1 ? key.toLowerCase().codePointAt(0) : 0);
    if (!code) throw new Error(`Unknown key: ${key}`);
    return { key, code };
  });
}
export class Input {
  constructor(onStatus, { tokenFile, platform = process.platform, environment = process.env, execute = exec } = {}) { this.onStatus = onStatus; this.tokenFile = tokenFile; this.platform = platform; this.execute = execute; this.pending = new Map(); this.held = new Set(); this.ready = false; this.sequence = 0; this.wayland = platform === 'linux' && !!environment.WAYLAND_DISPLAY; }
  async diagnostics() {
    let python = false, xdotool = false, powershell = false, osascript = false;
    if (this.platform === 'linux') {
      python = await this.execute('python3', ['-c', 'import dbus; from gi.repository import GLib']).then(() => true).catch(() => false);
      xdotool = await this.execute('xdotool', ['--version']).then(() => true).catch(() => false);
    }
    if (this.platform === 'win32') powershell = await this.execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()']).then(() => true).catch(() => false);
    if (this.platform === 'darwin') osascript = await this.execute('osascript', ['-e', 'return 1']).then(() => true).catch(() => false);
    return { platform: this.platform, wayland: this.wayland, python, xdotool, powershell, osascript, ready: this.ready, savedPermission: !!(await readPermission(this.tokenFile)), backend: this.wayland ? 'Wayland / Desktop Portal' : this.platform === 'linux' ? 'X11 / xdotool' : this.platform === 'win32' ? 'Windows keyboard input' : 'macOS System Events' };
  }
  rpc(command, payload = {}) {
    if (this.closed) return Promise.reject(new Error('Keyboard service is closed.'));
    if (!this.child) {
      this.child = spawn('python3', [fileURLToPath(new URL('./portal.py', import.meta.url)).replace(/app\.asar\//, 'app.asar.unpacked/')], { stdio: ['pipe', 'pipe', 'pipe'] });
      const child = this.child;
      createInterface({ input: this.child.stdout }).on('line', line => {
        try { const msg = JSON.parse(line); if (msg.event === 'closed') { this.ready = false; this.onStatus(); } const pending = this.pending.get(msg.id); if (pending) { clearTimeout(pending.timer); this.pending.delete(msg.id); msg.error ? pending.reject(new Error(msg.error)) : pending.resolve(msg.result); } } catch { /* non-protocol output */ }
      });
      let stderr = '';
      this.child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
      const stopped = error => { if (this.child !== child) return; this.child = null; this.ready = false; for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error(error?.message || stderr || 'Desktop portal stopped.')); } this.pending.clear(); this.onStatus(); };
      this.child.on('error', stopped); this.child.on('exit', () => stopped());
      this.child.stdin.on('error', () => {});
    }
    return new Promise((resolve, reject) => { const id = ++this.sequence; const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Desktop portal did not respond.')); }, command === 'setup' ? 125000 : 3000); this.pending.set(id, { resolve, reject, timer }); this.child.stdin.write(JSON.stringify({ id, command, ...payload }) + '\n'); });
  }
  setup(options = {}) {
    if (this.closing || this.closed) return Promise.reject(new Error('Keyboard service is closing.'));
    if (!this.setupPromise) this.setupPromise = this.performSetup(options).finally(() => { this.setupPromise = null; });
    return this.setupPromise;
  }
  async performSetup({ persist = true } = {}) {
    if (this.wayland) {
      if (!persist) await forgetPermission(this.tokenFile);
      const restoreToken = persist ? await readPermission(this.tokenFile) : null;
      if (this.closing || this.closed) throw new Error('Keyboard service is closing.');
      try {
        const result = await this.rpc('setup', { persist, restoreToken });
        if (persist && result.restoreToken) await writePermission(this.tokenFile, result.restoreToken);
        this.ready = true;
      } catch (error) { await this.reset(); throw error; }
    } else if (this.platform === 'darwin') {
      await this.execute('osascript', ['-e', 'tell application "System Events" to get name']); this.ready = true;
    } else {
      const d = await this.diagnostics();
      if (this.platform === 'linux' && !d.xdotool) throw new Error('Install xdotool first (see setup instructions).');
      if (this.platform === 'win32' && !d.powershell) throw new Error('PowerShell is required by the Windows keyboard adapter.');
      this.ready = true;
    }
    this.onStatus(); return this.diagnostics();
  }
  async restore() { if (!this.closing && !this.closed && this.wayland && await readPermission(this.tokenFile)) return this.setup(); }
  async forget() { await this.reset(); await forgetPermission(this.tokenFile); return this.diagnostics(); }
  async hotkey(value, mode = 'tap') {
    if (!['tap', 'down', 'up'].includes(mode)) throw new Error('Invalid hotkey behavior.');
    const keys = parseKeys(value);
    await this.sendKeys(value, mode);
    if (mode === 'down') keys.forEach(k => this.held.add(k.key));
    if (mode === 'up') keys.forEach(k => this.held.delete(k.key));
  }
  async sendKeys(value, mode = 'tap') {
    const keys = parseKeys(value);
    if (this.wayland) {
      if (!this.ready) throw new Error('Wayland keyboard permission has not been granted. Open Settings to set it up.');
      const down = keys.map(k => [k.code, 1]), up = [...keys].reverse().map(k => [k.code, 0]);
      return this.rpc('keys', { events: mode === 'down' ? down : mode === 'up' ? up : [...down, ...up] });
    }
    const x11Media = { PLAYPAUSE: 'XF86AudioPlay', STOP: 'XF86AudioStop', NEXT: 'XF86AudioNext', PREVIOUS: 'XF86AudioPrev', MUTE: 'XF86AudioMute', VOLUMEUP: 'XF86AudioRaiseVolume', VOLUMEDOWN: 'XF86AudioLowerVolume' };
    if (this.platform === 'linux' && keys.length === 1 && x11Media[keys[0].key]) return this.execute('xdotool', [mode === 'down' ? 'keydown' : mode === 'up' ? 'keyup' : 'key', x11Media[keys[0].key]]);
    if (this.platform === 'linux') return this.execute('xdotool', [mode === 'down' ? 'keydown' : mode === 'up' ? 'keyup' : 'key', keys.map(k => ({ CTRL: 'ctrl', CONTROL: 'ctrl', SHIFT: 'shift', ALT: 'alt', META: 'super', SUPER: 'super', CMD: 'super', COMMAND: 'super', ENTER: 'Return', RETURN: 'Return', ESC: 'Escape', ESCAPE: 'Escape', SPACE: 'space', BACKSPACE: 'BackSpace', DELETE: 'Delete', LEFT: 'Left', UP: 'Up', RIGHT: 'Right', DOWN: 'Down', HOME: 'Home', END: 'End', TAB: 'Tab', PAGEUP: 'Page_Up', PAGEDOWN: 'Page_Down', PLUS: 'plus', MINUS: 'minus', COMMA: 'comma', PERIOD: 'period', SLASH: 'slash' }[k.key] || (k.key.length === 1 ? k.key.toLowerCase() : k.key))).join('+')]);
    if (this.platform === 'darwin') {
      const modifiers = keys.slice(0, -1).map(k => ({ CTRL: 'control down', CONTROL: 'control down', ALT: 'option down', SHIFT: 'shift down', CMD: 'command down', COMMAND: 'command down', META: 'command down', SUPER: 'command down' }[k.key]));
      if (modifiers.some(m => !m)) throw new Error('Invalid macOS modifier key.');
      if (mode !== 'tap') throw new Error('Holding keys is not supported on macOS.');
      const last = keys.at(-1).key;
      const codes = { ENTER: 36, RETURN: 36, TAB: 48, SPACE: 49, BACKSPACE: 51, ESC: 53, ESCAPE: 53, DELETE: 117, LEFT: 123, RIGHT: 124, DOWN: 125, UP: 126, F1: 122, F2: 120, F3: 99, F4: 118, F5: 96, F6: 97, F7: 98, F8: 100, F9: 101, F10: 109, F11: 103, F12: 111 };
      const printable = { PLUS: '+', MINUS: '-', COMMA: ',', PERIOD: '.', SLASH: '/' }[last] || (last.length === 1 ? last.toLowerCase() : null);
      if (!codes[last] && !printable) throw new Error('This key is not yet supported on macOS.');
      const key = codes[last] ? `key code ${codes[last]}` : `keystroke ${JSON.stringify(printable)}`;
      return this.execute('osascript', ['-e', `tell application "System Events" to ${key}${modifiers.length ? ' using {' + modifiers.join(',') + '}' : ''}`]);
    }
    const vk = { CTRL: 17, CONTROL: 17, SHIFT: 16, ALT: 18, META: 91, SUPER: 91, CMD: 91, COMMAND: 91, ENTER: 13, RETURN: 13, TAB: 9, SPACE: 32, ESC: 27, ESCAPE: 27, BACKSPACE: 8, DELETE: 46, HOME: 36, END: 35, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, PAGEUP: 33, PAGEDOWN: 34, PLAYPAUSE: 179, NEXT: 176, PREVIOUS: 177, MUTE: 173, VOLUMEUP: 175, VOLUMEDOWN: 174 };
    vk.STOP = 178;
    const punctuation = { PLUS: 187, MINUS: 189, COMMA: 188, PERIOD: 190, SLASH: 191, '-': 189, ',': 188, '.': 190, '/': 191 };
    const numbers = keys.map(k => vk[k.key] || punctuation[k.key] || (/^F\d+$/.test(k.key) ? 111 + Number(k.key.slice(1)) : k.key.charCodeAt(0)));
    const down = numbers.map(n => `[MMKeys]::keybd_event(${n},0,0,[UIntPtr]::Zero);`).join('');
    const up = [...numbers].reverse().map(n => `[MMKeys]::keybd_event(${n},0,2,[UIntPtr]::Zero);`).join('');
    return this.execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class MMKeys{[DllImport("user32.dll")]public static extern void keybd_event(byte b,byte s,uint f,UIntPtr e);}';${mode === 'down' ? down : mode === 'up' ? up : down + up}`], { windowsHide: true });
  }
  async releaseAll() {
    const keys = [...this.held]; this.held.clear();
    for (let i = keys.length; i > 0; i -= 8) {
      try { await this.hotkey(keys.slice(Math.max(0, i - 8), i).join('+'), 'up'); }
      catch { this.ready = false; this.onStatus(); break; }
    }
  }
  async reset() {
    await this.releaseAll();
    const child = this.child;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Keyboard session reset.')); } this.pending.clear();
    if (child) await new Promise(resolve => {
      const timer = setTimeout(() => { child.kill(); resolve(); }, 1500);
      child.once('exit', () => { clearTimeout(timer); resolve(); }); child.stdin.end();
    });
    if (this.child === child) this.child = null;
    this.ready = false; this.onStatus();
  }
  async close() { this.closing = true; await this.releaseAll(); this.closed = true; this.child?.kill(); }
}
