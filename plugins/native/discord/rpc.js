import net from 'node:net';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

const MAX_FRAME = 1024 * 1024;
export function ipcPaths(platform = process.platform, env = process.env) {
  if (platform === 'win32') return Array.from({ length: 10 }, (_, n) => `\\\\?\\pipe\\discord-ipc-${n}`);
  const roots = [...new Set([env.XDG_RUNTIME_DIR, env.TMPDIR, env.TMP, env.TEMP, '/tmp'].filter(Boolean))];
  return roots.flatMap(root => Array.from({ length: 10 }, (_, n) => path.join(root, `discord-ipc-${n}`)));
}

export function encodeFrame(opcode, payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload));
  const header = Buffer.alloc(8); header.writeUInt32LE(opcode); header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

export class DiscordRPC extends EventEmitter {
  constructor(clientId, { platform, env, connect = file => net.createConnection(file), timeout = 5000 } = {}) {
    super(); Object.assign(this, { clientId, platform, env, connectSocket: connect, timeout });
    this.pending = new Map(); this.buffer = Buffer.alloc(0); this.closed = false;
  }
  async open() {
    for (const file of ipcPaths(this.platform, this.env)) {
      if (this.closed) throw new Error('Discord connection canceled.');
      try { await this.openSocket(file); return; } catch { this.socket?.destroy(); }
    }
    throw new Error('Discord desktop IPC not found. Start Discord; check sandbox permissions if using Flatpak or Snap.');
  }
  openSocket(file) {
    this.buffer = Buffer.alloc(0);
    return new Promise((resolve, reject) => {
      const socket = this.socket = this.connectSocket(file);
      let ready = false;
      const timer = setTimeout(() => { socket.destroy(); reject(new Error('Discord handshake timed out.')); }, this.timeout);
      const finish = error => { clearTimeout(timer); if (!ready) reject(error); else this.fail(error); };
      socket.on('error', () => finish(new Error('Discord IPC connection failed.')));
      socket.on('close', () => finish(new Error('Discord disconnected.')));
      socket.on('connect', () => socket.write(encodeFrame(0, { v: 1, client_id: this.clientId })));
      socket.on('data', chunk => {
        try {
          this.buffer = Buffer.concat([this.buffer, chunk]);
          while (this.buffer.length >= 8) {
            const opcode = this.buffer.readUInt32LE(0), size = this.buffer.readUInt32LE(4);
            if (size > MAX_FRAME) throw new Error('Discord IPC frame too large.');
            if (this.buffer.length < size + 8) break;
            const body = this.buffer.subarray(8, size + 8); this.buffer = this.buffer.subarray(size + 8);
            if (opcode === 3) { socket.write(encodeFrame(4, body)); continue; }
            if (opcode === 4) continue;
            if (opcode === 2) throw new Error('Discord closed the RPC connection.');
            if (opcode !== 1) throw new Error('Unexpected Discord IPC opcode.');
            const message = JSON.parse(body.toString());
            if (!ready && message.evt === 'READY') { ready = true; clearTimeout(timer); resolve(); }
            else this.dispatch(message);
          }
        } catch (error) { finish(error); socket.destroy(); }
      });
    });
  }
  dispatch(message) {
    const pending = this.pending.get(message.nonce);
    if (pending) {
      this.pending.delete(message.nonce); pending.cleanup();
      if (message.evt === 'ERROR') {
        // Preserve useful protocol diagnostics, never arbitrary server text.
        const detail = typeof message.data?.message === 'string' ? message.data.message.match(/\b(invalid_scope|access_denied|invalid_request|unauthorized_client|invalid_client|invalid_grant)\b/)?.[1] : null;
        pending.reject(new Error(`Discord rejected ${pending.command} (code ${Number(message.data?.code) || 'unknown'}${detail ? `, ${detail}` : ''}). Check application permissions and RPC/PKCE support.`));
      }
      else pending.resolve(message.data);
    } else if (message.cmd === 'DISPATCH') this.emit('event', message.evt, message.data);
  }
  request(command, args = {}, evt, { timeout = this.timeout, signal } = {}) {
    if (signal?.aborted) return Promise.reject(new Error(`Discord ${command} canceled.`));
    if (this.closed || !this.socket || this.socket.destroyed) return Promise.reject(new Error('Discord is not connected.'));
    const nonce = randomUUID();
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
      const abort = () => { this.pending.delete(nonce); cleanup(); reject(new Error(`Discord ${command} canceled.`)); };
      const timer = setTimeout(() => { this.pending.delete(nonce); cleanup(); reject(new Error(`Discord ${command} timed out.`)); }, timeout);
      this.pending.set(nonce, { resolve, reject, cleanup, command });
      signal?.addEventListener('abort', abort, { once: true });
      try { this.socket.write(encodeFrame(1, { cmd: command, args, nonce, ...(evt ? { evt } : {}) })); }
      catch { this.pending.delete(nonce); cleanup(); reject(new Error(`Discord ${command} could not be sent.`)); }
    });
  }
  fail(error) {
    for (const pending of this.pending.values()) { pending.cleanup(); pending.reject(error); }
    this.pending.clear(); this.emit('disconnected');
  }
  close() { this.closed = true; this.fail(new Error('Discord connection canceled.')); this.socket?.destroy(); }
}
