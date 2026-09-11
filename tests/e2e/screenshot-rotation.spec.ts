import { _electron as electron, expect, test } from '@playwright/test';
import { createServer } from 'vite';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('whole screenshot rotation preserves pixels, editable objects and pointer geometry', async ({}, info) => {
  const dir = await mkdtemp(join(tmpdir(), 'screenshot-scene-'));
  const server = await createServer({ cacheDir: join(dir, 'vite'), server: { port: 0 } }); await server.listen();
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)), SCREENSHOT_DEV_URL: `http://127.0.0.1:${(server.httpServer!.address() as { port: number }).port}`, SCREENSHOT_TEST_USER_DATA: join(dir, 'profile') }; delete env.ELECTRON_RUN_AS_NODE;
  // Pin software rasterization for exact fresh/dirty edge comparisons: GPU AA can vary between draws.
  // The real output test below and existing interaction regressions retain normal GPU settings.
  const app = await electron.launch({ args: [resolve('.'), '--disable-gpu'], env });
  try {
    const page = await app.firstWindow(); await expect(page.getByRole('heading', { name: 'Screenshot', exact: true })).toBeVisible();
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    const result = await page.evaluate(async () => {
      const renderPath = '/src/editor/render.ts', glyphPath = '/src/editor/glyph-layout.ts', fixturePath = '/tests/fixtures/rotation-preview.tsx';
      const { Renderer } = await import(/* @vite-ignore */ renderPath) as typeof import('../../src/editor/render');
      const { loadGlyphFonts } = await import(/* @vite-ignore */ glyphPath) as typeof import('../../src/editor/glyph-layout'); await loadGlyphFonts();
      const background = document.createElement('canvas'); background.width = 640; background.height = 400;
      const ctx = background.getContext('2d')!;
      for (const [i, color] of ['#f8fafc', '#bae6fd', '#bbf7d0', '#fecdd3'].entries()) { ctx.fillStyle = color; ctx.fillRect(i % 2 * 320, Math.floor(i / 2) * 200, 320, 200); }
      ctx.fillStyle = '#172554'; ctx.font = '24px Segoe UI'; ctx.fillText('Screenshot rotation · synthetic QA', 35, 55);
      const image = new Image(); image.src = background.toDataURL(); await image.decode();
      const annotations: import('../../src/editor/model').Annotation[] = [
        { id: 'r', type: 'rectangle', start: { x: 90, y: 95 }, end: { x: 220, y: 180 }, width: 6, color: '#e11d48', rotation: .2 },
        { id: 'a', type: 'arrow', start: { x: 280, y: 90 }, end: { x: 420, y: 140 }, width: 6, color: '#2563eb' },
        { id: 'c', type: 'circle', start: { x: 450, y: 180 }, end: { x: 510, y: 240 }, width: 5, color: '#047857', transform: { x: 0, y: -60, sx: 1, sy: 1.3 } },
        { id: 'f', type: 'freehand', points: [{ x: 55, y: 280 }, { x: 130, y: 330 }, { x: 180, y: 270 }], width: 8, color: '#7c3aed' },
        { id: 'b', type: 'blurStroke', points: [{ x: 305, y: 210 }, { x: 330, y: 230 }], width: 35 },
        { id: 't', type: 'text', position: { x: 270, y: 285 }, content: 'Editable text', color: '#172554', fontSize: 25, fontFamily: 'Segoe UI', lineHeight: 1.25, rotation: .1 },
        { id: 'e', type: 'emoji', position: { x: 470, y: 285 }, content: '😀', size: 40 },
        { id: 'i', type: 'image', assetId: 'fixture', position: { x: 530, y: 300 }, width: 70, height: 50, rotation: .3 },
      ];
      const renderer = new Renderer(image, () => background), target = document.createElement('canvas');
      renderer.render(target, annotations);
      let source = target.getContext('2d')!.getImageData(0, 0, 640, 400).data;
      let exact = true;
      const differences: { stage: string; pixels: number; max: number; bounds: number[] }[] = [];
      const compareExport = async (url: string, stage: string) => {
        const exported = new Image(); exported.src = url; await exported.decode();
        const decoded = document.createElement('canvas'); decoded.width = exported.width; decoded.height = exported.height;
        const ctx = decoded.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(exported, 0, 0);
        const expected = ctx.getImageData(0, 0, decoded.width, decoded.height).data, actual = target.getContext('2d')!.getImageData(0, 0, target.width, target.height).data;
        let pixels = 0, max = 0, left = Infinity, top = Infinity, right = 0, bottom = 0;
        for (let i = 0; i < actual.length; i++) if (actual[i] !== expected[i]) { pixels++; max = Math.max(max, Math.abs(actual[i] - expected[i])); const x = Math.floor(i / 4) % target.width, y = Math.floor(Math.floor(i / 4) / target.width); left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
        if (pixels) differences.push({ stage, pixels, max, bounds: [left, top, right, bottom] });
      };
      for (const turns of [1, 2, 3, 0] as const) {
        renderer.render(target, annotations, turns);
        const actual = target.getContext('2d')!.getImageData(0, 0, target.width, target.height).data;
        // Independent integer pixel permutation, not application transforms or Canvas rotation.
        for (let y = 0; y < 400; y++) for (let x = 0; x < 640; x++) {
          const [dx, dy] = turns === 1 ? [399 - y, x] : turns === 2 ? [639 - x, 399 - y] : turns === 3 ? [y, 639 - x] : [x, y];
          for (let c = 0; c < 4; c++) if (actual[(dy * target.width + dx) * 4 + c] !== source[(y * 640 + x) * 4 + c]) exact = false;
        }
        await compareExport(renderer.export(annotations, turns), `export ${turns}`);
      }
      // Dirty redraw after editing while rotated must equal a full redraw.
      const changed = annotations.map(a => a.id === 'r' ? { ...a, rotation: .7 } : a);
      renderer.render(target, changed, 1);
      renderer.invalidate(target);
      await compareExport(renderer.export(changed, 1), 'dirty versus full redraw');
      const debug = differences.length ? { actual: target.toDataURL(), expected: renderer.export(changed, 1) } : null;
      renderer.dispose(); source = new Uint8ClampedArray();
      const { mountPreview } = await import(/* @vite-ignore */ fixturePath) as typeof import('../fixtures/rotation-preview');
      mountPreview({ id: 'synthetic-scene', image: image.src, width: 640, height: 400, mode: 'full' });
      return { exact, differences, debug, annotations: annotations.filter(a => a.type !== 'image') };
    });
    if (result.debug) for (const [name, url] of Object.entries(result.debug)) await info.attach(name, { body: Buffer.from(url.split(',')[1], 'base64'), contentType: 'image/png' });
    expect(result.exact).toBe(true); expect(result.differences).toEqual([]);
    const rotate = page.getByRole('button', { name: 'Rotate screenshot 90° clockwise', exact: true });
    await expect(rotate).toBeEnabled();
    await page.evaluate(async annotations => { const path = '/src/stores/editor.ts'; const { useEditor } = await import(/* @vite-ignore */ path); annotations.forEach(a => useEditor.getState().add(a)); useEditor.getState().setTool('select'); useEditor.getState().select('r'); }, result.annotations);
    const canvas = page.getByLabel('Screenshot annotation canvas');
    for (const turns of [1, 2, 3, 0]) {
      await page.evaluate(async annotation => { const path = '/src/stores/editor.ts'; const s = (await import(/* @vite-ignore */ path)).useEditor.getState(); s.replace(annotation); s.select('r'); }, result.annotations[0]);
      await rotate.click(); await expect(canvas).toHaveAttribute('width', turns % 2 ? '400' : '640');
      await expect(canvas).toHaveAttribute('height', turns % 2 ? '640' : '400'); await expect(canvas).toBeFocused();
      const box = (await canvas.boundingBox())!;
      // Draw and select in screen space; inverse mapping must place both endpoints correctly.
      await page.getByLabel('Freehand', { exact: true }).click();
      await page.mouse.move(box.x + box.width * .3, box.y + box.height * .5); await page.mouse.down();
      await expect(rotate).toBeDisabled();
      await page.mouse.move(box.x + box.width * .4, box.y + box.height * .55, { steps: 5 }); await page.mouse.up();
      await expect(rotate).toBeEnabled();
      const endpoints = await page.evaluate(async () => { const path = '/src/stores/editor.ts'; const s = (await import(/* @vite-ignore */ path)).useEditor.getState(); const a = s.annotations.at(-1); return { start: a.points[0], end: a.points.at(-1) }; });
      const inverse = (x: number, y: number) => turns === 1 ? { x: y, y: 400 - x } : turns === 2 ? { x: 640 - x, y: 400 - y } : turns === 3 ? { x: 640 - y, y: x } : { x, y };
      const expected = inverse((turns % 2 ? 400 : 640) * .3, (turns % 2 ? 640 : 400) * .5);
      expect(endpoints.start.x).toBeCloseTo(expected.x, 0); expect(endpoints.start.y).toBeCloseTo(expected.y, 0);
      await page.getByLabel('Select', { exact: true }).click();
      await page.mouse.click(box.x + box.width * .35, box.y + box.height * .525);
      await expect(page.getByLabel('Selected object', { exact: true })).toBeVisible();
      await page.keyboard.press('Delete');
      await page.evaluate(async () => { const path = '/src/stores/editor.ts'; (await import(/* @vite-ignore */ path)).useEditor.getState().select('r'); });
      const handle = (await page.getByLabel('Resize se', { exact: true }).boundingBox())!;
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down(); await expect(rotate).toBeDisabled();
      await page.mouse.move(handle.x + handle.width / 2 + 12, handle.y + handle.height / 2 + 12, { steps: 4 }); await page.mouse.up();
      await expect(rotate).toBeEnabled();
      const selection = page.getByLabel('Selected object', { exact: true });
      const before = await page.evaluate(async () => { const path = '/src/stores/editor.ts'; return (await import(/* @vite-ignore */ path)).useEditor.getState().annotations.find((a: { id: string }) => a.id === 'r'); });
      const bounds = (await selection.boundingBox())!, cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2;
      await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 8, cy + 6, { steps: 4 }); await page.mouse.up();
      const after = await page.evaluate(async () => { const path = '/src/stores/editor.ts'; return (await import(/* @vite-ignore */ path)).useEditor.getState().annotations.find((a: { id: string }) => a.id === 'r'); });
      const ratio = (turns % 2 ? 400 : 640) / box.width;
      const delta = turns === 1 ? [6, -8] : turns === 2 ? [-8, -6] : turns === 3 ? [-6, 8] : [8, 6];
      expect(after.transform.x - before.transform.x, JSON.stringify({ turns, before, after, ratio })).toBeCloseTo(delta[0] * ratio, 0);
      expect(after.transform.y - before.transform.y).toBeCloseTo(delta[1] * ratio, 0);
      const moved = (await selection.boundingBox())!, rotationHandle = (await page.getByLabel('Rotate selected object', { exact: true }).boundingBox())!;
      const mx = moved.x + moved.width / 2, my = moved.y + moved.height / 2, hx = rotationHandle.x + rotationHandle.width / 2, hy = rotationHandle.y + rotationHandle.height / 2;
      await page.mouse.move(hx, hy); await page.mouse.down(); await page.mouse.move(mx - (hy - my), my + (hx - mx), { steps: 6 }); await page.mouse.up();
      const angle = await page.evaluate(async () => { const path = '/src/stores/editor.ts'; return (await import(/* @vite-ignore */ path)).useEditor.getState().annotations.find((a: { id: string }) => a.id === 'r').rotation; });
      expect(angle).toBeCloseTo((after.rotation + Math.PI / 2) % (Math.PI * 2), 1);
    }
    await rotate.click(); await page.screenshot({ path: info.outputPath('screenshot-rotation.png') });
    await page.getByLabel('Text', { exact: true }).click(); const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await expect(rotate).toBeDisabled(); await page.keyboard.press('Escape');
    await page.getByLabel('Emoji', { exact: true }).click(); await expect(rotate).toBeDisabled(); await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  } finally { await app.close(); await server.close(); }
});

test('rotated capture copies and saves through real IPC and resets next session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'screenshot-scene-output-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)), SCREENSHOT_TEST_USER_DATA: dir }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [resolve('.')], env });
  try {
    const settings = await app.firstWindow(); await expect(settings.getByRole('button', { name: 'Full screen', exact: true })).toBeEnabled();
    const next = app.waitForEvent('window'); await settings.getByRole('button', { name: 'Full screen', exact: true }).click(); const page = await next;
    const rotate = page.getByRole('button', { name: 'Rotate screenshot 90° clockwise', exact: true }); await expect(rotate).toBeEnabled();
    const size = await page.evaluate(async () => { const r = await window.screenshot.current(); if (!r.ok || !r.value) throw Error('No capture'); return { width: r.value.width, height: r.value.height }; });
    await rotate.click();
    await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const preview = await page.getByLabel('Screenshot annotation canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL());
    await page.getByRole('button', { name: 'Copy', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Image copied to clipboard.');
    const clipboardSize = await app.evaluate(async ({ clipboard, nativeImage }) => {
      for (const item of await clipboard.read()) if (item.types.includes('image/png')) return nativeImage.createFromBuffer(Buffer.from(await (await item.getType('image/png') as Blob).arrayBuffer())).getSize();
      throw Error('No clipboard PNG');
    });
    expect(clipboardSize).toEqual({ width: size.height, height: size.width });
    const file = join(dir, 'rotated.png');
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, file);
    await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('PNG saved.');
    const bytes = await readFile(file); expect(bytes.readUInt32BE(16)).toBe(size.height); expect(bytes.readUInt32BE(20)).toBe(size.width);
    expect(bytes.equals(Buffer.from(preview.split(',')[1], 'base64'))).toBe(true);
    const closed = page.waitForEvent('close'); await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await closed;
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
    const again = app.waitForEvent('window'); await settings.getByRole('button', { name: 'Full screen', exact: true }).click(); const fresh = await again;
    await expect(fresh.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled();
    await expect(fresh.getByLabel('Screenshot annotation canvas')).toHaveAttribute('width', String(size.width));
  } finally { await app.close(); }
});
