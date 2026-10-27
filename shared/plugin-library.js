export const platformName = platform => ({ linux: 'Linux', win32: 'Windows', darwin: 'macOS' }[platform] || platform);

export function pluginLibrary(plugins, nativePlugins, settings) {
  const disabled = new Set(settings.disabledNativePlugins || []);
  return [
    ...nativePlugins.filter(plugin => plugin.actions?.length > 0).map(plugin => {
      const enabled = plugin.required || !disabled.has(plugin.id);
      return { ...plugin, key: `native:${plugin.id}`, kind: 'native', enabled,
        restartRequired: plugin.state !== 'unsupported' && !plugin.required && enabled === (plugin.state === 'disabled'),
      };
    }),
    ...plugins.map(plugin => ({ ...plugin, key: `user:${plugin.id}`, kind: 'user', state: 'installed' })),
  ];
}
