import React, { useEffect, useState } from 'react';
import { api, desktop } from '../../api.js';
import { Icon } from '../../icons.jsx';
import { diagnosticProviders } from '../../../shared/diagnostics.js';
import './diagnostics.css';

const labels = {
  ready: 'Ready',
  unavailable: 'Unavailable',
  'setup-required': 'Setup required',
  loaded: 'Loaded',
  disabled: 'Disabled',
  unsupported: 'Not supported',
  error: 'Failed',
  pending: 'Starting',
};
const help = {
  keyboard:
    'Open Settings → Native keyboard plugin to check dependencies and grant keyboard or Accessibility permission.',
  obs: 'Start OBS 28+, enable its WebSocket server, then check the connection and password in Plugins → OBS Studio.',
  'linux-audio':
    'Check that PipeWire-Pulse or PulseAudio is running and pactl is installed. Open Settings for audio setup.',
  'linux-desktop':
    'Open Settings for the detected desktop backend. GNOME Wayland needs the MacroMaxx Desktop Bridge extension.',
  soundboard: 'Check sound playback dependencies and the selected output in Settings.',
};
function Badge({ state, children }) {
  return (
    <span className={`diagnostic-badge ${state}`}>
      <Icon
        name={
          state === 'ready' || state === 'loaded'
            ? 'CheckCircle2'
            : state === 'error' || state === 'unavailable'
              ? 'CircleAlert'
              : 'Info'
        }
        size={14}
      />
      {children || labels[state] || state}
    </span>
  );
}

export function Diagnostics({ status, perform, openSettings, openPlugins }) {
  const [snapshot, setSnapshot] = useState(null),
    [busy, setBusy] = useState(false),
    [exporting, setExporting] = useState(false),
    [failed, setFailed] = useState(false);
  const refresh = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const result = await perform(() => api.diagnosticSnapshot());
      if (result) setSnapshot(result);
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const providers = diagnosticProviders(status);
  const exportReport = async () => {
    setExporting(true);
    try {
      await perform(() => api.exportDiagnostics());
    } finally {
      setExporting(false);
    }
  };
  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Diagnostics</h1>
          <p>Connection health, permissions and native capabilities.</p>
        </div>
        <div className="tool-row">
          <button className="button" disabled={busy} onClick={refresh}>
            <Icon name="RefreshCw" size={16} />
            {busy ? 'Checking …' : 'Refresh checks'}
          </button>
          <button
            className="button"
            disabled={!desktop || exporting || busy}
            onClick={exportReport}
          >
            <Icon name="Download" size={16} />
            {exporting ? 'Exporting …' : 'Export report'}
          </button>
        </div>
      </section>
      <div className="diagnostics-page">
        {!desktop && (
          <div className="notice">
            <Icon name="Info" size={16} />
            Browser preview: hardware, permissions and native providers are only available in the
            desktop app.
          </div>
        )}
        {failed && (
          <div className="notice error" role="alert">
            Checks could not be refreshed. Connection statuses below still update live. Try again.
          </div>
        )}
        {snapshot?.keyboardCheckFailed && (
          <div className="notice error" role="alert">
            The keyboard dependency check failed. Open Settings to check the keyboard provider and
            try again.
          </div>
        )}
        <div className="diagnostic-overview">
          <section className="settings-card">
            <div className="diagnostic-heading">
              <h2>
                <Icon name="Usb" size={20} />
                Stream Deck
              </h2>
              <Badge state={status.device?.connected ? 'ready' : 'setup-required'}>
                {status.device?.connected ? 'Connected' : 'Not connected'}
              </Badge>
            </div>
            <p>
              {status.device?.connected
                ? `${status.device.name || 'Stream Deck'} · ${status.device.count} keys`
                : 'No active USB deck. The editor works in preview mode.'}
            </p>
            <p className="muted-text">
              {status.available?.length || 0} device(s) detected. If missing, check the cable, close
              other deck apps and check USB access in Settings.
            </p>
            <button
              className="button small"
              disabled={!desktop || busy}
              onClick={() => perform(() => api.reconnect())}
            >
              <Icon name="RefreshCw" size={15} />
              Reconnect deck
            </button>
          </section>
          <section className="settings-card">
            <div className="diagnostic-heading">
              <h2>
                <Icon name="Video" size={20} />
                OBS Studio
              </h2>
              <Badge state={status.obs?.connected ? 'ready' : 'setup-required'}>
                {status.obs?.connected ? 'Connected' : 'Not connected'}
              </Badge>
            </div>
            <p>
              {status.obs?.connected
                ? 'The OBS WebSocket connection is active.'
                : 'Optional integration. Only needed for OBS actions.'}
            </p>
            <p className="muted-text">{help.obs}</p>
            <button className="button small" onClick={openPlugins}>
              Open plugins
            </button>
          </section>
        </div>
        <section className="settings-card">
          <div className="diagnostic-heading">
            <h2>
              <Icon name="Monitor" size={20} />
              System
            </h2>
            {busy && <span role="status">Checking …</span>}
          </div>
          {snapshot ? (
            <dl className="diagnostic-system">
              {Object.entries(snapshot.runtime).map(([key, value]) => (
                <div key={key}>
                  <dt>
                    {{
                      app: 'MacroMaxx',
                      electron: 'Electron',
                      node: 'Node.js',
                      chrome: 'Chromium',
                      platform: 'Platform',
                      arch: 'Architecture',
                      osRelease: 'OS release',
                      session: 'Session',
                    }[key] || key}
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="muted-text">
              {failed ? 'System information unavailable.' : 'Loading system information …'}
            </p>
          )}
          <p className="muted-text">
            Connection and provider statuses update live. Refresh rechecks keyboard dependencies
            without requesting permissions or changing system settings. Other providers report their
            current detected state.
          </p>
        </section>
        <section className="settings-card">
          <div className="diagnostic-heading">
            <h2>
              <Icon name="Puzzle" size={20} />
              Native providers
            </h2>
            <button className="button small" onClick={openSettings}>
              Open settings
            </button>
          </div>
          <p className="muted-text">
            Unavailable optional capabilities are not necessarily app errors. Disabled or
            unsupported providers retain their saved assignments.
          </p>
          {providers.length ? (
            providers.map((plugin) => (
              <article className="diagnostic-provider" key={plugin.id}>
                <div className="diagnostic-heading">
                  <h3>{plugin.name}</h3>
                  <Badge state={plugin.state} />
                </div>
                {plugin.restartRequired && (
                  <p className="diagnostic-warning">
                    Restart MacroMaxx to apply this provider's setting.
                  </p>
                )}
                {plugin.reason && <p className="diagnostic-reason">{plugin.reason}</p>}
                {plugin.checks.map((check) => (
                  <div className="diagnostic-check" key={check.id}>
                    <div className="diagnostic-heading">
                      <strong>{check.id}</strong>
                      <Badge state={check.state} />
                    </div>
                    {check.reason && check.state !== 'ready' && (
                      <p className="diagnostic-reason">{check.reason}</p>
                    )}
                  </div>
                ))}
                {(plugin.state === 'error' ||
                  plugin.checks.some((check) => check.state !== 'ready')) && (
                  <p className="muted-text">
                    {help[plugin.id] ||
                      'Open this provider in Plugins for setup instructions, dependencies and supported platforms.'}
                  </p>
                )}
              </article>
            ))
          ) : (
            <p className="muted-text">No native providers reported.</p>
          )}
        </section>
        <section className="settings-card">
          <h2>Privacy-safe report</h2>
          <p className="muted-text">
            The JSON export includes app/runtime versions, operating system, deck dimensions,
            connection states and provider/capability states. It excludes passwords, tokens, URLs,
            personal paths, serial numbers, profile content, activity logs and raw errors. Nothing
            is uploaded. Review the file before sharing.
          </p>
        </section>
      </div>
    </>
  );
}
