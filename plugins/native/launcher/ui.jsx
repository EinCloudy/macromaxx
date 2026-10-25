import React, { useState } from 'react';
import { api } from '../../../src/api.js';
import { Select, TextField, ProcessFields } from '../fields.jsx';
export function LauncherEditor({ action, update, status, perform }) {
  const [search, setSearch] = useState('');
  const features = status.native?.capabilities?.['launcher.open']?.features || { modes: ['file'], terminal: false };
  const apps = (status.apps || []).filter(app => app.id === action.desktopId || app.name.toLowerCase().includes(search.toLowerCase()));
  const modes = [['file', 'Application or file path'], ['installed', 'Installed application (Linux)'], ['flatpak', 'Flatpak app ID (Linux)']].filter(([id]) => features.modes.includes(id));
  return <>
    <Select label="Launch mode" value={action.mode || 'file'} options={modes} onChange={mode => update({ mode })} />
    {action.mode === 'installed' ? <><TextField label="Find an application" value={search} onChange={setSearch} /><Select label="Installed application" value={action.desktopId || ''} options={[["", 'Choose an application …'], ...apps.map(app => [app.id, `${app.name}${app.flatpak ? ' (Flatpak)' : ''}`])]} onChange={desktopId => update({ desktopId })} /><button className="button small" disabled={!features.modes.includes('installed')} onClick={() => perform(() => api.nativeCall('launcher', 'refresh'))}>Refresh applications</button></> : action.mode === 'flatpak' ? <TextField label="Flatpak application ID" value={action.flatpakId} placeholder="org.mozilla.firefox" onChange={flatpakId => update({ flatpakId })} /> : <><TextField label="Application or file" value={action.path} placeholder="Local executable or file path" onChange={path => update({ path })} /><button className="button small" onClick={() => perform(async () => { const path = await api.pickFile(); if (path) update({ path }); })}>Choose file</button></>}
    <ProcessFields action={action} update={update} />
    {(features.terminal || action.terminal) && <label className="checkbox-label"><input type="checkbox" checked={!!action.terminal} onChange={e => update({ terminal: e.target.checked })} />Open in terminal (Linux adapter)</label>}
    <p className="muted-text">Paths, executable names, and application IDs must exist on the target OS. Imported settings are preserved when a launch mode is unavailable.</p>
  </>;
}
export function ScriptEditor({ action, update }) {
  return <><TextField label="Shell executable" value={action.shell || '/bin/sh'} onChange={shell => update({ shell })} /><TextField label="Shell script" value={action.script} multiline placeholder="Your POSIX command or script" onChange={script => update({ script })} /><ProcessFields action={action} update={update} /><p className="muted-text">The bundled POSIX adapter supports Linux and macOS, not Windows. It runs with your user permissions; foreground process groups can be canceled. Timeout: 60 seconds.</p></>;
}
