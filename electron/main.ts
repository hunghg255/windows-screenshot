import { app, BrowserWindow, clipboard, ClipboardItem, dialog, globalShortcut, ipcMain, Menu, nativeImage, screen, session, Tray, type NativeImage } from 'electron';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { CaptureData, CaptureRequest, Settings, Shortcuts, Point, Rect } from '../shared/contracts';
import { validateCaptureRequest } from './display-target';
import { validRect } from '../shared/geometry';
import { captureDisplay } from './capture';
import { compositeDesktop } from './desktop-composite';
import { desktopLayout, desktopPixels, desktopRegion, intersects, type DesktopLayout } from '../shared/desktop-geometry';
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
const overlays = new Map<BrowserWindow, CaptureData>();
let desktop: DesktopLayout | null = null;
let selectionStart: Point | null = null;
let selectionOwner: BrowserWindow | null = null;
let selectionTimer: ReturnType<typeof setInterval> | null = null;
function resetSelection() { selectionStart = null; selectionOwner = null; if (selectionTimer) clearInterval(selectionTimer); selectionTimer = null; }
function closeOverlays() { resetSelection(); const windows = [...overlays.keys()]; overlays.clear(); for (const win of windows) if (!win.isDestroyed()) win.destroy(); }
function broadcastSelection(rect: Rect | null) { for (const win of overlays.keys()) win.webContents.send('selection-changed', rect); }
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
  active.end(); data = null; image = null; desktop = null; closeOverlays();
  const old = captureWindow; captureWindow = null;
  if (old && !old.isDestroyed()) old.destroy();
}
function showEditor() {
  const old = captureWindow; captureWindow = null; closeOverlays(); if (old && !old.isDestroyed()) old.destroy();
  const win = createWindow('editor'); captureWindow = win;
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.on('closed', () => { if (captureWindow === win) clearCapture(); });
}
async function beginCapture(request: CaptureRequest) {
  if (active.id) { captureWindow?.show(); captureWindow?.focus(); return; }
  const displays = screen.getAllDisplays();
  const layout = desktopLayout(displays);
  const { mode } = request;
  const id = randomUUID(); active.begin(id);
  settingsWindow?.hide();
  try {
    await new Promise(resolve => setTimeout(resolve, 220));
    const frames: NativeImage[] = [];
    for (const display of displays) {
      frames.push(await captureDisplay(display));
      if (!active.matches(id)) return;
    }
    desktop = layout;
    image = compositeDesktop(layout, frames);
    data = { id, image: mode === 'full' ? image.toDataURL() : '', width: layout.width, height: layout.height, mode };
    if (mode === 'full') showEditor();
    else {
      const ready: Promise<void>[] = [];
      for (let i = 0; i < displays.length; i++) {
        const display = displays[i], win = createWindow('region', true);
        overlays.set(win, { ...data, image: frames[i].toDataURL(), overlayBounds: display.bounds });
        captureWindow ??= win;
        win.setBounds(display.bounds); win.setAlwaysOnTop(true, 'screen-saver');
        ready.push(new Promise(resolve => { win.once('ready-to-show', resolve); win.once('closed', resolve); }));
        win.webContents.once('did-fail-load', () => { if (overlays.has(win)) clearCapture(); });
        win.on('closed', () => { if (overlays.has(win)) clearCapture(); });
        win.webContents.on('render-process-gone', () => { if (overlays.has(win)) clearCapture(); });
      }
      await Promise.all(ready);
      if (!active.matches(id)) return;
      for (const win of overlays.keys()) win.showInactive();
      const cursor = screen.getCursorScreenPoint();
      const focused = [...overlays.keys()].find(win => { const b = overlays.get(win)!.overlayBounds!; return cursor.x >= b.x && cursor.x < b.x + b.width && cursor.y >= b.y && cursor.y < b.y + b.height; });
      (focused ?? captureWindow)?.focus();
    }
  } catch (error) { if (active.matches(id)) clearCapture(); throw error; }
}
function finishCrop(id: string, rect: unknown) {
  assertSession(id);
  if (data!.mode !== 'region' || !desktop || !validRect(rect, data!.width, data!.height) || !desktop.displays.some(d => intersects(rect, desktopPixels(d.bounds, desktop!)))) throw new Error('Select a non-empty region containing a screen.');
  image = image!.crop(rect); data = { id, image: image.toDataURL(), ...image.getSize(), mode: 'full' }; showEditor();
}
function report(error: unknown) { dialog.showErrorBox('Screenshot', error instanceof Error ? error.message : 'The operation failed. Please try again.'); }
const callbacks = { full: () => { void beginCapture({ mode: 'full' }).catch(report); }, region: () => { void beginCapture({ mode: 'region' }).catch(report); } };
function refreshTray() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Full screen (all displays)', click: callbacks.full }, { label: 'Select region across displays', click: callbacks.region },
    { type: 'separator' }, { label: 'Settings', click: showSettings }, { label: 'Quit', click: () => app.quit() },
  ]));
}
function assertSession(id: unknown) { if (!active.matches(id) || !image || !data) throw new Error('This capture session has ended.'); }
function handle(channel: string, role: 'settings' | 'capture' | 'any', action: (...args: any[]) => unknown, withSender = false) {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    try {
      const sender = event.sender;
      const captureSender = sender === captureWindow?.webContents || [...overlays.keys()].some(win => win.webContents === sender);
      const allowed = role === 'settings' ? sender === settingsWindow?.webContents : role === 'capture' ? captureSender : sender === settingsWindow?.webContents || captureSender;
      if (!allowed || event.senderFrame !== sender.mainFrame || sender.getURL().split('#')[0] !== baseURL + (dev ? '/' : '')) throw new Error('Unauthorized request.');
      return { ok: true, value: await action(...(withSender ? [sender, ...args] : args)) };
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
    handle('current', 'capture', (sender: Electron.WebContents) => overlays.get(BrowserWindow.fromWebContents(sender)!) ?? data, true);
    handle('selection', 'capture', (sender: Electron.WebContents, id: string, phase: string) => {
      assertSession(id);
      const win = BrowserWindow.fromWebContents(sender);
      if (!win || !overlays.has(win) || !desktop || data!.mode !== 'region') throw new Error('Selection is not available.');
      if (phase === 'start') {
        if (selectionOwner) throw new Error('A selection is already active.');
        selectionOwner = win; selectionStart = screen.getCursorScreenPoint();
        broadcastSelection(desktopRegion(selectionStart, selectionStart, desktop));
        selectionTimer = setInterval(() => { if (selectionStart && desktop) broadcastSelection(desktopRegion(selectionStart, screen.getCursorScreenPoint(), desktop)); }, 16);
      } else if (phase === 'reset' || phase === 'end') {
        if (selectionOwner !== win || !selectionStart) throw new Error('No active selection in this window.');
        const rect = desktopPixels(desktopRegion(selectionStart, screen.getCursorScreenPoint(), desktop), desktop);
        resetSelection(); broadcastSelection(null);
        if (phase === 'end' && rect.width && rect.height) finishCrop(id, rect);
      } else throw new Error('Invalid selection action.');
    }, true);
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
    handle('crop', 'capture', finishCrop);
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
    const displayChanged = () => { refreshTray(); if (active.id) { clearCapture(); report(new Error('Display configuration changed. Please capture again.')); } };
    screen.on('display-added', displayChanged); screen.on('display-removed', displayChanged); screen.on('display-metrics-changed', displayChanged);
    showSettings();
  }).catch(report);
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => { quitting = true; globalShortcut.unregisterAll(); clearCapture(); tray?.destroy(); });
}
