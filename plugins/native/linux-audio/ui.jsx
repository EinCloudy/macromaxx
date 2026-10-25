import React from 'react';
import { Icon } from '../../../src/icons.jsx';
import { api } from '../../../src/api.js';
import { Select } from '../fields.jsx';
export function AudioEditor({ action, update, status }) {
  const audio = status.audio || {}, kind = action.kind || 'input';
  const targets = kind === 'input' ? audio.inputs : kind === 'output' ? audio.outputs : audio.applications;
  const unique = [...new Map((targets || []).map(t => [t.id, t])).values()];
  return <><Select label="Audio target type" value={kind} options={[["input", 'Microphone / input'], ['output', 'Speakers / output'], ['application', 'Application']]} onChange={kind => update({ kind, target: 'default', command: 'mute' })} />
    <Select label="Audio target" value={action.target || 'default'} options={[[kind === 'application' ? '' : 'default', kind === 'application' ? 'Choose a running application …' : 'System default'], ...unique.map(t => [t.id, `${t.name} · ${t.volume}%${t.mute ? ' · Muted' : ''}`])]} onChange={target => update({ target })} />
    <Select label="Audio command" value={action.command} options={[["mute", 'Toggle mute'], ['volume', 'Set volume'], ['volumeup', 'Volume up'], ['volumedown', 'Volume down'], ...(kind === 'input' ? [['ptt', 'Push-to-talk (hold)'], ['ptm', 'Push-to-mute (hold)']] : []), ...(kind !== 'application' ? [['default', 'Set as default device']] : [['move', 'Move application to output']])]} onChange={command => update({ command })} />
    {['volume', 'volumeup', 'volumedown'].includes(action.command) && <label className="field"><span>Volume / step (%)</span><input type="number" min="0" max="150" value={action.volume ?? 5} onChange={e => update({ volume: Number(e.target.value) })} /></label>}
    {action.command === 'move' && <Select label="Output device" value={action.output || ''} options={[["", 'Choose an output …'], ...(audio.outputs || []).map(t => [t.id, t.name])]} onChange={output => update({ output })} />}
    {['ptt', 'ptm'].includes(action.command) && <p className="muted-text">Put this action first on a physical key. It takes effect on key-down and restores the previous microphone state on release. Additional actions are not run for a hold assignment.</p>}
    <p className="muted-text">Linux Audio plugin · requires pactl and PipeWire-Pulse/PulseAudio. Device IDs are OS-local and are retained in imported profiles.</p>
  </>;
}
export function AudioSettings({ status, perform }) {
  const audio = status.audio || {};
  return <section className="settings-card"><div className="settings-title"><span className="action-icon"><Icon name="Mic" /></span><div><h3>Linux audio plugin</h3><p>PipeWire / PulseAudio mixer and live mute state.</p></div></div><div className="setup-steps">{['inputs', 'outputs'].map(kind => <div key={kind}><h4>{kind === 'inputs' ? 'Microphones' : 'Outputs'}</h4>{(audio[kind] || []).map(d => <p key={d.id}>{d.name} · {d.volume}% · {d.mute ? 'Muted' : 'Unmuted'}{d.id === (kind === 'inputs' ? audio.defaultInput : audio.defaultOutput) ? ' · Default' : ''}</p>)}</div>)}</div>{audio.error && <p className="muted-text">{audio.error}</p>}<button className="button" onClick={() => perform(() => api.nativeCall('linux-audio', 'refresh'))}>Refresh audio devices</button><p className="muted-text">Install pactl: Debian/Ubuntu: pulseaudio-utils; Arch: libpulse. No keyboard permission is needed.</p></section>;
}
