import { run } from '../../../electron/commands.js';
import { selectPlayer } from './players.js';
import { loadCover } from './cover.js';
import { readPlayers, mediaBackends } from './adapters.js';
import { createHash } from 'node:crypto';
export const playerCommands = ['playpause', 'play', 'pause', 'stop', 'next', 'previous', 'player-volume', 'player-volumeup', 'player-volumedown'];
export class Media {
  constructor(onStatus, execute = run, artwork = loadCover, platform = process.platform) { this.onStatus = onStatus; this.run = execute; this.artwork = artwork; this.platform = platform; this.covers = new Map(); this.state = { available: false, players: [], error: '', backend: mediaBackends[platform] }; }
  async cover(url, track = '') {
    if (this.closed || !url) return '';
    const key = createHash('sha256').update(url).update(track).digest('hex');
    if (!this.covers.has(key)) {
      this.covers.set(key, Promise.resolve().then(() => this.artwork(url)).catch(() => ''));
      if (this.covers.size > 32) this.covers.delete(this.covers.keys().next().value);
    }
    const result = await this.covers.get(key);
    if (!result) this.covers.delete(key);
    return result;
  }
  start() { if (!this.closed && !this.timer) { this.refresh(); this.timer = setInterval(() => this.refresh(), 1500); } }
  async refresh() {
    if (this.closed) return this.state;
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      let next;
      try {
        const players = await Promise.all((await readPlayers(this.platform, this.run)).map(async ({ artUrl, ...player }) => ({ ...player, cover: await this.cover(artUrl, JSON.stringify([player.title, player.artist, player.album])) })));
        next = { available: true, players, error: '', backend: mediaBackends[this.platform] };
      } catch (error) { next = { available: false, players: [], error: `${mediaBackends[this.platform] || 'Media metadata'} unavailable: ${error.message}`, backend: mediaBackends[this.platform] }; }
      if (this.closed) return this.state;
      if (JSON.stringify(next) !== JSON.stringify(this.state)) { this.state = next; this.onStatus(); }
      return this.state;
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  async execute(action) {
    await this.refresh();
    const player = selectPlayer(this.state, action.player);
    if (!player) throw new Error('The selected media player is not available. Start it and refresh the player list.');
    if (!playerCommands.includes(action.command)) throw new Error('Unknown player command.');
    let args;
    if (action.command.startsWith('player-volume')) {
      const value = Number(action.command === 'player-volume' ? action.volume ?? 50 : action.step ?? 5);
      if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('Player volume must be between 0 and 100%.');
      const target = action.command === 'player-volume' ? value : Math.max(0, Math.min(100, player.volume + (action.command === 'player-volumeup' ? value : -value)));
      args = ['volume', String(target / 100)];
    } else args = [action.command === 'playpause' ? 'play-pause' : action.command];
    await this.run('playerctl', ['--player', player.id, ...args]); await this.refresh();
  }
  close() { this.closed = true; clearInterval(this.timer); this.covers.clear(); }
}
