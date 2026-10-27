export function migrateNativeSettings(state) {
  const version = state.settings.nativePluginSettingsVersion || 0;
  if (version >= 3) return;
  // Preserve the old all-sound-disabled preference when the shared playback
  // implementation is split from the Linux routing package.
  const disabled = new Set(state.settings.disabledNativePlugins || []);
  if (version < 2 && disabled.has('linux-soundboard')) disabled.add('soundboard');
  // A single switch now controls mixer and routing. Preserve any previous
  // opt-out rather than silently enabling part of the combined integration.
  if (disabled.delete('linux-soundboard')) disabled.add('linux-audio');
  if (state.settings.disabledNativePlugins) state.settings.disabledNativePlugins = [...disabled];
  state.settings.nativePluginSettingsVersion = 3;
}
