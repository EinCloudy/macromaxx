import React from 'react';
import { Icon } from '../../../src/icons.jsx';
import { api } from '../../../src/api.js';
export function KeyboardSettings({ state, status, change, perform }) {
  const diag = status.keyboard || {}, platform = status.native?.platform;
  const call = (operation, ...args) => api.nativeCall('keyboard', operation, ...args);
  return <section className="settings-card">
    <div className="settings-title"><span className="action-icon"><Icon name="Keyboard" /></span><div><h3>Keyboard & text</h3><p>{diag.backend || 'Not detected'}</p></div><span className={`connection ${status.inputReady ? 'connected' : ''}`}><i />{status.inputReady ? 'Ready' : 'Set up'}</span></div>
    <p className="settings-description">{diag.wayland ? 'Allow keyboard access when your desktop asks for permission.' : platform === 'darwin' ? 'Allow MacroMaxx in System Settings → Privacy & Security → Accessibility. The fallback may also require Automation permission and supports key presses only.' : platform === 'win32' ? 'Apps running as administrator may reject keyboard input from MacroMaxx.' : 'Keyboard input may require additional setup.'}</p>
    <button className="button primary" onClick={() => perform(() => call('setup'), 'Keyboard input is ready.')}>Allow keyboard input</button>
    <button className="button small" onClick={() => perform(() => call('diagnostics'), 'Keyboard dependencies checked.')}>Check dependencies</button>
    {diag.wayland && <><label className="checkbox-label"><input type="checkbox" checked={state.settings.rememberWaylandPermission !== false} onChange={e => change(s => { s.settings.rememberWaylandPermission = e.target.checked; })} />Remember and restore keyboard permission</label><button className="button small" onClick={() => perform(() => call('forget'), 'Saved permission forgotten.')}>Forget saved permission</button><p className="muted-text">{diag.savedPermission ? 'Restore token saved privately outside workspace exports.' : 'No restore token saved. Enable persistence in the desktop dialog if offered.'}</p></>}
    {platform === 'linux' && <div className="setup-steps"><h4>Linux setup</h4><p className="muted-text">If USB access is denied, set up access below. Your system will ask for your password.</p><button className="button small" onClick={() => perform(() => call('installUdev'), 'USB rule installed. Reconnect the device if needed.')}>Set up USB access</button><details><summary>Keyboard dependencies</summary><p className="muted-text">Wayland needs Python D-Bus, PyGObject, libei, libxkbcommon, and the desktop portal. X11 needs xdotool.</p><code>{diag.wayland ? 'Debian/Ubuntu: sudo apt install python3-dbus python3-gi libei1 libxkbcommon0' : 'Debian/Ubuntu: sudo apt install xdotool'}</code><code>{diag.wayland ? 'Arch: sudo pacman -S python-dbus python-gobject libei libxkbcommon' : 'Arch: sudo pacman -S xdotool'}</code></details></div>}
    <p className="muted-text">Text actions replace the clipboard and paste into the focused application. Permissions and target-application restrictions depend on the OS.</p>
  </section>;
}
