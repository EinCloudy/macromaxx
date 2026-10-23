import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Tray, Menu, nativeImage } from 'electron';
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
import { visibleKeys, validateState } from '../shared/model.js';
import { backKey, isKeyActive } from '../shared/visuals.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const exec = promisify(execFile); const dev = process.argv.includes('--dev');
let win, tray, store, state, input, devices, plugins, actions, folderPath = [], quitting = false;
let logs = [], pressed = new Map();
const emit = event => { if (win && !win.isDestroyed()) win.webContents.send('app:event', event); };
const status = () => emit({ type: 'status', status: getStatus() });
const getStatus = () => ({ device: devices?.info, available: devices?.available || [], obs: actions?.obsState, inputReady: input?.ready, running: [...(actions?.running.keys() || [])], folderPath });
const log = (level, title, message) => { const item = { id: crypto.randomUUID(), time: Date.now(), level, title, message }; logs = [item, ...logs].slice(0, 200); emit({ type: 'log', item }); };
const publishState = () => emit({ type: 'state', state, folderPath });
async function persist() { await store.save(state); }
async function navigate(target) {
  if (target.profileId) { if (!state.profiles.some(p => p.id === target.profileId)) throw new Error('Profil nicht gefunden.'); state.activeProfileId = target.profileId; folderPath = []; await persist(); }
  else if (target.up) folderPath.pop();
  else if (Array.isArray(target.path)) {
    if (target.path.some(i => !Number.isInteger(i) || i < 0 || i > 127) || target.path.length > 12) throw new Error('Ungültiger Ordnerpfad.');
    folderPath = target.path;
  }
  publishState(); status(); await devices.render();
}
function keyAt(index) { const count = devices.info.count; if (folderPath.length && index === 0) return null; return visibleKeys(state, folderPath)[index - (folderPath.length ? 1 : 0)]; }
async function execute(index, long = false) {
  if (!Number.isInteger(index) || index < 0 || index >= devices.info.count) throw new Error('Ungültige Taste.');
  if (folderPath.length && index === 0) return navigate({ up: true });
  const key = keyAt(index); if (!key) return;
  if (key.actions[0]?.type === 'folder' && !long) return navigate({ path: [...folderPath, index - (folderPath.length ? 1 : 0)] });
  await actions.execute(structuredClone(key), long);
}
function updateKey(id, change) {
  function visit(keys) { for (const key of keys) if (key) { if (key.id === id) { if (typeof change.label === 'string') key.label = change.label.slice(0, 80); if (/^#[0-9a-f]{6}$/i.test(change.color)) key.color = change.color; } visit(key.children || []); } }
  state.profiles.forEach(p => visit(p.keys)); publishState(); persist().catch(e => log('error', 'Speichern', e.message));
}
async function autostart(enabled) {
  if (process.platform !== 'linux') { app.setLoginItemSettings({ openAtLogin: enabled }); return; }
  const dir = path.join(app.getPath('home'), '.config', 'autostart'); await fs.mkdir(dir, { recursive: true }); const file = path.join(dir, 'macromaxx.desktop');
  if (!enabled) { await fs.unlink(file).catch(e => { if (e.code !== 'ENOENT') throw e; }); return; }
  const quote = s => '"' + s.replace(/["`$\\]/g, '\\$&') + '"';
  const command = app.isPackaged ? quote(process.env.APPIMAGE || process.execPath) : `${quote(process.execPath)} ${quote(app.getAppPath())}`;
  await fs.writeFile(file, `[Desktop Entry]\nType=Application\nName=MacroMaxx\nExec=${command}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`);
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { win?.show(); win?.focus(); });
  app.whenReady().then(async () => {
    app.setName('MacroMaxx'); store = new Store(app.getPath('userData'));
    try { state = await store.load(); } catch (e) { dialog.showErrorBox('MacroMaxx – Workspace', e.message); app.quit(); return; }
    input = new Input(status);
    plugins = new Plugins([path.join(app.getAppPath(), 'plugins'), path.join(app.getPath('userData'), 'plugins')]); await plugins.scan();
    devices = new Devices({ onStatus: status, getKeys: () => folderPath.length ? [backKey, ...visibleKeys(state, folderPath)] : visibleKeys(state), getBrightness: () => state.settings.brightness, isActive: key => isKeyActive(key, actions?.obsState),
      onDown: index => { pressed.set(index, Date.now()); emit({ type: 'press', index, down: true }); },
      onUp: index => { const start = pressed.get(index); pressed.delete(index); emit({ type: 'press', index, down: false }); if (start) execute(index, Date.now() - start > 600).catch(e => log('error', 'Taste', e.message)); }
    });
    actions = new Actions({ input, plugins, shell, clipboard, getState: () => state, navigate, log, updateKey, status });
    const handlers = {
      init: () => ({ state, status: getStatus(), logs, folderPath }),
      save: async (_, next) => { validateState(next); const old = state.settings; if (old.autostart !== next.settings.autostart) await autostart(next.settings.autostart); await store.save(next); if (state.activeProfileId !== next.activeProfileId) folderPath = []; state = next; await devices.render(); return true; },
      execute: (_, index, long) => execute(index, long), navigate: (_, target) => navigate(target),
      images: (_, images) => { if (!Array.isArray(images) || images.length > 10002 || images.some(i => !i || typeof i.signature !== 'string' || i.signature.length > 1000000 || typeof i.image !== 'string' || i.image.length > 2000000 || !/^data:image\/png;base64,/.test(i.image))) throw new Error('Ungültige Bilder.'); return devices.setImages(images); },
      diagnostics: () => input.diagnostics(), setupInput: async () => { try { return await input.setup(); } catch (e) { log('error', 'Tastatureinrichtung', e.message); throw e; } },
      installUdev: async () => {
        if (process.platform !== 'linux') throw new Error('Nur für Linux.');
        const rule = 'SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0fd9", TAG+="uaccess"\n';
        const source = path.join(app.getPath('temp'), '70-macromaxx-streamdeck.rules'); await fs.writeFile(source, rule);
        const script = path.join(here, 'install-udev.sh').replace(/app\.asar\//, 'app.asar.unpacked/');
        await exec('pkexec', ['/bin/sh', script, source], { timeout: 120000 }); await devices.scan(); return true;
      },
      connectOBS: () => actions.connectOBS(), disconnectOBS: () => actions.obs.disconnect(),
      pickFile: async () => { const result = await dialog.showOpenDialog(win, { properties: ['openFile'] }); return result.canceled ? null : result.filePaths[0]; },
      pickImage: async () => { const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp'] }], properties: ['openFile'] }); if (r.canceled) return null; const sharp = (await import('sharp')).default; const buffer = await sharp(r.filePaths[0], { limitInputPixels: 20000000 }).resize(256, 256, { fit: 'cover' }).png().toBuffer(); return 'data:image/png;base64,' + buffer.toString('base64'); },
      exportWorkspace: async () => { const r = await dialog.showSaveDialog(win, { defaultPath: 'MacroMaxx-Workspace.json', filters: [{ name: 'MacroMaxx Workspace', extensions: ['json'] }] }); if (r.canceled) return false; await fs.writeFile(r.filePath, JSON.stringify(state, null, 2), { mode: 0o600 }); return true; },
      importWorkspace: async () => {
        const r = await dialog.showOpenDialog(win, { filters: [{ name: 'MacroMaxx Workspace', extensions: ['json'] }], properties: ['openFile'] }); if (r.canceled) return null;
        const stat = await fs.stat(r.filePaths[0]); if (stat.size > 25000000) throw new Error('Datei zu groß (max. 25 MB).');
        const imported = validateState(JSON.parse(await fs.readFile(r.filePaths[0], 'utf8')));
        const confirm = await dialog.showMessageBox(win, { type: 'question', message: 'Aktuellen Workspace ersetzen?', detail: 'Die vorhandene Version bleibt als Sicherung erhalten. Importierte Aktionen werden erst durch Tastendruck ausgeführt.', buttons: ['Abbrechen', 'Importieren'], defaultId: 0, cancelId: 0 }); if (confirm.response !== 1) return null;
        imported.settings.autostart = state.settings.autostart; await store.save(imported); state = imported; folderPath = []; publishState(); status(); await devices.render(); return state;
      },
      plugins: () => plugins.scan(), openPlugins: () => shell.openPath(path.join(app.getPath('userData'), 'plugins')),
      cancel: async () => { actions.cancel(); await input.releaseAll(); }, quit: () => { quitting = true; app.quit(); }, selectDevice: (_, devicePath) => devices.select(devicePath)
    };
    for (const [name, handler] of Object.entries(handlers)) ipcMain.handle('app:' + name, (event, ...args) => { if (event.sender !== win?.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Unzulässiger Aufruf.'); return handler(event, ...args); });
    win = new BrowserWindow({ width: 1500, height: 960, minWidth: 1120, minHeight: 740, backgroundColor: '#101114', title: 'MacroMaxx', autoHideMenuBar: true, webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => { if (url !== win.webContents.getURL()) event.preventDefault(); });
    win.webContents.session.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [dev ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://127.0.0.1:5173; object-src 'none'" : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; object-src 'none'"] } }));
    // Linux tray implementations reliably accept PNG, rather than SVG buffers.
    const sharp = (await import('sharp')).default;
    const png = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="16" fill="#ad92ff"/><path d="M16 44V20l16 16 16-16v24" fill="none" stroke="#15121c" stroke-width="6"/></svg>')).png().toBuffer();
    tray = new Tray(nativeImage.createFromBuffer(png)); tray.setToolTip('MacroMaxx'); tray.setContextMenu(Menu.buildFromTemplate([{ label: 'MacroMaxx öffnen', click: () => win.show() }, { type: 'separator' }, { label: 'Beenden', click: () => { quitting = true; app.quit(); } }])); tray.on('click', () => win.show());
    win.on('close', event => { if (!quitting && state.settings.closeToTray) { event.preventDefault(); win.hide(); } });
    if (dev) await win.loadURL('http://127.0.0.1:5173'); else await win.loadFile(path.join(here, '../dist/index.html'));
    devices.start(); if (store.recovery) log('info', 'Wiederherstellung', store.recovery);
  }).catch(error => { dialog.showErrorBox('MacroMaxx', error.stack || error.message); quitting = true; app.quit(); });
  app.on('before-quit', event => {
    quitting = true;
    if (devices && !app.cleanupDone) { event.preventDefault(); app.cleanupDone = true; actions.close(); plugins.close(); Promise.all([input.close(), devices.close(), store.queue]).finally(() => app.quit()); }
  });
  app.on('window-all-closed', () => { if (!state?.settings.closeToTray) app.quit(); });
}
