import { DEFAULT_FONT_SIZE, MIN_FONT_SIZE, MAX_FONT_SIZE } from './key-text.js';
export const uid = () => globalThis.crypto.randomUUID();
export const catalog = [
  { type: 'hotkey', name: 'Hotkey', icon: 'Keyboard', group: 'System', description: 'Eine Tastenkombination auslösen', defaults: { keys: 'CTRL+SHIFT+M' } },
  { type: 'url', name: 'Website', icon: 'Globe', group: 'System', description: 'Eine URL im Browser öffnen', defaults: { url: 'https://example.com' } },
  { type: 'app', name: 'Programm öffnen', icon: 'AppWindow', group: 'System', description: 'Programm oder Datei starten', defaults: { path: '' } },
  { type: 'text', name: 'Text eingeben', icon: 'TextCursorInput', group: 'System', description: 'Text über die Zwischenablage einfügen', defaults: { text: '' } },
  { type: 'media', name: 'Mediensteuerung', icon: 'Music2', group: 'System', description: 'Wiedergabe und Lautstärke', defaults: { command: 'playpause' } },
  { type: 'webhook', name: 'Webhook', icon: 'Webhook', group: 'Verbindungen', description: 'HTTP-Anfrage an deinen Workflow', defaults: { url: '', method: 'POST', headers: '{}', body: '{}' } },
  { type: 'obs', name: 'OBS Studio', icon: 'Video', group: 'Verbindungen', description: 'Szenen, Aufnahme und Streaming', defaults: { command: 'scene', scene: '', input: '' } },
  { type: 'folder', name: 'Ordner', icon: 'Folder', group: 'Organisation', description: 'Platz für weitere Aktionen', defaults: {} },
  { type: 'profile', name: 'Profil wechseln', icon: 'Layers', group: 'Organisation', description: 'Ein anderes Setup aktivieren', defaults: { profileId: '' } },
  { type: 'delay', name: 'Wartezeit', icon: 'Timer', group: 'Abläufe', description: 'Eine Pause in deiner Aktionskette', defaults: { ms: 500 } },
  { type: 'plugin', name: 'Plugin', icon: 'Puzzle', group: 'Erweiterungen', description: 'Eigene JavaScript-Aktionen', defaults: { pluginId: 'hello', config: '{}' } },
];
export function makeAction(type) { const item = catalog.find(a => a.type === type); if (!item) throw new Error('Unbekannte Aktion'); return { id: uid(), type, ...structuredClone(item.defaults) }; }
export function makeKey(type, label) { const item = catalog.find(a => a.type === type); return { id: uid(), label: label || item.name, icon: item.icon, color: '#ad92ff', background: '#242231', image: '', actions: [makeAction(type)], longActions: [], children: [], stopOnError: true }; }
export function makeProfile(name = 'Neues Profil') { return { id: uid(), name, icon: 'Layers', keys: Array(15).fill(null) }; }
export function duplicateKey(key) {
  const copy = structuredClone(key); copy.id = uid();
  [...copy.actions, ...copy.longActions].forEach(a => { a.id = uid(); });
  copy.children = copy.children.map(k => k ? duplicateKey(k) : null);
  return copy;
}
export function initialState() {
  const profile = makeProfile('Mein Workspace');
  const entries = [['hotkey', 'Mikrofon', 'Mic', '#bda4ff'], ['url', 'Browser', 'Globe', '#82c8ff'], ['app', 'Dateien', 'FolderOpen', '#ffce83'], ['media', 'Play / Pause', 'Music2', '#a2e6c0'], ['folder', 'Workflows', 'Folder', '#bda4ff']];
  entries.forEach(([type, label, icon, color], i) => { profile.keys[i] = { ...makeKey(type, label), icon, color }; });
  profile.keys[1].actions[0].url = 'https://www.google.com';
  profile.keys[2].actions[0].path = '~';
  return { version: 1, profiles: [profile], activeProfileId: profile.id, settings: { brightness: 65, theme: 'dark', closeToTray: true, autostart: false, obsUrl: 'ws://127.0.0.1:4455', obsPassword: '', folderAnimations: true, iconRevealAnimation: true, defaultFontSize: DEFAULT_FONT_SIZE } };
}
export function validateState(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.profiles) || !value.profiles.length || value.profiles.length > 100) throw new Error('Ungültige Profildatei (Version 1 erwartet).');
  const ids = new Set(), keyIds = new Set(); let count = 0;
  function keys(items, depth = 0) {
    if (!Array.isArray(items) || items.length > 128 || depth > 12) throw new Error('Ungültige Ordnerstruktur.');
    for (const key of items) if (key) {
      if (++count > 10000 || typeof key.id !== 'string' || keyIds.has(key.id) || typeof key.label !== 'string' || key.label.length > 80 || typeof key.icon !== 'string' || typeof key.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(key.color) || !/^#[0-9a-f]{6}$/i.test(key.background) || typeof key.image !== 'string') throw new Error('Ungültige Taste.');
      keyIds.add(key.id);
      if (key.fontSize !== undefined && (!Number.isInteger(key.fontSize) || key.fontSize < MIN_FONT_SIZE || key.fontSize > MAX_FONT_SIZE)) throw new Error('Ungültige Schriftgröße.');
      if (key.backPosition !== undefined && (!Number.isInteger(key.backPosition) || key.backPosition < 0 || key.backPosition > 127)) throw new Error('Ungültige Position der Zurück-Taste.');
      if (key.image && !/^data:image\/(png|jpeg|webp);base64,/.test(key.image)) throw new Error('Ungültiges Tastenbild.');
      for (const actions of [key.actions, key.longActions]) {
        if (!Array.isArray(actions) || actions.length > 100) throw new Error('Ungültige Aktionskette.');
        for (const a of actions) if (!a || typeof a.id !== 'string' || !catalog.some(c => c.type === a.type)) throw new Error('Unbekannter Aktionstyp.');
      }
      keys(key.children, depth + 1);
    }
  }
  for (const p of value.profiles) { if (typeof p.id !== 'string' || ids.has(p.id) || typeof p.name !== 'string') throw new Error('Ungültiges Profil.'); ids.add(p.id); keys(p.keys); }
  if (!ids.has(value.activeProfileId)) throw new Error('Aktives Profil fehlt.');
  if (!value.settings || !Number.isFinite(value.settings.brightness) || value.settings.brightness < 0 || value.settings.brightness > 100) throw new Error('Ungültige Einstellungen.');
  if (typeof value.settings.autostart !== 'boolean' || typeof value.settings.closeToTray !== 'boolean' || typeof value.settings.obsUrl !== 'string' || typeof value.settings.obsPassword !== 'string' || !['dark', 'light'].includes(value.settings.theme)) throw new Error('Ungültige App-Einstellungen.');
  for (const name of ['folderAnimations', 'iconRevealAnimation']) {
    if (value.settings[name] !== undefined && typeof value.settings[name] !== 'boolean') throw new Error('Ungültige Animationseinstellung.');
  }
  if (value.settings.defaultFontSize !== undefined && (!Number.isInteger(value.settings.defaultFontSize) || value.settings.defaultFontSize < MIN_FONT_SIZE || value.settings.defaultFontSize > MAX_FONT_SIZE)) throw new Error('Ungültige globale Schriftgröße.');
  return value;
}
export function visibleKeys(state, path = []) {
  let keys = state.profiles.find(p => p.id === state.activeProfileId)?.keys || [];
  for (const index of path) keys = keys[index]?.children || [];
  return keys;
}
