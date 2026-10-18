import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

async function launch() {
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)), SCREENSHOT_TEST_USER_DATA: await mkdtemp(join(tmpdir(), 'screenshot-rotation-')) }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.SCREENSHOT_EXECUTABLE, args: process.env.SCREENSHOT_EXECUTABLE ? [] : [resolve('.')], env });
  const settings = await app.firstWindow(); await expect(settings.getByRole('button', { name: 'Full screen', exact: true })).toBeEnabled();
  const next = app.waitForEvent('window'); await settings.getByRole('button', { name: 'Full screen', exact: true }).click();
  const page = await next; await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled();
  return { app, page };
}
const selected = (page: Page) => page.getByLabel('Selected object', { exact: true });
async function drag(page: Page, x: number, y: number, dx: number, dy: number) { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up(); }
async function turn(page: Page, degrees: number, snap = false, release = true) {
  const b = (await selected(page).boundingBox())!, h = (await page.getByRole('button', { name: 'Rotate selected object', exact: true }).boundingBox())!;
  const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 }, p = { x: h.x + h.width / 2, y: h.y + h.height / 2 };
  if (snap) await page.keyboard.down('Shift');
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (let i = 1; i <= Math.max(8, Math.ceil(Math.abs(degrees) / 10)); i++) {
    const angle = degrees * Math.PI / 180 * i / Math.max(8, Math.ceil(Math.abs(degrees) / 10));
    await page.mouse.move(c.x + (p.x - c.x) * Math.cos(angle) - (p.y - c.y) * Math.sin(angle), c.y + (p.x - c.x) * Math.sin(angle) + (p.y - c.y) * Math.cos(angle));
  }
  if (release) await page.mouse.up();
  if (snap) await page.keyboard.up('Shift');
}
async function settledPixels(page: Page) {
  return page.getByLabel('Screenshot annotation canvas').evaluate(async (c: HTMLCanvasElement) => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return c.toDataURL();
  });
}
test('rotate every supported type, preserve rotated resize anchors, cancel and copy', async () => {
  const { app, page } = await launch();
  try {
    const c = (await page.getByLabel('Screenshot annotation canvas').boundingBox())!, x = c.x + c.width * .4, y = c.y + c.height * .4;
    for (const tool of ['Line', 'Arrow', 'Rectangle (Shift for square)', 'Text', 'Emoji']) {
      await page.getByLabel(tool, { exact: true }).click();
      if (tool === 'Text') {
        await page.mouse.click(x, y); await page.getByLabel('Content', { exact: true }).fill('Tiếng Việt\nRotate text'); await page.getByRole('button', { name: 'Done', exact: true }).click();
      } else if (tool === 'Emoji') {
        await page.getByRole('button', { name: 'Grinning face', exact: true }).click(); await page.mouse.click(x, y);
      } else {
        await drag(page, x, y, 130, 80); await page.getByLabel('Select', { exact: true }).click(); await page.mouse.click(x, y);
      }
      await expect(page.getByRole('button', { name: 'Rotate selected object', exact: true })).toBeVisible();
      await turn(page, 360); await expect(selected(page)).toHaveAttribute('data-rotation', '0');
      await turn(page, -360); await expect(selected(page)).toHaveAttribute('data-rotation', '0');
      await turn(page, 43, true); await expect(selected(page)).toHaveAttribute('data-rotation', '45');
      for (const h of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
        const opposite: Record<string, string> = { nw: 'se', n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e' };
        const button = page.getByRole('button', { name: `Resize ${h}`, exact: true }), fixed = page.getByRole('button', { name: `Resize ${opposite[h]}`, exact: true });
        const before = (await fixed.boundingBox())!, handle = (await button.boundingBox())!;
        const dx = h.includes('w') ? -6 : h.includes('e') ? 6 : 0, dy = h.includes('n') ? -6 : h.includes('s') ? 6 : 0;
        await drag(page, handle.x + handle.width / 2, handle.y + handle.height / 2, (dx - dy) / Math.SQRT2, (dx + dy) / Math.SQRT2);
        const after = (await fixed.boundingBox())!; expect(Math.abs(after.x - before.x)).toBeLessThan(1); expect(Math.abs(after.y - before.y)).toBeLessThan(1);
      }
      const b = (await selected(page).boundingBox())!;
      await drag(page, b.x + b.width / 2, b.y + b.height / 2, 18, 12); await expect(selected(page)).toHaveAttribute('data-rotation', '45');
      const pixels = await settledPixels(page);
      await turn(page, 70, false, false); await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeDisabled();
      await page.keyboard.press('Escape'); await page.mouse.up(); await expect(selected(page)).toHaveAttribute('data-rotation', '45'); expect(await settledPixels(page) === pixels).toBe(true);
      await turn(page, -80, false, false); await page.getByLabel('Screenshot annotation canvas').dispatchEvent('pointercancel'); await page.mouse.up(); expect(await settledPixels(page) === pixels).toBe(true);
      await page.getByRole('button', { name: 'Copy', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Image copied to clipboard.');
      const matches = await app.evaluate(async ({ clipboard, nativeImage }, pixels) => {
        const expected = nativeImage.createFromDataURL(pixels).toBitmap();
        for (const item of await clipboard.read()) if (item.types.includes('image/png')) {
          const blob = await item.getType('image/png');
          return expected.equals(nativeImage.createFromBuffer(Buffer.from(await (blob as Blob).arrayBuffer())).toBitmap());
        }
        return false;
      }, pixels); expect(matches).toBe(true);
      await page.getByRole('button', { name: 'Delete selected object' }).click(); await expect(selected(page)).toHaveCount(0);
    }
  } finally { await app.close(); }
});

test('rotated text editing and size slider retain angle; cancelled edit restores pixels', async () => {
  const { app, page } = await launch();
  try {
    const c = (await page.getByLabel('Screenshot annotation canvas').boundingBox())!;
    await page.getByLabel('Text', { exact: true }).click(); await page.mouse.click(c.x + c.width * .4, c.y + c.height * .4);
    await page.getByLabel('Content', { exact: true }).fill('Tiếng Việt\nOriginal'); await page.getByRole('button', { name: 'Done', exact: true }).click();
    await turn(page, 90); await expect(selected(page)).toHaveAttribute('data-rotation', '90');
    const before = await settledPixels(page);
    await selected(page).dblclick(); await page.getByLabel('Content', { exact: true }).fill('Cancelled'); await page.keyboard.press('Escape');
    expect(await settledPixels(page) === before).toBe(true); await expect(selected(page)).toHaveAttribute('data-rotation', '90');
    await selected(page).dblclick(); await page.getByLabel('Content', { exact: true }).fill('Đã sửa\nNew line\nThird line'); await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(selected(page)).toHaveAttribute('data-rotation', '90');
    const size = page.getByRole('slider', { name: 'Brush size', exact: true }); await size.fill('64');
    await expect(selected(page)).toHaveAttribute('data-rotation', '90');
    await selected(page).dblclick(); await expect(page.getByLabel('Content', { exact: true })).toHaveValue('Đã sửa\nNew line\nThird line'); await expect(page.getByLabel('Font size (px)', { exact: true })).toHaveValue('64');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
  } finally { await app.close(); }
});
