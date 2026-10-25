import { run } from '../../../electron/commands.js';
import { selectPlayer } from './players.js';
export const playerCommands = ['playpause', 'play', 'pause', 'stop', 'next', 'previous', 'player-volume', 'player-volumeup', 'player-volumedown'];
export class Media {
  constructor(onStatus, execute = run) { this.onStatus = onStatus; this.run = execute; this.state = { available: false, players: [], error: '' }; }
  start() { if (process.platform === 'linux') { this.refresh(); this.timer = setInterval(() => this.refresh(), 1500); } }
  async refresh() {
    if (process.platform !== 'linux' || this.closed) return this.state;
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      let next;
      try {
        const ids = await this.run('playerctl', ['-l']).catch(error => { if (error.code === 1) return ''; throw error; });
        const players = (await Promise.all([...new Set(ids.split('\n').filter(Boolean))].map(async id => {
          try {
            const [status, metadata, volume] = await Promise.all([this.run('playerctl', ['--player', id, 'status']), this.run('playerctl', ['--player', id, 'metadata', '--format', '{{title}}\u001f{{artist}}']), this.run('playerctl', ['--player', id, 'volume']).catch(() => '')]);
            const [title = '', artist = ''] = metadata.split('\u001f');
            return { id, status, title, artist, volume: Math.round((Number(volume) || 0) * 100) };
          } catch { return null; }
        }))).filter(Boolean);
        next = { available: true, players, error: '' };
      } catch (error) { next = { available: false, players: [], error: 'Media control requires playerctl and an MPRIS-compatible player. ' + error.message }; }
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
  close() { this.closed = true; clearInterval(this.timer); }
}
