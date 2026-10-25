const { contextBridge, ipcRenderer } = require('electron');
const methods = ['init', 'save', 'execute', 'navigate', 'images', 'diagnostics', 'setupInput', 'installUdev', 'connectOBS', 'disconnectOBS', 'importWorkspace', 'exportWorkspace', 'pickFile', 'pickImage', 'plugins', 'openPlugins', 'cancel', 'quit', 'selectDevice', 'refreshAudio', 'reconnect', 'forgetInput', 'refreshApplications', 'refreshMedia', 'refreshDesktop', 'installDesktopExtension', 'setupSoundboard', 'stopSounds', 'removeSoundboard', 'flushComplete', 'installLauncher', 'openDataFolder'];
const api = Object.fromEntries(methods.map(method => [method, (...args) => ipcRenderer.invoke('app:' + method, ...args)]));
api.subscribe = callback => { const listener = (_, event) => callback(event); ipcRenderer.on('app:event', listener); return () => ipcRenderer.removeListener('app:event', listener); };
contextBridge.exposeInMainWorld('macro', api);
