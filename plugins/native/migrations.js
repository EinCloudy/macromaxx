export function migrateNativeSettings(state) {
  if ((state.settings.nativePluginSettingsVersion || 0) >= 2) return;
  // Preserve the old all-sound-disabled preference when the shared playback
  // implementation is split from the Linux routing package.
  const disabled = new Set(state.settings.disabledNativePlugins || []);
  if (disabled.has('linux-soundboard')) disabled.add('soundboard');
  if (state.settings.disabledNativePlugins) state.settings.disabledNativePlugins = [...disabled];
  state.settings.nativePluginSettingsVersion = 2;
}
