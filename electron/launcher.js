import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

export function argumentsArray(value = '[]') {
  const args = typeof value === 'string' ? JSON.parse(value || '[]') : value;
  if (!Array.isArray(args) || args.length > 128 || args.some(a => typeof a !== 'string')) throw new Error('Arguments must be a JSON array of strings.');
  return args;
}
export function splitExec(value) {
  const result = []; let word = '', quote = '', escaped = false, started = false;
  for (const c of value) {
    if (escaped) { word += c; escaped = false; started = true; }
    else if (c === '\\') escaped = true;
    else if (quote) { if (c === quote) quote = ''; else word += c; }
    else if (c === '"' || c === "'") { quote = c; started = true; }
    else if (/\s/.test(c)) { if (started) { result.push(word); word = ''; started = false; } }
    else { word += c; started = true; }
  }
  if (quote || escaped) throw new Error('Unterminated quoting in application command.');
  if (started) result.push(word);
  return result;
}
export function desktopCommand(entry) {
  return splitExec(entry.Exec || '').flatMap(token => {
    if (token === '%i') return entry.Icon ? ['--icon', entry.Icon] : [];
    const value = token.replace(/%%|%[fFuUick]/g, code => ({ '%%': '%', '%c': entry.Name, '%k': entry.file }[code] || ''));
    return value ? [value] : [];
  });
}
const expandHome = value => String(value || '').replace(/^~(?=$|\/)/, os.homedir());

export class Launcher {
  constructor(onStatus, launch = spawn) { this.onStatus = onStatus; this.spawn = launch; this.entries = new Map(); this.apps = []; this.scripts = new Set(); }
  async scan(directories) {
    const home = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local/share');
    const roots = directories || [path.join(home, 'applications'), ...(process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').map(d => path.join(d, 'applications')), path.join(os.homedir(), '.local/share/flatpak/exports/share/applications'), '/var/lib/flatpak/exports/share/applications'];
    this.entries.clear(); const seen = new Set();
    const visit = async (root, relative = '', depth = 0) => {
      if (depth > 4) return;
      for (const file of await fs.readdir(path.join(root, relative), { withFileTypes: true }).catch(() => [])) {
        const name = path.join(relative, file.name);
        if (file.isDirectory()) { await visit(root, name, depth + 1); continue; }
        if (!name.endsWith('.desktop')) continue;
        const id = name.split(path.sep).join('-'); if (seen.has(id)) continue; seen.add(id);
        const entry = { file: path.join(root, name), id }; let section = '';
        for (const line of (await fs.readFile(entry.file, 'utf8').catch(() => '')).split(/\r?\n/)) {
          if (line.startsWith('[')) section = line;
          else if (section === '[Desktop Entry]' && !line.startsWith('#')) { const separator = line.indexOf('='); if (separator > 0) entry[line.slice(0, separator)] = line.slice(separator + 1); }
        }
        if (entry.Type === 'Application' && entry.Name && entry.Exec && entry.Hidden !== 'true' && entry.NoDisplay !== 'true') this.entries.set(id, entry);
      }
    };
    for (const root of [...new Set(roots)]) await visit(root);
    this.apps = [...this.entries.values()].map(e => ({ id: e.id, name: e.Name, flatpak: /\bflatpak\s+run\b/.test(e.Exec) })).sort((a, b) => a.name.localeCompare(b.name));
    this.onStatus(); return this.apps;
  }
  environment(value) {
    const env = JSON.parse(value || '{}');
    if (!env || Array.isArray(env) || typeof env !== 'object' || Object.entries(env).some(([key, v]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof v !== 'string')) throw new Error('Environment must be a JSON object of string values.');
    return { ...process.env, ...env };
  }
  async terminal(command) {
    for (const [binary, args] of [['xdg-terminal-exec', []], ['konsole', ['-e']], ['gnome-terminal', ['--']], ['xterm', ['-e']]]) {
      for (const directory of (process.env.PATH || '').split(path.delimiter)) {
        if (await fs.access(path.join(directory, binary), fs.constants.X_OK).then(() => true).catch(() => false)) return [binary, ...args, ...command];
      }
    }
    throw new Error('No supported terminal found (xdg-terminal-exec, konsole, gnome-terminal, or xterm).');
  }
  async launch(action, shell) {
    const args = argumentsArray(action.args); let command, entry;
    if (action.mode === 'installed') {
      if (!this.entries.has(action.desktopId)) await this.scan();
      entry = this.entries.get(action.desktopId); if (!entry) throw new Error('Installed application not found. Refresh the application list.');
      command = desktopCommand(entry);
    } else if (action.mode === 'flatpak') {
      if (!/^[A-Za-z0-9_.-]+$/.test(action.flatpakId || '')) throw new Error('Enter a valid Flatpak application ID.');
      command = ['flatpak', 'run', action.flatpakId];
    } else {
      const target = expandHome(action.path); if (!target) throw new Error('Choose an application or file first.');
      if (target.endsWith('.desktop')) {
        const text = await fs.readFile(target, 'utf8'); entry = { file: target };
        let section = ''; for (const line of text.split(/\r?\n/)) { if (line.startsWith('[')) section = line; else if (section === '[Desktop Entry]') { const i = line.indexOf('='); if (i > 0) entry[line.slice(0, i)] = line.slice(i + 1); } }
        command = desktopCommand(entry);
      } else {
        const stat = await fs.stat(target).catch(() => null);
        const executable = stat?.isFile() && (process.platform === 'win32' || !!(stat.mode & 0o111));
        if (executable || !stat && !target.includes(path.sep)) command = [target];
        else if (process.platform === 'darwin' && target.endsWith('.app') && args.length) command = ['open', '-a', target, '--args'];
        else { if (args.length || action.terminal) throw new Error('Arguments and terminal mode require an executable application.'); const error = await shell.openPath(target); if (error) throw new Error(error); return; }
      }
    }
    if (!command?.length) throw new Error('Application command is empty.');
    command.push(...args);
    if (action.terminal || entry?.Terminal === 'true') command = await this.terminal(command);
    const cwd = expandHome(action.cwd || entry?.Path) || undefined;
    await new Promise((resolve, reject) => {
      const child = this.spawn(command[0], command.slice(1), { cwd, env: this.environment(action.env), detached: true, stdio: 'ignore', windowsHide: true });
      child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
    });
  }
  script(action, signal) {
    if (process.platform === 'win32') throw new Error('Shell script actions currently require Linux or macOS.');
    if (!String(action.script || '').trim()) throw new Error('Enter a shell script.');
    if (signal?.aborted) return Promise.reject(new Error('Canceled'));
    return new Promise((resolve, reject) => {
      const child = this.spawn(action.shell || '/bin/sh', ['-c', action.script, 'macromaxx', ...argumentsArray(action.args)], { cwd: expandHome(action.cwd) || undefined, env: this.environment(action.env), detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
      this.scripts.add(child); let output = '', errorOutput = '', aborted = false, escalation;
      const kill = () => {
        if (aborted) return; aborted = true;
        try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill(); }
        escalation = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }, 500); escalation.unref();
      };
      child.cancelScript = kill;
      const timer = setTimeout(kill, 60000);
      signal?.addEventListener('abort', kill, { once: true });
      child.stdout.on('data', chunk => { output = (output + chunk).slice(-65536); });
      child.stderr.on('data', chunk => { errorOutput = (errorOutput + chunk).slice(-65536); });
      const cleanup = () => { clearTimeout(timer); clearTimeout(escalation); signal?.removeEventListener('abort', kill); this.scripts.delete(child); };
      child.once('error', e => { cleanup(); reject(e); });
      child.once('close', code => { cleanup(); if (aborted) reject(new Error('Script canceled or timed out.')); else if (code) reject(new Error(`Script exited ${code}: ${errorOutput.slice(-2000)}`)); else resolve({ message: output.trim().slice(-2000) || 'Script completed.' }); });
    });
  }
  close() { for (const child of this.scripts) child.cancelScript(); }
}
