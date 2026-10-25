import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Tray, Menu, nativeImage, powerMonitor, globalShortcut, Notification } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Store } from './store.js';
import { Input } from './input.js';
import { Devices } from './devices.js';
import { Plugins } from './plugins.js';
import { Actions } from './actions.js';
import { Audio } from './audio.js';
import { Launcher } from './launcher.js';
import { Media } from './media.js';
import { Desktop } from './desktop.js';
import { FocusMonitor } from './focus.js';
import { AutoProfiles } from './auto-profiles.js';
import { Soundboard } from './soundboard.js';
import { Background } from './background.js';
import { validateState } from '../shared/model.js';
import { isKeyActive, liveKey } from '../shared/visuals.js';
import { deckSlots } from '../shared/deck-layout.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const exec = promisify(execFile); const dev = process.argv.includes('--dev');
let win, tray, store, state, input, devices, plugins, actions, audio, launcher, media, desktop, focus, autoProfiles, soundboard, background, folderPath = [], quitting = false;
let bootReady = false, showRequested = false, creatingWindow, saveRequest, notifiedBackground = false;
let logs = [], pressed = new Map();
const emit = event => { if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('app:event', event); };
const status = () => emit({ type: 'status', status: getStatus() });
const getStatus = () => ({ device: devices?.info, available: devices?.available || [], obs: actions?.obsState, audio: audio?.state, media: media?.state, desktop: desktop?.state, focus: focus?.state, soundboard: soundboard?.state, background: background ? { ...background.state, windowVisible: !!win && !win.isDestroyed() && win.isVisible() } : undefined, apps: launcher?.apps || [], inputReady: input?.ready, running: [...(actions?.running.keys() || [])], folderPath });
const log = (level, title, message) => { const item = { id: crypto.randomUUID(), time: Date.now(), level, title, message }; logs = [item, ...logs].slice(0, 200); emit({ type: 'log', item }); };
const publishState = () => emit({ type: 'state', state, folderPath });
function releasePhysicalKeys() {
  for (const index of pressed.keys()) emit({ type: 'press', index, down: false });
  pressed.clear(); actions?.cancel();
  soundboard?.stopAll();
  void audio?.releaseAll().catch(e => log('error', 'Microphone release', e.message));
  void input?.releaseAll().catch(e => log('error', 'Keyboard release', e.message));
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
        window.hide(); void flushRenderer();
        if (!notifiedBackground && Notification.isSupported()) { notifiedBackground = true; new Notification({ title: 'MacroMaxx is running in the background', body: 'Open it again from your app launcher, tray, shortcut, or by starting MacroMaxx again.' }).show(); }
      } else app.quit();
    });
    window.on('closed', () => { if (win === window) win = null; });
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
  if (win.isMinimized()) win.restore(); win.show(); win.focus();
}
app.commandLine.appendSwitch('enable-features', [...new Set([...(app.commandLine.getSwitchValue('enable-features') || '').split(',').filter(Boolean), 'GlobalShortcutsPortal'])].join(','));
if (!app.requestSingleInstanceLock()) app.quit();
else if (process.argv.includes('--quit')) app.quit();
else {
  app.on('second-instance', (_, argv) => { if (argv.includes('--quit')) app.quit(); else if (!argv.includes('--background')) showMainWindow().catch(e => log('error', 'Open window', e.message)); });
  app.on('activate', () => { showMainWindow().catch(e => log('error', 'Open window', e.message)); });
  app.whenReady().then(async () => {
    app.setName('MacroMaxx'); store = new Store(app.getPath('userData'));
    try { state = await store.load(); } catch (e) { dialog.showErrorBox('MacroMaxx – Workspace', e.message); app.quit(); return; }
    input = new Input(status, { tokenFile: path.join(app.getPath('userData'), 'keyboard-permission.json') });
    audio = new Audio(status);
    launcher = new Launcher(status); await launcher.scan();
    media = new Media(status);
    desktop = new Desktop(status, input); await desktop.probe();
    autoProfiles = new AutoProfiles(() => state, id => navigate({ profileId: id, automatic: true }), e => log('error', 'Automatic profile', e.message));
    focus = new FocusMonitor(path.join(app.getPath('userData'), 'runtime'), desktop, info => { status(); autoProfiles.update(info); });
    soundboard = new Soundboard(status, e => log('error', 'Soundboard', e.message)); await soundboard.probe();
    background = new Background({ app, shortcuts: globalShortcut, show: () => { showMainWindow().catch(e => log('error', 'Open window', e.message)); }, onStatus: status }); await background.refresh();
    plugins = new Plugins([path.join(app.getAppPath(), 'plugins'), path.join(app.getPath('userData'), 'plugins')]); await plugins.scan();
    devices = new Devices({ onStatus: status, onDisconnect: releasePhysicalKeys, getKeys: () => deckSlots(state, folderPath, devices?.info.count || 15).map(slot => liveKey(slot.key, { media: media.state })), getBrightness: () => state.settings.brightness, isActive: key => isKeyActive(key, actions?.obsState, { audio: audio.state, media: media.state, soundboard: soundboard.state }), getSettings: () => state.settings,
      onDown: index => {
        if (pressed.has(index)) return;
        const key = deckSlots(state, folderPath, devices.info.count)[index]?.key;
        const action = key?.actions?.[0];
        const record = { time: Date.now(), keyId: key?.id };
        if (action?.type === 'audio' && ['ptt', 'ptm'].includes(action.command)) {
          record.hold = audio.startHold(action); record.hold.catch(e => log('error', 'Microphone hold', e.message));
        }
        pressed.set(index, record); emit({ type: 'press', index, down: true });
      },
      onUp: index => {
        const record = pressed.get(index); pressed.delete(index); emit({ type: 'press', index, down: false });
        if (record?.hold) record.hold.then(token => audio.releaseHold(token)).catch(e => log('error', 'Microphone release', e.message));
        else if (record && record.keyId === deckSlots(state, folderPath, devices.info.count)[index]?.key?.id) execute(index, Date.now() - record.time > 600).catch(e => log('error', 'Key', e.message));
      }
    });
    actions = new Actions({ input, plugins, shell, clipboard, getState: () => state, navigate, log, updateKey, status, audio, launcher, media, desktop, soundboard });
    const handlers = {
      init: () => ({ state, status: getStatus(), logs, folderPath }),
      save: async (_, next) => {
        validateState(next); const old = state.settings;
        if (old.showShortcut !== next.settings.showShortcut && !background.shortcut(next.settings.showShortcut || '')) throw new Error(background.state.error);
        if (old.autostart !== next.settings.autostart || old.startInBackground !== next.settings.startInBackground) await background.autostart(next.settings.autostart, next.settings.startInBackground !== false);
        await store.save(next);
        if (state.activeProfileId !== next.activeProfileId) { folderPath = []; autoProfiles.manual(next.activeProfileId); }
        state = next; await focus.configure(!!state.settings.autoProfiles); autoProfiles.update(focus.state, true); await devices.render(); return true;
      },
      flushComplete: (_, id) => { if (saveRequest?.id === id) saveRequest.finish(); },
      installLauncher: () => background.installLauncher(),
      openDataFolder: () => shell.openPath(app.getPath('userData')),
      execute: (_, index, long) => execute(index, long), navigate: (_, target) => navigate(target),
      images: (_, images) => { if (!Array.isArray(images) || images.length > 10002 || images.some(i => !i || typeof i.signature !== 'string' || i.signature.length > 1000000 || typeof i.image !== 'string' || i.image.length > 2000000 || !/^data:image\/png;base64,/.test(i.image))) throw new Error('Invalid images.'); return devices.setImages(images); },
      diagnostics: () => input.diagnostics(), setupInput: async () => { try { return await input.setup({ persist: state.settings.rememberWaylandPermission !== false }); } catch (e) { log('error', 'Keyboard setup', e.message); throw e; } },
      forgetInput: () => input.forget(),
      refreshAudio: () => audio.refresh(),
      refreshApplications: () => launcher.scan(),
      refreshMedia: () => media.refresh(),
      refreshDesktop: () => desktop.probe(),
      setupSoundboard: async (_, options) => { const result = await soundboard.setupVirtual(options || {}); await audio.refresh(); return result; },
      stopSounds: () => soundboard.stopAll(),
      removeSoundboard: async () => { soundboard.stopAll(); await soundboard.teardown(); await audio.refresh(); },
      installDesktopExtension: () => desktop.installExtension(path.join(app.getAppPath(), 'extensions/macromaxx@macromaxx.local')),
      reconnect: async () => { releasePhysicalKeys(); await devices.reconnect(); await audio.refresh(); },
      installUdev: async () => {
        if (process.platform !== 'linux') throw new Error('Available on Linux only.');
        const rule = 'SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0fd9", TAG+="uaccess"\n';
        const source = path.join(app.getPath('temp'), '70-macromaxx-streamdeck.rules'); await fs.writeFile(source, rule);
        const script = path.join(here, 'install-udev.sh').replace(/app\.asar\//, 'app.asar.unpacked/');
        await exec('pkexec', ['/bin/sh', script, source], { timeout: 120000 }); await devices.scan(); return true;
      },
      connectOBS: () => actions.connectOBS(), disconnectOBS: () => actions.obs.disconnect(),
      pickFile: async () => { const result = await dialog.showOpenDialog(win, { properties: ['openFile'] }); return result.canceled ? null : result.filePaths[0]; },
      pickImage: async () => { const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }], properties: ['openFile'] }); if (r.canceled) return null; const sharp = (await import('sharp')).default; const buffer = await sharp(r.filePaths[0], { limitInputPixels: 20000000 }).resize(256, 256, { fit: 'cover' }).png().toBuffer(); return 'data:image/png;base64,' + buffer.toString('base64'); },
      exportWorkspace: async () => { const r = await dialog.showSaveDialog(win, { defaultPath: 'MacroMaxx-Workspace.json', filters: [{ name: 'MacroMaxx Workspace', extensions: ['json'] }] }); if (r.canceled) return false; await fs.writeFile(r.filePath, JSON.stringify(state, null, 2), { mode: 0o600 }); return true; },
      importWorkspace: async () => {
        const r = await dialog.showOpenDialog(win, { filters: [{ name: 'MacroMaxx Workspace', extensions: ['json'] }], properties: ['openFile'] }); if (r.canceled) return null;
        const stat = await fs.stat(r.filePaths[0]); if (stat.size > 25000000) throw new Error('File too large (maximum 25 MB).');
        const imported = validateState(JSON.parse(await fs.readFile(r.filePaths[0], 'utf8')));
        const confirm = await dialog.showMessageBox(win, { type: 'question', message: 'Replace the current workspace?', detail: 'The current version will be kept as a backup. Imported actions only run when a key is triggered.', buttons: ['Cancel', 'Import'], defaultId: 0, cancelId: 0 }); if (confirm.response !== 1) return null;
        imported.settings.autostart = state.settings.autostart; await store.save(imported); state = imported; folderPath = []; publishState(); status(); await devices.render(); return state;
      },
      plugins: () => plugins.scan(), openPlugins: () => shell.openPath(path.join(app.getPath('userData'), 'plugins')),
      cancel: async () => { actions.cancel(); soundboard.stopAll(); await Promise.all([input.releaseAll(), audio.releaseAll()]); }, quit: () => { quitting = true; app.quit(); }, selectDevice: (_, devicePath) => devices.select(devicePath)
    };
    for (const [name, handler] of Object.entries(handlers)) ipcMain.handle('app:' + name, (event, ...args) => { if (event.sender !== win?.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Unauthorized request.'); return handler(event, ...args); });
    // Linux tray implementations reliably accept PNG, rather than SVG buffers.
    const sharp = (await import('sharp')).default;
    const png = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="16" fill="#ad92ff"/><path d="M16 44V20l16 16 16-16v24" fill="none" stroke="#15121c" stroke-width="6"/></svg>')).png().toBuffer();
    try {
      tray = new Tray(nativeImage.createFromBuffer(png)); tray.setToolTip('MacroMaxx'); tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open MacroMaxx', click: () => { showMainWindow().catch(e => log('error', 'Open window', e.message)); } }, { type: 'separator' }, { label: 'Quit', click: () => app.quit() }])); tray.on('click', () => { showMainWindow().catch(e => log('error', 'Open window', e.message)); });
    } catch (e) { log('info', 'System tray', e.message); }
    bootReady = true;
    await createMainWindow(!process.argv.includes('--background') || process.argv.includes('--show') || showRequested);
    if (state.settings.autostart) await background.autostart(true, state.settings.startInBackground !== false);
    if (!background.shortcut(state.settings.showShortcut || '')) log('error', 'Open shortcut', background.state.error);
    devices.start(); audio.start(); media.start(); if (store.recovery) log('info', 'Recovery', store.recovery);
    focus.configure(!!state.settings.autoProfiles).catch(e => log('error', 'Focus detection', e.message));
    if (state.settings.rememberWaylandPermission !== false) input.restore().catch(e => log('error', 'Keyboard permission restore', e.message));
    powerMonitor.on('suspend', () => { releasePhysicalKeys(); devices.suspend().catch(e => log('error', 'Suspend', e.message)); });
    powerMonitor.on('lock-screen', releasePhysicalKeys);
    powerMonitor.on('resume', () => {
      Promise.allSettled([devices.resume(), audio.refresh(), media.refresh(), soundboard.probe(), focus.restart(), input.reset().then(() => state.settings.rememberWaylandPermission !== false ? input.restore() : null)]).then(status);
    });
  }).catch(error => { dialog.showErrorBox('MacroMaxx', error.stack || error.message); quitting = true; app.quit(); });
  app.on('before-quit', event => {
    quitting = true;
    if (!devices || app.cleanupDone) return;
    event.preventDefault();
    if (app.cleanupStarted) return;
    app.cleanupStarted = true;
    flushRenderer().finally(() => {
      actions.close(); plugins.close(); launcher.close(); media.close(); autoProfiles.close(); background.close();
      Promise.allSettled([input.close(), audio.close(), focus.close(), soundboard.close(), devices.close(), store.queue]).then(() => { app.cleanupDone = true; app.quit(); });
    });
  });
  // The close handler decides whether to quit. A destroyed renderer/window
  // must not prevent reopening the still-running device controller.
  app.on('window-all-closed', () => {});
}
