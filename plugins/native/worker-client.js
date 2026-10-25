import { fork } from 'node:child_process';
export class NativeBackendError extends Error {
  constructor(message) { super(message); this.code = 'NATIVE_BACKEND_UNAVAILABLE'; }
}
// Native addons run outside Electron's main process: a binding panic or ABI
// failure degrades one backend instead of taking down the deck controller.
export class NativeWorker {
  constructor(file, changed = () => {}, event = () => {}, { launch = fork, args = [] } = {}) {
    Object.assign(this, { file, changed, event, launch, args });
    this.state = { available: false, reason: '' }; this.pending = new Map(); this.sequence = 0;
  }
  start() {
    if (this.closed) return Promise.reject(new NativeBackendError('Native worker is closed.'));
    if (this.starting) return this.starting;
    if (this.child && this.state.available) return Promise.resolve(this.state);
    this.starting = new Promise((resolve, reject) => {
      this.rejectStart = reject;
      const child = this.launch(this.file, this.args, { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: [] });
      this.child = child; let stderr = '', ready = false;
      const timer = setTimeout(() => { fail('Native backend initialization timed out.'); child.kill(); }, 10000);
      this.initializationTimer = timer;
      const fail = message => {
        if (this.child !== child) return;
        this.child = null; clearTimeout(timer);
        const error = new NativeBackendError(message || stderr || 'Native backend exited.');
        this.state = { available: false, reason: error.message };
        for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); } this.pending.clear();
        if (!ready) reject(error); this.rejectStart = null; this.changed(); this.event({ type: 'backend-exit', error: error.message });
      };
      child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
      child.on('error', error => fail(error.message)); child.on('exit', () => fail(stderr || 'Native backend exited.'));
      child.on('message', message => {
        if (this.child !== child) return;
        if (message.type === 'ready') {
          if (message.error) { fail(message.error); child.kill(); return; }
          ready = true; clearTimeout(timer); this.rejectStart = null; this.state = { available: true, reason: '' }; resolve(this.state); this.changed();
        } else if (message.id) {
          const pending = this.pending.get(message.id); if (!pending) return;
          this.pending.delete(message.id); clearTimeout(pending.timer);
          if (message.error) { const error = new Error(message.error); error.code = message.code || 'NATIVE_REQUEST_FAILED'; pending.reject(error); } else pending.resolve(message.result);
        } else this.event(message);
      });
    }).finally(() => { this.starting = null; });
    return this.starting;
  }
  async request(command, payload = {}, timeout = 10000) {
    await this.start(); const child = this.child;
    if (!child?.connected) throw new NativeBackendError('Native backend is disconnected.');
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id); reject(new NativeBackendError('Native backend request timed out.')); child.kill();
        const force = setTimeout(() => child.kill('SIGKILL'), 500); force.unref();
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      child.send({ id, command, ...payload }, error => { if (error) { clearTimeout(timer); this.pending.delete(id); reject(new NativeBackendError(error.message)); } });
    });
  }
  async close() {
    if (this.closed) return;
    if (this.child?.connected && this.state.available) await this.request('close', {}, 2000).catch(() => {});
    this.closed = true; clearTimeout(this.initializationTimer); this.rejectStart?.(new NativeBackendError('Native backend closed during initialization.')); this.rejectStart = null;
    const child = this.child; this.child = null;
    if (child && child.exitCode === null && child.signalCode === null) await new Promise(resolve => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 500);
      child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill();
    });
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new NativeBackendError('Native backend closed.')); } this.pending.clear();
    this.state.available = false;
  }
}
