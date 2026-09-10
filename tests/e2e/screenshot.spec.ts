import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

async function launch() {
  const userData = await mkdtemp(join(tmpdir(), 'screenshot-e2e-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), SCREENSHOT_TEST_USER_DATA: userData }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.SCREENSHOT_EXECUTABLE, args: process.env.SCREENSHOT_EXECUTABLE ? [] : [resolve('.')], env });
  const settings = await app.firstWindow();
  await expect(settings.getByRole('heading', { name: 'Screenshot' })).toBeVisible();
  return { app, settings, userData };
}

test('shortcut persistence, actual registration conflict and 30 clean capture sessions', async ({}, info) => {
  test.setTimeout(120000);
  const { app, settings, userData } = await launch();
  try {
    const baseline = await settings.evaluate(() => window.screenshot.updateShortcuts({ full: 'Ctrl+Alt+Shift+F21', region: 'Ctrl+Alt+Shift+F22' })); expect(baseline.ok).toBe(true);
    await app.evaluate(({ globalShortcut }) => globalShortcut.register('Ctrl+Alt+Shift+J', () => {}));
    const conflict = await settings.evaluate(() => window.screenshot.updateShortcuts({ full: 'Ctrl+Alt+Shift+J', region: 'Ctrl+Alt+Shift+K' }));
    expect(conflict.ok).toBe(false);
    expect(await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Ctrl+Alt+Shift+F21') && globalShortcut.isRegistered('Ctrl+Alt+Shift+F22'))).toBe(true);
    await app.evaluate(({ globalShortcut }) => globalShortcut.unregister('Ctrl+Alt+Shift+J'));
    const updated = await settings.evaluate(() => window.screenshot.updateShortcuts({ full: 'Ctrl+Alt+Shift+F23', region: 'Ctrl+Alt+Shift+F24' })); expect(updated.ok).toBe(true);
    expect(JSON.parse(await readFile(join(userData, 'settings.json'), 'utf8')).shortcuts).toEqual({ full: 'Ctrl+Alt+Shift+F23', region: 'Ctrl+Alt+Shift+F24' });
    const readings: { cycle: number; workingSetKB: number; windows: number }[] = [];
    for (let i = 0; i < 30; i++) {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
      const editor = await capture(app, settings, 'Full screen'); await expect(editor.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled();
      const closed = editor.waitForEvent('close'); await editor.keyboard.press('Escape').catch(error => { if (!editor.isClosed()) throw error; }); await closed;
      const state = await app.evaluate(({ app, BrowserWindow }) => ({ workingSetKB: app.getAppMetrics().reduce((sum, metric) => sum + metric.memory.workingSetSize, 0), windows: BrowserWindow.getAllWindows().length }));
      expect(state.windows).toBe(1); if ([0, 9, 19, 29].includes(i)) readings.push({ cycle: i + 1, ...state });
    }
    const displays = await app.evaluate(({ screen }) => screen.getAllDisplays().map(d => ({ bounds: d.bounds, scaleFactor: d.scaleFactor, size: d.size })));
    await info.attach('capture-cycle-metrics', { body: JSON.stringify({ displays, readings }, null, 2), contentType: 'application/json' });
    console.log('Capture cycles:', JSON.stringify({ displays, readings }));
  } finally { await app.close(); }
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), SCREENSHOT_TEST_USER_DATA: userData }; delete env.ELECTRON_RUN_AS_NODE;
  const restarted = await electron.launch({ executablePath: process.env.SCREENSHOT_EXECUTABLE, args: process.env.SCREENSHOT_EXECUTABLE ? [] : [resolve('.')], env });
  try { await expect((await restarted.firstWindow()).getByLabel('full shortcut')).toHaveValue('Ctrl+Alt+Shift+F23'); } finally { await restarted.close(); }
});
async function capture(app: ElectronApplication, settings: Page, mode: 'Full screen' | 'Select region') {
  const window = app.waitForEvent('window'); await settings.getByRole('button', { name: mode, exact: true }).click();
  const page = await window; await page.waitForLoadState('domcontentloaded'); return page;
}
test('real desktop capture, annotations, clipboard, save integration and clean cancellation', async () => {
  const { app, settings, userData } = await launch();
  try {
    expect(await settings.evaluate(() => Object.keys(window.screenshot).sort())).toEqual(['cancel', 'capture', 'crop', 'current', 'displays', 'importImage', 'onDisplaysChanged', 'output', 'settings', 'updateShortcuts'].sort());
    expect(await settings.evaluate(() => window.screenshot.importImage('invalid'))).toEqual({ ok: false, error: 'Unauthorized request.' });
    expect(await settings.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined');
    const editor = await capture(app, settings, 'Full screen');
    await expect(editor.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled();
    const snapshot = await editor.evaluate(async () => { const r = await window.screenshot.current(); if (!r.ok || !r.value) throw new Error('Missing capture'); return r.value; });
    const displays = await app.evaluate(({ screen }) => screen.getAllDisplays().map(d => ({ width: Math.round(d.bounds.width * d.scaleFactor), height: Math.round(d.bounds.height * d.scaleFactor) })));
    expect(displays).toContainEqual({ width: snapshot.width, height: snapshot.height });
    const canvas = editor.getByLabel('Screenshot annotation canvas'); const box = (await canvas.boundingBox())!;
    for (const label of ['Arrow', 'Rectangle (Shift for square)', 'Circle', 'Freehand', 'Blur pen']) {
      await editor.getByLabel(label, { exact: true }).click();
      await editor.mouse.move(box.x + box.width * .2, box.y + box.height * .3); await editor.mouse.down();
      await editor.mouse.move(box.x + box.width * .6, box.y + box.height * .65, { steps: 8 }); await editor.mouse.up();
    }
    const forged = await editor.evaluate(() => window.screenshot.output('stale', 'copy', 'invalid')); expect(forged.ok).toBe(false);
    await editor.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(editor.getByRole('status')).toHaveText('Image copied to clipboard.');
    const clipboard = await app.evaluate(async ({ clipboard, nativeImage }) => {
      const items = await clipboard.read();
      for (const item of items) if (item.types.includes('image/png')) {
        const blob = await item.getType('image/png'); const bytes = Buffer.from(await (blob as Blob).arrayBuffer());
        const image = nativeImage.createFromBuffer(bytes);
        return { size: image.getSize(), hash: process.getBuiltinModule('node:crypto').createHash('sha256').update(image.toBitmap()).digest('hex') as string };
      }
      throw new Error('No PNG in Windows clipboard');
    });
    expect(clipboard.size).toEqual({ width: snapshot.width, height: snapshot.height });
    const originalHash = await app.evaluate(({ nativeImage }, data) => process.getBuiltinModule('node:crypto').createHash('sha256').update(nativeImage.createFromDataURL(data).toBitmap()).digest('hex') as string, snapshot.image);
    expect(clipboard.hash).not.toBe(originalHash);
    // Stub only the native file picker; the real PNG encoder, IPC, filesystem and config remain in use.
    const savePath = join(userData, 'áº¢nh chá»¥p.png');
    await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, savePath);
    await editor.getByRole('button', { name: 'Save', exact: true }).click(); await expect(editor.getByRole('status')).toHaveText('PNG saved.');
    const savedHash = await app.evaluate(({ nativeImage }, path) => process.getBuiltinModule('node:crypto').createHash('sha256').update(nativeImage.createFromPath(path).toBitmap()).digest('hex') as string, savePath);
    expect(savedHash).toBe(clipboard.hash);
    await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' }); });
    await editor.getByRole('button', { name: 'Save', exact: true }).click(); await expect(editor.getByRole('status')).toContainText('Save cancelled');
    await editor.screenshot({ path: 'test-results/editor.png' });
    const closed = editor.waitForEvent('close'); await editor.getByRole('button', { name: 'Cancel', exact: true }).click(); await closed;
    expect(app.windows()).toHaveLength(1);
  } finally { await app.close(); }
});

test('region capture uses frozen pixels and Escape releases the session', async () => {
  const { app, settings } = await launch();
  try {
    const overlay = await capture(app, settings, 'Select region');
    await expect(overlay.getByAltText('Frozen screen capture')).toBeVisible();
    const bitmap = await overlay.evaluate(async () => { const r = await window.screenshot.current(); return r.ok ? r.value : null; });
    const viewport = overlay.viewportSize() ?? await overlay.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    const editorPromise = app.waitForEvent('window');
    await overlay.mouse.move(viewport.width * .6, viewport.height * .6); await overlay.mouse.down();
    await overlay.mouse.move(viewport.width * .2, viewport.height * .2); await overlay.mouse.up();
    const editor = await editorPromise; await expect(editor.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled();
    const crop = await editor.evaluate(async () => { const r = await window.screenshot.current(); return r.ok ? r.value : null; });
    expect(Math.abs(crop!.width - bitmap!.width * .4)).toBeLessThanOrEqual(3);
    expect(Math.abs(crop!.height - bitmap!.height * .4)).toBeLessThanOrEqual(3);
    const closed = editor.waitForEvent('close'); await editor.keyboard.press('Escape').catch(error => { if (!editor.isClosed()) throw error; }); await closed;
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
    const another = await capture(app, settings, 'Select region'); await expect(another.getByAltText('Frozen screen capture')).toBeVisible();
    const cancelled = another.waitForEvent('close'); await another.keyboard.press('Escape').catch(error => { if (!another.isClosed()) throw error; }); await cancelled;
  } finally { await app.close(); }
});

test('isolated frame fallback recovers from an undersized thumbnail', async () => {
  const { app, settings } = await launch();
  try {
    await app.evaluate(({ desktopCapturer }) => {
      const original = desktopCapturer.getSources.bind(desktopCapturer);
      desktopCapturer.getSources = async options => {
        desktopCapturer.getSources = original;
        return (await original(options)).map(source => ({ ...source, thumbnail: source.thumbnail.resize({ width: 150 }) }));
      };
    });
    const captured = await settings.evaluate(() => window.screenshot.capture({ mode: 'full', target: { kind: 'cursor' } }));
    expect(captured).toEqual({ ok: true, value: undefined });
    await expect.poll(() => app.windows().some(page => page.url().endsWith('#editor'))).toBe(true);
    const editor = app.windows().find(page => page.url().endsWith('#editor'))!;
    await expect(editor.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled();
    const result = await editor.evaluate(async () => { const r = await window.screenshot.current(); return r.ok && r.value ? { width: r.value.width, height: r.value.height } : null; });
    expect(result!.width).toBeGreaterThan(150);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(2);
  } finally { await app.close(); }
});

