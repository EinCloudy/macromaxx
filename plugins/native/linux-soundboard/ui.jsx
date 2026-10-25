import React, { useState } from 'react';
import { Icon } from '../../../src/icons.jsx';
import { api } from '../../../src/api.js';
import { Select, TextField } from '../fields.jsx';
export function SoundEditor({ action, update, status, perform }) {
  return <><Select label="Sound command" value={action.command || 'play'} options={[["play", 'Play audio'], ['stop-all', 'Stop all sounds']]} onChange={command => update({ command })} />{action.command !== 'stop-all' && <>
    <TextField label="Audio file" value={action.path} onChange={path => update({ path })} /><button className="button small" onClick={() => perform(async () => { const path = await api.pickFile(); if (path) update({ path }); })}>Choose audio file</button>
    <Select label="Audio route" value={action.route || 'output'} options={[["output", 'Speakers / headphones'], ['virtual', 'Virtual microphone'], ['both', 'Output and virtual microphone']]} onChange={route => update({ route })} />
    {action.route !== 'virtual' && <Select label="Playback output" value={action.output || 'default'} options={[["default", 'System default'], ...(status.audio?.outputs || []).filter(d => d.id !== 'macromaxx_soundboard').map(d => [d.id, d.name])]} onChange={output => update({ output })} />}
    <label className="field"><span>Sound volume (%)</span><input type="number" min="0" max="100" value={action.volume ?? 80} onChange={e => update({ volume: Number(e.target.value) })} /></label>
    <Select label="Repeated key press" value={action.behavior || 'restart'} options={[["restart", 'Restart this sound'], ['toggle', 'Play / stop toggle'], ['overlap', 'Allow overlapping playback']]} onChange={behavior => update({ behavior })} />
    <label className="checkbox-label"><input type="checkbox" checked={!!action.loop} onChange={e => update({ loop: e.target.checked })} />Loop until stopped</label><p className="muted-text">Linux Soundboard plugin · ffmpeg/pw-play required. Virtual routing also requires pactl and setup below. Audio files are not bundled in exports.</p>
  </>}</>;
}
export function SoundSettings({ status, perform }) {
  const [microphone, setMicrophone] = useState('none'), [output, setOutput] = useState('none');
  const sound = status.soundboard || {};
  const call = (operation, ...args) => api.nativeCall('linux-soundboard', operation, ...args);
  return <section className="settings-card"><div className="settings-title"><span className="action-icon"><Icon name="Radio" /></span><div><h3>Linux soundboard plugin</h3><p>{sound.available ? 'PipeWire tools available' : 'Install ffmpeg and PipeWire tools'}</p></div></div><p className="muted-text">{sound.error || `${sound.playing?.length || 0} sounds playing. Virtual microphone: ${sound.virtualReady ? 'ready' : 'not set up'}.`}</p>
    <Select label="Mix physical microphone (optional)" value={microphone} options={[["none", 'None – sounds only'], ...(status.audio?.inputs || []).filter(d => !d.id.startsWith('macromaxx_') && !d.id.endsWith('.monitor')).map(d => [d.id, d.name])]} onChange={setMicrophone} />
    <Select label="Monitor the mix on output (optional)" value={output} options={[["none", 'None – avoid local microphone feedback'], ...(status.audio?.outputs || []).filter(d => d.id !== 'macromaxx_soundboard').map(d => [d.id, d.name])]} onChange={setOutput} />
    <div className="tool-row"><button className="button" onClick={() => perform(() => call('setup', { microphone, output }), 'Choose MacroMaxx Virtual Microphone in your voice app.')}>Set up virtual microphone</button><button className="button" onClick={() => perform(() => call('stop'))}>Stop all sounds</button></div><button className="button small" onClick={() => perform(() => call('remove'), 'App-created routing removed.')}>Remove app-created routing</button><p className="muted-text">Setup does not change default devices. Only this session’s module IDs are removed after verifying ownership. Existing shared devices are reused. Monitoring includes a mixed microphone; leave it disabled to avoid hearing yourself.</p></section>;
}
