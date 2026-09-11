import { _electron as electron, expect, test } from '@playwright/test';
import { createServer } from 'vite';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { animatedPng, animatedWebp, orientedJpeg } from '../fixtures/image-formats';

test('insert all image formats, transform, cancel, export and validate SVG', async ({}, info) => {
  test.setTimeout(120000);
  const dir = await mkdtemp(join(tmpdir(), 'screenshot-import-'));
  const server = await createServer({ cacheDir: join(dir, 'vite'), server: { port: 0 } }); await server.listen();
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)), SCREENSHOT_DEV_URL: `http://127.0.0.1:${(server.httpServer!.address() as { port: number }).port}`, SCREENSHOT_TEST_USER_DATA: join(dir, 'profile') }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [resolve('.')], env });
  try {
    const settings = await app.firstWindow(); await expect(settings.getByRole('button', { name: 'Full screen', exact: true })).toBeEnabled();
    const next = app.waitForEvent('window'); await settings.getByRole('button', { name: 'Full screen', exact: true }).click();
    const page = await next; await expect(page.getByRole('button', { name: 'Insert image', exact: true })).toBeEnabled();
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const fixtures = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 120; c.height = 80;
      const ctx = c.getContext('2d')!; ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 60, 80);
      return { png: c.toDataURL('image/png'), jpg: c.toDataURL('image/jpeg'), webp: c.toDataURL('image/webp') };
    });
    for (const [ext, url] of Object.entries(fixtures)) await writeFile(join(dir, `fixture.${ext}`), Buffer.from(url.split(',')[1], 'base64'));
    await writeFile(join(dir, 'fixture.jpeg'), Buffer.from(fixtures.jpg.split(',')[1], 'base64'));
    await writeFile(join(dir, 'fixture.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><defs><linearGradient id="g"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient><path id="p" d="M0 0H60V80H0Z"/></defs><use href="#p" fill="url(#g)"/></svg>');
    const count = () => page.evaluate(async () => { const path = '/src/stores/editor.ts'; return (await import(/* @vite-ignore */ path)).useEditor.getState().annotations.length; });
    for (const ext of ['png', 'jpg', 'jpeg', 'svg', 'webp']) {
      await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, join(dir, `fixture.${ext}`));
      await page.getByRole('button', { name: 'Insert image', exact: true }).click();
      await expect(page.getByRole('status')).toHaveText('Image inserted. Drag handles to resize or rotate.');
      await expect(page.getByLabel('Image width', { exact: true })).toHaveValue('120');
      const dimensions = (await page.getByLabel('Image dimensions', { exact: true }).boundingBox())!, tools = (await page.getByLabel('Drawing tool', { exact: true }).boundingBox())!;
      expect(dimensions.y).toBeGreaterThanOrEqual(tools.y + tools.height);
      await page.getByLabel('Image width', { exact: true }).fill('180'); await page.keyboard.press('Enter');
      await expect(page.getByLabel('Image height', { exact: true })).toHaveValue('120');
      await page.getByLabel('Image width', { exact: true }).fill('999'); await page.keyboard.press('Escape');
      await expect(page.getByLabel('Image width', { exact: true })).toHaveValue('180');
      const selection = page.getByLabel('Selected object', { exact: true });
      const b = (await selection.boundingBox())!, h = (await page.getByLabel('Rotate selected object', { exact: true }).boundingBox())!;
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2, hx = h.x + h.width / 2, hy = h.y + h.height / 2;
      await page.mouse.move(hx, hy); await page.mouse.down(); await page.mouse.move(cx - (hy - cy), cy + (hx - cx), { steps: 8 }); await page.mouse.up();
      await expect(selection).toHaveAttribute('data-rotation', '90');
      const handle = (await page.getByLabel('Resize se', { exact: true }).boundingBox())!;
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down(); await page.mouse.move(handle.x - 15, handle.y + 20, { steps: 5 }); await page.mouse.up();
      await expect(selection).toHaveAttribute('data-rotation', '90');
      await expect(page.getByLabel('Image width', { exact: true })).not.toHaveValue('180');
      const comparison = await page.evaluate(async () => {
        const storePath = '/src/stores/editor.ts';
        const state = (await import(/* @vite-ignore */ storePath)).useEditor.getState();
        // A second repaint of the same objects must not alter their pixels.
        const before = document.querySelector('canvas')!.toDataURL();
        state.replace({ ...state.annotations[0] });
        await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        return before === document.querySelector('canvas')!.toDataURL();
      });
      expect(comparison, `stable redraw ${ext}`).toBe(true);
    }
    expect(await count()).toBe(5);
    await app.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] }); });
    await page.getByRole('button', { name: 'Insert image', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Image selection cancelled.'); expect(await count()).toBe(5);
    await page.getByRole('button', { name: 'Copy', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Image copied to clipboard.');
    const pixels = await page.getByLabel('Screenshot annotation canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL());
    const matches = await app.evaluate(async ({ clipboard, nativeImage }, png) => {
      const expected = nativeImage.createFromDataURL(png).toBitmap();
      for (const item of await clipboard.read()) if (item.types.includes('image/png')) {
        const blob = await item.getType('image/png');
        const actual = nativeImage.createFromBuffer(Buffer.from(await (blob as Blob).arrayBuffer())).toBitmap();
        let differences = 0, maxDelta = 0; for (let i = 0; i < actual.length; i++) if (actual[i] !== expected[i]) { differences++; maxDelta = Math.max(maxDelta, Math.abs(actual[i] - expected[i])); }
        return { differences, maxDelta };
      }
      throw new Error('No PNG on clipboard.');
    }, pixels);
    expect(matches).toEqual({ differences: 0, maxDelta: 0 });
    const saved = join(dir, 'saved.png');
    await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, saved);
    await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('PNG saved.'); expect((await readFile(saved)).length).toBeGreaterThan(100);
    const validation = await page.evaluate(async () => {
      const svgPath = '/src/editor/svg-source.ts', assetsPath = '/src/editor/image-assets.ts';
      const { svgSource } = await import(/* @vite-ignore */ svgPath) as typeof import('../../src/editor/svg-source');
      const { ImageAssets } = await import(/* @vite-ignore */ assetsPath) as typeof import('../../src/editor/image-assets');
      const bad = ['<script/>', '<image href="https://example.com/a.png"/>', '<use href="#loop" id="loop"/>', '<animate attributeName="x"/>', '<path style="fill:url(https://example.com)"/>'];
      const rejected = bad.every(body => { try { svgSource(new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`)); return false; } catch { return true; } });
      const assets = new ImageAssets();
      const a = await assets.add({ mime: 'image/svg+xml', bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="red" d="M0 0H10V10H0Z"/></svg>') });
      assets.retain([]); let released = false; try { assets.get(a.assetId); } catch { released = true; }
      const pending = assets.add({ mime: 'image/svg+xml', bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>') }); assets.dispose();
      let stale = false; try { await pending; } catch { stale = true; }
      return { rejected, released, stale };
    });
    expect(validation).toEqual({ rejected: true, released: true, stale: true });
    const frames = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 4; c.height = 2; const ctx = c.getContext('2d')!;
      return ['red', 'blue'].map(color => { ctx.fillStyle = color; ctx.fillRect(0, 0, 4, 2); return { png: c.toDataURL(), webp: c.toDataURL('image/webp'), jpeg: c.toDataURL('image/jpeg') }; });
    });
    const bytes = (url: string) => Buffer.from(url.split(',')[1], 'base64');
    const special = [
      { mime: 'image/webp', bytes: [...animatedWebp(bytes(frames[0].webp), bytes(frames[1].webp), 4, 2)] },
      { mime: 'image/png', bytes: [...animatedPng(bytes(frames[0].png), bytes(frames[1].png), 4, 2)] },
      { mime: 'image/jpeg', bytes: [...orientedJpeg(bytes(frames[0].jpeg))] },
    ];
    const decoded = await page.evaluate(async inputs => {
      const path = '/src/editor/image-assets.ts'; const { ImageAssets } = await import(/* @vite-ignore */ path) as typeof import('../../src/editor/image-assets');
      const assets = new ImageAssets(); const results = [];
      for (const input of inputs) {
        const a = await assets.add({ mime: input.mime as import('../../shared/image-import').ImageMime, bytes: new Uint8Array(input.bytes) });
        const c = document.createElement('canvas'); c.width = a.width; c.height = a.height; const ctx = c.getContext('2d')!; ctx.drawImage(assets.get(a.assetId), 0, 0);
        const pixel = [...ctx.getImageData(0, 0, 1, 1).data];
        await new Promise(r => setTimeout(r, 250)); ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(assets.get(a.assetId), 0, 0);
        results.push({ width: a.width, height: a.height, red: pixel[0] > 200 && pixel[2] < 30, stable: pixel.join() === [...ctx.getImageData(0, 0, 1, 1).data].join() });
      }
      assets.dispose(); return results;
    }, special);
    expect(decoded).toEqual([{ width: 4, height: 2, red: true, stable: true }, { width: 4, height: 2, red: true, stable: true }, { width: 2, height: 4, red: true, stable: true }]);
    await page.getByRole('button', { name: 'Delete selected object', exact: true }).click(); expect(await count()).toBe(4);
    // Visual QA replaces every desktop pixel with a synthetic background before saving.
    await page.evaluate(async () => {
      const path = '/src/stores/editor.ts'; const { useEditor } = await import(/* @vite-ignore */ path) as typeof import('../../src/stores/editor');
      const store = useEditor.getState(), a = store.annotations.find(a => a.type === 'image')!;
      store.select(a.id); await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const c = document.querySelector('canvas')!, ctx = c.getContext('2d')!;
      ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = '#ffffff'; ctx.fillRect(80, 80, c.width - 160, c.height - 160);
      ctx.font = '36px Segoe UI'; ctx.fillStyle = '#334155'; ctx.fillText('Insert image · resize · rotate', 140, 170);
      if (a.type === 'image') { ctx.save(); ctx.translate(a.position.x + a.width / 2, a.position.y + a.height / 2); ctx.rotate(a.rotation ?? 0); ctx.fillStyle = '#2563eb'; ctx.fillRect(-a.width / 2, -a.height / 2, a.width, a.height); ctx.fillStyle = '#93c5fd'; ctx.fillRect(-a.width / 2 + 15, -a.height / 2 + 15, a.width / 2, a.height - 30); ctx.restore(); }
    });
    await page.screenshot({ path: info.outputPath('image-import-ui.png') });
    expect(errors).toEqual([]);
  } finally { await app.close(); await server.close(); }
});
