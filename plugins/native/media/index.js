import { Media, playerCommands } from './service.js';
import { selectPlayer } from './players.js';
import { run } from '../../../electron/commands.js';

const systemCommands = ['mute', 'volumeup', 'volumedown'];
const windowsCommands = ['playpause', 'next', 'previous', ...systemCommands];
export async function create(ctx) {
  const execute = ctx.runCommand || run;
  const linux = ctx.platform === 'linux';
  const media = new Media(ctx.changed);
  let systemAvailable = ctx.platform === 'win32' ? !!ctx.service('input')?.integrationAvailable : false;
  const refresh = async () => {
    if (linux) {
      await media.refresh();
      systemAvailable = await execute('wpctl', ['--version']).then(() => true).catch(() => execute('pactl', ['--version']).then(() => true).catch(() => false));
    } else if (ctx.platform === 'darwin') systemAvailable = await execute('osascript', ['-e', 'return 1']).then(() => true).catch(() => false);
    ctx.changed(); return media.state;
  };
  await refresh();
  const commands = () => linux ? [...(media.state.available ? playerCommands : []), ...(systemAvailable ? systemCommands : [])] : systemAvailable ? ctx.platform === 'win32' ? windowsCommands : systemCommands : [];
  return {
    services: { media },
    defaults: () => ctx.platform === 'darwin' ? { command: 'volumeup' } : {},
    capabilities: () => ({ 'media.controls': { available: commands().length > 0, reason: commands().length ? '' : 'Required native media tools are unavailable.', features: { commands: commands(), players: linux && media.state.available, titles: linux && media.state.available } } }),
    supports: action => {
      if (action.command && !commands().includes(action.command)) return { available: false, reason: 'This media command is not implemented or available in the current OS adapter.' };
      if (!linux && (action.showTitle || action.player && action.player !== 'auto')) return { available: false, reason: 'Player selection and track metadata currently require the Linux MPRIS adapter.' };
      return { available: true };
    },
    actions: { media: async action => {
      if (linux && playerCommands.includes(action.command)) return media.execute(action);
      if (ctx.platform === 'darwin') return execute('osascript', ['-e', action.command === 'mute' ? 'set volume output muted not (output muted of (get volume settings))' : `set volume output volume ((output volume of (get volume settings)) ${action.command === 'volumeup' ? '+' : '-'} 5)`]);
      if (ctx.platform === 'win32') return ctx.runAction({ type: 'hotkey', keys: { playpause: 'PLAYPAUSE', next: 'NEXT', previous: 'PREVIOUS', mute: 'MUTE', volumeup: 'VOLUMEUP', volumedown: 'VOLUMEDOWN' }[action.command] });
      const audio = ctx.service('audio');
      if (audio?.state.available) return audio.execute({ kind: 'output', target: 'default', command: action.command, volume: 5 });
      try { return await execute('wpctl', action.command === 'mute' ? ['set-mute', '@DEFAULT_AUDIO_SINK@', 'toggle'] : ['set-volume', '-l', '1.5', '@DEFAULT_AUDIO_SINK@', action.command === 'volumeup' ? '5%+' : '5%-']); }
      catch { return execute('pactl', action.command === 'mute' ? ['set-sink-mute', '@DEFAULT_SINK@', 'toggle'] : ['set-sink-volume', '@DEFAULT_SINK@', action.command === 'volumeup' ? '+5%' : '-5%']); }
    } },
    operations: { refresh },
    status: () => ({ media: linux ? media.state : { available: systemAvailable, players: [], error: '', backend: ctx.platform === 'win32' ? 'Windows media keys' : 'macOS volume/mute' } }),
    visual: key => linux ? mediaVisual(key, media.state) : null,
    start: () => { if (linux) media.start(); }, resume: refresh, close: () => media.close(),
  };
}
export function mediaVisual(key, state) {
  const action = key.actions?.find(a => a.type === 'media'); if (!action) return null;
  const player = selectPlayer(state, action.player);
  return { ...(['playpause', 'play', 'pause'].includes(action.command) ? { active: player?.status === 'Playing' } : {}), ...(action.showTitle && player?.title ? { label: `${player.title}${action.showArtist && player.artist ? ' · ' + player.artist : ''}`.slice(0, 80) } : {}) };
}
