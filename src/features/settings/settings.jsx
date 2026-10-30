import React, { useState } from 'react';
import { api } from '../../api.js';
import { Icon } from '../../icons.jsx';
import { Button, Switch } from '../../components/ui.jsx';
import { BuiltInSettings } from '../../../plugins/native/ui.jsx';
import { AutoProfileSettings } from './auto-profile-settings.jsx';
import { AnimationSettings, TypographySettings } from './appearance-settings.jsx';
import { ScreensaverSettings } from './screensaver-settings.jsx';

export function Settings({ state, status, change, perform, flush }) {
  const [busy, setBusy] = useState('');
  const task = async (name, fn, message) => {
    setBusy(name);
    try {
      await perform(fn, message);
    } finally {
      setBusy('');
    }
  };
  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>Devices, app preferences, and appearance.</p>
        </div>
        <span className="badge">v0.1.0</span>
      </section>
      <div className="settings-grid">
        <AnimationSettings state={state} change={change} />
        <ScreensaverSettings state={state} status={status} change={change} />
        <TypographySettings state={state} change={change} />
        <BuiltInSettings
          state={state}
          status={status}
          change={change}
          perform={perform}
          flush={flush}
        />
        <AutoProfileSettings state={state} status={status} change={change} />
        <section className="settings-card">
          <div className="settings-title">
            <span className="action-icon">
              <Icon name="Usb" />
            </span>
            <div>
              <h3>Stream Deck</h3>
              <p>{status.device?.name || 'Virtual device'}</p>
            </div>
          </div>
          {status.device?.error && (
            <div className="notice error">
              <Icon name="CircleAlert" size={17} />
              {status.device.error}
            </div>
          )}
          <Button
            icon="RefreshCw"
            disabled={!!busy}
            onClick={() => task('reconnect', () => api.reconnect(), 'Device scan refreshed')}
          >
            Reconnect Stream Deck
          </Button>
          <p className="muted-text">For keyboard and USB permissions, see Keyboard & text.</p>
        </section>
        <section className="settings-card">
          <div className="settings-title">
            <span className="action-icon">
              <Icon name="Settings2" />
            </span>
            <div>
              <h3>App preferences</h3>
              <p>Startup, appearance, and backups.</p>
            </div>
          </div>
          <div className="setting-line">
            <div>
              <strong>Launch at login</strong>
              <small>Start MacroMaxx when you sign in.</small>
            </div>
            <Switch
              label="Launch at login"
              checked={state.settings.autostart}
              onChange={(value) =>
                change((s) => {
                  s.settings.autostart = value;
                })
              }
            />
          </div>
          <div className="setting-line">
            <div>
              <strong>Keep running in the background</strong>
              <small>Minimize to the tray when closing the window.</small>
            </div>
            <Switch
              label="Minimize to tray"
              checked={state.settings.closeToTray}
              onChange={(value) =>
                change((s) => {
                  s.settings.closeToTray = value;
                })
              }
            />
          </div>
          <div className="setting-line">
            <div>
              <strong>Appearance</strong>
              <small>App color theme.</small>
            </div>
            <select
              aria-label="Appearance"
              value={state.settings.theme}
              onChange={(e) =>
                change((s) => {
                  s.settings.theme = e.target.value;
                })
              }
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
          <div className="section-divider" />
          <h4>Transfer your workspace</h4>
          <p className="muted-text">
            Back up or restore profiles, key images, and settings as JSON. Importing replaces the
            current workspace.
          </p>
          <div className="tool-row">
            <Button
              icon="Download"
              onClick={() =>
                perform(async () => {
                  await flush();
                  return api.exportWorkspace();
                })
              }
            >
              Export
            </Button>
            <Button
              icon="Upload"
              onClick={() =>
                perform(async () => {
                  await flush();
                  return api.importWorkspace();
                })
              }
            >
              Import
            </Button>
          </div>
          <div className="section-divider" />
          <Button
            icon="Power"
            onClick={() =>
              perform(async () => {
                await flush();
                await api.quit();
              })
            }
          >
            Quit MacroMaxx
          </Button>
        </section>
      </div>
    </>
  );
}
