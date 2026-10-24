import { listStreamDecks, openStreamDeck } from '@elgato-stream-deck/node';
import sharp from 'sharp';
import { visualSignature } from '../shared/visuals.js';
import { animationEnabled } from '../shared/animation-settings.js';
import { playStartupWave } from './startup-wave.js';
import { playIconTransition } from './icon-transitions.js';
import { resolvedKeyFont } from '../shared/key-text.js';

export class Devices {
  constructor({ onStatus, onDown, onUp, getKeys, getBrightness, isActive = () => false, getSettings = () => ({}) }) {
    Object.assign(this, { onStatus, onDown, onUp, getKeys, getBrightness, isActive, getSettings });
    this.info = { connected: false, name: 'Virtuelles Stream Deck', rows: 3, columns: 5, count: 15, error: '' };
    this.cache = new Map();
    this.sent = new Map();
    this.images = new Map();
    this.displayed = new Map();
    this.transitionCache = new Map();
    this.waveCache = new Map();
    this.renderQueue = Promise.resolve();
    this.renderRevision = 0;
    this.startupPlayed = false;
    this.pendingTransition = null;
  }

  start() { this.scan(); this.timer = setInterval(() => this.scan(), 3000); }

  async scan() {
    if (this.scanning || this.stopping) return;
    this.scanning = true;
    try {
      const devices = await listStreamDecks();
      if (this.stopping) return;
      if (this.deck && !devices.some(d => d.path === this.path)) await this.disconnect();
      this.available = devices.map(d => ({ path: d.path, name: d.modelInfo.name }));
      if (!this.deck && devices.length) {
        const target = devices.find(d => d.path === this.preferred) || devices[0];
        const opened = await openStreamDeck(target.path);
        if (this.stopping) { await opened.close().catch(() => {}); return; }
        this.deck = opened;
        this.path = target.path;
        const controls = this.deck.modelInfo.controls.filter(c => c.type === 'button');
        this.controls = controls;
        const serial = await opened.getSerialNumber();
        if (this.stopping || this.deck !== opened) return;
        this.info = {
          connected: true, name: this.deck.modelInfo.name, serial,
          count: controls.length, rows: Math.max(...controls.map(c => c.row)) + 1,
          columns: Math.max(...controls.map(c => c.column)) + 1, error: '',
        };
        this.deck.on('down', c => {
          if (!this.stopping && c.type === 'button') { this.skipStartupAnimation(); this.skipTransition(); this.onDown(c.index); }
        });
        this.deck.on('up', c => { if (!this.stopping && c.type === 'button') this.onUp(c.index); });
        this.deck.on('error', error => { this.info.error = error.message; this.disconnect().catch(() => {}); });
        this.sent.clear();
        await this.startupAnimation();
      } else if (!devices.length && this.info.error) { this.info.error = ''; this.onStatus(); }
    } catch (error) {
      const message = `USB-Zugriff fehlgeschlagen: ${error.message}`;
      if (this.info.error !== message) { this.info.error = message; this.onStatus(); }
    } finally { this.scanning = false; }
  }

  async select(devicePath) { this.preferred = devicePath; await this.disconnect(); await this.scan(); }

  async disconnect() {
    this.skipStartupAnimation();
    this.transitionController?.abort();
    this.shutdownController?.abort();
    this.pendingTransition = null;
    const deck = this.deck;
    this.deck = null;
    this.path = null;
    this.sent.clear();
    this.displayed.clear();
    this.transitionCache.clear();
    this.waveCache.clear();
    if (deck) { deck.removeAllListeners(); await deck.close().catch(() => {}); }
    this.info.connected = false;
    this.onStatus();
  }

  skipStartupAnimation() { this.startupController?.abort(); }

  skipTransition() {
    this.pendingTransition = null;
    if (this.transitionController) { this.transitionController.abort(); void this.render(); }
  }

  startupAnimation() {
    if (this.startupPlayed || !this.controls.some(c => c.feedbackType === 'lcd')) { this.onStatus(); return this.render(); }
    this.startupPlayed = true;
    const deck = this.deck;
    const controller = new AbortController();
    this.startupController = controller;
    this.info.animating = true;
    ++this.renderRevision;
    this.renderQueue = this.renderQueue.catch(() => {}).then(async () => {
      try {
        if (this.deck !== deck || controller.signal.aborted) return;
        await deck.setBrightness(this.getBrightness());
        await playStartupWave(deck, this.controls, { signal: controller.signal, preparedCache: this.waveCache });
        if (!controller.signal.aborted && !this.pendingTransition && animationEnabled(this.getSettings(), 'reveal')) {
          this.pendingTransition = { kind: 'reveal' };
        }
      } catch (error) {
        if (!controller.signal.aborted && this.deck === deck) this.info.error = `Startanimation: ${error.message}`;
      } finally {
        this.sent.clear();
        this.displayed.clear();
        this.startupController = null;
        this.info.animating = false;
        this.onStatus();
      }
    });
    this.onStatus();
    return this.renderQueue.then(() => this.render());
  }

  navigateTransition(direction = 'in') {
    this.pendingTransition = animationEnabled(this.getSettings(), 'folder') ? { kind: 'folder', direction } : null;
    return this.render();
  }

  setImages(images) {
    this.images = new Map(images.map(({ signature, image }) => [signature, image]));
    return this.render();
  }

  async imageBuffer(control, signature, image) {
    const { width, height } = control.pixelSize;
    const id = `${signature}:${width}x${height}`;
    let buffer = this.cache.get(id);
    if (!buffer) {
      buffer = await sharp(Buffer.from(image.split(',')[1], 'base64')).resize(width, height).removeAlpha().raw().toBuffer();
      this.cache.set(id, buffer);
      if (this.cache.size > 256) this.cache.delete(this.cache.keys().next().value);
    }
    return buffer;
  }

  render() {
    const revision = ++this.renderRevision;
    this.transitionController?.abort();
    this.renderQueue = this.renderQueue.catch(() => {}).then(async () => {
      if (revision !== this.renderRevision || this.stopping) return;
      const deck = this.deck;
      if (!deck) return;
      const current = () => this.deck === deck && revision === this.renderRevision && !this.stopping;
      await deck.setBrightness(this.getBrightness());
      const settings = this.getSettings();
      const keys = this.getKeys().map(key => resolvedKeyFont(key, settings));
      const targets = [];
      let missing = false;
      for (const control of this.controls) {
        if (!current()) return;
        const key = keys[control.index];
        const signature = visualSignature(key, this.isActive(key));
        if (control.feedbackType === 'lcd') {
          const image = this.images.get(signature);
          if (!image) { missing = true; continue; }
          const buffer = await this.imageBuffer(control, signature, image);
          targets.push({ control, buffer, signature });
        }
      }
      if (!current()) return;
      const transition = this.pendingTransition;
      if (transition && !animationEnabled(this.getSettings(), transition.kind)) this.pendingTransition = null;
      if (this.pendingTransition) {
        // Wait for the exact artwork instead of flashing icons before the effect.
        if (missing) return;
        this.pendingTransition = null;
        if (targets.length) {
          const controller = new AbortController();
          this.transitionController = controller;
          this.info.transitioning = transition.kind;
          this.onStatus();
          try {
            await playIconTransition(deck, targets, this.displayed, {
              ...transition, signal: controller.signal, cache: this.transitionCache,
              onFrame: (index, buffer) => {
                if (this.deck === deck) { this.displayed.set(index, buffer); this.sent.delete(index); }
              },
            });
            if (current() && !controller.signal.aborted) {
              for (const target of targets) this.sent.set(target.control.index, target.signature);
            }
          } catch (error) {
            if (!controller.signal.aborted) { this.info.error = `Icon-Animation: ${error.message}`; this.onStatus(); }
          } finally {
            if (this.deck !== deck) this.transitionCache.clear();
            this.transitionController = null;
            this.info.transitioning = null;
            this.onStatus();
          }
        }
      }
      // Also restores exact artwork after cancellation or an animation error.
      for (const target of targets) {
        if (!current()) return;
        if (this.sent.get(target.control.index) === target.signature) continue;
        await deck.fillKeyBuffer(target.control.index, target.buffer, { format: 'rgb' });
        if (this.deck !== deck) return;
        this.displayed.set(target.control.index, target.buffer);
        this.sent.set(target.control.index, target.signature);
      }
      for (const control of this.controls.filter(c => c.feedbackType === 'rgb')) {
        if (!current()) return;
        const key = keys[control.index];
        const signature = visualSignature(key, this.isActive(key));
        if (this.sent.get(control.index) === signature) continue;
        const color = key?.color || '#000000';
        await deck.fillKeyColor(control.index, parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16));
        this.sent.set(control.index, signature);
      }
    }).catch(error => { this.info.error = error.message; this.onStatus(); });
    return this.renderQueue;
  }

  close() {
    // Repeated quit requests must neither replay nor interrupt the end wave.
    if (!this.closePromise) this.closePromise = this.closeDevice();
    return this.closePromise;
  }

  async closeDevice() {
    this.stopping = true;
    this.skipStartupAnimation();
    this.transitionController?.abort();
    this.pendingTransition = null;
    clearInterval(this.timer);
    await this.renderQueue.catch(() => {});
    const deck = this.deck;
    if (!deck) return;
    const controller = new AbortController();
    this.shutdownController = controller;
    this.info.closing = true;
    this.onStatus();
    let timer;
    try {
      // An optional visual effect must not indefinitely delay shutdown if a
      // device stops replying. Normal rendering has already been stopped.
      const deadline = new Promise(resolve => {
        const budget = 4000 + Math.max(0, (this.controls?.length || 0) - 15) * 150;
        timer = setTimeout(() => { controller.abort(); resolve(); }, budget);
      });
      await Promise.race([
        playStartupWave(deck, this.controls || [], { reverse: true, signal: controller.signal, preparedCache: this.waveCache }),
        deadline,
      ]);
    } catch (error) {
      if (!controller.signal.aborted && this.deck === deck) this.info.error = `Beenden-Animation: ${error.message}`;
    } finally {
      clearTimeout(timer);
      this.shutdownController = null;
      this.info.closing = false;
      this.onStatus();
      if (this.deck === deck) {
        await deck.clearPanel().catch(() => {});
        await this.disconnect();
      }
    }
  }
}
