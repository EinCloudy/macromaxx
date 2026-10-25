import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Tray, Menu, nativeImage, powerMonitor, globalShortcut, Notification } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { Devices } from './devices.js';
import { Plugins } from './plugins.js';
import { Actions } from './actions.js';
import { AutoProfiles } from './auto-profiles.js';
import { NativePlugins, prepareNativePlugins } from './native-plugins.js';
import { validateState } from '../shared/model.js';
import { isKeyActive } from '../shared/visuals.js';
import { deckSlots } from '../shared/deck-layout.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes('--dev');
const nativeDirectory = path.join(here, '../plugins/native');
let win, tray, store, state, devices, plugins, actions, autoProfiles, native, folderPath = [], quitting = false;
let bootReady = false, showRequested = false, creatingWindow, saveRequest, notifiedBackground = false;
let logs = [], pressed = new Map();
const emit = event => { if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('app:event', event); };
const status = () => emit({ type: 'status', status: getStatus() });
const getStatus = () => ({ ...native?.snapshot(), device: devices?.info, available: devices?.available || [], obs: actions?.obsState, running: [...(actions?.running.keys() || [])], folderPath });
const log = (level, title, message) => { const item = { id: crypto.randomUUID(), time: Date.now(), level, title, message }; logs = [item, ...logs].slice(0, 200); emit({ type: 'log', item }); };
const publishState = () => emit({ type: 'state', state, folderPath });
function releasePhysicalKeys() {
  for (const index of pressed.keys()) emit({ type: 'press', index, down: false });
  pressed.clear(); actions?.cancel();
  void native?.releaseAll().catch(e => log('error', 'Native input release', e.message));
}
async function persist() { await store.save(state); }
async function navigate(target) {
  if (quitting) return;
  const previousPath = [...folderPath];
  if (target.profileId) { if (!state.profiles.some(p => p.id === target.profileId)) throw new Error('Profile not found.'); if (!target.automatic) autoProfiles?.manual(target.profileId); state.activeProfileId = target.profileId; folderPath = []; await persist(); }
  else if (target.up) folderPath.pop();
  else if (Array.isArray(target.path)) {
    if (target.path.some(i => !Number.isInteger(i) || i < 0 || i > 127) || target.path.length > 12) throw new Error('Invalid folder path.');
    folderPath = target.path;
  }
  publishState(); status();
  if (!target.profileId && JSON.stringify(previousPath) !== JSON.stringify(folderPath)) {
    await devices.navigateTransition(folderPath.length > previousPath.length ? 'in' : 'out');
  } else await devices.render();
}
async function execute(index, long = false) {
  if (quitting) return;
  if (!Number.isInteger(index) || index < 0 || index >= devices.info.count) throw new Error('Invalid key.');
  const slot = deckSlots(state, folderPath, devices.info.count)[index];
  if (slot.isBack) return navigate({ up: true });
  const key = slot.key; if (!key) return;
  if (key.actions[0]?.type === 'folder' && !long) return navigate({ path: [...folderPath, slot.childIndex] });
  await actions.execute(structuredClone(key), long);
}
function updateKey(id, change) {
  function visit(keys) { for (const key of keys) if (key) { if (key.id === id) { if (typeof change.label === 'string') key.label = change.label.slice(0, 80); if (/^#[0-9a-f]{6}$/i.test(change.color)) key.color = change.color; } visit(key.children || []); } }
  state.profiles.forEach(p => visit(p.keys)); publishState(); persist().catch(e => log('error', 'Save', e.message));
}
function flushRenderer() {
  if (saveRequest) return saveRequest.promise;
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return Promise.resolve();
  const id = crypto.randomUUID(); let finish;
  const promise = new Promise(resolve => { finish = resolve; });
  const timer = setTimeout(() => { saveRequest = null; finish(); }, 2000);
  saveRequest = { id, promise, finish: () => { clearTimeout(timer); saveRequest = null; finish(); } };
  emit({ type: 'flush', id }); return promise;
}
async function createMainWindow(show = true) {
  if (creatingWindow) return creatingWindow;
  creatingWindow = (async () => {
    const window = new BrowserWindow({ width: 1500, height: 960, minWidth: 1120, minHeight: 740, show, backgroundColor: '#101114', title: 'MacroMaxx', autoHideMenuBar: true, webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    win = window;
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (url !== window.webContents.getURL()) event.preventDefault(); });
    window.webContents.session.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [dev ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://127.0.0.1:5173; object-src 'none'" : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; object-src 'none'"] } }));
    window.on('close', event => {
      if (quitting) return;
      event.preventDefault();
      if (state.settings.closeToTray) {
        window.hide(); native?.changed(); void flushRenderer();
        if (!notifiedBackground && Notification.isSupported()) { notifiedBackground = true; new Notification({ title: 'MacroMaxx is running in the background', body: 'Open it again from your app launcher, tray, shortcut, or by starting MacroMaxx again.' }).show(); }
      } else app.quit();
    });
    window.on('closed', () => { if (win === window) win = null; native?.changed(); });
    for (const event of ['show', 'hide', 'minimize', 'restore']) window.on(event, () => native?.changed());
    if (dev) await window.loadURL('http://127.0.0.1:5173'); else await window.loadFile(path.join(here, '../dist/index.html'));
  })().finally(() => { creatingWindow = null; });
  return creatingWindow;
}
async function showMainWindow() {
  if (quitting) return;
  if (!bootReady) { showRequested = true; return; }
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
    if (win && !win.isDestroyed()) win.destroy();
    await createMainWindow(true);
  }
  if (win.isMinimized()) win.restore(); win.show(); win.focus(); native?.changed();
}
prepareNativePlugins(app, nativeDirectory);
if (!app.requestSingleInstanceLock()) app.quit();
else if (process.argv.includes('--quit')) app.quit();
else {
  app.on('second-instance', (_, argv) => { if (argv.includes('--quit')) app.quit(); else if (!argv.includes('--background')) showMainWindow().catch(e => log('error', 'Open window', e.message)); });
  app.on('activate', () => { showMainWindow().catch(e => log('error', 'Open window', e.message)); });
  app.whenReady().then(async () => {
    app.setName('MacroMaxx'); store = new Store(app.getPath('userData'));
    try { state = await store.load(); } catch (e) { dialog.showErrorBox('MacroMaxx – Workspace', e.message); app.quit(); return; }
    native = new NativePlugins(nativeDirectory, {
      app, shell, clipboard, shortcuts: globalShortcut, getState: () => state, log, onStatus: status,
      dataDirectory: app.getPath('userData'), tempDirectory: app.getPath('temp'),
      showWindow: () => { showMainWindow().catch(e => log('error', 'Open window', e.message)); },
      windowVisible: () => !!win && !win.isDestroyed() && win.isVisible(),
      reconnectDevice: () => devices?.reconnect(), onFocus: info => autoProfiles?.update(info),
    });
    await native.initialize();
    autoProfiles = new AutoProfiles(() => state, id => navigate({ profileId: id, automatic: true }), e => log('error', 'Automatic profile', e.message));
    plugins = new Plugins([path.join(app.getAppPath(), 'plugins'), path.join(app.getPath('userData'), 'plugins')]); await plugins.scan();
    devices = new Devices({ onStatus: status, onDisconnect: releasePhysicalKeys, getKeys: () => deckSlots(state, folderPath, devices?.info.count || 15).map(slot => native.renderKey(slot.key)), getBrightness: () => state.settings.brightness, isActive: key => native.visual(key)?.active ?? isKeyActive(key, actions?.obsState), getSettings: () => state.settings,
      onDown: index => {
        if (quitting) return;
        if (pressed.has(index)) return;
        const key = deckSlots(state, folderPath, devices.info.count)[index]?.key;
        const action = key?.actions?.[0];
        const record = { time: Date.now(), keyId: key?.id };
        const hold = native.beginHold(action);
        record.hold = hold && hold.catch(e => { log('error', 'Native hold', e.message); return () => {}; });
        pressed.set(index, record); emit({ type: 'press', index, down: true });
      },
      onUp: index => {
        const record = pressed.get(index); pressed.delete(index); emit({ type: 'press', index, down: false });
        if (record?.hold) record.hold.then(release => release()).catch(e => log('error', 'Native release', e.message));
        else if (record && record.keyId === deckSlots(state, folderPath, devices.info.count)[index]?.key?.id) execute(index, Date.now() - record.time > 600).catch(e => log('error', 'Key', e.message));
      }
    });
    actions = new Actions({ plugins, shell, getState: () => state, navigate, log, updateKey, status, native });
    const handlers = {
      init: () => ({ state, status: getStatus(), logs, folderPath }),
      save: async (_, next) => {
        validateState(next); const old = state.settings;
        await native.beforeSettings(old, next.settings);
        await store.save(next);
        if (state.activeProfileId !== next.activeProfileId) { folderPath = []; autoProfiles.manual(next.activeProfileId); }
        state = next; await native.configure(old, state.settings); autoProfiles.update(native.snapshot().focus, true); await devices.render(); return true;
      },
      flushComplete: (_, id) => { if (saveRequest?.id === id) saveRequest.finish(); },
      nativeCall: (_, id, operation, ...args) => native.invoke(id, operation, ...args),
      openDataFolder: () => shell.openPath(app.getPath('userData')),
      execute: (_, index, long) => execute(index, long), navigate: (_, target) => navigate(target),
      images: (_, images) => { if (!Array.isArray(images) || images.length > 10002 || images.some(i => !i || typeof i.signature !== 'string' || i.signature.length > 1000000 || typeof i.image !== 'string' || i.image.length > 2000000 || !/^data:image\/png;base64,/.test(i.image))) throw new Error('Invalid images.'); return devices.setImages(images); },
      ...native.legacyHandlers(),
      reconnect: async () => { releasePhysicalKeys(); await devices.reconnect(); },
      connectOBS: () => actions.connectOBS(), disconnectOBS: () => actions.obs.disconnect(),
      pickFile: async () => { const result = await dialog.showOpenDialog(win, { properties: ['openFile'] }); return result.canceled ? null : result.filePaths[0]; },
      pickImage: async () => { const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }], properties: ['openFile'] }); if (r.canceled) return null; const sharp = (await import('sharp')).default; const buffer = await sharp(r.filePaths[0], { limitInputPixels: 20000000 }).resize(256, 256, { fit: 'cover' }).png().toBuffer(); return 'data:image/png;base64,' + buffer.toString('base64'); },
      exportWorkspace: async () => { const r = await dialog.showSaveDialog(win, { defaultPath: 'MacroMaxx-Workspace.json', filters: [{ name: 'MacroMaxx Workspace', extensions: ['json'] }] }); if (r.canceled) return false; await fs.writeFile(r.filePath, JSON.stringify(state, null, 2), { mode: 0o600 }); return true; },
      importWorkspace: async () => {
        const r = await dialog.showOpenDialog(win, { filters: [{ name: 'MacroMaxx Workspace', extensions: ['json'] }], properties: ['openFile'] }); if (r.canceled) return null;
        const stat = await fs.stat(r.filePaths[0]); if (stat.size > 25000000) throw new Error('File too large (maximum 25 MB).');
        const imported = validateState(JSON.parse(await fs.readFile(r.filePaths[0], 'utf8')));
        const confirm = await dialog.showMessageBox(win, { type: 'question', message: 'Replace the current workspace?', detail: 'The current version will be kept as a backup. Imported actions only run when a key is triggered.', buttons: ['Cancel', 'Import'], defaultId: 0, cancelId: 0 }); if (confirm.response !== 1) return null;
        const previous = state.settings;
        imported.settings.autostart = previous.autostart;
        await native.beforeSettings(previous, imported.settings);
        await store.save(imported); state = imported; folderPath = [];
        await native.configure(previous, state.settings); publishState(); status(); await devices.render(); return state;
      },
      plugins: () => plugins.scan(), openPlugins: () => shell.openPath(path.join(app.getPath('userData'), 'plugins')),
      cancel: async () => { actions.cancel(); await native.releaseAll(); }, quit: () => { quitting = true; app.quit(); }, selectDevice: (_, devicePath) => devices.select(devicePath)
    };
    for (const [name, handler] of Object.entries(handlers)) ipcMain.handle('app:' + name, (event, ...args) => { if (event.sender !== win?.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Unauthorized request.'); return handler(event, ...args); });
    // Linux tray implementations reliably accept PNG, rather than SVG buffers.
    const sharp = (await import('sharp')).default;
    const png = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="16" fill="#ad92ff"/><path d="M16 44V20l16 16 16-16v24" fill="none" stroke="#15121c" stroke-width="6"/></svg>')).png().toBuffer();
    try {
      tray = new Tray(nativeImage.createFromBuffer(png)); tray.setToolTip('MacroMaxx'); tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open MacroMaxx', click: () => { showMainWindow().catch(e => log('error', 'Open window', e.message)); } }, { type: 'separator' }, { label: 'Quit', click: () => app.quit() }])); tray.on('click', () => { showMainWindow().catch(e => log('error', 'Open window', e.message)); });
    } catch (e) { log('info', 'System tray', e.message); }
    bootReady = true;
    await createMainWindow((!process.argv.includes('--background') && !native.shouldStartHidden()) || process.argv.includes('--show') || showRequested);
    devices.start(); await native.start(); if (store.recovery) log('info', 'Recovery', store.recovery);
    powerMonitor.on('suspend', () => { releasePhysicalKeys(); Promise.allSettled([devices.suspend(), native.suspend()]).then(status); });
    powerMonitor.on('lock-screen', releasePhysicalKeys);
    powerMonitor.on('resume', () => {
      Promise.allSettled([devices.resume(), native.resume()]).then(status);
    });
  }).catch(error => { dialog.showErrorBox('MacroMaxx', error.stack || error.message); quitting = true; app.quit(); });
  app.on('before-quit', event => {
    quitting = true;
    if (!devices || app.cleanupDone) return;
    event.preventDefault();
    if (app.cleanupStarted) return;
    app.cleanupStarted = true;
    flushRenderer().finally(() => {
      actions.close(); plugins.close(); autoProfiles.close();
      Promise.allSettled([native.close(), devices.close(), store.queue]).then(() => { app.cleanupDone = true; app.quit(); });
    });
  });
  // The close handler decides whether to quit. A destroyed renderer/window
  // must not prevent reopening the still-running device controller.
  app.on('window-all-closed', () => {});
}
