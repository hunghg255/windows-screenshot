import { _electron as electron, expect, test } from '@playwright/test';
import { createServer } from 'vite';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// The capture is replaced with a synthetic image before visual QA; do not retain desktop traces.
test.use({ trace: 'off' });

test('arrow, circle and freehand have constant ink, clean redraw and matching Copy/Save', async ({}, info) => {
  test.setTimeout(120000);
  const dir = await mkdtemp(join(tmpdir(), 'screenshot-strokes-'));
  const server = await createServer({ cacheDir: join(dir, 'vite'), server: { port: 0 } }); await server.listen();
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((p): p is [string, string] => p[1] !== undefined)), SCREENSHOT_DEV_URL: `http://127.0.0.1:${(server.httpServer!.address() as { port: number }).port}`, SCREENSHOT_TEST_USER_DATA: join(dir, 'profile') }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [resolve('.')], env });
  try {
    const settings = await app.firstWindow(); await expect(settings.getByRole('button', { name: 'Full screen', exact: true })).toBeEnabled();
    const next = app.waitForEvent('window'); await settings.getByRole('button', { name: 'Full screen', exact: true }).click();
    const page = await next; await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled();
    const result = await page.evaluate(async () => {
      const path = '/src/editor/render.ts', transforms = '/src/editor/transform.ts';
      const { paint, Renderer } = await import(/* @vite-ignore */ path) as typeof import('../../src/editor/render');
      const { frameBounds, resizeAnnotation, moveAnnotation } = await import(/* @vite-ignore */ transforms) as typeof import('../../src/editor/transform');
      type Drawing = import('../../src/editor/model').Drawing;
      const canvas = () => { const c = document.createElement('canvas'); c.width = 1000; c.height = 800; return c; };
      const actual = canvas(), reference = canvas(), ctx = actual.getContext('2d', { willReadFrequently: true })!, ref = reference.getContext('2d', { willReadFrequently: true })!;
      const circle: Drawing = { id: 'c', type: 'circle', start: { x: 100, y: 100 }, end: { x: 300, y: 300 }, width: 8, color: '#f00' };
      const arrows: Drawing[] = [{ x: 300, y: 100 }, { x: 100, y: 300 }, { x: 300, y: 300 }, { x: 103, y: 101 }].flatMap(end => [0, Math.PI / 4, Math.PI / 2].map(rotation => ({ id: 'a', type: 'arrow', start: { x: 100, y: 100 }, end, width: 8, color: '#f00', rotation })));
      const lines: Drawing[] = [
        [{ x: 100, y: 100 }, { x: 300, y: 100 }],
        [{ x: 100, y: 100 }, { x: 100, y: 300 }],
        [{ x: 100, y: 100 }, { x: 300, y: 300 }],
        [{ x: 100, y: 100 }, { x: 200, y: 250 }, { x: 300, y: 100 }],
        [{ x: 200, y: 200 }], [{ x: 200, y: 200 }, { x: 200, y: 200 }],
      ].map(points => ({ id: 'f', type: 'freehand', points, width: 8, color: '#f00' }));
      const failures: string[] = [], thickness: number[] = [];
      const bytesEqual = () => {
        const a = ctx.getImageData(0, 0, 1000, 800).data, b = ref.getImageData(0, 0, 1000, 800).data;
        return a.every((value, i) => value === b[i]);
      };
      for (const [sx, sy] of [[2, 1], [1, 2], [2, 2], [.5, .75]]) {
        for (const [index, source] of [circle, ...lines, ...arrows].entries()) {
          ctx.clearRect(0, 0, 1000, 800); ref.clearRect(0, 0, 1000, 800);
          paint(ctx, { ...source, transform: { x: 20, y: 20, sx, sy } });
          ref.strokeStyle = '#f00'; ref.fillStyle = '#f00'; ref.lineWidth = 8; ref.lineCap = 'round'; ref.lineJoin = 'round'; ref.beginPath();
          if (source.type === 'circle') {
            // Independent destination geometry, with no production transform helpers.
            ref.ellipse(200 * sx + 20, 200 * sy + 20, 100 * sx, 100 * sy, 0, 0, Math.PI * 2); ref.stroke();
            for (const [x, y, vertical] of [[300 * sx + 20, 200 * sy + 20, 0], [100 * sx + 20, 200 * sy + 20, 0], [200 * sx + 20, 100 * sy + 20, 1], [200 * sx + 20, 300 * sy + 20, 1]]) {
              let sum = 0;
              for (let d = -15; d <= 15; d++) sum += ctx.getImageData(Math.round(x + (vertical ? 0 : d)), Math.round(y + (vertical ? d : 0)), 1, 1).data[3] / 255;
              thickness.push(sum);
            }
          } else if (source.type === 'arrow') {
            const start = { x: source.start.x * sx + 20, y: source.start.y * sy + 20 }, end = { x: source.end.x * sx + 20, y: source.end.y * sy + 20 };
            const angle = Math.atan2(end.y - start.y, end.x - start.x), length = Math.min(24, .6 * Math.hypot(end.x - start.x, end.y - start.y));
            const head = [-Math.PI / 6, Math.PI / 6].map(offset => ({ x: end.x - length * Math.cos(angle + offset), y: end.y - length * Math.sin(angle + offset) }));
            const points = [start, end, ...head];
            const cx = (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) / 2, cy = (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) / 2;
            ref.save(); ref.translate(cx, cy); ref.rotate(source.rotation ?? 0); ref.translate(-cx, -cy);
            ref.moveTo(start.x, start.y); ref.lineTo(end.x, end.y); for (const p of head) { ref.moveTo(end.x, end.y); ref.lineTo(p.x, p.y); } ref.stroke(); ref.restore();
            if (!source.rotation && source.end.y === source.start.y) {
              let sum = 0; for (let d = -15; d <= 15; d++) sum += ctx.getImageData(Math.round((start.x + end.x) / 2), Math.round(start.y + d), 1, 1).data[3] / 255;
              thickness.push(sum);
            }
          } else if ('points' in source) {
            const points = source.points.map(p => ({ x: p.x * sx + 20, y: p.y * sy + 20 }));
            if (points.every(p => p.x === points[0].x && p.y === points[0].y)) { ref.arc(points[0].x, points[0].y, 4, 0, Math.PI * 2); ref.fill(); }
            else { ref.moveTo(points[0].x, points[0].y); for (const p of points.slice(1)) ref.lineTo(p.x, p.y); ref.stroke(); }
          }
          if (!bytesEqual()) failures.push(`reference:${index}:${sx},${sy}`);
        }
      }
      const bg = canvas(); bg.getContext('2d')!.fillStyle = '#fff'; bg.getContext('2d')!.fillRect(0, 0, 1000, 800);
      const original = new Image(); original.src = bg.toDataURL(); await original.decode();
      const renderer = new Renderer(original), output = canvas(), fresh = canvas();
      const check = (annotations: Drawing[]) => {
        renderer.render(output, annotations); const clean = new Renderer(original); clean.render(fresh, annotations);
        if (output.toDataURL() !== fresh.toDataURL() || output.toDataURL() !== renderer.export(annotations)) {
          const a = output.getContext('2d')!.getImageData(0, 0, 1000, 800).data, b = fresh.getContext('2d')!.getImageData(0, 0, 1000, 800).data;
          let count = 0, max = 0; const samples: number[][] = [];
          for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { count++; max = Math.max(max, Math.abs(a[i] - b[i])); if (samples.length < 3) samples.push([Math.floor(i / 4) % 1000, Math.floor(i / 4000), a[i], b[i]]); }
          failures.push(JSON.stringify({ annotations, count, max, samples }));
        } clean.dispose();
      };
      for (const source of [circle, ...lines, ...arrows]) {
        let a = source; check([a]);
        for (let i = 0; i < 4; i++) {
          a = resizeAnnotation(a, frameBounds(a), 'se', { x: 80, y: 30 }, false, bg) as Drawing; check([a]);
          a = resizeAnnotation(a, frameBounds(a), 'se', { x: -80, y: -30 }, false, bg) as Drawing; check([a]);
        }
        a = moveAnnotation(a, frameBounds(a), { x: 200, y: 100 }, bg) as Drawing; check([a]);
        check([{ ...a, width: 16 }]); check([source]); check([]);
      }
      const dense: Drawing = { id: 'dense', type: 'freehand', color: '#f00', width: 8, points: Array.from({ length: 10000 }, (_, i) => ({ x: 100 + i * .05, y: 200 + Math.sin(i / 100) * 60 })) };
      const timings: number[] = [];
      for (let i = 0; i < 30; i++) {
        await new Promise(requestAnimationFrame); const start = performance.now();
        renderer.render(output, [{ ...dense, transform: { x: i, y: 0, sx: 1.2, sy: .5 } }]); output.getContext('2d')!.getImageData(200, 200, 1, 1);
        if (i >= 5) timings.push(performance.now() - start);
      }
      renderer.dispose();
      // Replace the mounted editor with the same real capture ID and a synthetic background.
      const contractPath = '/tests/fixtures/rotation-preview.tsx';
      const capture = await window.screenshot.current();
      if (!capture.ok) throw new Error(capture.error);
      if (!capture.value) throw new Error('Missing capture session');
      bg.width = capture.value.width; bg.height = capture.value.height; bg.getContext('2d')!.fillStyle = '#fff'; bg.getContext('2d')!.fillRect(0, 0, bg.width, bg.height);
      (await import(/* @vite-ignore */ contractPath)).mountPreview({ ...capture.value, image: bg.toDataURL() });
      return { failures, thickness, denseRenderP95: timings.sort((a, b) => a - b)[23] };
    });
    expect(result.failures).toEqual([]); for (const width of result.thickness) expect(Math.abs(width - 8)).toBeLessThanOrEqual(1);
    await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled();
    const ui = page.locator('main.editor:visible');
    const canvas = ui.getByLabel('Screenshot annotation canvas'), b = (await canvas.boundingBox())!;
    for (const label of ['Circle', 'Freehand', 'Arrow']) {
      await ui.getByLabel(label, { exact: true }).click();
      await page.mouse.move(b.x + 90, b.y + 90); await page.mouse.down(); await page.mouse.move(b.x + 210, b.y + 210, { steps: 10 }); await page.mouse.up();
      await ui.getByLabel('Select', { exact: true }).click(); await page.mouse.click(b.x + 90, b.y + (label === 'Circle' ? 150 : 90));
      await expect(ui.getByLabel('Selected object', { exact: true })).toBeVisible();
      const h = (await ui.getByLabel('Resize e', { exact: true }).boundingBox())!;
      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down(); await page.mouse.move(h.x + 70, h.y + h.height / 2, { steps: 8 }); await page.mouse.up();
      await ui.getByLabel('Brush size').fill('12');
      await expect.poll(() => page.evaluate(async () => { const path = '/src/stores/editor.ts'; return (await import(/* @vite-ignore */ path)).useEditor.getState().annotations[0].width; })).toBe(12);
      await page.getByRole('button', { name: 'Copy', exact: true }).click(); await expect(page.getByRole('status')).toContainText('copied');
      const preview = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
      expect(await app.evaluate(async ({ clipboard, nativeImage }, png) => {
        for (const item of await clipboard.read()) if (item.types.includes('image/png')) {
          const blob = await item.getType('image/png'); return nativeImage.createFromDataURL(png).toBitmap().equals(nativeImage.createFromBuffer(Buffer.from(await (blob as Blob).arrayBuffer())).toBitmap());
        }
        return false;
      }, preview)).toBe(true);
      const saved = join(dir, `${label}.png`);
      await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, saved);
      await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('PNG saved.');
      expect(await app.evaluate(({ nativeImage }, { data, preview }) => nativeImage.createFromBuffer(Buffer.from(data)).toBitmap().equals(nativeImage.createFromDataURL(preview).toBitmap()), { data: Array.from(await readFile(saved)), preview })).toBe(true);
      await page.screenshot({ path: info.outputPath(`${label}.png`) });
      await page.getByRole('button', { name: 'Delete selected object' }).click();
    }
    await info.attach('stroke-metrics', { body: JSON.stringify(result), contentType: 'application/json' });
  } finally { await app.close(); await server.close(); }
});
