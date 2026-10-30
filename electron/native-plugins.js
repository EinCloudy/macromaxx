import fs from 'node:fs/promises';
import syncFs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { migrateNativeSettings } from '../plugins/native/migrations.js';
import { hasMissingCredentials, missingCredentialMessage } from '../shared/workspace-credentials.js';

const require = createRequire(import.meta.url);
const unavailable = reason => ({ available: false, reason });

// Only the application's bundled directory is eligible. User JavaScript plugins
// retain their separate worker API and can never opt into main-process loading.
export function prepareNativePlugins(app, directory, platform = process.platform) {
  for (const name of syncFs.readdirSync(directory, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const base = path.join(directory, name.name), file = path.join(base, 'manifest.json');
    if (!syncFs.existsSync(file)) continue;
    const manifest = JSON.parse(syncFs.readFileSync(file, 'utf8'));
    if (manifest.type !== 'bundled-native' || !manifest.platforms?.includes(platform) || !manifest.bootstrap) continue;
    const entry = syncFs.realpathSync(path.resolve(base, manifest.bootstrap));
    if (!entry.startsWith(syncFs.realpathSync(base) + path.sep)) throw new Error('Invalid native bootstrap path.');
    require(entry)(app, platform);
  }
}

export class NativePlugins {
  constructor(directory, context, { platform = process.platform, loader = file => import(pathToFileURL(file).href) } = {}) {
    this.directory = directory; this.platform = platform; this.context = context; this.loader = loader;
    this.records = []; this.services = new Map();
  }
  changed() { this.cached = null; this.context.onStatus?.(); }
  report(id, error) { this.context.log?.('error', `Native plugin: ${id}`, error.message || String(error)); }
  async initialize() {
    migrateNativeSettings(this.context.getState());
    const roots = await fs.readdir(this.directory, { withFileTypes: true });
    for (const root of roots) {
      if (!root.isDirectory()) continue;
      const base = path.join(this.directory, root.name);
      let manifest;
      try { manifest = JSON.parse(await fs.readFile(path.join(base, 'manifest.json'), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      if (manifest.type !== 'bundled-native' || manifest.apiVersion !== 1 || manifest.id !== root.name || !/^[a-z0-9-]+$/.test(manifest.id) || !Array.isArray(manifest.platforms)) throw new Error('Invalid bundled native plugin manifest.');
      this.records.push({ manifest, base, state: 'pending', reason: '', instance: null });
    }
    this.records.sort((a, b) => (a.manifest.order || 0) - (b.manifest.order || 0));
    for (const record of this.records) {
      const { manifest, base } = record;
      if (!manifest.platforms.includes(this.platform)) { record.state = 'unsupported'; record.reason = `Available on ${manifest.platforms.join(', ')}; current platform: ${this.platform}.`; continue; }
      if (!manifest.required && this.context.getState().settings.disabledNativePlugins?.includes(manifest.id)) { record.state = 'disabled'; record.reason = 'Disabled in Plugins. Restart after enabling this plugin.'; continue; }
      try {
        const entry = await fs.realpath(path.resolve(base, manifest.main || 'index.js'));
        if (!entry.startsWith(await fs.realpath(base) + path.sep)) throw new Error('Native plugin entry escapes its bundled directory.');
        const module = await this.loader(entry);
        const ctx = {
          ...this.context, platform: this.platform, root: base,
          changed: () => this.changed(), report: error => this.report(manifest.id, error),
          service: name => this.services.get(name),
          runAction: (action, signal) => this.execute(action, signal),
        };
        record.instance = await module.create(ctx);
        for (const type of Object.keys(manifest.actions || {})) if (typeof record.instance.actions?.[type] !== 'function') throw new Error(`Missing native action implementation: ${type}`);
        for (const name of Object.keys(record.instance.services || {})) if (this.services.has(name)) throw new Error(`Duplicate native service: ${name}`);
        for (const [name, service] of Object.entries(record.instance.services || {})) this.services.set(name, service);
        record.state = 'loaded';
      } catch (error) { record.state = 'error'; record.reason = error.message; this.report(manifest.id, error); try { await record.instance?.close?.(); } catch { /* keep loading the core */ } record.instance = null; }
    }
    this.changed(); return this;
  }
  owner(type) { return this.records.find(record => Object.hasOwn(record.manifest.actions || {}, type)); }
  availability(action) {
    const record = this.owner(action.type);
    if (!record) return { available: true };
    const base = { provider: record.manifest.id, name: record.manifest.name };
    if (record.state !== 'loaded') return { ...base, ...unavailable(record.reason || 'Native plugin is not loaded.') };
    const capability = record.instance.capabilities?.()[record.manifest.actions[action.type]];
    if (!capability?.available) return { ...base, ...unavailable(capability?.reason || 'Required native capability is unavailable.') };
    const supported = record.instance.supports?.(action);
    return { ...base, ...(supported === false ? unavailable('This action variant is not supported by the current native plugin.') : supported || { available: true }) };
  }
  handles(type) { return !!this.owner(type); }
  async execute(action, signal) {
    if (hasMissingCredentials(action)) throw new Error(missingCredentialMessage);
    if (this.closing) throw new Error('Native integrations are closing.');
    const record = this.owner(action.type), availability = this.availability(action);
    if (!record || !availability.available) throw new Error(availability.reason || `No native provider for ${action.type}.`);
    return record.instance.actions[action.type](action, signal);
  }
  beginHold(action) {
    if (this.closing) return null;
    const record = this.owner(action?.type);
    if (record?.state !== 'loaded' || !record.instance.isHold?.(action)) return null;
    if (hasMissingCredentials(action)) return Promise.reject(new Error(missingCredentialMessage));
    const check = this.availability(action);
    if (!check.available) return Promise.reject(new Error(check.reason));
    return Promise.resolve(record.instance.beginHold(action));
  }
  async invoke(id, operation, ...args) {
    if (this.closing) throw new Error('Native integrations are closing.');
    const record = this.records.find(record => record.manifest.id === id);
    if (!record || record.state !== 'loaded') throw new Error(record?.reason || `Native plugin ${id} is not available.`);
    const handler = Object.hasOwn(record.instance.operations || {}, operation) && record.instance.operations[operation];
    if (typeof handler !== 'function') throw new Error('Unknown native plugin operation.');
    try { return await handler(...args); } finally { this.changed(); }
  }
  legacyHandlers() {
    const handlers = {};
    for (const record of this.records) for (const [alias, operation] of Object.entries(record.manifest.legacyOperations || {})) {
      if (Object.hasOwn(handlers, alias)) throw new Error(`Duplicate native compatibility operation: ${alias}`);
      handlers[alias] = (_, ...args) => this.invoke(record.manifest.id, operation, ...args);
    }
    return handlers;
  }
  visual(key) {
    if (!key) return null;
    let patch = null;
    for (const record of this.records) if (record.state === 'loaded') {
      try {
        const contribution = record.instance.visual?.(key);
        if (contribution) patch = { ...patch, ...(typeof contribution.active === 'boolean' ? { active: contribution.active } : {}), ...(typeof contribution.label === 'string' ? { label: contribution.label.slice(0, 80) } : {}) };
      } catch (error) { record.reason = `Visual contribution failed: ${error.message}`; }
    }
    return patch;
  }
  renderKey(key) { const patch = this.visual(key); return patch?.label !== undefined ? { ...key, label: patch.label } : key; }
  snapshot() {
    if (this.cached) return this.cached;
    const state = this.context.getState();
    const status = { inputReady: false, apps: [], focus: { enabled: false, available: false, appId: '', error: 'No native active-application provider is loaded.' } };
    const plugins = [], capabilities = {}, actionTypes = {}, actionStates = {}, visuals = {};
    for (const record of this.records) {
      const { manifest, instance } = record;
      const caps = record.state === 'loaded' ? instance.capabilities?.() || {} : {};
      if (record.state === 'loaded') Object.assign(status, instance.status?.() || {});
      const configuredDisabled = !manifest.required && !!state.settings.disabledNativePlugins?.includes(manifest.id);
      plugins.push({ id: manifest.id, name: manifest.name, description: manifest.description, icon: manifest.ui?.icon, guide: manifest.guide, builtIn: !!manifest.builtIn, actions: Object.keys(manifest.actions || {}), platforms: manifest.platforms, required: !!manifest.required, state: record.state, reason: record.reason, enabled: !configuredDisabled, restartRequired: manifest.platforms.includes(this.platform) && configuredDisabled !== (record.state === 'disabled'), capabilities: caps });
      for (const [id, value] of Object.entries(caps)) capabilities[id] = { ...value, provider: manifest.id };
      for (const type of Object.keys(manifest.actions || {})) actionTypes[type] = { ...this.availability({ type }), defaults: record.state === 'loaded' ? instance.defaults?.(type) || {} : {} };
    }
    const visit = keys => { for (const key of keys) if (key) {
      const patch = this.visual(key); if (patch) visuals[key.id] = patch;
      for (const action of [...key.actions, ...(key.longActions || [])]) if (this.handles(action.type)) actionStates[action.id] = this.availability(action);
      visit(key.children || []);
    } };
    state.profiles.forEach(profile => visit(profile.keys));
    status.native = { platform: this.platform, plugins, capabilities, actionTypes, actionStates, visuals };
    this.cached = status; return status;
  }
  async lifecycle(name, ...args) {
    const records = name === 'close' ? [...this.records].reverse() : this.records;
    if (['release', 'suspend', 'resume'].includes(name)) {
      await Promise.all(records.filter(record => record.state === 'loaded' && record.instance[name]).map(async record => { try { await record.instance[name](...args); } catch (error) { this.report(record.manifest.id, error); } }));
      this.changed(); return;
    }
    for (const record of records) if (record.state === 'loaded' && record.instance[name]) {
      try { await record.instance[name](...args); } catch (error) { this.report(record.manifest.id, error); }
    }
    this.changed();
  }
  start() { return this.lifecycle('start'); }
  releaseAll() { return this.lifecycle('release'); }
  suspend() { return this.lifecycle('suspend'); }
  resume() { return this.lifecycle('resume'); }
  async beforeSettings(previous, next) { for (const record of this.records) if (record.state === 'loaded') await record.instance.beforeSettings?.(previous, next); }
  configure(previous, next) { return this.lifecycle('configure', previous, next); }
  manualProfile(id) { this.context.manualProfile?.(id); }
  shouldStartHidden() { return this.records.some(record => record.state === 'loaded' && record.instance.shouldStartHidden?.()); }
  close() { if (!this.closePromise) { this.closing = true; this.closePromise = this.lifecycle('close'); } return this.closePromise; }
}
