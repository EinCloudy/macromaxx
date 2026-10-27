import { DEFAULT_FONT_SIZE, MIN_FONT_SIZE, MAX_FONT_SIZE } from './key-text.js';
import { nativeActionDefinitions } from '../plugins/native/catalog.js';
export const uid = () => globalThis.crypto.randomUUID();
export const catalog = [...nativeActionDefinitions,
  { type: 'url', order: 20, name: 'Website', icon: 'Globe', group: 'System', description: 'Open a URL in your browser', defaults: { url: 'https://example.com' } },
  { type: 'webhook', order: 70, name: 'Webhook', icon: 'Webhook', group: 'Connections', description: 'Send an HTTP request to your workflow', defaults: { url: '', method: 'POST', headers: '{}', body: '{}' } },
  { type: 'folder', order: 90, name: 'Folder', icon: 'Folder', group: 'Organization', description: 'Make room for more actions', defaults: {} },
  { type: 'profile', order: 100, name: 'Switch profile', icon: 'Layers', group: 'Organization', description: 'Activate another setup', defaults: { profileId: '' } },
  { type: 'delay', order: 110, name: 'Delay', icon: 'Timer', group: 'Workflows', description: 'Add a pause to your action chain', defaults: { ms: 500 } },
  { type: 'plugin', order: 120, name: 'Plugin', icon: 'Puzzle', group: 'Extensions', description: 'Run your own JavaScript actions', defaults: { pluginId: 'hello', config: '{}' } },
].sort((a, b) => a.order - b.order);
export function makeAction(type, defaults = {}) { const item = catalog.find(a => a.type === type); if (!item) throw new Error('Unknown action'); return { ...structuredClone(item.defaults), ...structuredClone(defaults), id: uid(), type }; }
export function makeKey(type, label, defaults = {}) { const item = catalog.find(a => a.type === type); return { id: uid(), label: label || item.name, icon: item.icon, color: '#ad92ff', background: '#242231', image: '', actions: [makeAction(type, defaults)], longActions: [], children: [], stopOnError: true }; }
export function makeProfile(name = 'New profile') { return { id: uid(), name, icon: 'Layers', keys: Array(15).fill(null) }; }
export function duplicateKey(key) {
  const copy = structuredClone(key); copy.id = uid();
  [...copy.actions, ...copy.longActions].forEach(a => { a.id = uid(); });
  copy.children = copy.children.map(k => k ? duplicateKey(k) : null);
  return copy;
}
export function initialState() {
  const profile = makeProfile('My Workspace');
  const entries = [['hotkey', 'Microphone', 'Mic', '#bda4ff'], ['url', 'Browser', 'Globe', '#82c8ff'], ['app', 'Files', 'FolderOpen', '#ffce83'], ['media', 'Play / Pause', 'Music2', '#a2e6c0'], ['folder', 'Workflows', 'Folder', '#bda4ff']];
  entries.forEach(([type, label, icon, color], i) => { profile.keys[i] = { ...makeKey(type, label), icon, color }; });
  profile.keys[1].actions[0].url = 'https://www.google.com';
  profile.keys[2].actions[0].path = '~';
  return { version: 1, profiles: [profile], activeProfileId: profile.id, settings: { brightness: 65, theme: 'dark', closeToTray: true, autostart: false, obsUrl: 'ws://127.0.0.1:4455', obsPassword: '', folderAnimations: true, iconRevealAnimation: true, defaultFontSize: DEFAULT_FONT_SIZE } };
}
export function validateState(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.profiles) || !value.profiles.length || value.profiles.length > 100) throw new Error('Invalid workspace file (expected version 1).');
  const ids = new Set(), keyIds = new Set(); let count = 0;
  function keys(items, depth = 0) {
    if (!Array.isArray(items) || items.length > 128 || depth > 12) throw new Error('Invalid folder structure.');
    for (const key of items) if (key) {
      if (++count > 10000 || typeof key.id !== 'string' || keyIds.has(key.id) || typeof key.label !== 'string' || key.label.length > 80 || typeof key.icon !== 'string' || typeof key.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(key.color) || !/^#[0-9a-f]{6}$/i.test(key.background) || typeof key.image !== 'string') throw new Error('Invalid key.');
      keyIds.add(key.id);
      if (key.fontSize !== undefined && (!Number.isInteger(key.fontSize) || key.fontSize < MIN_FONT_SIZE || key.fontSize > MAX_FONT_SIZE)) throw new Error('Invalid font size.');
      if (key.backPosition !== undefined && (!Number.isInteger(key.backPosition) || key.backPosition < 0 || key.backPosition > 127)) throw new Error('Invalid Back key position.');
      if (key.image && !/^data:image\/(png|jpeg|webp);base64,/.test(key.image)) throw new Error('Invalid key image.');
      for (const actions of [key.actions, key.longActions]) {
        if (!Array.isArray(actions) || actions.length > 100) throw new Error('Invalid action chain.');
        for (const a of actions) if (!a || typeof a.id !== 'string' || !catalog.some(c => c.type === a.type)) throw new Error('Unknown action type.');
      }
      keys(key.children, depth + 1);
    }
  }
  for (const p of value.profiles) {
    if (typeof p.id !== 'string' || ids.has(p.id) || typeof p.name !== 'string') throw new Error('Invalid profile.');
    if (p.appRules !== undefined && (!Array.isArray(p.appRules) || p.appRules.length > 32 || p.appRules.some(rule => typeof rule !== 'string' || rule.length > 256))) throw new Error('Invalid application profile rules.');
    ids.add(p.id); keys(p.keys);
  }
  if (!ids.has(value.activeProfileId)) throw new Error('Active profile is missing.');
  if (!value.settings || !Number.isFinite(value.settings.brightness) || value.settings.brightness < 0 || value.settings.brightness > 100) throw new Error('Invalid settings.');
  if (typeof value.settings.autostart !== 'boolean' || typeof value.settings.closeToTray !== 'boolean' || typeof value.settings.obsUrl !== 'string' || typeof value.settings.obsPassword !== 'string' || !['dark', 'light'].includes(value.settings.theme)) throw new Error('Invalid app settings.');
  for (const name of ['folderAnimations', 'iconRevealAnimation', 'rememberWaylandPermission', 'autoProfiles', 'startInBackground']) {
    if (value.settings[name] !== undefined && typeof value.settings[name] !== 'boolean') throw new Error('Invalid animation setting.');
  }
  if (value.settings.autoProfileFallback !== undefined && typeof value.settings.autoProfileFallback !== 'string') throw new Error('Invalid automatic-profile fallback.');
  if (value.settings.showShortcut !== undefined && (typeof value.settings.showShortcut !== 'string' || value.settings.showShortcut.length > 128)) throw new Error('Invalid window shortcut.');
  if (value.settings.disabledNativePlugins !== undefined && (!Array.isArray(value.settings.disabledNativePlugins) || value.settings.disabledNativePlugins.length > 64 || value.settings.disabledNativePlugins.some(id => typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)))) throw new Error('Invalid native plugin settings.');
  if (value.settings.defaultFontSize !== undefined && (!Number.isInteger(value.settings.defaultFontSize) || value.settings.defaultFontSize < MIN_FONT_SIZE || value.settings.defaultFontSize > MAX_FONT_SIZE)) throw new Error('Invalid default font size.');
  return value;
}
export function visibleKeys(state, path = []) {
  let keys = state.profiles.find(p => p.id === state.activeProfileId)?.keys || [];
  for (const index of path) keys = keys[index]?.children || [];
  return keys;
}
