import React from 'react';
import { Icon } from '../../src/icons.jsx';
import { buildNativeUIRegistry } from './ui-registry.js';

// This trusted, build-time registry ships with the plugins. The core never
// imports native service implementations or evaluates renderer code from disk.
const registry = buildNativeUIRegistry(
  import.meta.glob('./*/manifest.json', { eager: true, import: 'default' }),
  import.meta.glob('./*/ui.jsx', { eager: true }),
);
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
export function NativePluginSettings({ plugin, ...props }) {
  const panels = registry[plugin.id]?.settings || [];
  if (plugin.state !== 'loaded') return <p className="muted-text">Settings are available when this plugin is loaded on a supported platform.</p>;
  return panels.length ? panels.map((Settings, index) => <Settings key={index} {...props} />) : <p className="muted-text">This plugin does not need any additional settings. Configure its actions in the Deck Editor.</p>;
}
