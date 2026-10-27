import React, { useState } from 'react';
import { Icon } from '../../../src/icons.jsx';
import { api } from '../../../src/api.js';
import { Select, TextField } from '../fields.jsx';

export function OBSEditor({ action, update, status }) {
  const obs = status.obs || {};
  return <>
    <Select label="OBS action" value={action.command} options={[["scene", 'Switch scene'], ['record', 'Toggle recording'], ['stream', 'Toggle streaming'], ['mute', 'Toggle audio mute']]} onChange={command => update({ command })} />
    {action.command === 'scene' && <><TextField label="Scene name" value={action.scene} placeholder="e.g. Desktop" onChange={scene => update({ scene })} />{!!obs.scenes?.length && <Select label="Available scenes" value={action.scene || ''} options={[["", 'Choose a scene …'], ...obs.scenes.map(scene => [scene, scene])]} onChange={scene => update({ scene })} />}</>}
    {action.command === 'mute' && <><TextField label="Audio source" value={action.input} placeholder="Mic/Aux" onChange={input => update({ input })} />{!!obs.inputs?.length && <Select label="Available sources" value={action.input || ''} options={[["", 'Choose a source …'], ...obs.inputs.map(input => [input, input])]} onChange={input => update({ input })} />}</>}
    {!obs.connected && <p className="muted-text">Connect OBS in Plugins → OBS Studio → Details first.</p>}
  </>;
}

export function OBSSettings({ state, status, change, perform, flush }) {
  const [busy, setBusy] = useState(false), obs = status.obs || {};
  const connect = async () => {
    setBusy(true);
    try { await perform(async () => { await flush(); return api.nativeCall('obs', obs.connected ? 'disconnect' : 'connect'); }, obs.connected ? 'OBS disconnected' : 'OBS connected'); }
    finally { setBusy(false); }
  };
  return <section className="settings-card">
    <div className="settings-title"><span className="action-icon blue"><Icon name="Video" /></span><div><h3>OBS connection</h3><p>OBS WebSocket · Linux, Windows & macOS</p></div><span className={`connection ${obs.connected ? 'connected' : ''}`}><i />{obs.connected ? 'Connected' : 'Offline'}</span></div>
    <TextField label="WebSocket address" value={state.settings.obsUrl} onChange={obsUrl => change(s => { s.settings.obsUrl = obsUrl; })} />
    <label className="field"><span>Server password</span><input type="password" autoComplete="off" placeholder="Optional" value={state.settings.obsPassword} onChange={e => change(s => { s.settings.obsPassword = e.target.value; })} /></label>
    <button className="button primary" disabled={busy} onClick={connect}><Icon name={obs.connected ? 'Unplug' : 'Plug'} size={16} />{busy ? 'Please wait …' : obs.connected ? 'Disconnect' : 'Connect to OBS'}</button>
    {obs.connected && <div className="obs-live"><span><i className="green-dot" />{obs.scene}</span><span>REC {obs.recording ? '● Active' : 'Inactive'}</span><span>LIVE {obs.streaming ? '● Active' : 'Inactive'}</span></div>}
    <p className="muted-text">Connection details are stored locally and included in workspace exports. Changing the address or password takes effect on the next connection.</p>
  </section>;
}
