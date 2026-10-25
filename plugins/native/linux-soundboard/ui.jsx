import React, { useState } from 'react';
import { Icon } from '../../../src/icons.jsx';
import { api } from '../../../src/api.js';
import { Select } from '../fields.jsx';
export function SoundSettings({ status, perform }) {
  const [microphone, setMicrophone] = useState('none'), [output, setOutput] = useState('none');
  const sound = status.soundRouting || {};
  const call = (operation, ...args) => api.nativeCall('linux-soundboard', operation, ...args);
  return <section className="settings-card"><div className="settings-title"><span className="action-icon"><Icon name="Radio" /></span><div><h3>Linux audio routing plugin</h3><p>{sound.available ? 'PipeWire tools available' : 'Install ffmpeg and PipeWire tools'}</p></div></div><p className="muted-text">{sound.error || `${sound.playing?.length || 0} routed sounds playing. Virtual microphone: ${sound.virtualReady ? 'ready' : 'not set up'}.`}</p>
    <Select label="Mix physical microphone (optional)" value={microphone} options={[["none", 'None – sounds only'], ...(status.audio?.inputs || []).filter(d => !d.id.startsWith('macromaxx_') && !d.id.endsWith('.monitor')).map(d => [d.id, d.name])]} onChange={setMicrophone} />
    <Select label="Monitor the mix on output (optional)" value={output} options={[["none", 'None – avoid local microphone feedback'], ...(status.audio?.outputs || []).filter(d => d.id !== 'macromaxx_soundboard').map(d => [d.id, d.name])]} onChange={setOutput} />
    <div className="tool-row"><button className="button" onClick={() => perform(() => call('setup', { microphone, output }), 'Choose MacroMaxx Virtual Microphone in your voice app.')}>Set up virtual microphone</button><button className="button" onClick={() => perform(() => call('stop'))}>Stop all sounds</button></div><button className="button small" onClick={() => perform(() => call('remove'), 'App-created routing removed.')}>Remove app-created routing</button><p className="muted-text">Setup does not change default devices. Only this session’s module IDs are removed after verifying ownership. Existing shared devices are reused. Monitoring includes a mixed microphone; leave it disabled to avoid hearing yourself.</p></section>;
}
