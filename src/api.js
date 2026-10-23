import { initialState } from '../shared/model.js';
const unavailable = async () => { throw new Error('Diese Funktion ist in der Electron-App verfügbar. Starte npm start.'); };
export const desktop = !!window.macro;
export const api = window.macro || {
  init: async () => ({ state: JSON.parse(localStorage.getItem('macromaxx') || 'null') || initialState(), status: { device: { connected: false, name: 'Virtuelles Stream Deck', rows: 3, columns: 5, count: 15 }, obs: { connected: false }, running: [] }, logs: [], folderPath: [] }),
  save: async state => localStorage.setItem('macromaxx', JSON.stringify(state)),
  subscribe: () => () => {}, images: async () => {}, plugins: async () => [{ id: 'hello', name: 'Hallo, MacroMaxx!', fields: [{ key: 'name', label: 'Dein Name', default: 'Welt' }] }],
  diagnostics: async () => ({ platform: 'browser', backend: 'Browser-Vorschau', wayland: false }),
  execute: unavailable, setupInput: unavailable, installUdev: unavailable, connectOBS: unavailable, disconnectOBS: unavailable, importWorkspace: unavailable, exportWorkspace: unavailable, pickFile: unavailable, pickImage: unavailable, openPlugins: unavailable, selectDevice: unavailable, cancel: async () => {}, quit: unavailable,
};
