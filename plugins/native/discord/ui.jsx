import React, { useState } from 'react';
import { Icon } from '../../../src/icons.jsx';
import { api } from '../../../src/api.js';
import { Select } from '../fields.jsx';

export function DiscordEditor({ action, update, status }) {
  return <>
    <Select label="Discord action" value={action.command} options={[["mute", 'Microphone mute'], ['deaf', 'Deafen']]} onChange={command => update({ command })} />
    <Select label="Behavior" value={action.mode || 'toggle'} options={[["toggle", 'Toggle'], ['on', 'Enable'], ['off', 'Disable']]} onChange={mode => update({ mode })} />
    {!status.discord?.connected && <p className="muted-text">Connect in Plugins → Discord → Details first. Requires the Discord desktop app.</p>}
  </>;
}

export function DiscordSettings({ status, perform }) {
  const discord = status.discord || {}, [busy, setBusy] = useState(false);
  const connect = async () => { setBusy(true); try { await perform(() => api.nativeCall('discord', 'connect')); } finally { setBusy(false); } };
  return <section className="settings-card">
    <div className="settings-title"><span className="action-icon blue"><Icon name="Headphones" /></span><div><h3>Discord connection</h3><p>Discord desktop app · Experimental</p></div><span className={`connection ${discord.connected ? 'connected' : ''}`}><i />{discord.connected ? 'Connected' : discord.connecting ? 'Authorizing' : 'Offline'}</span></div>
    <p className="settings-description">Approve access in the Discord desktop app. This connection is experimental and still needs real-client testing.</p>
    {!discord.connected && <button className="button primary" disabled={busy || discord.connecting} onClick={connect}>Connect to Discord</button>}
    {(discord.connected || discord.connecting || busy) && <button className="button" onClick={() => perform(() => api.nativeCall('discord', 'disconnect'))}>{discord.connected ? 'Disconnect' : 'Cancel authorization'}</button>}
    {discord.connected && <p className="muted-text">Microphone: {discord.mute ? 'Muted' : 'Unmuted'} · Deafen: {discord.deaf ? 'On' : 'Off'}</p>}
    {discord.error && <div className="notice error" role="alert">{discord.error}</div>}
    {discord.connecting && discord.stage && <p className="muted-text" role="status">Current step: {discord.stage}. Check Discord for an authorization dialog; you have up to two minutes to approve.</p>}
    <p className="muted-text">Authorization is not saved or exported. Reconnect after restarting MacroMaxx or when it expires. To revoke access, use Discord → User Settings → Authorized Apps.</p>
  </section>;
}
