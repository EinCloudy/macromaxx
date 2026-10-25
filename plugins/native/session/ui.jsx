import React from 'react';
import { Icon } from '../../../src/icons.jsx';
import { api } from '../../../src/api.js';
export function BackgroundSettings({ state, status, change, perform }) {
  const [shortcut, setShortcut] = React.useState(state.settings.showShortcut || '');
  React.useEffect(() => setShortcut(state.settings.showShortcut || ''), [state.settings.showShortcut]);
  const linux = status.native?.platform === 'linux';
  return <section className="settings-card"><div className="settings-title"><span className="action-icon"><Icon name="AppWindow" /></span><div><h3>Native session plugin</h3><p>OS login integration and reopening.</p></div></div>
    <label className="checkbox-label"><input type="checkbox" checked={state.settings.startInBackground !== false} onChange={e => change(s => { s.settings.startInBackground = e.target.checked; })} />Start hidden at login where supported by the OS</label>
    <label className="field"><span>Optional global shortcut to open MacroMaxx</span><input placeholder="CommandOrControl+Shift+Space" value={shortcut} onChange={e => setShortcut(e.target.value)} onBlur={() => { if (shortcut !== (state.settings.showShortcut || '')) change(s => { s.settings.showShortcut = shortcut.trim(); }); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>
    <p className="muted-text">Active shortcut: {status.background?.shortcut || 'None'}. {status.background?.error || 'Shortcut registration is subject to OS permissions and conflicts.'}</p>
    <div className="tool-row">{linux && <button className="button" onClick={() => perform(() => api.nativeCall('session', 'installLauncher'), 'Local application launcher installed.')}>Install application launcher</button>}<button className="button" onClick={() => perform(() => api.openDataFolder())}>Open data folder</button></div>
    <p className="muted-text">{linux ? status.background?.launcherInstalled ? 'Local XDG launcher installed.' : 'Install a local launcher for desktops without a tray.' : 'Use your OS-installed application shortcut to reopen the running app.'} Starting MacroMaxx again or --show opens its existing window. --quit requests normal shutdown; --background starts hidden. macOS login visibility follows the OS login-item API. Moving a portable executable requires updating launch entries.</p>
  </section>;
}
