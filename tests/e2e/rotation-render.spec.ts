import { _electron as electron, expect, test } from '@playwright/test';
import { createServer } from 'vite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('rectangle resize keeps four independently measured stroke widths equal', async () => {
  const server = await createServer({ cacheDir: await mkdtemp(join(tmpdir(), 'screenshot-vite-rotation-')), server: { port: 0 } }); await server.listen();
  const address = server.httpServer!.address() as { port: number };
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((p): p is [string, string] => p[1] !== undefined)), SCREENSHOT_DEV_URL: `http://127.0.0.1:${address.port}`, SCREENSHOT_TEST_USER_DATA: await mkdtemp(join(tmpdir(), 'screenshot-rotation-render-')) }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [resolve('.')], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: 'Screenshot', exact: true })).toBeVisible();
    const widths = await page.evaluate(async () => {
      const path = '/src/editor/render.ts';
      const { paint } = await import(/* @vite-ignore */ path) as typeof import('../../src/editor/render');
      const c = document.createElement('canvas'); c.width = 900; c.height = 700;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      const samples: number[][] = [];
      for (const [sx, sy] of [[2, 1], [1, 2], [2, 2], [.5, .75]]) {
        ctx.clearRect(0, 0, c.width, c.height);
        paint(ctx, { id: 'r', type: 'rectangle', start: { x: 100, y: 100 }, end: { x: 300, y: 250 }, color: '#ff0000', width: 8, transform: { x: 20, y: 20, sx, sy } });
        const midX = Math.round(200 * sx + 20), midY = Math.round(175 * sy + 20);
        const thickness = (x: number, y: number, vertical: boolean) => {
          let total = 0;
          for (let offset = -20; offset <= 20; offset++) total += ctx.getImageData(Math.round(x) + (vertical ? 0 : offset), Math.round(y) + (vertical ? offset : 0), 1, 1).data[3] / 255;
          return total;
        };
        samples.push([thickness(100 * sx + 20, midY, false), thickness(300 * sx + 20, midY, false), thickness(midX, 100 * sy + 20, true), thickness(midX, 250 * sy + 20, true)]);
      }
      return samples;
    });
    for (const sides of widths) for (const width of sides) expect(Math.abs(width - 8)).toBeLessThanOrEqual(1);
  } finally { await app.close(); await server.close(); }
});

test('rotated render matches independent rectangle paths and fresh exports; synthetic UI preview', async ({}, info) => {
  const server = await createServer({ cacheDir: await mkdtemp(join(tmpdir(), 'screenshot-vite-rotation-')), server: { port: 0 } }); await server.listen();
  const address = server.httpServer!.address() as { port: number };
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((p): p is [string, string] => p[1] !== undefined)), SCREENSHOT_DEV_URL: `http://127.0.0.1:${address.port}`, SCREENSHOT_TEST_USER_DATA: await mkdtemp(join(tmpdir(), 'screenshot-rotation-render-')) }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [resolve('.')], env });
  try {
    const page = await app.firstWindow(); await expect(page.getByRole('heading', { name: 'Screenshot', exact: true })).toBeVisible();
    const result = await page.evaluate(async () => {
      const renderPath = '/src/editor/render.ts', geometryPath = '/src/editor/transform.ts', glyphPath = '/src/editor/glyph-layout.ts';
      const { Renderer, paint } = await import(/* @vite-ignore */ renderPath) as typeof import('../../src/editor/render');
      const { annotationBounds, resizeAnnotation, moveAnnotation } = await import(/* @vite-ignore */ geometryPath) as typeof import('../../src/editor/transform');
      const { loadGlyphFonts } = await import(/* @vite-ignore */ glyphPath) as typeof import('../../src/editor/glyph-layout');
      await loadGlyphFonts();
      const canvas = () => { const c = document.createElement('canvas'); c.width = 960; c.height = 640; return c; };
      const background = canvas(), bg = background.getContext('2d')!;
      bg.fillStyle = '#e5e7eb'; bg.fillRect(0, 0, 960, 640); bg.fillStyle = '#ffffff'; bg.fillRect(36, 36, 888, 568);
      bg.font = '24px Segoe UI'; bg.fillStyle = '#334155'; bg.fillText('Rotation & resize — synthetic QA image', 70, 90);
      const original = new Image(); original.src = background.toDataURL(); await original.decode();
      const renderer = new Renderer(original), output = canvas(), actual = canvas(), expected = canvas();
      const shape = { id: 'r', type: 'rectangle' as const, start: { x: 180, y: 170 }, end: { x: 320, y: 260 }, width: 8, color: '#e11d48', transform: { x: 20, y: 30, sx: 1.5, sy: .8 } };
      let maxReferenceDifference = 0, dirtyMatches = true;
      for (const rotation of [0, Math.PI / 4, Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI * 2]) {
        const a = { ...shape, rotation }, ctx = actual.getContext('2d')!, ref = expected.getContext('2d')!;
        ctx.clearRect(0, 0, 960, 640); ref.clearRect(0, 0, 960, 640); paint(ctx, a);
        // Independent world-space path: fixed-width stroke, no application geometry helpers.
        const left = 290, right = 500, top = 166, bottom = 238, cx = 395, cy = 202;
        const vertices = [[left, top], [right, top], [right, bottom], [left, bottom]].map(([x, y]) => ({ x: cx + (x - cx) * Math.cos(rotation) - (y - cy) * Math.sin(rotation), y: cy + (x - cx) * Math.sin(rotation) + (y - cy) * Math.cos(rotation) }));
        ref.lineWidth = 8; ref.lineJoin = 'round'; ref.lineCap = 'round'; ref.strokeStyle = shape.color; ref.beginPath();
        vertices.forEach((p, i) => i ? ref.lineTo(p.x, p.y) : ref.moveTo(p.x, p.y)); ref.closePath(); ref.stroke();
        const pixels = ctx.getImageData(0, 0, 960, 640).data, reference = ref.getImageData(0, 0, 960, 640).data;
        let alphaDifference = 0; for (let i = 3; i < pixels.length; i += 4) alphaDifference += Math.abs(pixels[i] - reference[i]) / 255;
        maxReferenceDifference = Math.max(maxReferenceDifference, alphaDifference);
      }
      const annotations: import('../../src/editor/model').Annotation[] = [shape,
        { id: 'arrow', type: 'arrow', start: { x: 500, y: 280 }, end: { x: 660, y: 350 }, width: 6, color: '#2563eb' },
        { id: 'text', type: 'text', position: { x: 180, y: 390 }, content: 'Tiếng Việt\nRotated text', fontSize: 32, fontFamily: 'Segoe UI', lineHeight: 1.25, color: '#047857' },
        { id: 'emoji', type: 'emoji', position: { x: 730, y: 390 }, content: '👩‍💻', size: 64 }];
      for (const original of annotations) {
        for (const angle of [Math.PI / 4, Math.PI / 2, Math.PI * 1.5, Math.PI * 2]) {
          const rotated = { ...original, rotation: angle };
          const resized = resizeAnnotation(rotated, annotationBounds(rotated, 0), 'se', { x: 25, y: 35 }, false, output);
          const moved = moveAnnotation(resized, annotationBounds(resized, 0), { x: -550, y: -400 }, output);
          for (const a of [rotated, resized, moved, { ...moved, rotation: angle + Math.PI / 3 }, original]) {
            renderer.render(output, [a]); dirtyMatches &&= output.toDataURL() === renderer.export([a]);
          }
        }
      }
      renderer.render(output, []); dirtyMatches &&= output.toDataURL() === renderer.export([]); renderer.dispose();
      const fixturePath = '/tests/fixtures/rotation-preview.tsx';
      const { mountPreview } = await import(/* @vite-ignore */ fixturePath) as typeof import('../fixtures/rotation-preview');
      mountPreview({ id: 'synthetic-rotation', image: original.src, width: 960, height: 640, mode: 'full', displayId: 0 });
      return { maxReferenceDifference, dirtyMatches, annotations };
    });
    expect(result.maxReferenceDifference).toBeLessThan(12); expect(result.dirtyMatches).toBe(true);
    await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled();
    await page.evaluate(async annotations => {
      const path = '/src/stores/editor.ts'; const { useEditor } = await import(/* @vite-ignore */ path) as typeof import('../../src/stores/editor');
      annotations.forEach((a, i) => useEditor.getState().add({ ...a, rotation: [Math.PI / 6, Math.PI / 4, -.2, .3][i] }));
      useEditor.getState().setTool('select'); useEditor.getState().select('r');
    }, result.annotations);
    await expect(page.getByRole('button', { name: 'Rotate selected object', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('rotation-preview.png') });
  } finally { await app.close(); await server.close(); }
});
