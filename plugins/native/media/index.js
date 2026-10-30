import { Media, playerCommands } from './service.js';
import { selectPlayer } from './players.js';
import { run } from '../../../electron/commands.js';

const systemCommands = ['mute', 'volumeup', 'volumedown'];
const windowsCommands = ['playpause', 'next', 'previous', ...systemCommands];
export async function create(ctx) {
  const execute = ctx.runCommand || run;
  const linux = ctx.platform === 'linux';
  const media = new Media(ctx.changed, execute, undefined, ctx.platform);
  let scrollFrame = 0, scrollTimer;
  const hasScrollingTile = () => {
    const visit = keys => (keys || []).some(key => key && (key.actions?.some(action => action.type === 'tile' && action.scrollText && selectPlayer(media.state, action.player)) || visit(key.children)));
    return ctx.getState?.()?.profiles?.some(profile => visit(profile.keys));
  };
  let systemAvailable = ctx.platform === 'win32' ? !!ctx.service('input')?.integrationAvailable : false;
  const refresh = async () => {
    await media.refresh();
    if (linux) {
      systemAvailable = await execute('wpctl', ['--version']).then(() => true).catch(() => execute('pactl', ['--version']).then(() => true).catch(() => false));
    } else if (ctx.platform === 'darwin') systemAvailable = await execute('osascript', ['-e', 'return 1']).then(() => true).catch(() => false);
    ctx.changed(); return media.state;
  };
  await refresh();
  const systemReady = () => ctx.platform === 'win32' ? !!ctx.service('input')?.integrationAvailable : systemAvailable;
  const globalCommands = () => ctx.service('input')?.mediaCommands || (ctx.platform === 'win32' && systemReady() ? windowsCommands : []);
  const commands = () => [...new Set([...(linux && media.state.available ? playerCommands : []), ...globalCommands(), ...(systemReady() ? systemCommands : [])])];
  return {
    services: { media },
    defaults: type => type !== 'tile' && ctx.platform === 'darwin' && !commands().includes('playpause') ? { command: 'volumeup' } : {},
    capabilities: () => ({
      'media.controls': { available: commands().length > 0, reason: commands().length ? '' : 'Required native media tools are unavailable.', features: { commands: commands(), globalCommands: globalCommands(), players: linux && media.state.available, titles: media.state.available } },
      'media.tiles': { available: media.state.available, reason: media.state.error, features: { contents: ['album-cover', 'track-info'], players: ctx.platform !== 'darwin' } },
    }),
    supports: action => {
      if (action.type === 'tile') return !action.content || ['album-cover', 'track-info'].includes(action.content) ? { available: true } : { available: false, reason: 'Unknown Tile content.' };
      if (action.command && !commands().includes(action.command)) return { available: false, reason: 'This media command is not implemented or available in the current OS adapter.' };
      if (!linux && action.player && action.player !== 'auto') return { available: false, reason: 'Media control player selection currently requires the Linux MPRIS adapter. Tiles can select Windows media sessions independently.' };
      return { available: true };
    },
    actions: { media: async action => {
      if (linux && playerCommands.includes(action.command) && (selectPlayer(media.state, action.player) || !globalCommands().includes(action.command) || action.player && action.player !== 'auto' || action.showTitle)) return media.execute(action);
      const shared = globalCommands().includes(action.command);
      const preferSystemApi = systemCommands.includes(action.command) && systemAvailable && (linux || ctx.platform === 'darwin' && !ctx.service('input')?.ready);
      if (shared && !preferSystemApi) return ctx.runAction({ type: 'hotkey', keys: { playpause: 'PLAYPAUSE', next: 'NEXT', previous: 'PREVIOUS', stop: 'STOP', mute: 'MUTE', volumeup: 'VOLUMEUP', volumedown: 'VOLUMEDOWN' }[action.command] });
      if (ctx.platform === 'darwin') return execute('osascript', ['-e', action.command === 'mute' ? 'set volume output muted not (output muted of (get volume settings))' : `set volume output volume ((output volume of (get volume settings)) ${action.command === 'volumeup' ? '+' : '-'} 5)`]);
      if (ctx.platform === 'win32') return ctx.runAction({ type: 'hotkey', keys: { playpause: 'PLAYPAUSE', next: 'NEXT', previous: 'PREVIOUS', mute: 'MUTE', volumeup: 'VOLUMEUP', volumedown: 'VOLUMEDOWN' }[action.command] });
      const audio = ctx.service('audio');
      if (audio?.state.available) return audio.execute({ kind: 'output', target: 'default', command: action.command, volume: 5 });
      try { return await execute('wpctl', action.command === 'mute' ? ['set-mute', '@DEFAULT_AUDIO_SINK@', 'toggle'] : ['set-volume', '-l', '1.5', '@DEFAULT_AUDIO_SINK@', action.command === 'volumeup' ? '5%+' : '5%-']); }
      catch { return execute('pactl', action.command === 'mute' ? ['set-sink-mute', '@DEFAULT_SINK@', 'toggle'] : ['set-sink-volume', '@DEFAULT_SINK@', action.command === 'volumeup' ? '+5%' : '-5%']); }
    }, tile: async () => { /* A Tile is display-only; pressing it never changes playback. */ } },
    operations: { refresh },
    status: () => ({ media: media.state }),
    visual: key => tileVisual(key, media.state, scrollFrame) || mediaVisual(key, media.state),
    start: () => { media.start(); if (!scrollTimer) scrollTimer = setInterval(() => { if (hasScrollingTile()) { scrollFrame++; ctx.changed(); } }, 50); }, resume: refresh, close: () => { clearInterval(scrollTimer); media.close(); },
  };
}
export function mediaVisual(key, state) {
  const action = key.actions?.find(a => a.type === 'media'); if (!action) return null;
  const player = selectPlayer(state, action.player);
  return { ...(['playpause', 'play', 'pause'].includes(action.command) && player ? { active: player.status === 'Playing' } : {}), ...(action.showTitle && player?.title ? { label: `${player.title}${action.showArtist && player.artist ? ' · ' + player.artist : ''}`.slice(0, 80) } : {}) };
}
export function tileVisual(key, state, scrollFrame = 0) {
  const action = key.actions?.find(a => a.type === 'tile'); if (!action) return null;
  const player = selectPlayer(state, action.player); if (!player) return null;
  const textOnly = action.content === 'track-info';
  const fields = action.textFields || (textOnly || action.showTitle ? (action.showArtist ? 'both' : 'title') : 'none');
  const stacked = fields === 'both' && action.textLayout === 'stacked';
  const label = [fields === 'title' || fields === 'both' ? player.title : '', fields === 'artist' || fields === 'both' ? player.artist : ''].filter(Boolean).map(value => value.replace(/[\r\n]+/g, ' ')).join(stacked ? '\n' : ' · ');
  const text = label && action.scrollText ? { scrollFrame, scrollSpeed: ['slow', 'fast'].includes(action.scrollSpeed) ? action.scrollSpeed : 'normal' } : {};
  const layout = label && stacked ? { textLayout: 'stacked' } : {};
  return { active: false, ...(textOnly ? { image: '', label, ...text, ...layout } : { ...(player.cover ? { image: player.cover, label: '' } : {}), ...(label ? { label, ...text, ...layout } : {}) }) };
}
