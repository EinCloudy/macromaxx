import { listStreamDecks, openStreamDeck } from '@elgato-stream-deck/node';
import sharp from 'sharp';
import { visualSignature } from '../shared/visuals.js';
export class Devices {
  constructor({ onStatus, onDown, onUp, getKeys, getBrightness, isActive = () => false }) {
    Object.assign(this, { onStatus, onDown, onUp, getKeys, getBrightness, isActive });
    this.info = { connected: false, name: 'Virtuelles Stream Deck', rows: 3, columns: 5, count: 15, error: '' }; this.cache = new Map(); this.sent = new Map(); this.images = new Map(); this.renderQueue = Promise.resolve(); this.renderRevision = 0;
  }
  start() { this.scan(); this.timer = setInterval(() => this.scan(), 3000); }
  async scan() {
    if (this.scanning || this.stopping) return; this.scanning = true;
    try {
      const devices = await listStreamDecks();
      if (this.deck && !devices.some(d => d.path === this.path)) await this.disconnect();
      this.available = devices.map(d => ({ path: d.path, name: d.modelInfo.name }));
      if (!this.deck && devices.length) {
        const target = devices.find(d => d.path === this.preferred) || devices[0];
        this.deck = await openStreamDeck(target.path); this.path = target.path;
        const controls = this.deck.modelInfo.controls.filter(c => c.type === 'button');
        this.controls = controls;
        this.info = { connected: true, name: this.deck.modelInfo.name, serial: await this.deck.getSerialNumber(), count: controls.length, rows: Math.max(...controls.map(c => c.row)) + 1, columns: Math.max(...controls.map(c => c.column)) + 1, error: '' };
        this.deck.on('down', c => { if (c.type === 'button') this.onDown(c.index); });
        this.deck.on('up', c => { if (c.type === 'button') this.onUp(c.index); });
        this.deck.on('error', error => { this.info.error = error.message; this.disconnect().catch(() => {}); });
        this.sent.clear(); this.onStatus(); await this.render();
      } else if (!devices.length && this.info.error) { this.info.error = ''; this.onStatus(); }
    } catch (error) { const message = `USB-Zugriff fehlgeschlagen: ${error.message}`; if (this.info.error !== message) { this.info.error = message; this.onStatus(); } }
    finally { this.scanning = false; }
  }
  async select(devicePath) { this.preferred = devicePath; await this.disconnect(); await this.scan(); }
  async disconnect() { const deck = this.deck; this.deck = null; this.path = null; this.sent.clear(); if (deck) { deck.removeAllListeners(); await deck.close().catch(() => {}); } this.info.connected = false; this.onStatus(); }
  setImages(images) { this.images = new Map(images.map(({ signature, image }) => [signature, image])); return this.render(); }
  render() {
    const revision = ++this.renderRevision;
    this.renderQueue = this.renderQueue.catch(() => {}).then(async () => {
      if (revision !== this.renderRevision) return;
      const deck = this.deck; if (!deck) return;
      await deck.setBrightness(this.getBrightness());
      const keys = this.getKeys();
      for (const c of this.controls) {
        if (this.deck !== deck || revision !== this.renderRevision) return;
        const key = keys[c.index];
        const signature = visualSignature(key, this.isActive(key));
        const image = this.images.get(signature);
        if (this.sent.get(c.index) === signature) continue;
        if (c.feedbackType === 'lcd') {
          const size = c.pixelSize;
          // Keep the previous artwork until the exact new image is ready.
          // Never flash a label-only placeholder during navigation.
          if (!image) continue;
          let buffer;
          {
            const cacheKey = signature + `${size.width}x${size.height}`;
            buffer = this.cache.get(cacheKey);
            if (!buffer) { buffer = await sharp(Buffer.from(image.split(',')[1], 'base64')).resize(size.width, size.height).removeAlpha().raw().toBuffer(); this.cache.set(cacheKey, buffer); if (this.cache.size > 256) this.cache.delete(this.cache.keys().next().value); }
          }
          if (revision !== this.renderRevision || this.deck !== deck) return;
          await deck.fillKeyBuffer(c.index, buffer, { format: 'rgb' });
        } else if (c.feedbackType === 'rgb') { const color = key?.color || '#000000'; await deck.fillKeyColor(c.index, parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)); }
        this.sent.set(c.index, signature);
      }
    }).catch(error => { this.info.error = error.message; this.onStatus(); }); return this.renderQueue;
  }
  async close() { this.stopping = true; clearInterval(this.timer); await this.renderQueue.catch(() => {}); if (this.deck) { await this.deck.resetToLogo().catch(() => {}); await this.disconnect(); } }
}
