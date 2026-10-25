import React from 'react';
import { Icon } from '../../../src/icons.jsx';
import { api } from '../../../src/api.js';
import { Select } from '../fields.jsx';
export function MediaEditor({ action, update, status }) {
  const features = status.native?.capabilities?.['media.controls']?.features || { commands: [], players: false, titles: false };
  const commands = [['playpause', 'Play / pause'], ['play', 'Play'], ['pause', 'Pause'], ['stop', 'Stop playback'], ['next', 'Next track'], ['previous', 'Previous track'], ['player-volume', 'Set player volume'], ['player-volumeup', 'Player volume up'], ['player-volumedown', 'Player volume down'], ['mute', 'System mute'], ['volumeup', 'System volume up'], ['volumedown', 'System volume down']];
  return <><Select label="Media command" value={action.command} options={commands.filter(([id]) => features.commands.includes(id))} onChange={command => update({ command })} />
    {(features.players || action.player && action.player !== 'auto') && <Select label="MPRIS player (Linux)" value={action.player || 'auto'} options={[["auto", 'Automatic (prefer playing)'], ...(status.media?.players || []).map(p => [p.id, `${p.id} · ${p.status}`])]} onChange={player => update({ player })} />}
    {action.command?.startsWith('player-volume') && <label className="field"><span>{action.command === 'player-volume' ? 'Player volume (%)' : 'Volume step (%)'}</span><input type="number" min="0" max="100" value={action.command === 'player-volume' ? action.volume ?? 50 : action.step ?? 5} onChange={e => update({ [action.command === 'player-volume' ? 'volume' : 'step']: Number(e.target.value) })} /></label>}
    {(features.titles || action.showTitle) && <><label className="checkbox-label"><input type="checkbox" checked={!!action.showTitle} onChange={e => update({ showTitle: e.target.checked })} />Show track title on key (Linux MPRIS)</label>{action.showTitle && <label className="checkbox-label"><input type="checkbox" checked={!!action.showArtist} onChange={e => update({ showArtist: e.target.checked })} />Include artist</label>}</>}
    <p className="muted-text">Shared RobotJS provides global playback keys where supported and permitted. Linux prefers MPRIS when a player is available; player selection and metadata remain platform-specific. Saved unsupported commands remain visible.</p>
  </>;
}
export function MediaSettings({ status, perform }) {
  const media = status.media || {}, features = status.native?.capabilities?.['media.controls']?.features || {};
  return <section className="settings-card"><div className="settings-title"><span className="action-icon"><Icon name="Music2" /></span><div><h3>Native media</h3><p>{media.backend || 'Linux MPRIS / playerctl'}</p></div></div>{(media.players || []).map(p => <p className="muted-text" key={p.id}>{p.id} · {p.status} · {p.volume}%<br />{p.title}{p.artist ? ' · ' + p.artist : ''}</p>)}<p className="muted-text">{media.error || `Available commands: ${(features.commands || []).join(', ') || 'None'}.`}</p><button className="button" onClick={() => perform(() => api.nativeCall('media', 'refresh'))}>Refresh media capabilities</button></section>;
}
