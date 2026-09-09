import { _electron as electron, expect, test } from '@playwright/test';
import { createServer } from 'vite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir, cpus } from 'node:os';
import { join, resolve } from 'node:path';

test('Electron Canvas: blur masks, layer order, restoration, export and 4K frame timing', async ({}, info) => {
  const server = await createServer({ server: { port: 0, strictPort: false } }); await server.listen();
  const address = server.httpServer!.address() as { port: number };
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((p): p is [string, string] => p[1] !== undefined)), SCREENSHOT_DEV_URL: `http://127.0.0.1:${address.port}`, SCREENSHOT_TEST_USER_DATA: await mkdtemp(join(tmpdir(), 'screenshot-render-')) }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [resolve('.')], env });
  try {
    const page = await app.firstWindow(); await expect(page.getByRole('heading', { name: 'Screenshot' })).toBeVisible();
    await expect(page.getByLabel('full shortcut')).toHaveValue('Ctrl+Alt+F');
    await page.screenshot({ path: 'test-results/settings.png' });
    const result = await page.evaluate(async () => {
      const modulePath = '/src/editor/render.ts';
      const { Renderer } = await import(/* @vite-ignore */ modulePath) as typeof import('../../src/editor/render');
      const glyphPath = '/src/editor/glyph-layout.ts', emojiPath = '/src/editor/emojis.ts';
      const { loadGlyphFonts } = await import(/* @vite-ignore */ glyphPath) as typeof import('../../src/editor/glyph-layout');
      const { availableEmojis } = await import(/* @vite-ignore */ emojiPath) as typeof import('../../src/editor/emojis');
      await loadGlyphFonts();
      const fixture = document.createElement('canvas'); fixture.width = 3840; fixture.height = 2160;
      const ctx = fixture.getContext('2d')!;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, fixture.width, fixture.height);
      ctx.fillStyle = '#000000'; for (let x = 0; x < fixture.width; x += 8) ctx.fillRect(x, 0, 4, fixture.height);
      const original = new Image(); original.src = fixture.toDataURL(); await original.decode();
      const renderer = new Renderer(original), output = document.createElement('canvas'); output.width = fixture.width; output.height = fixture.height;
      const pixel = (x: number, y: number) => Array.from(output.getContext('2d')!.getImageData(x, y, 1, 1).data);
      const stroke = { id: 'blur', type: 'blurStroke' as const, width: 80, points: [{ x: 100, y: 100 }, { x: 1000, y: 100 }] };
      renderer.render(output, [stroke]); const inside = pixel(400, 100), outside = pixel(400, 300);
      renderer.render(output, [stroke, { ...stroke, id: 'duplicate' }]); const overlap = pixel(400, 100);
      renderer.render(output, [{ id: 'line', type: 'freehand', width: 10, color: '#ff0000', points: [{ x: 100, y: 100 }, { x: 1000, y: 100 }] }, stroke]); const colorAboveBlur = pixel(400, 100);
      renderer.render(output, []); const restored = pixel(400, 100);
      const timings: number[] = [];
      for (let i = 0; i < 65; i++) {
        await new Promise(requestAnimationFrame); const start = performance.now();
        renderer.render(output, [{ ...stroke, transform: { x: i, y: i / 2, sx: 1 + i * .001, sy: 1 + i * .002 }, points: [{ x: 100, y: 100 }, { x: 1000 + i * 20, y: 100 + i }] }]); output.getContext('2d')!.getImageData(400, 100, 1, 1);
        if (i >= 5) timings.push(performance.now() - start);
      }
      const png = renderer.export([stroke]); const exported = new Image(); exported.src = png; await exported.decode();
      const check = document.createElement('canvas'); check.width = 3840; check.height = 2160; check.getContext('2d')!.drawImage(exported, 0, 0);
      const exportPixel = Array.from(check.getContext('2d')!.getImageData(400, 100, 1, 1).data);
      const text: import('../../src/editor/model').TextAnnotation = { id: 'text', type: 'text', position: { x: 200, y: 350 }, content: 'Tiếng Việt\nLong original text', fontSize: 72, fontFamily: 'Segoe UI', lineHeight: 1.25, color: '#ff0000' };
      const emoji: import('../../src/editor/model').EmojiAnnotation = { id: 'emoji', type: 'emoji', position: { x: 1300, y: 350 }, content: '👩‍💻', size: 96 };
      renderer.render(output, [text, emoji]);
      const glyphExportMatches = output.toDataURL() === renderer.export([text, emoji]);
      const edited = { ...text, content: 'Hi', fontSize: 32 }, resized = { ...emoji, size: 48 };
      renderer.render(output, [edited, resized]); const dirtyMatches = output.toDataURL() === renderer.export([edited, resized]);
      renderer.render(output, []); const deleteRestores = output.toDataURL() === renderer.export([]);
      const supportedEmojiCount = availableEmojis().length;
      const transformPath = '/src/editor/transform.ts';
      const { resizeAnnotation, moveAnnotation, handles } = await import(/* @vite-ignore */ transformPath) as typeof import('../../src/editor/transform');
      const { annotationBounds } = await import(/* @vite-ignore */ modulePath) as typeof import('../../src/editor/render');
      let transformsMatch = true; const transformFailures: string[] = [];
      for (const a of [text, emoji, stroke, { id: 'rect', type: 'rectangle' as const, start: { x: 50, y: 50 }, end: { x: 200, y: 150 }, width: 8, color: '#f00' }]) {
        for (const handle of handles) {
          const updated = resizeAnnotation(a, annotationBounds(a, 0), handle, { x: 35, y: 25 }, false, fixture);
          renderer.render(output, [updated]); if (output.toDataURL() !== renderer.export([updated])) { transformsMatch = false; transformFailures.push(a.type + ':' + handle); }
        }
        const moved = moveAnnotation(a, annotationBounds(a, 0), { x: 200, y: 100 }, fixture);
        renderer.render(output, [moved]); if (output.toDataURL() !== renderer.export([moved])) { transformsMatch = false; transformFailures.push(a.type + ':move'); }
      }
      renderer.render(output, [{ ...stroke, transform: { x: 1000, y: 500, sx: 1, sy: 1 } }]);
      const oldMaskRestored = pixel(400, 100), newMask = pixel(1500, 600);
      renderer.render(output, []); transformsMatch &&= output.toDataURL() === renderer.export([]);
      renderer.dispose(); fixture.width = 0; output.width = 0; check.width = 0;
      return { inside, outside, overlap, colorAboveBlur, restored, exportPixel, glyphExportMatches, dirtyMatches, deleteRestores, supportedEmojiCount, transformsMatch, transformFailures, oldMaskRestored, newMask, exportSize: [exported.naturalWidth, exported.naturalHeight], p95: timings.sort((a, b) => a - b)[Math.ceil(timings.length * .95) - 1] };
    });
    expect(result.inside[0]).toBeGreaterThan(80); expect(result.inside[0]).toBeLessThan(180);
    expect(result.outside).toEqual([0, 0, 0, 255]); expect(result.overlap).toEqual(result.inside);
    expect(result.colorAboveBlur).toEqual([255, 0, 0, 255]); expect(result.restored).toEqual([0, 0, 0, 255]);
    expect(result.exportPixel).toEqual(result.inside); expect(result.exportSize).toEqual([3840, 2160]);
    expect(result.glyphExportMatches).toBe(true); expect(result.dirtyMatches).toBe(true); expect(result.deleteRestores).toBe(true); expect(result.supportedEmojiCount).toBeGreaterThanOrEqual(24);
    expect(result.transformFailures).toEqual([]); expect(result.transformsMatch).toBe(true); expect(result.oldMaskRestored).toEqual([0, 0, 0, 255]); expect(result.newMask[0]).toBeGreaterThan(80); expect(result.newMask[0]).toBeLessThan(180);
    await info.attach('4k-render-metrics', { body: JSON.stringify({ ...result, cpu: cpus()[0].model, node: process.version }, null, 2), contentType: 'application/json' });
    console.log(`4K Canvas render p95: ${result.p95.toFixed(2)} ms`);
    expect(result.p95).toBeLessThan(33);
  } finally { await app.close(); await server.close(); }
});





