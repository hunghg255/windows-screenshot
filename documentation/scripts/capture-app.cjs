// Capture real Electron UI with the app's own settings screenshot as safe input.
// Run from the repository root: node documentation/scripts/capture-app.cjs
const { _electron: electron, expect } = require('@playwright/test');
const { mkdtemp, mkdir, readFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { resolve, join } = require('node:path');

(async () => {
  const { createServer } = await import('vite');
  const taskDir = await mkdtemp(join(tmpdir(), 'screenshot-marketing-'));
  const server = await createServer({ cacheDir: join(taskDir, 'vite'), server: { port: 0 } });
  await server.listen();
  const env = { ...process.env, SCREENSHOT_DEV_URL: `http://127.0.0.1:${server.httpServer.address().port}`, SCREENSHOT_TEST_USER_DATA: await mkdtemp(join(tmpdir(), 'screenshot-marketing-')) };
  delete env.ELECTRON_RUN_AS_NODE;
  const output = resolve('documentation/public/screenshots');
  await mkdir(output, { recursive: true });
  let app;
  try {
    app = await electron.launch({ args: [resolve('.')], env });
    const page = await app.firstWindow();
    await expect(page.getByLabel('Capture display')).toBeEnabled({ timeout: 30000 });
    await expect(page.getByLabel('full shortcut')).not.toHaveValue('');
    await page.evaluate(() => document.fonts.ready);
    const settingsImage = await page.screenshot({ path: join(output, 'settings.png') });
    // Only supply a safe input bitmap to the editor; all UI and annotations are real.
    await app.evaluate(({ ipcMain, nativeImage, BrowserWindow }, base64) => {
      const image = nativeImage.createFromBuffer(Buffer.from(base64, 'base64'));
      ipcMain.removeHandler('current');
      ipcMain.handle('current', () => ({ ok: true, value: { id: 'marketing-fixture', image: image.toDataURL(), ...image.getSize(), mode: 'full', displayId: 0 } }));
      const win = BrowserWindow.getAllWindows()[0];
      win.setSize(1200, 850);
      void win.loadURL(win.webContents.getURL().replace('#settings', '#editor'));
    }, settingsImage.toString('base64'));
    await page.waitForURL('**/#editor');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled();
    const box = await page.getByLabel('Screenshot annotation canvas').boundingBox();
    await page.getByLabel('Stroke color').fill('#ef572c');
    await page.getByLabel('Brush size').fill('4');
    await page.getByLabel('Rectangle (Shift for square)', { exact: true }).click();
    await page.mouse.move(box.x + 20, box.y + 173);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 20, box.y + 220, { steps: 12 });
    await page.mouse.up();
    await page.getByLabel('Arrow', { exact: true }).click();
    await page.mouse.move(box.x + 360, box.y + 290);
    await page.mouse.down();
    await page.mouse.move(box.x + 310, box.y + 224, { steps: 10 });
    await page.mouse.up();
    await page.getByLabel('Text', { exact: true }).click();
    await page.getByLabel('Brush size').fill('24');
    await page.mouse.click(box.x + 40, box.y + 515);
    await page.getByLabel('Content', { exact: true }).fill('Chọn vùng cần chụp');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByLabel('Select', { exact: true }).click();
    await page.mouse.click(box.x + box.width - 25, box.y + 520);
    await page.screenshot({ path: join(output, 'editor.png') });
    await page.getByLabel('Emoji', { exact: true }).click();
    await expect(page.getByLabel('Emoji picker', { exact: true })).toBeVisible();
    await page.screenshot({ path: join(output, 'emoji.png') });
    await page.keyboard.press('Escape');
    await page.getByLabel('Select', { exact: true }).click();
    // This fixture window is not a production capture session: provide only
    // repository-owned PNG bytes, then use the real decoding and editing UI.
    await app.evaluate(({ ipcMain }, bytes) => {
      ipcMain.removeHandler('import-image');
      ipcMain.handle('import-image', () => ({ ok: true, value: { mime: 'image/png', bytes: new Uint8Array(bytes) } }));
    }, [...await readFile(resolve('documentation/public/logo.png'))]);
    await page.getByRole('button', { name: 'Insert image', exact: true }).click();
    await expect(page.getByLabel('Image width', { exact: true })).toBeVisible();
    await page.getByLabel('Image width', { exact: true }).fill('160');
    await page.keyboard.press('Enter');
    const selection = await page.getByLabel('Selected object', { exact: true }).boundingBox();
    const handle = await page.getByLabel('Rotate selected object', { exact: true }).boundingBox();
    const cx = selection.x + selection.width / 2, cy = selection.y + selection.height / 2;
    const hx = handle.x + handle.width / 2, hy = handle.y + handle.height / 2;
    const angle = Math.PI / 12;
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(cx + (hx - cx) * Math.cos(angle) - (hy - cy) * Math.sin(angle), cy + (hx - cx) * Math.sin(angle) + (hy - cy) * Math.cos(angle), { steps: 12 });
    await page.mouse.up();
    await page.screenshot({ path: join(output, 'insert-image.png') });
    await page.getByRole('button', { name: 'Rotate screenshot 90° clockwise', exact: true }).click();
    await page.screenshot({ path: join(output, 'rotate-screenshot.png') });
    console.log('Saved real app screenshots: settings.png, editor.png, emoji.png, insert-image.png, rotate-screenshot.png');
  } finally {
    if (app) await app.close();
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
