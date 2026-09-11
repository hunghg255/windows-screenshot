import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
async function launch() {
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)), SCREENSHOT_TEST_USER_DATA: await mkdtemp(join(tmpdir(), 'screenshot-transform-')) }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.SCREENSHOT_EXECUTABLE, args: process.env.SCREENSHOT_EXECUTABLE ? [] : [resolve('.')], env });
  const settings = await app.firstWindow(); await expect(settings.getByRole('button', { name: 'Full screen', exact: true })).toBeEnabled();
  const next = app.waitForEvent('window'); await settings.getByRole('button', { name: 'Full screen', exact: true }).click();
  const page = await next; await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled(); return { app, page };
}
async function drag(page: Page, x: number, y: number, dx: number, dy: number) { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 5 }); await page.mouse.up(); }
const selection = (page: Page) => page.getByLabel('Selected object', { exact: true });
test('move and resize all drawing types with eight handles; cancel restores snapshot', async () => {
  const { app, page } = await launch();
  try {
    const canvas = page.getByLabel('Screenshot annotation canvas'), b = (await canvas.boundingBox())!;
    const x = b.x + 100, y = b.y + 100;
    for (const label of ['Arrow', 'Rectangle (Shift for square)', 'Circle', 'Freehand', 'Blur pen']) {
      await page.getByLabel(label, { exact: true }).click(); await drag(page, x, y, 160, 100);
      await page.getByLabel('Select', { exact: true }).click(); await page.mouse.click(x, label === 'Circle' ? y + 80 : y);
      await expect(selection(page)).toBeVisible(); await expect(page.getByRole('button', { name: /^Resize / })).toHaveCount(8);
      const before = (await selection(page).boundingBox())!;
      await drag(page, before.x + before.width / 2, before.y + before.height / 2, 35, 30);
      const moved = (await selection(page).boundingBox())!; expect(moved.x - before.x).toBeCloseTo(35, 0); expect(moved.y - before.y).toBeCloseTo(30, 0);
      for (const handle of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
        const button = page.getByRole('button', { name: `Resize ${handle}`, exact: true }), h = (await button.boundingBox())!;
        await drag(page, h.x + h.width / 2, h.y + h.height / 2, handle.includes('w') ? -5 : handle.includes('e') ? 5 : 0, handle.includes('n') ? -5 : handle.includes('s') ? 5 : 0);
      }
      const grown = (await selection(page).boundingBox())!; expect(grown.width).toBeGreaterThan(moved.width); expect(grown.height).toBeGreaterThan(moved.height);
      await page.mouse.move(grown.x + grown.width / 2, grown.y + grown.height / 2); await page.mouse.down(); await page.mouse.move(grown.x + grown.width / 2 + 45, grown.y + grown.height / 2 + 20);
      await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeDisabled(); await page.keyboard.press('Escape'); await page.mouse.up();
      expect(await selection(page).boundingBox()).toEqual(grown); expect(page.isClosed()).toBe(false);
      await page.mouse.move(grown.x + grown.width / 2, grown.y + grown.height / 2); await page.mouse.down(); await page.mouse.move(grown.x + grown.width / 2 + 20, grown.y + grown.height / 2 + 15);
      await canvas.dispatchEvent('pointercancel'); await page.mouse.up(); expect(await selection(page).boundingBox()).toEqual(grown);
      if (label === 'Blur pen') {
        const beforeResize = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
        await page.mouse.move(grown.x + grown.width / 2, grown.y + grown.height / 2); await page.mouse.down(); await page.mouse.move(grown.x + grown.width / 2 + 20, grown.y + grown.height / 2 + 15);
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#editor'))!.setSize(1200, 850));
        await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled(); await page.mouse.up();
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        expect(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL()) === beforeResize).toBe(true);
      }
      await page.getByRole('button', { name: 'Delete selected object' }).click(); await expect(selection(page)).toHaveCount(0);
    }
  } finally { await app.close(); }
});
test('glyph move and uniform edge resize preserve text editing and emoji size', async () => {
  const { app, page } = await launch();
  try {
    const b = (await page.getByLabel('Screenshot annotation canvas').boundingBox())!;
    await page.getByLabel('Text', { exact: true }).click(); await page.mouse.click(b.x + 100, b.y + 100);
    await page.getByLabel('Content', { exact: true }).fill('Tiếng Việt\nHai dòng'); await page.getByRole('button', { name: 'Done', exact: true }).click();
    const original = (await selection(page).boundingBox())!;
    await drag(page, original.x + original.width / 2, original.y + original.height / 2, 40, 25);
    const east = (await page.getByLabel('Resize e', { exact: true }).boundingBox())!;
    await drag(page, east.x + 8, east.y + 8, 50, 0);
    expect(Number(await page.getByLabel('Brush size').inputValue())).toBeGreaterThan(32);
    const resized = (await selection(page).boundingBox())!;
    await page.mouse.dblclick(resized.x + resized.width / 2, resized.y + resized.height / 2);
    await expect(page.getByLabel('Content', { exact: true })).toHaveValue('Tiếng Việt\nHai dòng'); await page.getByLabel('Content', { exact: true }).press('Escape');
    await page.getByLabel('Emoji', { exact: true }).click(); await page.getByRole('button', { name: 'Woman technologist', exact: true }).click(); await page.mouse.click(b.x + 380, b.y + 200);
    const south = (await page.getByLabel('Resize s', { exact: true }).boundingBox())!;
    await drag(page, south.x + 8, south.y + 8, 0, 30);
    expect(Number(await page.getByLabel('Brush size').inputValue())).toBeGreaterThan(48);
    await expect(page.getByLabel('Stroke color')).toBeDisabled();
    await page.getByRole('button', { name: 'Copy', exact: true }).click(); await expect(page.getByRole('status')).toContainText('copied');
    const png = await page.getByLabel('Screenshot annotation canvas').evaluate((element: HTMLCanvasElement) => element.toDataURL());
    const same = await app.evaluate(async ({ clipboard, nativeImage }, preview) => {
      const expected = nativeImage.createFromDataURL(preview).toBitmap();
      for (const item of await clipboard.read()) if (item.types.includes('image/png')) {
        const blob = await item.getType('image/png');
        return expected.equals(nativeImage.createFromBuffer(Buffer.from(await (blob as Blob).arrayBuffer())).toBitmap());
      }
      return false;
    }, png);
    expect(same).toBe(true);
    await page.screenshot({ path: 'test-results/transform.png' });
  } finally { await app.close(); }
});
