import { app, BrowserWindow, clipboard, ClipboardItem, dialog, globalShortcut, ipcMain, Menu, nativeImage, screen, session, Tray, type NativeImage } from 'electron';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { CaptureData, CaptureMode, CaptureRequest, Settings, Shortcuts } from '../shared/contracts';
import { resolveDisplay, validateCaptureRequest } from './display-target';
import { validRect } from '../shared/geometry';
import { captureDisplay } from './capture';
import { loadSettings, persistSettings } from './settings';
import { replaceShortcuts } from './shortcuts';
import { CaptureSession } from './session';
import { decodePng } from './image-output';
import { readImportedImage } from './image-import';

const root = join(__dirname, '../..');
const dev = !app.isPackaged && /^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(process.env.SCREENSHOT_DEV_URL ?? '') ? process.env.SCREENSHOT_DEV_URL : undefined;
const baseURL = dev ?? pathToFileURL(join(root, 'dist/index.html')).href;
let settingsWindow: BrowserWindow | null = null;
let captureWindow: BrowserWindow | null = null;
let tray: Tray;
let quitting = false;
let image: NativeImage | null = null;
let data: CaptureData | null = null;
let settings: Settings;
let warning = '';
let configPath: string;
let registered: Shortcuts | null = null;
let outputBusy = false;
let configBusy = false;
let importBusy = false;
const active = new CaptureSession();

function createWindow(view: string, overlay = false) {
  const win = new BrowserWindow({ width: view === 'settings' ? 680 : 1120, height: view === 'settings' ? 600 : 780, minWidth: overlay ? 1 : 640, minHeight: overlay ? 1 : 480,
    show: false, frame: !overlay, resizable: !overlay, skipTaskbar: overlay, alwaysOnTop: overlay, backgroundColor: '#0a0a0a',
    icon: join(root, 'assets/icon.ico'), autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  void win.loadURL(`${baseURL}#${view}`);
  return win;
}
function showSettings() {
  if (!settingsWindow) {
    settingsWindow = createWindow('settings');
    settingsWindow.once('ready-to-show', () => settingsWindow?.show());
    settingsWindow.on('close', event => { if (!quitting) { event.preventDefault(); settingsWindow?.hide(); } });
  } else { settingsWindow.show(); settingsWindow.focus(); }
}
function clearCapture() {
  active.end(); data = null; image = null;
  const old = captureWindow; captureWindow = null;
  if (old && !old.isDestroyed()) old.destroy();
}
function showEditor() {
  const old = captureWindow; captureWindow = null; old?.destroy();
  const win = createWindow('editor'); captureWindow = win;
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.on('closed', () => { if (captureWindow === win) clearCapture(); });
}
async function beginCapture(request: CaptureRequest) {
  if (active.id) { captureWindow?.show(); captureWindow?.focus(); return; }
  const display = resolveDisplay(request, screen.getAllDisplays(), screen.getCursorScreenPoint());
  const { mode } = request;
  const id = randomUUID(); active.begin(id);
  settingsWindow?.hide();
  try {
    await new Promise(resolve => setTimeout(resolve, 220));
    const bitmap = await captureDisplay(display);
    if (!active.matches(id)) return;
    image = bitmap;
    const size = bitmap.getSize();
    data = { id, image: bitmap.toDataURL(), ...size, mode, displayId: display.id };
    if (mode === 'full') showEditor();
    else {
      const win = createWindow('region', true); captureWindow = win;
      win.setBounds(display.bounds); win.setAlwaysOnTop(true, 'screen-saver');
      win.once('ready-to-show', () => { win.show(); win.focus(); });
      win.on('closed', () => { if (captureWindow === win) clearCapture(); });
    }
  } catch (error) { if (active.matches(id)) clearCapture(); throw error; }
}
function report(error: unknown) { dialog.showErrorBox('Screenshot', error instanceof Error ? error.message : 'The operation failed. Please try again.'); }
const callbacks = { full: () => { void beginCapture({ mode: 'full', target: { kind: 'cursor' } }).catch(report); }, region: () => { void beginCapture({ mode: 'region', target: { kind: 'cursor' } }).catch(report); } };
function displayList() {
  return screen.getAllDisplays().map((d, i) => ({ id: d.id, label: `Display ${i + 1}${d.label ? ` · ${d.label}` : ''}`, bounds: d.bounds, width: Math.round(d.bounds.width * d.scaleFactor), height: Math.round(d.bounds.height * d.scaleFactor), scaleFactor: d.scaleFactor }));
}
function refreshTray() {
  tray.setContextMenu(Menu.buildFromTemplate([
    ...displayList().map(d => ({ label: `${d.label} (${d.width} × ${d.height})`, submenu: (['full', 'region'] as CaptureMode[]).map(mode => ({ label: mode === 'full' ? 'Full screen' : 'Select region', click: () => { void beginCapture({ mode, target: { kind: 'display', displayId: d.id } }).catch(report); } })) })),
    { type: 'separator' }, { label: 'Settings', click: showSettings }, { label: 'Quit', click: () => app.quit() },
  ]));
}
function assertSession(id: unknown) { if (!active.matches(id) || !image || !data) throw new Error('This capture session has ended.'); }
function handle(channel: string, role: 'settings' | 'capture' | 'any', action: (...args: any[]) => unknown) {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    try {
      const sender = event.sender;
      const allowed = role === 'settings' ? sender === settingsWindow?.webContents : role === 'capture' ? sender === captureWindow?.webContents : sender === settingsWindow?.webContents || sender === captureWindow?.webContents;
      if (!allowed || event.senderFrame !== sender.mainFrame || sender.getURL().split('#')[0] !== baseURL + (dev ? '/' : '')) throw new Error('Unauthorized request.');
      return { ok: true, value: await action(...args) };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Operation failed. Please try again.' }; }
  });
}

if (process.env.SCREENSHOT_TEST_USER_DATA) app.setPath('userData', process.env.SCREENSHOT_TEST_USER_DATA);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (captureWindow) { captureWindow.show(); captureWindow.focus(); } else showSettings(); });
  app.whenReady().then(async () => {
    configPath = join(app.getPath('userData'), 'settings.json');
    ({ settings, warning } = await loadSettings(configPath));
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [dev
      ? `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ${dev.replace('http:', 'ws:')}; object-src 'none'; frame-src 'none'`
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'"] } }));
    try { replaceShortcuts(globalShortcut, null, settings.shortcuts, callbacks); registered = settings.shortcuts; } catch (error) { warning += ` ${String(error)}`; }
    handle('settings', 'settings', () => ({ settings, warning }));
    handle('displays', 'settings', () => ({ displays: displayList(), defaultId: screen.getDisplayMatching(settingsWindow!.getBounds()).id }));
    handle('shortcuts', 'settings', async (next: Shortcuts) => {
      if (configBusy || outputBusy) throw new Error('Please wait for the current operation.'); configBusy = true;
      const old = registered;
      try {
        replaceShortcuts(globalShortcut, old, next, callbacks);
        try { await persistSettings(configPath, { ...settings, shortcuts: next }); }
        catch (error) { replaceShortcuts(globalShortcut, next, old ?? settings.shortcuts, callbacks); throw error; }
        settings = { ...settings, shortcuts: next }; registered = next; warning = ''; return settings;
      } finally { configBusy = false; }
    });
    handle('capture', 'settings', (request: unknown) => { if (!validateCaptureRequest(request)) throw new Error('Invalid capture request.'); return beginCapture(request); });
    handle('current', 'capture', () => data);
    handle('import-image', 'capture', async (id: string) => {
      assertSession(id);
      if (importBusy || outputBusy || data!.mode !== 'full') throw new Error('Please wait for the current operation.');
      importBusy = true;
      try {
        const result = await dialog.showOpenDialog(captureWindow!, { title: 'Insert image', defaultPath: app.getPath('pictures'), properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp'] }] });
        assertSession(id);
        if (result.canceled || !result.filePaths.length) return null;
        const imported = await readImportedImage(result.filePaths[0]);
        assertSession(id); return imported;
      } finally { importBusy = false; }
    });
    handle('cancel', 'capture', (id: string) => { assertSession(id); if (outputBusy) throw new Error('Please wait for export.'); clearCapture(); });
    handle('crop', 'capture', (id: string, rect: unknown) => {
      assertSession(id);
      if (data!.mode !== 'region' || !validRect(rect, data!.width, data!.height)) throw new Error('Select a non-empty region within the display.');
      image = image!.crop(rect); data = { ...data!, image: image.toDataURL(), ...image.getSize(), mode: 'full' }; showEditor();
    });
    handle('output', 'capture', async (id: string, action: string, png: unknown) => {
      assertSession(id);
      if (outputBusy || importBusy || configBusy || data!.mode !== 'full' || !['copy', 'save'].includes(action)) throw new Error('Export is not available.');
      outputBusy = true;
      try {
        const bytes = decodePng(png, data!.width, data!.height);
        const flattened = nativeImage.createFromBuffer(bytes);
        if (flattened.isEmpty()) throw new Error('Unable to decode PNG.');
        if (action === 'copy') { await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(bytes)], { type: 'image/png' }) })]); return 'copied'; }
        const result = await dialog.showSaveDialog(captureWindow!, { title: 'Save screenshot', defaultPath: join(settings.lastDirectory ?? app.getPath('pictures'), `Screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`), filters: [{ name: 'PNG image', extensions: ['png'] }], properties: ['showOverwriteConfirmation', 'createDirectory'] });
        if (result.canceled || !result.filePath) return 'cancelled';
        assertSession(id);
        await writeFile(result.filePath, bytes);
        settings = { ...settings, lastDirectory: dirname(result.filePath) };
        try { await persistSettings(configPath, settings); } catch { warning = 'Image saved, but the last folder could not be remembered.'; }
        return 'saved';
      } finally { outputBusy = false; }
    });
    tray = new Tray(join(root, 'assets/icon.ico'));
    tray.setToolTip('Screenshot');
    refreshTray();
    tray.on('double-click', showSettings);
    const displayChanged = () => { refreshTray(); settingsWindow?.webContents.send('displays-changed'); if (active.id) { clearCapture(); report(new Error('Display configuration changed. Please capture again.')); } };
    screen.on('display-added', displayChanged); screen.on('display-removed', displayChanged); screen.on('display-metrics-changed', displayChanged);
    showSettings();
  }).catch(report);
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => { quitting = true; globalShortcut.unregisterAll(); clearCapture(); tray?.destroy(); });
}
