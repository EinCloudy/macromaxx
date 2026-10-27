import { DEFAULT_FONT_SIZE } from './key-text.js';
import { catalog } from './action-catalog.js';

// Keep the public model entry point stable for Electron and existing consumers.
export { catalog } from './action-catalog.js';
export { validateState } from './workspace-validation.js';

export const uid = () => globalThis.crypto.randomUUID();
export function makeAction(type, defaults = {}) {
  const item = catalog.find((a) => a.type === type);
  if (!item) throw new Error('Unknown action');
  return { ...structuredClone(item.defaults), ...structuredClone(defaults), id: uid(), type };
}
export function makeKey(type, label, defaults = {}) {
  const item = catalog.find((a) => a.type === type);
  return {
    id: uid(),
    label: label || item.name,
    icon: item.icon,
    color: '#ad92ff',
    background: '#242231',
    image: '',
    actions: [makeAction(type, defaults)],
    longActions: [],
    children: [],
    stopOnError: true,
  };
}
export function makeProfile(name = 'New profile') {
  return { id: uid(), name, icon: 'Layers', keys: Array(15).fill(null) };
}
export function duplicateKey(key) {
  const copy = structuredClone(key);
  copy.id = uid();
  [...copy.actions, ...copy.longActions].forEach((a) => {
    a.id = uid();
  });
  copy.children = copy.children.map((k) => (k ? duplicateKey(k) : null));
  return copy;
}
export function duplicateProfile(profile) {
  return {
    ...structuredClone(profile),
    id: uid(),
    name: `${profile.name} – Copy`,
    keys: profile.keys.map((key) => (key ? duplicateKey(key) : null)),
  };
}
export function initialState() {
  const profile = makeProfile('My Workspace');
  const entries = [
    ['hotkey', 'Microphone', 'Mic', '#bda4ff'],
    ['url', 'Browser', 'Globe', '#82c8ff'],
    ['app', 'Files', 'FolderOpen', '#ffce83'],
    ['media', 'Play / Pause', 'Music2', '#a2e6c0'],
    ['folder', 'Workflows', 'Folder', '#bda4ff'],
  ];
  entries.forEach(([type, label, icon, color], i) => {
    profile.keys[i] = { ...makeKey(type, label), icon, color };
  });
  profile.keys[1].actions[0].url = 'https://www.google.com';
  profile.keys[2].actions[0].path = '~';
  return {
    version: 1,
    profiles: [profile],
    activeProfileId: profile.id,
    settings: {
      brightness: 65,
      theme: 'dark',
      closeToTray: true,
      autostart: false,
      obsUrl: 'ws://127.0.0.1:4455',
      obsPassword: '',
      folderAnimations: true,
      iconRevealAnimation: true,
      defaultFontSize: DEFAULT_FONT_SIZE,
    },
  };
}
export function visibleKeys(state, path = []) {
  let keys = state.profiles.find((p) => p.id === state.activeProfileId)?.keys || [];
  for (const index of path) keys = keys[index]?.children || [];
  return keys;
}
