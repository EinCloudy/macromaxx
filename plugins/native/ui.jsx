import React from 'react';
import { Icon } from '../../src/icons.jsx';
import { KeyboardSettings } from './keyboard/ui.jsx';
import { BackgroundSettings } from './session/ui.jsx';
import { LauncherEditor, ScriptEditor } from './launcher/ui.jsx';
import { MediaEditor, MediaSettings } from './media/ui.jsx';
import { AudioEditor, AudioSettings } from './linux-audio/ui.jsx';
import { DesktopEditor, DesktopSettings } from './linux-desktop/ui.jsx';
import { SoundSettings } from './linux-soundboard/ui.jsx';
import { SoundEditor, SharedSoundSettings } from './soundboard/ui.jsx';

// This trusted, build-time registry ships with the plugins. The core never
// imports native service implementations or evaluates renderer code from disk.
const registry = {
  keyboard: { Settings: KeyboardSettings }, session: { Settings: BackgroundSettings },
  launcher: { editors: { app: LauncherEditor, script: ScriptEditor } },
  media: { Settings: MediaSettings, editors: { media: MediaEditor } },
  'linux-audio': { Settings: AudioSettings, editors: { audio: AudioEditor } },
  'linux-desktop': { Settings: DesktopSettings, editors: { desktop: DesktopEditor } },
  'linux-soundboard': { Settings: SoundSettings },
  soundboard: { Settings: SharedSoundSettings, editors: { sound: SoundEditor } },
};
export function nativeActionAvailability(status, action) {
  return status.native?.actionStates?.[action.id] || status.native?.actionTypes?.[action.type] || { available: true };
}
export function NativeActionEditor(props) {
  const type = props.action.type;
  const provider = props.status.native?.actionTypes?.[type]?.provider;
  const Editor = registry[provider]?.editors?.[type] || Object.values(registry).map(item => item.editors?.[type]).find(Boolean);
  const availability = nativeActionAvailability(props.status, props.action);
  return <>{!availability.available && <div className="notice error"><Icon name="Info" size={16} /><span>{availability.name}: {availability.reason} Your saved assignment is preserved.</span></div>}{Editor && <Editor {...props} />}</>;
}
export function NativeSettingsPanels(props) {
  return <>{(props.status.native?.plugins || []).filter(plugin => plugin.state === 'loaded').map(plugin => {
    const Settings = registry[plugin.id]?.Settings;
    return Settings ? <Settings key={plugin.id} {...props} /> : null;
  })}</>;
}
const platformName = platform => ({ linux: 'Linux', win32: 'Windows', darwin: 'macOS' }[platform] || platform);
export function NativePluginsSettings({ state, status, change }) {
  return <section className="settings-card"><div className="settings-title"><span className="action-icon"><Icon name="Package" /></span><div><h3>Bundled native plugins</h3><p>Current platform: {platformName(status.native?.platform || 'browser preview')}</p></div></div>
    <p className="muted-text">These trusted application components run in the main process. Only plugins compatible with this OS are loaded. Optional plugin changes take effect after restarting. User JavaScript plugins keep their separate worker API.</p>
    {(status.native?.plugins || []).map(plugin => <div key={plugin.id} className="setup-steps"><div className="setting-line"><div><strong>{plugin.name}</strong><small>{plugin.platforms.map(platformName).join(' · ')} · {plugin.state}</small></div>{plugin.required ? <span className="badge">Included</span> : plugin.state !== 'unsupported' && <button role="switch" aria-label={`Enable ${plugin.name}`} aria-checked={plugin.enabled} className={`switch ${plugin.enabled ? 'on' : ''}`} onClick={() => change(s => {
      const disabled = new Set(s.settings.disabledNativePlugins || []);
      if (plugin.enabled) disabled.add(plugin.id); else disabled.delete(plugin.id);
      s.settings.disabledNativePlugins = [...disabled];
    })}><i /></button>}</div><p className="muted-text">{plugin.description}</p>{plugin.restartRequired && <p className="muted-text">Restart required to apply this change.</p>}{plugin.reason && <p className="muted-text">{plugin.reason}</p>}{Object.entries(plugin.capabilities || {}).map(([id, capability]) => <p key={id} className="muted-text">{id}: {capability.available ? capability.ready === false ? 'available; setup/permission required' : 'available' : capability.reason || 'unavailable'}</p>)}</div>)}
    <p className="muted-text">Core editor, profiles, key rendering, webhooks, OBS, and action chains stay usable independently. See docs/PLATFORMS.md for the complete capability matrix.</p>
  </section>;
}
