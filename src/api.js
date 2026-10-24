import { initialState } from '../shared/model.js';
const unavailable = async () => { throw new Error('This feature requires the Electron app. Run npm start.'); };
export const desktop = !!window.macro;
export const api = window.macro || {
  init: async () => ({ state: JSON.parse(localStorage.getItem('macromaxx') || 'null') || initialState(), status: { device: { connected: false, name: 'Virtual Stream Deck', rows: 3, columns: 5, count: 15 }, obs: { connected: false }, running: [] }, logs: [], folderPath: [] }),
  save: async state => localStorage.setItem('macromaxx', JSON.stringify(state)),
  subscribe: () => () => {}, images: async () => {}, plugins: async () => [{ id: 'hello', name: 'Hello, MacroMaxx!', fields: [{ key: 'name', label: 'Your name', default: 'World' }] }],
  diagnostics: async () => ({ platform: 'browser', backend: 'Browser preview', wayland: false }),
  refreshAudio: unavailable,
  reconnect: unavailable,
  forgetInput: unavailable,
  execute: unavailable, setupInput: unavailable, installUdev: unavailable, connectOBS: unavailable, disconnectOBS: unavailable, importWorkspace: unavailable, exportWorkspace: unavailable, pickFile: unavailable, pickImage: unavailable, openPlugins: unavailable, selectDevice: unavailable, cancel: async () => {}, quit: unavailable,
};
