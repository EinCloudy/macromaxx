import { catalog, makeAction, makeKey } from './model.js';

const actionGroups = [
  ['Keyboard & text', ['hotkey', 'text']],
  ['Media & audio', ['media', 'audio', 'sound']],
  ['Apps & system', ['app', 'script', 'desktop']],
  ['Connections', ['url', 'webhook', 'obs']],
  ['Organization', ['folder', 'profile']],
  ['Workflows', ['delay']],
];

// Library identities are separate from saved action types: each user plugin
// gets its own entry while assignments retain the portable `plugin` contract.
export function actionLibrary(plugins, status = {}) {
  return [
    ...actionGroups.flatMap(([group, types]) => types.map(type => {
      const item = catalog.find(item => item.type === type);
      const availability = status.native?.actionTypes?.[item.type] || { available: true };
      return { ...item, key: item.type, group,
        defaults: availability.defaults || {}, availability };
    })),
    ...plugins.map(plugin => ({ key: `user:${plugin.id}`, type: 'plugin', name: plugin.name,
      icon: plugin.icon || 'Puzzle', group: `Plugin · ${plugin.name}`, description: plugin.description || 'Run this user plugin',
      defaults: { pluginId: plugin.id, config: JSON.stringify(Object.fromEntries((plugin.fields || []).filter(field => field.default !== undefined).map(field => [field.key, field.default]))) },
      availability: { available: true },
    })),
  ];
}

export function libraryAction(item) { return makeAction(item.type, item.defaults); }
export function libraryKey(item) { return { ...makeKey(item.type, item.name, item.defaults), icon: item.icon }; }
