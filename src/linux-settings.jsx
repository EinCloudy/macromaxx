import React from 'react';
import { Icon } from './icons.jsx';
import { api } from './api.js';
export function AudioSettings({ status, perform }) {
  const audio = status.audio || {};
  return <section className="settings-card"><div className="settings-title"><span className="action-icon"><Icon name="Mic" /></span><div><h3>Linux audio</h3><p>PipeWire / PulseAudio devices and live mute state.</p></div></div>
    <p className="muted-text">Add an Audio & microphone action to control inputs, outputs, or application streams. Device names are retained across reconnects. Mute states update when changed in other apps.</p>
    <div className="setup-steps">{['inputs', 'outputs'].map(kind => <div key={kind}><h4>{kind === 'inputs' ? 'Microphones' : 'Outputs'}</h4>{(audio[kind] || []).map(d => <p key={d.id}>{d.name} · {d.volume}% · {d.mute ? 'Muted' : 'Unmuted'}{d.id === (kind === 'inputs' ? audio.defaultInput : audio.defaultOutput) ? ' · Default' : ''}</p>)}</div>)}</div>
    {audio.error && <p className="muted-text">{audio.error}</p>}<button className="button" onClick={() => perform(() => api.refreshAudio())}>Refresh audio devices</button>
    <p className="muted-text">Install pactl: Debian/Ubuntu: pulseaudio-utils; Arch: libpulse. No keyboard permission is required for audio actions.</p>
  </section>;
}
export function MediaSettings({ status, perform }) {
  const media = status.media || {};
  return <section className="settings-card"><div className="settings-title"><span className="action-icon"><Icon name="Music2" /></span><div><h3>Media players</h3><p>MPRIS playback state and track metadata.</p></div></div>{(media.players || []).map(p => <p className="muted-text" key={p.id}>{p.id} · {p.status} · {p.volume}%<br />{p.title}{p.artist ? ' · ' + p.artist : ''}</p>)}<p className="muted-text">{media.error || (!media.players?.length ? 'Start an MPRIS-compatible player to select it on a Media controls key.' : 'Enable track titles in a key’s properties for live labels.')}</p><button className="button" onClick={() => perform(() => api.refreshMedia())}>Refresh players</button></section>;
}
export function DesktopSettings({ status, perform }) {
  const desktop = status.desktop || {};
  return <section className="settings-card"><div className="settings-title"><span className="action-icon"><Icon name="Monitor" /></span><div><h3>Desktop integration</h3><p>{desktop.backend || 'Not detected'}</p></div></div><p className="muted-text">{desktop.error || `${desktop.supported?.length || 0} window/workspace actions available.`}</p><button className="button" onClick={() => perform(() => api.refreshDesktop())}>Check desktop backend</button><div className="setup-steps"><h4>GNOME Wayland</h4><p className="muted-text">Install the bundled GNOME Shell bridge, then log out/in and enable it using the Extensions app or the command below. No Shell Eval permission is required. Existing extension files are not overwritten.</p><button className="button" onClick={() => perform(() => api.installDesktopExtension(), 'Extension files installed. Log out/in and enable the extension.')}>Install GNOME extension</button><code>gnome-extensions enable macromaxx@macromaxx.local</code><p className="muted-text">KDE uses qdbus6/qdbus and KWin directly. Other X11 desktops need wmctrl (and xdotool for minimize/app switching). Other Wayland compositors require their own shortcuts.</p></div></section>;
}
