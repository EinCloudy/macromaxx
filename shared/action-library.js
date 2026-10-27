import { catalog, makeAction, makeKey } from './model.js';

// Library identities are separate from saved action types: each user plugin
// gets its own entry while assignments retain the portable `plugin` contract.
export function actionLibrary(plugins, status = {}) {
  return [
    ...catalog.filter(item => item.type !== 'plugin').map(item => {
      const availability = status.native?.actionTypes?.[item.type] || { available: true };
      const provider = availability.provider || item.provider;
      const plugin = status.native?.plugins?.find(plugin => plugin.id === provider);
      return { ...item, key: item.type, group: provider ? `Plugin · ${plugin?.name || provider}` : item.group,
        defaults: availability.defaults || {}, availability };
    }),
    ...plugins.map(plugin => ({ key: `user:${plugin.id}`, type: 'plugin', name: plugin.name,
      icon: plugin.icon || 'Puzzle', group: `Plugin · ${plugin.name}`, description: plugin.description || 'Run this user plugin',
      defaults: { pluginId: plugin.id, config: JSON.stringify(Object.fromEntries((plugin.fields || []).filter(field => field.default !== undefined).map(field => [field.key, field.default]))) },
      availability: { available: true },
    })),
  ];
}

export function libraryAction(item) { return makeAction(item.type, item.defaults); }
export function libraryKey(item) { return { ...makeKey(item.type, item.name, item.defaults), icon: item.icon }; }
