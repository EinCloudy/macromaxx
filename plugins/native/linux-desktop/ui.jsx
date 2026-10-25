import React from 'react';
import { Icon } from '../../../src/icons.jsx';
import { api } from '../../../src/api.js';
import { Select } from '../fields.jsx';
import { desktopCommands } from './commands.js';
export function DesktopEditor({ action, update, status }) {
  return <><Select label="Desktop action" value={action.command} options={desktopCommands.map(([id, label]) => [id, label + (status.desktop?.supported?.includes(id) ? '' : ' (not available here)')])} onChange={command => update({ command })} /><p className="muted-text">Backend: {status.desktop?.backend || 'No Linux desktop adapter loaded'}. {status.desktop?.error || 'Commands affect the focused window.'}</p></>;
}
export function DesktopSettings({ status, perform }) {
  const desktop = status.desktop || {};
  return <section className="settings-card"><div className="settings-title"><span className="action-icon"><Icon name="Monitor" /></span><div><h3>Linux desktop plugin</h3><p>{desktop.backend || 'Not detected'}</p></div></div><p className="muted-text">{desktop.error || `${desktop.supported?.length || 0} actions available.`}</p><button className="button" onClick={() => perform(() => api.nativeCall('linux-desktop', 'refresh'))}>Check desktop backend</button><div className="setup-steps"><h4>GNOME Wayland</h4><p className="muted-text">Install this plugin’s Shell bridge, log out/in if needed, then enable it. No Shell Eval permission is required; existing files are not overwritten.</p><button className="button" onClick={() => perform(() => api.nativeCall('linux-desktop', 'installExtension'), 'Extension files installed. Log out/in and enable the extension.')}>Install GNOME extension</button><code>gnome-extensions enable macromaxx@macromaxx.local</code><p className="muted-text">KDE uses qdbus/KWin. Other X11 desktops need wmctrl and xdotool for minimize/focus detection. Other Wayland compositors require their own adapters.</p></div></section>;
}
