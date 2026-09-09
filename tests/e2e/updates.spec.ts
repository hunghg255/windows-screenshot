import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
async function launch() {
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), SCREENSHOT_TEST_USER_DATA: await mkdtemp(join(tmpdir(), 'screenshot-updates-')) }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.SCREENSHOT_EXECUTABLE, args: process.env.SCREENSHOT_EXECUTABLE ? [] : [resolve('.')], env });
  const settings = await app.firstWindow(); await expect(settings.getByLabel('Capture display')).toBeEnabled();
  return { app, settings };
}
async function capture(app: ElectronApplication, settings: Page, mode = 'Full screen') {
  const opened = app.waitForEvent('window'); await settings.getByRole('button', { name: mode, exact: true }).click();
  const editor = await opened; await expect(editor.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled(); return editor;
}
async function close(editor: Page) {
  const closed = editor.waitForEvent('close'); await editor.getByRole('button', { name: 'Cancel', exact: true }).click().catch(error => { if (!editor.isClosed()) throw error; }); await closed;
}
test('explicit target captures both physical displays independent of Settings location', async () => {
  const { app, settings } = await launch();
  try {
    const list = await settings.evaluate(async () => { const r = await window.screenshot.displays(); if (!r.ok) throw new Error(r.error); return r.value.displays; });
    test.skip(list.length < 2, 'Requires two physical displays.');
    for (const target of list.slice(0, 2)) {
      const other = list.find(d => d.id !== target.id)!;
      await app.evaluate(({ BrowserWindow }, b) => { const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#settings'))!; win.setPosition(b.x + 40, b.y + 40); win.show(); }, other.bounds);
      await settings.getByLabel('Capture display').selectOption(String(target.id));
      const editor = await capture(app, settings);
      const data = await editor.evaluate(async () => { const r = await window.screenshot.current(); return r.ok && r.value ? { id: r.value.displayId, width: r.value.width, height: r.value.height } : null; });
      expect(data).toEqual({ id: target.id, width: target.width, height: target.height }); await close(editor);
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
    const rejected = await settings.evaluate(() => window.screenshot.capture({ mode: 'full', target: { kind: 'display', displayId: 999999999 } })); expect(rejected.ok).toBe(false);
    const target = list.find(d => d.bounds.x < 0) ?? list[1];
    await settings.getByLabel('Capture display').selectOption(String(target.id));
    const opened = app.waitForEvent('window'); await settings.getByRole('button', { name: 'Select region', exact: true }).click();
    const overlay = await opened; await expect(overlay.getByAltText('Frozen screen capture')).toBeVisible();
    const b = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#region'))!.getBounds()); expect(b).toEqual(target.bounds);
    const next = app.waitForEvent('window'); await overlay.mouse.move(30, 40); await overlay.mouse.down(); await overlay.mouse.move(230, 140); await overlay.mouse.up();
    const editor = await next; await expect(editor.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled();
    const crop = await editor.evaluate(async () => { const r = await window.screenshot.current(); return r.ok && r.value ? { width: r.value.width, height: r.value.height } : null; });
    expect(crop).toEqual({ width: Math.round(200 * target.scaleFactor), height: Math.round(100 * target.scaleFactor) });
  } finally { await app.close(); }
});
test('Text and Emoji create, edit, discard, resize, select, delete and copy', async () => {
  const { app, settings } = await launch();
  try {
    const editor = await capture(app, settings), canvas = editor.getByLabel('Screenshot annotation canvas'), b = (await canvas.boundingBox())!;
    const x = b.x + 70, y = b.y + 80;
    await editor.getByLabel('Text', { exact: true }).click(); await editor.mouse.click(x, y);
    const content = editor.getByLabel('Content', { exact: true }); await content.fill('Tiếng Việt\nHello');
    await expect(editor.getByRole('button', { name: 'Copy', exact: true })).toBeDisabled();
    await content.press('Control+Enter'); await expect(content).toHaveCount(0);
    await expect(editor.getByRole('button', { name: 'Delete selected object' })).toBeEnabled();
    await editor.mouse.dblclick(x + 5, y + 8); await expect(content).toHaveValue('Tiếng Việt\nHello');
    await content.fill('Discard this'); await editor.screenshot({ path: 'test-results/text-panel.png' }); await editor.getByRole('button', { name: 'Close text editor', exact: true }).click();
    await editor.mouse.dblclick(x + 5, y + 8); await expect(content).toHaveValue('Tiếng Việt\nHello');
    await content.fill('Chào bạn'); await editor.getByRole('button', { name: 'Done', exact: true }).click();
    await editor.getByLabel('Brush size').fill('60');
    await editor.getByLabel('Emoji', { exact: true }).click(); await expect(editor.getByLabel('Emoji picker', { exact: true })).toBeVisible(); await editor.screenshot({ path: 'test-results/emoji-panel.png' }); await editor.getByRole('button', { name: 'Close emoji picker', exact: true }).click(); await expect(editor.getByLabel('Emoji picker', { exact: true })).toHaveCount(0); await editor.getByLabel('Emoji', { exact: true }).click();
    await editor.getByRole('button', { name: 'Grinning face', exact: true }).click();
    await editor.mouse.click(x + 240, y + 80);
    await expect(editor.getByLabel('Stroke color')).toBeDisabled(); await editor.getByLabel('Brush size').fill('96');
    await editor.getByRole('button', { name: 'Copy', exact: true }).click(); await expect(editor.getByRole('status')).toContainText('copied');
    await editor.screenshot({ path: 'test-results/text-emoji.png' });
    await editor.getByRole('button', { name: 'Delete selected object' }).click(); await expect(editor.getByRole('button', { name: 'Delete selected object' })).toBeDisabled();
    await editor.getByLabel('Emoji', { exact: true }).click(); await editor.getByRole('button', { name: 'Grinning face', exact: true }).press('Escape'); await expect(editor.getByLabel('Emoji picker', { exact: true })).toHaveCount(0);
    expect(editor.isClosed()).toBe(false);
    await editor.getByLabel('Text', { exact: true }).click(); await editor.mouse.click(x, y + 180); await content.fill('a'.repeat(2001)); await expect(editor.getByRole('alert')).toContainText('2,000'); await expect(editor.getByRole('button', { name: 'Done', exact: true })).toBeDisabled(); await content.press('Escape');
    await close(editor);
  } finally { await app.close(); }
});


