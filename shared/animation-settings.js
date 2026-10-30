export function animationEnabled(settings, kind) {
  if (kind === 'screensaver') return true;
  if (kind === 'folder') return settings.folderAnimations !== false;
  if (kind === 'reveal') return settings.iconRevealAnimation !== false;
  return false;
}
