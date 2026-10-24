import React from 'react';
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
