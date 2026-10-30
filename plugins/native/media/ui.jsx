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
    {(features.titles || action.showTitle) && <><label className="checkbox-label"><input type="checkbox" checked={!!action.showTitle} onChange={e => update({ showTitle: e.target.checked })} />Show track title on key</label>{action.showTitle && <label className="checkbox-label"><input type="checkbox" checked={!!action.showArtist} onChange={e => update({ showArtist: e.target.checked })} />Include artist</label>}</>}
    <p className="muted-text">Available controls and track information depend on your system and media player.</p>
  </>;
}
export function TileEditor({ action, update, status }) {
  const features = status.native?.capabilities?.['media.tiles']?.features || {};
  const players = status.media?.players || [];
  const selected = action.player || 'auto';
  return <>
    <Select label="Tile content" value={action.content || 'album-cover'} options={[["album-cover", 'Album cover'], ["track-info", 'Track information']]} onChange={content => update({ content })} />
    {(features.players || selected !== 'auto') && <Select label="Media player" value={selected} options={[["auto", 'Automatic (prefer playing)'], ...players.map(p => [p.id, `${p.id} · ${p.status}`]), ...(selected !== 'auto' && !players.some(p => p.id === selected) ? [[selected, `${selected} · Not available`]] : [])]} onChange={player => update({ player })} />}
    <Select label="Text to display" value={action.textFields || (action.content === 'track-info' || action.showTitle ? (action.showArtist ? 'both' : 'title') : 'none')} options={[["none", 'No text'], ["title", 'Title only'], ["artist", 'Artist only'], ["both", 'Title and artist']]} onChange={textFields => update({ textFields })} />
    <label className="checkbox-label"><input type="checkbox" checked={!!action.scrollText} onChange={e => update({ scrollText: e.target.checked })} />Scroll text when too long</label>
    {action.scrollText && <Select label="Scroll speed" value={action.scrollSpeed || 'normal'} options={[["slow", 'Slow'], ["normal", 'Normal'], ["fast", 'Fast']]} onChange={scrollSpeed => update({ scrollSpeed })} />}
    <p className="muted-text">Display-only Tile for Windows, macOS and Linux. Your player must share media information with the operating system. macOS exposes the current player only. Without artwork, your configured key appearance is used.</p>
  </>;
}
export function MediaSettings({ status, perform }) {
  const media = status.media || {}, features = status.native?.capabilities?.['media.controls']?.features || {};
  return <section className="settings-card"><div className="settings-title"><span className="action-icon"><Icon name="Music2" /></span><div><h3>Native media</h3><p>{media.backend || 'System media sessions'}</p></div></div>{(media.players || []).map(p => <p className="muted-text" key={p.id}>{p.id} · {p.status}{p.volume != null ? ` · ${p.volume}%` : ''}<br />{p.title}{p.artist ? ' · ' + p.artist : ''}</p>)}<p className="muted-text">{media.error || `Available commands: ${(features.commands || []).join(', ') || 'None'}.`}</p><button className="button" onClick={() => perform(() => api.nativeCall('media', 'refresh'))}>Refresh media capabilities</button></section>;
}
