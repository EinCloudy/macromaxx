import React from 'react';
import { Icon } from '../../../src/icons.jsx';
import { api } from '../../../src/api.js';
import { Select, TextField } from '../fields.jsx';
export function SoundEditor({ action, update, status, perform }) {
  const features = status.native?.capabilities?.['sound.play']?.features || { routes: ['output'] };
  return <><Select label="Sound command" value={action.command || 'play'} options={[["play", 'Play audio'], ['stop-all', 'Stop all sounds']]} onChange={command => update({ command })} />{action.command !== 'stop-all' && <>
    <TextField label="Audio file" value={action.path} onChange={path => update({ path })} /><button className="button small" onClick={() => perform(async () => { const path = await api.pickFile(); if (path) update({ path }); })}>Choose audio file</button>
    <Select label="Audio route" value={action.route || 'output'} options={[["output", 'Default / selected output'], ['virtual', 'Virtual microphone (Linux routing)'], ['both', 'Output and virtual microphone (Linux)']].filter(([id]) => features.routes.includes(id))} onChange={route => update({ route })} />
    {(features.namedOutputs || action.output && action.output !== 'default') && action.route !== 'virtual' && <Select label="Playback output" value={action.output || 'default'} options={[["default", 'System default'], ...(status.audio?.outputs || []).filter(d => d.id !== 'macromaxx_soundboard').map(d => [d.id, d.name])]} onChange={output => update({ output })} />}
    <label className="field"><span>Sound volume (%)</span><input type="number" min="0" max="100" value={action.volume ?? 80} onChange={e => update({ volume: Number(e.target.value) })} /></label>
    <Select label="Repeated key press" value={action.behavior || 'restart'} options={[["restart", 'Restart this sound'], ['toggle', 'Play / stop toggle'], ['overlap', 'Allow overlapping playback']]} onChange={behavior => update({ behavior })} />
    <label className="checkbox-label"><input type="checkbox" checked={!!action.loop} onChange={e => update({ loop: e.target.checked })} />Loop until stopped</label>
    <p className="muted-text">Selected outputs and virtual microphones require Linux audio routing. Audio files are not included in exports.</p>
  </>}</>;
}
export function SharedSoundSettings({ status, perform }) {
  const sound = status.soundboard || {};
  return <section className="settings-card"><div className="settings-title"><span className="action-icon"><Icon name="Radio" /></span><div><h3>Shared soundboard</h3><p>Default backend: {sound.backend || 'Not available'}</p></div></div><p className="muted-text">Play sounds through the default audio output. On Linux, playback may require pipewire-jack or libjack.</p>{sound.error && <p className="muted-text">{sound.error}</p>}<div className="tool-row"><button className="button" onClick={() => perform(() => api.nativeCall('soundboard', 'refresh'))}>Check audio</button><button className="button" onClick={() => perform(() => api.nativeCall('soundboard', 'stop'))}>Stop all sounds</button></div></section>;
}
