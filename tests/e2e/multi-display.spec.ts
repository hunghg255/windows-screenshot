import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
async function launch() {
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), SCREENSHOT_TEST_USER_DATA: await mkdtemp(join(tmpdir(), 'screenshot-desktop-')) }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [resolve('.')], env });
  const settings = await app.firstWindow(); await expect(settings.getByRole('button', { name: 'Full screen', exact: true })).toBeEnabled();
  await app.evaluate(({ screen, desktopCapturer, nativeImage }) => {
    const base = screen.getPrimaryDisplay();
    const displays = [
      { ...base, id: 1, bounds: { x: 0, y: 40, width: 320, height: 240 }, scaleFactor: 1 },
      { ...base, id: 2, bounds: { x: 320, y: 0, width: 320, height: 280 }, scaleFactor: 1.5 },
      { ...base, id: 3, bounds: { x: 640, y: 40, width: 200, height: 320 }, scaleFactor: 2 },
    ];
    screen.getAllDisplays = () => displays;
    screen.getCursorScreenPoint = () => ({ x: 100, y: 100 });
    desktopCapturer.getSources = async () => displays.map((d, i) => {
      const width = d.bounds.width * d.scaleFactor, height = d.bounds.height * d.scaleFactor;
      const bytes = Buffer.alloc(width * height * 4); for (let p = 0; p < bytes.length; p += 4) { bytes[p + (2 - i)] = 255; bytes[p + 3] = 255; }
      return { id: String(d.id), name: String(d.id), display_id: String(d.id), appIcon: nativeImage.createEmpty(), thumbnail: nativeImage.createFromBitmap(bytes, { width, height }) };
    });
  });
  return { app, settings };
}
test('three-screen composite, shared selection, crop and cleanup', async () => {
  const { app, settings } = await launch();
  try {
    const open = app.waitForEvent('window'); await settings.getByRole('button', { name: 'Full screen', exact: true }).click();
    const editor = await open; await expect(editor.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled();
    const data = await editor.evaluate(async () => { const r = await window.screenshot.current(); if (!r.ok || !r.value) throw new Error('Missing'); return r.value; });
    expect([data.width, data.height]).toEqual([1680, 720]);
    const samples = await app.evaluate(({ nativeImage }, image) => {
      const bytes = nativeImage.createFromDataURL(image).toBitmap(); return [[10, 10], [100, 100], [700, 100], [1400, 100]].map(([x, y]) => [...bytes.subarray((y * 1680 + x) * 4, (y * 1680 + x) * 4 + 4)]);
    }, data.image);
    expect(samples).toEqual([[0, 0, 0, 0], [0, 0, 255, 255], [0, 255, 0, 255], [255, 0, 0, 255]]);
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
    await settings.getByRole('button', { name: 'Select region', exact: true }).click();
    await expect.poll(() => app.windows().filter(p => p.url().endsWith('#region')).length).toBe(3);
    const overlays = app.windows().filter(p => p.url().endsWith('#region'));
    for (const overlay of overlays) await expect(overlay.getByAltText('Frozen screen capture')).toBeVisible();
    const first = overlays[0];
    expect(await first.evaluate(async () => { const r = await window.screenshot.current(); return r.ok && r.value ? window.screenshot.selection(r.value.id, 'start') : null; })).toMatchObject({ ok: true });
    await app.evaluate(({ screen }) => { screen.getCursorScreenPoint = () => ({ x: 740, y: 220 }); });
    await expect.poll(() => first.locator('.selection-box').evaluate(el => (el as HTMLElement).style.width)).toBe('200%');
    const next = app.waitForEvent('window');
    await first.evaluate(async () => { const r = await window.screenshot.current(); if (r.ok && r.value) await window.screenshot.selection(r.value.id, 'end'); }).catch(error => { if (!first.isClosed()) throw error; });
    const cropped = await next; await expect(cropped.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled();
    expect(await cropped.evaluate(async () => { const r = await window.screenshot.current(); return r.ok && r.value ? [r.value.width, r.value.height] : null; })).toEqual([1280, 240]);
    expect(app.windows().filter(p => p.url().endsWith('#region'))).toHaveLength(0);
    expect(await settings.evaluate(() => window.screenshot.selection('stale', 'start'))).toMatchObject({ ok: false });
  } finally { await app.close(); }
});
test('Line draw, resize, copy and header remain usable at minimum width', async () => {
  const { app, settings } = await launch();
  try {
    const open = app.waitForEvent('window'); await settings.getByRole('button', { name: 'Full screen', exact: true }).click();
    const editor = await open; await expect(editor.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled();
    for (const width of [640, 800, 1120]) {
      await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#editor'))!.setSize(width, 780), width);
      await expect.poll(() => editor.evaluate(() => {
        const tools = document.querySelector('.toolbar-tools')!.getBoundingClientRect(), actions = document.querySelector('.toolbar-actions')!.getBoundingClientRect();
        const root = document.querySelector('.toolbar-tools')!, rows = [...root.children].map(el => el.getBoundingClientRect());
        return actions.right <= innerWidth && tools.right <= actions.left && Math.abs(tools.top - actions.top) < 1 && root.scrollWidth <= root.clientWidth && rows.length === 2 && rows[1].top >= rows[0].bottom;
      })).toBe(true);
      for (const name of ['Copy', 'Save', 'Cancel']) { const button = editor.getByRole('button', { name, exact: true }); await expect(button).toBeInViewport(); await expect(button).toHaveText(''); await expect(button).toHaveAttribute('title', /.+/); }
      if (width === 640) await editor.screenshot({ path: 'test-results/header-640.png' });
    }
    await editor.getByLabel('Line', { exact: true }).click();
    const canvas = editor.getByLabel('Screenshot annotation canvas'), b = (await canvas.boundingBox())!;
    await editor.mouse.move(b.x + 70, b.y + 100); await editor.mouse.down(); await editor.mouse.move(b.x + 250, b.y + 150); await editor.mouse.up();
    await editor.getByLabel('Select', { exact: true }).click(); await editor.mouse.click(b.x + 160, b.y + 125);
    await expect(editor.locator('.annotation-selection')).toBeVisible();
    const handle = editor.getByLabel('Resize se', { exact: true });
    await expect(handle).toBeVisible(); { const h = (await handle.boundingBox())!; await editor.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await editor.mouse.down(); await editor.mouse.move(h.x + 40, h.y + 20); await editor.mouse.up(); }
    await editor.getByRole('button', { name: 'Copy', exact: true }).click(); await expect(editor.getByRole('status')).toContainText('copied');
    await expect(editor.getByRole('status')).toHaveCSS('font-weight', '700');
    await expect(editor.getByRole('status')).toHaveCSS('color', 'rgb(74, 222, 128)');
    await editor.screenshot({ path: 'test-results/line-header.png' });
    await editor.getByLabel('Delete selected object', { exact: true }).click(); await expect(editor.locator('.annotation-selection')).toHaveCount(0);
  } finally { await app.close(); }
});

test('selection rejects gaps and wrong owners, resets, and cancels on display change', async () => {
  const { app, settings } = await launch();
  try {
    await app.evaluate(({ dialog }) => { dialog.showErrorBox = () => {}; });
    await settings.getByRole('button', { name: 'Select region', exact: true }).click();
    await expect.poll(() => app.windows().filter(p => p.url().endsWith('#region')).length).toBe(3);
    const overlays = app.windows().filter(p => p.url().endsWith('#region'));
    for (const page of overlays) await expect(page.getByAltText('Frozen screen capture')).toBeVisible();
    const id = await overlays[0].evaluate(async () => { const r = await window.screenshot.current(); if (!r.ok || !r.value) throw new Error('Missing'); return r.value.id; });
    expect(await overlays[0].evaluate(id => window.screenshot.crop(id, { x: 0, y: 0, width: 10, height: 10 }), id)).toMatchObject({ ok: false });
    expect(await overlays[0].evaluate(id => window.screenshot.selection(id, 'start'), id)).toMatchObject({ ok: true });
    expect(await overlays[1].evaluate(id => window.screenshot.selection(id, 'end'), id)).toMatchObject({ ok: false });
    expect(await overlays[0].evaluate(id => window.screenshot.selection(id, 'reset'), id)).toMatchObject({ ok: true });
    await expect.poll(() => overlays[0].locator('.selection-box').evaluate(el => (el as HTMLElement).style.inset)).toBe('0px');
    await overlays[0].evaluate(id => window.screenshot.selection(id, 'start'), id);
    await app.evaluate(({ screen }) => { screen.emit('display-metrics-changed', {}, screen.getPrimaryDisplay(), ['scaleFactor']); });
    await expect.poll(() => app.windows().length).toBe(1);
  } finally { await app.close(); }
});
