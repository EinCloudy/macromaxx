import { keyFontSize, resolvedKeyFont } from './key-text.js';
import { selectPlayer } from './players.js';
export const backKey = { id: 'back', label: 'Back', icon: 'ArrowLeft', color: '#ad92ff', background: '#242231' };

export function isKeyActive(key, obs, live = {}) {
  const sound = key?.actions?.find(a => a.type === 'sound');
  if (sound) return !!live.soundboard?.playing?.some(s => s.actionId === sound.id);
  const audioAction = key?.actions?.find(a => a.type === 'audio');
  if (audioAction && live.audio?.available) {
    const kind = audioAction.kind || 'input';
    const items = kind === 'input' ? live.audio.inputs : kind === 'output' ? live.audio.outputs : live.audio.applications;
    const target = audioAction.target && audioAction.target !== 'default' ? audioAction.target : kind === 'input' ? live.audio.defaultInput : live.audio.defaultOutput;
    return !!items?.find(d => d.id === target)?.mute;
  }
  const mediaAction = key?.actions?.find(a => a.type === 'media' && ['playpause', 'play', 'pause'].includes(a.command));
  if (mediaAction) return selectPlayer(live.media, mediaAction.player)?.status === 'Playing';
  const action = key?.actions?.find(a => a.type === 'obs');
  if (!action || !obs?.connected) return false;
  return action.command === 'scene' ? obs.scene === action.scene
    : action.command === 'record' ? !!obs.recording
    : action.command === 'stream' ? !!obs.streaming : !!obs.muted?.[action.input];
}

export function liveKey(key, live = {}) {
  const action = key?.actions?.find(a => a.type === 'media' && a.showTitle);
  const player = action && selectPlayer(live.media, action.player);
  return player?.title ? { ...key, label: `${player.title}${action.showArtist && player.artist ? ' · ' + player.artist : ''}`.slice(0, 80) } : key;
}

// Only appearance matters: the same artwork can be reused on any page/slot.
export function visualSignature(key, active = false) {
  return JSON.stringify(key ? [key.label, key.icon, key.color, key.background, key.image || '', keyFontSize(key), !!active] : null);
}

export function collectVisuals(state, obs, live = {}) {
  const entries = new Map();
  function add(key) {
    key = resolvedKeyFont(liveKey(key, live), state.settings);
    const active = isKeyActive(key, obs, live);
    const signature = visualSignature(key, active);
    if (!entries.has(signature)) entries.set(signature, { key, active, signature });
  }
  function visit(keys) { for (const key of keys) if (key) { add(key); visit(key.children || []); } }
  add(null); add(backKey);
  state.profiles.forEach(profile => visit(profile.keys));
  return [...entries.values()];
}
