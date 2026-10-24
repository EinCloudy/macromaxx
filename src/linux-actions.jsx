import React, { useState } from 'react';
import { api } from './api.js';
import { desktopCommands } from '../shared/desktop-commands.js';
export function DesktopEditor({ action, update, status }) {
  return <><Select label="Desktop action" value={action.command} options={desktopCommands.map(([id, label]) => [id, label + (status.desktop?.supported?.includes(id) ? '' : ' (not available here)')])} onChange={command => update({ command })} /><p className="muted-text">Backend: {status.desktop?.backend || 'Not detected'}. {status.desktop?.error || 'Actions affect the currently focused window.'}</p></>;
}
function TextField({ label, value, onChange, multiline, placeholder }) { return <label className="field"><span>{label}</span>{multiline ? <textarea rows="4" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} /> : <input value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />}</label>; }
export function LauncherEditor({ action, update, status, perform }) {
  const [search, setSearch] = useState('');
  const apps = (status.apps || []).filter(app => app.id === action.desktopId || app.name.toLowerCase().includes(search.toLowerCase()));
  return <>
    <Select label="Launch mode" value={action.mode || 'file'} options={[["file", 'Application or file path'], ['installed', 'Installed application'], ['flatpak', 'Flatpak app ID']]} onChange={mode => update({ mode })} />
    {action.mode === 'installed' ? <><TextField label="Find an application" value={search} onChange={setSearch} /><Select label="Installed application" value={action.desktopId || ''} options={[["", 'Choose an application …'], ...apps.map(app => [app.id, `${app.name}${app.flatpak ? ' (Flatpak)' : ''}`])]} onChange={desktopId => update({ desktopId })} /><button className="button small" onClick={() => perform(() => api.refreshApplications())}>Refresh applications</button></> : action.mode === 'flatpak' ? <TextField label="Flatpak application ID" value={action.flatpakId} placeholder="org.mozilla.firefox" onChange={flatpakId => update({ flatpakId })} /> : <><TextField label="Application or file" value={action.path} placeholder="/path/to/application or executable in PATH" onChange={path => update({ path })} /><button className="button small" onClick={() => perform(async () => { const path = await api.pickFile(); if (path) update({ path }); })}>Choose file</button></>}
    <ProcessFields action={action} update={update} />
    <label className="checkbox-label"><input type="checkbox" checked={!!action.terminal} onChange={e => update({ terminal: e.target.checked })} />Open in terminal</label>
  </>;
}
function ProcessFields({ action, update }) {
  return <><TextField label="Arguments (JSON array)" value={action.args || '[]'} placeholder={'["--new-window", "a path with spaces"]'} onChange={args => update({ args })} /><TextField label="Working directory" value={action.cwd} placeholder="Optional; ~ is supported" onChange={cwd => update({ cwd })} /><TextField label="Environment (JSON object)" value={action.env || '{}'} onChange={env => update({ env })} /><p className="muted-text">Arguments are passed separately, without shell interpolation. Environment values are included in workspace exports.</p></>;
}
export function ScriptEditor({ action, update }) {
  return <><TextField label="Shell executable" value={action.shell || '/bin/sh'} onChange={shell => update({ shell })} /><TextField label="Shell script" value={action.script} multiline placeholder="Your command or script" onChange={script => update({ script })} /><ProcessFields action={action} update={update} /><p className="muted-text">Runs with your user permissions. Foreground commands are awaited, output appears in Activity, and chains can cancel the process group. Timeout: 60 seconds.</p></>;
}
export function MediaEditor({ action, update, status }) {
  return <><Select label="Media command" value={action.command} options={[
    ['playpause', 'Play / pause'], ['play', 'Play'], ['pause', 'Pause'], ['stop', 'Stop playback'], ['next', 'Next track'], ['previous', 'Previous track'],
    ['player-volume', 'Set player volume'], ['player-volumeup', 'Player volume up'], ['player-volumedown', 'Player volume down'],
    ['mute', 'System mute'], ['volumeup', 'System volume up'], ['volumedown', 'System volume down'],
  ]} onChange={command => update({ command })} />
    <Select label="MPRIS player (Linux)" value={action.player || 'auto'} options={[["auto", 'Automatic (prefer playing)'], ...(status.media?.players || []).map(p => [p.id, `${p.id} · ${p.status}`])]} onChange={player => update({ player })} />
    {action.command?.startsWith('player-volume') && <label className="field"><span>{action.command === 'player-volume' ? 'Player volume (%)' : 'Volume step (%)'}</span><input type="number" min="0" max="100" value={action.command === 'player-volume' ? action.volume ?? 50 : action.step ?? 5} onChange={e => update({ [action.command === 'player-volume' ? 'volume' : 'step']: Number(e.target.value) })} /></label>}
    <label className="checkbox-label"><input type="checkbox" checked={!!action.showTitle} onChange={e => update({ showTitle: e.target.checked })} />Show track title on key</label>
    {action.showTitle && <label className="checkbox-label"><input type="checkbox" checked={!!action.showArtist} onChange={e => update({ showArtist: e.target.checked })} />Include artist</label>}
    <p className="muted-text">Player selection, titles, and player volume require playerctl on Linux. System-volume actions still control the system output.</p>
  </>;
}
export function Select({ label, value, options, onChange }) {
  return <label className="field"><span>{label}</span><select value={value} onChange={e => onChange(e.target.value)}>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
}
export function AudioEditor({ action, update, status }) {
  const audio = status.audio || {}, kind = action.kind || 'input';
  const targets = kind === 'input' ? audio.inputs : kind === 'output' ? audio.outputs : audio.applications;
  const unique = [...new Map((targets || []).map(t => [t.id, t])).values()];
  return <>
    <Select label="Audio target type" value={kind} options={[['input', 'Microphone / input'], ['output', 'Speakers / output'], ['application', 'Application']]} onChange={kind => update({ kind, target: 'default', command: 'mute' })} />
    <Select label="Audio target" value={action.target || 'default'} options={[[kind === 'application' ? '' : 'default', kind === 'application' ? 'Choose a running application …' : 'System default'], ...unique.map(t => [t.id, `${t.name} · ${t.volume}%${t.mute ? ' · Muted' : ''}`])]} onChange={target => update({ target })} />
    <Select label="Audio command" value={action.command} options={[
      ['mute', 'Toggle mute'], ['volume', 'Set volume'], ['volumeup', 'Volume up'], ['volumedown', 'Volume down'],
      ...(kind === 'input' ? [['ptt', 'Push-to-talk (hold)'], ['ptm', 'Push-to-mute (hold)']] : []),
      ...(kind !== 'application' ? [['default', 'Set as default device']] : [['move', 'Move application to output']]),
    ]} onChange={command => update({ command })} />
    {['volume', 'volumeup', 'volumedown'].includes(action.command) && <label className="field"><span>Volume / step (%)</span><input type="number" min="0" max="150" value={action.volume ?? 5} onChange={e => update({ volume: Number(e.target.value) })} /></label>}
    {action.command === 'move' && <Select label="Output device" value={action.output || ''} options={[['', 'Choose an output …'], ...(audio.outputs || []).map(t => [t.id, t.name])]} onChange={output => update({ output })} />}
    {['ptt', 'ptm'].includes(action.command) && <p className="muted-text">Place this action first on the key. It runs immediately on physical press and restores the previous microphone state on release. Additional actions on that key are not run for a hold assignment.</p>}
    {!audio.available && <p className="muted-text">{audio.error || 'Requires Linux with pactl and PipeWire-Pulse or PulseAudio.'}</p>}
  </>;
}
